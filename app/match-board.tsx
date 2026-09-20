"use client";
import { useEffect, useMemo, useRef, useState } from "react";
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
  onPremove,
  premove,
  onResign,
  onAbort,
  onReact,
  matchActions,
  busy = false,
  connection = "Live",
  bothSides = false,
}: {
  match: ArenaMatch;
  ownId?: string;
  onMove?: (move: { from: string; to: string; promotion?: string }) => void;
  onPremove?: (move: { from: string; to: string; promotion?: string }) => void;
  premove?: { from: string; to: string; promotion?: string } | null;
  onResign?: () => void;
  onAbort?: () => void;
  onReact?: (emote: string) => Promise<void> | void;
  matchActions?: React.ReactNode;
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
    [confirmAbort, setConfirmAbort] = useState(false),
    [moveMarker, setMoveMarker] = useState<{ from: string; to: string } | null>(
      null,
    ),
    [reactionUntil, setReactionUntil] = useState(0),
    [reactionError, setReactionError] = useState(""),
    [dragFrom, setDragFrom] = useState<Square | null>(null),
    [boardTheme, setBoardTheme] = useState<"slate" | "classic" | "wood" | "bubble-gum" | "meta-blue">(() => {
      if (typeof window === "undefined") return "slate";
      const saved = window.localStorage.getItem("cb-board-theme");
      if (saved === "premium-walnut") return "bubble-gum";
      return saved === "classic" || saved === "wood" || saved === "bubble-gum" || saved === "meta-blue" ? saved : "slate";
    });
  const dragSource = useRef<Square | null>(null),
    suppressClick = useRef(false);
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
    setDragFrom(null);
    dragSource.current = null;
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
  const canPremove =
    match.status === "active" &&
    !!onPremove &&
    replay === null &&
    !busy &&
    !bothSides &&
    chess.turn() !== myColor;
  const legal =
    selected && canPlay
      ? chess.moves({ square: selected, verbose: true }).map((move) => move.to)
      : [];
  const premovePiece = premove ? chess.get(premove.from) : null;
  const reversed = (myColor === "b") !== flip,
    squares = Array.from(
      { length: 64 },
      (_, i) => ("abcdefgh"[i % 8] + (8 - Math.floor(i / 8))) as Square,
    );
  if (reversed) squares.reverse();
  const tc = timeControl(match.control),
    result =
      match.status === "cancelled"
        ? "Match aborted · no rewards awarded"
        : match.result === "draw"
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
  function chooseBoardTheme(theme: "slate" | "classic" | "wood" | "bubble-gum" | "meta-blue") {
    setBoardTheme(theme);
    window.localStorage.setItem("cb-board-theme", theme);
  }
  function submitMove(from: Square, to: Square) {
    if (canPlay) {
      const isLegal = chess
        .moves({ square: from, verbose: true })
        .some((move) => move.to === to);
      if (!isLegal) return;
      if (chess.get(from)?.type === "p" && ["1", "8"].includes(to[1]))
        setPromotion({ from, to });
      else onMove?.({ from, to });
      return;
    }
    if (canPremove && chess.get(to)?.color !== myColor)
      onPremove?.({ from, to, promotion: "q" });
  }
  function click(square: Square) {
    if (suppressClick.current) return;
    if ((!canPlay && !canPremove) || promotion) return;
    if (selected && legal.includes(square)) {
      submitMove(selected, square);
      setSelected(null);
    } else if (selected && canPremove && chess.get(square)?.color !== myColor) {
      submitMove(selected, square);
      setSelected(null);
    } else {
      const movingColor = canPlay ? chess.turn() : myColor;
      setSelected(chess.get(square)?.color === movingColor ? square : null);
    }
  }
  function beginDrag(
    event: React.PointerEvent<HTMLButtonElement>,
    square: Square,
  ) {
    const touchPhone =
      event.pointerType === "touch" &&
      !window.matchMedia("(min-width: 700px)").matches;
    if (touchPhone || (!canPlay && !canPremove) || promotion) return;
    const movingColor = canPlay ? chess.turn() : myColor;
    if (chess.get(square)?.color !== movingColor) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragSource.current = square;
    setDragFrom(square);
  }
  function finishDrag(event: React.PointerEvent<HTMLButtonElement>) {
    const from = dragSource.current;
    if (!from) return;
    dragSource.current = null;
    setDragFrom(null);
    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLButtonElement>("[data-square]")?.dataset.square as
      Square | undefined;
    if (!target || target === from) return;
    suppressClick.current = true;
    window.setTimeout(() => (suppressClick.current = false), 0);
    submitMove(from, target);
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
      {matchActions}
      <div className="game-layout">
        <div className="match-board-column">
          {strip(reversed ? "white" : "black")}
          <div className="board-stage">
            <div
              className={"interactive-board board-theme-" + boardTheme}
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
                    data-square={square}
                    className={
                      "sq " +
                      (light ? "light" : "dark") +
                      (selected === square ? " selected" : "") +
                      (legal.includes(square) ? " legal" : "") +
                      (dragFrom === square ? " dragging" : "") +
                      (premove?.from === square ? " premove-origin" : "") +
                      (premove?.to === square ? " premove-destination" : "") +
                      (moveMarker?.from === square ? " move-origin" : "") +
                      (moveMarker?.to === square ? " move-destination" : "") +
                      (piece?.color === "w" ? " white-piece" : " black-piece")
                    }
                    onClick={() => click(square)}
                    onPointerDown={(event) => beginDrag(event, square)}
                    onPointerUp={finishDrag}
                    aria-label={`${square}${piece ? ` ${piece.color} ${piece.type}` : " empty"}`}
                    aria-disabled={!canPlay}
                  >
                    <span className="piece" data-piece={piece ? piece.color + piece.type : undefined}>
                      {piece
                        ? boardTheme === "bubble-gum"
                          ? <img className="bubble-gum-piece" src={`/boards/bubble-gum/${piece.color}${piece.type}.png`} alt="" draggable={false}/>
                          : symbols[piece.color + piece.type]
                        : legal.includes(square)
                          ? "·"
                          : ""}
                    </span>
                    {premove?.to === square && premovePiece && (
                      <span
                        className={
                          "premove-ghost " +
                          (premovePiece.color === "w"
                            ? "white-piece"
                            : "black-piece")
                        }
                        aria-hidden="true"
                      >
                        {symbols[premovePiece.color + premovePiece.type]}
                      </span>
                    )}
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
          {premove ? (
            <p className="premove-note">
              Premove queued. It will play automatically if legal.
            </p>
          ) : canPremove ? (
            <p className="premove-note">
              Your opponent is thinking. Select your next move to queue one
              premove.
            </p>
          ) : null}
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
          <section className="board-theme-picker" aria-label="Board color">
            <span>Board color</span>
            <div>
              {[
                ["slate", "Chess Burger"],
                ["classic", "Classic green"],
                ["wood", "Warm wood"],
                ["bubble-gum", "Bubble Gum"],
                ["meta-blue", "Meta Blue"],
              ].map(([theme, label]) => (
                <button
                  key={theme}
                  type="button"
                  className={boardTheme === theme ? "active" : ""}
                  aria-pressed={boardTheme === theme}
                  onClick={() =>
                    chooseBoardTheme(theme as "slate" | "classic" | "wood" | "bubble-gum" | "meta-blue")
                  }
                >
                  <i className={"board-swatch " + theme} aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>
          </section>
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
            {onAbort && match.status === "active" && (
              <button className="abort-match-button" onClick={() => setConfirmAbort((value) => !value)}>
                <Flag size={15} />
                Abort match
              </button>
            )}
          </div>
          {confirmAbort && (
            <div className="resign-confirm abort-confirm" role="alertdialog" aria-label="Abort match">
              <p>Abort this match?</p>
              <small>Both players receive no CBR, Gold, or EXP. Every fifth abort triggers a 1-minute cooldown.</small>
              <button
                disabled={busy}
                onClick={() => {
                  onAbort?.();
                  setConfirmAbort(false);
                }}
              >
                Yes, abort match
              </button>
              <button onClick={() => setConfirmAbort(false)}>Keep playing</button>
            </div>
          )}
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
