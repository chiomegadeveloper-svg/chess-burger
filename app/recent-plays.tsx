"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { arena } from "./arena-client";
import type { ArenaMatch } from "./game-rules";
import { readGames, type SavedGame } from "./game-history";

export default function RecentPlays({ onReplay }: { onReplay: (game: SavedGame) => void }) {
  const [games, setGames] = useState<SavedGame[]>([]);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState("");

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      try {
        let loaded = readGames().filter((game) => game.pgn);
        try {
          const data = await arena<{ matches: ArenaMatch[] }>("history");
          const offline = await arena<{ games: SavedGame[] }>("offline-history");
          const server = [
            ...offline.games,
            ...data.matches.map((match) => ({
              id: match.id,
              white: match.white?.display_name ?? "White",
              black: match.black?.display_name ?? "Black",
              pgn: match.pgn,
              score: match.result === "draw" ? "½–½" : match.result === "white" ? "1–0" : "0–1",
              startedAt: new Date(match.created_at).toISOString(),
              updatedAt: new Date(match.created_at).toISOString(),
            })),
          ];
          loaded = [...server, ...loaded.filter((game) => !server.some((item) => item.id === game.id))];
        } catch {}
        if (alive) {
          setGames(loaded.sort((first, second) => Date.parse(second.startedAt ?? "") - Date.parse(first.startedAt ?? "")));
          setError("");
        }
      } catch {
        if (alive) setError("Saved games could not be loaded from this browser.");
      }
    };
    void refresh();
    const change = () => void refresh();
    window.addEventListener("cb-games-changed", change);
    return () => {
      alive = false;
      window.removeEventListener("cb-games-changed", change);
    };
  }, []);

  const limited = games.slice(0,20);
  const pages = Math.max(1, Math.ceil(limited.length / 5));
  const visible = limited.slice((page-1)*5,page*5);

  return (
    <section className="recent-plays">
      <div className="page-heading">
        <h2>Recent plays</h2>
        <span className="sample-label">Latest {limited.length} of 20</span>
      </div>
      {error ? (
        <p role="alert">{error}</p>
      ) : !limited.length ? (
        <p className="history-empty">No saved games yet. Your moves are saved as you play.</p>
      ) : (
        <>
          <ol>
            {visible.map((game) => {
              const expanded = expandedId === game.id;
              return (
                <li className={expanded ? "expanded" : ""} key={game.id}>
                  <button
                    type="button"
                    className="history-summary"
                    aria-expanded={expanded}
                    aria-controls={"history-details-" + game.id}
                    onClick={() => setExpandedId((current) => current === game.id ? "" : game.id)}
                  >
                    <span className="history-players"><strong>{game.white}</strong> vs <strong>{game.black}</strong></span>
                    <ChevronDown size={15} aria-hidden="true" />
                  </button>
                  {expanded ? (
                    <div className="history-details" id={"history-details-" + game.id}>
                      <span className="history-score">Score: {game.score}</span>
                      <time dateTime={game.startedAt ?? undefined}>
                        {game.startedAt ? new Date(game.startedAt).toLocaleDateString() : "Date unavailable"}
                        {game.startedAt ? " · " + new Date(game.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
                      </time>
                      <button type="button" onClick={() => onReplay(game)}>Replay</button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
          {pages > 1 ? (
            <nav className="history-pagination" aria-label="Recent plays pages">
              <button type="button" disabled={page === 1} onClick={() => { setPage((current) => Math.max(1, current - 1)); setExpandedId(""); }}>Previous</button>
              <span>{page} / {pages}</span>
              <button type="button" disabled={page === pages} onClick={() => { setPage((current) => Math.min(pages, current + 1)); setExpandedId(""); }}>Next</button>
            </nav>
          ) : null}
        </>
      )}
    </section>
  );
}
