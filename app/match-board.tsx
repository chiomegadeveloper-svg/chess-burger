"use client";
import { useEffect, useMemo, useState } from "react";
import type { Square } from "chess.js";
import {
  Flag,
  RotateCw,
  ChevronLeft,
  ChevronRight,
  SkipBack,
  SkipForward,
} from "lucide-react";
import {
  gameFromPgn,
  timeControl,
  type ArenaMatch,
  type ArenaPlayer,
  type MatchReaction,
} from "./game-rules";

const symbols: Record<string, string> = {
  wk: "♔",
  wq: "♕",
  wr: "♖",
  wb: "♗",
  wn: "♘",
  wp: "♙",
  bk: "♚",
  bq: "♛",
  br: "♜",
  bb: "♝",
  bn: "♞",
  bp: "♟",
};
const emotes = [
  ["haha", "Haha!"],
  ["easy", "Easy"],
  ["good-game", "Good game"],
  ["crying", "Crying"],
  ["nya", "Nya!"],
  ["newbie", "Newbie"],
  ["great", "You’re great!"],
  ["surrender", "Surrender?"],
  ["no", "No!"],
  ["yes", "Yes!"],
  ["draw", "Draw?"],
  ["check-time", "Check time"],
] as const;
export function Avatar({
  player,
}: {
  player?: Pick<ArenaPlayer, "display_name" | "avatar_url">;
}) {
  return (
    <span className="player-avatar">
      {player?.avatar_url ? (
        <img src={player.avatar_url} alt="" />
      ) : (
        (player?.display_name?.[0] ?? "?").toUpperCase()
      )}
    </span>
  );
}
function clock(ms: number) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function MatchBoard({
  match,
  ownId,
  onMove,
  onResign,
  onReact,
  busy = false,
  connection = "Live",
  bothSides = false,
}: {
  match: ArenaMatch;
  ownId?: string;
  onMove?: (move: { from: string; to: string; promotion?: string }) => void;
  onResign?: () => void;
  onReact?: (emote: string) => Promise<void> | void;
  busy?: boolean;
  connection?: string;
  bothSides?: boolean;
}) {
  const [selected, setSelected] = useState<Square | null>(null),
    [promotion, setPromotion] = useState<{ from: string; to: string } | null>(
      null,
    ),
    [replay, setReplay] = useState<number | null>(null),
    [flip, setFlip] = useState(false),
    [tick, setTick] = useState(Date.now()),
    [confirmResign, setConfirmResign] = useState(false),
    [moveMarker, setMoveMarker] = useState<{ from: string; to: string } | null>(
      null,
    ),
    [reactionUntil, setReactionUntil] = useState(0),
    [reactionError, setReactionError] = useState("");
  const chess = useMemo(() => gameFromPgn(match.pgn), [match.pgn]),
    history = chess.history(),
    myColor = ownId === match.black_id ? "b" : "w";
  const offset = useMemo(
    () => (match.server_now ?? Date.now()) - Date.now(),
    [match.server_now],
  );
  const reactions = useMemo(() => {
      try {
        return JSON.parse(match.reactions || "{}") as Record<
          string,
          MatchReaction
        >;
      } catch {
        return {};
      }
    }, [match.reactions]),
    reactionCooling = reactionUntil > tick;
  useEffect(() => {
    const timer = setInterval(() => setTick(Date.now()), 200);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    setSelected(null);
    setPromotion(null);
  }, [match.version]);
  useEffect(() => {
    const last = chess.history({ verbose: true }).at(-1);
    if (!last) {
      setMoveMarker(null);
      return;
    }
    setMoveMarker({ from: last.from, to: last.to });
    const timer = setTimeout(() => setMoveMarker(null), 2000);
    return () => clearTimeout(timer);
  }, [match.pgn]);
  const display = useMemo(() => {
    if (replay === null) return chess;
    const game = gameFromPgn("");
    history.slice(0, replay).forEach((move) => game.move(move));
    return game;
  }, [chess, history, replay]);
  const canPlay =
    match.status === "active" &&
    !!onMove &&
    replay === null &&
    !busy &&
    (bothSides || chess.turn() === myColor);
  const legal =
    selected && canPlay
      ? chess.moves({ square: selected, verbose: true }).map((move) => move.to)
      : [];
  const reversed = (myColor === "b") !== flip,
    squares = Array.from(
      { length: 64 },
      (_, i) => ("abcdefgh"[i % 8] + (8 - Math.floor(i / 8))) as Square,
    );
  if (reversed) squares.reverse();
  const tc = timeControl(match.control),
    result =
      match.result === "draw"
        ? "Draw"
        : match.result
          ? `${match.result === "white" ? (match.white?.display_name ?? "White") : (match.black?.display_name ?? "Black")} wins`
          : chess.isCheck()
            ? "Check"
            : canPlay
              ? bothSides
                ? chess.turn() === "w"
                  ? "White to move"
                  : "Black to move"
                : "Your move"
              : "Waiting for opponent";
  function click(square: Square) {
    if (!canPlay || promotion) return;
    if (selected && legal.includes(square)) {
      if (chess.get(selected)?.type === "p" && ["1", "8"].includes(square[1]))
        setPromotion({ from: selected, to: square });
      else onMove?.({ from: selected, to: square });
    } else
      setSelected(chess.get(square)?.color === chess.turn() ? square : null);
  }
  async function react(emote: string) {
    if (!onReact || reactionCooling) return;
    setReactionUntil(Date.now() + 5000);
    setReactionError("");
    try {
      await onReact(emote);
    } catch (error) {
      setReactionUntil(0);
      setReactionError((error as Error).message);
    }
  }
  function strip(side: "white" | "black") {
    const player = match[side],
      turn = chess.turn() === (side === "white" ? "w" : "b"),
      left =
        match[side === "white" ? "white_ms" : "black_ms"] -
        (match.status === "active" && turn
          ? Math.max(0, tick + offset - match.last_tick)
          : 0);
    return (
      <div
        className={
          "game-player-strip " +
          (turn && match.status === "active" ? "moving" : "")
        }
      >
        <Avatar player={player} />
        <span>
          <strong>
            {player?.display_name ?? (side === "white" ? "White" : "Black")}
          </strong>
          <small>
            @{player?.username ?? "local"} · {player?.cbr ?? 88} CBR
          </small>
        </span>
        <time className={left < 30000 ? "clock-low" : ""}>{clock(left)}</time>
      </div>
    );
  }
  function reactionPlayer(side: "white" | "black") {
    const player = match[side];
    const reaction = reactions[player?.user_id ?? ""];
    const visible = reaction && tick - reaction.at < 3500;
    const emoteIndex = reaction
      ? emotes.findIndex(([id]) => id === reaction.emote)
      : -1;
    return (
      <div className="versus-player">
        <div className="reaction-bubble" aria-live="polite">
          {visible && emoteIndex >= 0 && (
            <img
              key={reaction.at}
              src={`/emotes/${emoteIndex}.webp`}
              alt={`${player?.display_name ?? side} reacted ${reaction.emote}`}
            />
          )}
        </div>
        <Avatar player={player} />
        <strong>
          {player?.display_name ?? (side === "white" ? "White" : "Black")}
        </strong>
      </div>
    );
  }
  return (
    <section className="chess-scene network-scene">
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            {tc.group} · {tc.label}
          </span>
          <h1>{match.status === "finished" ? result : "Your match"}</h1>
        </div>
        <span className="connection-label">{connection}</span>
      </div>
      <div className="game-layout">
        <div className="match-board-column">
          {strip(reversed ? "white" : "black")}
          <div className="board-stage">
            <div
              className="interactive-board"
              role="group"
              aria-label="Chessboard"
            >
              {squares.map((square) => {
                const piece = display.get(square),
                  light =
                    ("abcdefgh".indexOf(square[0]) + Number(square[1])) % 2 ===
                    0;
                return (
                  <button
                    type="button"
                    key={square}
                    className={
                      "sq " +
                      (light ? "light" : "dark") +
                      (selected === square ? " selected" : "") +
                      (legal.includes(square) ? " legal" : "") +
                      (moveMarker?.from === square ? " move-origin" : "") +
                      (moveMarker?.to === square ? " move-destination" : "") +
                      (piece?.color === "w" ? " white-piece" : " black-piece")
                    }
                    onClick={() => click(square)}
                    aria-label={`${square}${piece ? ` ${piece.color} ${piece.type}` : " empty"}`}
                    aria-disabled={!canPlay}
                  >
                    <span className="piece">
                      {piece
                        ? symbols[piece.color + piece.type]
                        : legal.includes(square)
                          ? "·"
                          : ""}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          {strip(reversed ? "black" : "white")}
        </div>
        <aside className="game-info cloud-panel">
          <h2>
            {replay === null
              ? result
              : `Replay · move ${replay} of ${history.length}`}
          </h2>
          {promotion && (
            <div className="promotion-picker">
              <p>Promote to</p>
              {["q", "r", "b", "n"].map((piece) => (
                <button
                  key={piece}
                  onClick={() => {
                    onMove?.({ ...promotion, promotion: piece });
                    setPromotion(null);
                  }}
                  aria-label={`Promote to ${({ q: "queen", r: "rook", b: "bishop", n: "knight" } as Record<string, string>)[piece]}`}
                >
                  {symbols[chess.turn() + piece]}
                </button>
              ))}
            </div>
          )}
          <div className="board-actions">
            <button onClick={() => setFlip((value) => !value)}>
              <RotateCw size={15} />
              Flip board
            </button>
            {onResign && match.status === "active" && (
              <button onClick={() => setConfirmResign((value) => !value)}>
                <Flag size={15} />
                Resign
              </button>
            )}
          </div>
          {confirmResign && (
            <div className="resign-confirm">
              <p>Resign this match?</p>
              <button
                disabled={busy}
                onClick={() => {
                  onResign?.();
                  setConfirmResign(false);
                }}
              >
                Yes, resign
              </button>
              <button onClick={() => setConfirmResign(false)}>
                Keep playing
              </button>
            </div>
          )}
          {(match.status === "finished" || !onMove) && (
            <div className="replay-controls">
              <button aria-label="First move" onClick={() => setReplay(0)}>
                <SkipBack size={16} />
              </button>
              <button
                aria-label="Previous move"
                disabled={replay === 0}
                onClick={() =>
                  setReplay(Math.max(0, (replay ?? history.length) - 1))
                }
              >
                <ChevronLeft size={16} />
              </button>
              <button
                aria-label="Next move"
                disabled={replay === null || replay === history.length}
                onClick={() =>
                  setReplay(Math.min(history.length, (replay ?? 0) + 1))
                }
              >
                <ChevronRight size={16} />
              </button>
              <button aria-label="Latest move" onClick={() => setReplay(null)}>
                <SkipForward size={16} />
              </button>
            </div>
          )}
          <h3>Moves</h3>
          <p className="move-log">
            {history.length
              ? history.map((move, index) => (
                  <span key={index}>
                    {index % 2 === 0 ? `${Math.floor(index / 2) + 1}. ` : ""}
                    {move}{" "}
                  </span>
                ))
              : "The board is ready."}
          </p>
          <section className="match-reactions" aria-label="Player reactions">
            <div className="versus-players">
              {reactionPlayer("white")}
              <b className="versus-mark">VS</b>
              {reactionPlayer("black")}
            </div>
            {onReact && (
              <>
                <div
                  className={"emote-grid " + (reactionCooling ? "cooling" : "")}
                  aria-label="Chess reactions"
                >
                  {emotes.map(([id, label], index) => (
                    <button
                      key={id}
                      type="button"
                      disabled={reactionCooling || match.status !== "active"}
                      onClick={() => void react(id)}
                      title={label}
                      aria-label={label}
                    >
                      <img src={`/emotes/${index}.webp`} alt="" />
                    </button>
                  ))}
                </div>
                <p className="emote-cooldown">
                  {reactionCooling
                    ? `Recharging ${Math.max(1, Math.ceil((reactionUntil - tick) / 1000))}s`
                    : "Choose a reaction"}
                </p>
                {reactionError && (
                  <p className="inline-error">{reactionError}</p>
                )}
              </>
            )}
          </section>
        </aside>
      </div>
    </section>
  );
}
