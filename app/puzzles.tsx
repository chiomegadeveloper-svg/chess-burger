"use client";

import { useEffect, useMemo, useState } from "react";
import { Chess, type Square } from "chess.js";
import { ArrowLeft, Check, Coins, Lightbulb, LockKeyhole, RotateCcw, Volume2 } from "lucide-react";
import { arena } from "./arena-client";
import { DAILY_PUZZLES } from "./puzzle-data";

const symbols: Record<string, string> = { wk: "♚", wq: "♛", wr: "♜", wb: "♝", wn: "♞", wp: "♟", bk: "♚", bq: "♛", br: "♜", bb: "♝", bn: "♞", bp: "♟" };
type PuzzleState = { completed: string[]; gold: number; bonus_claimed: boolean; day: string };

export default function Puzzles({ onClose, onReward }: { onClose: () => void; onReward: () => void }) {
  const [state, setState] = useState<PuzzleState | null>(null);
  const [index, setIndex] = useState(0);
  const [game, setGame] = useState(() => new Chess(DAILY_PUZZLES[0].fen));
  const [selected, setSelected] = useState<Square | null>(null);
  const [message, setMessage] = useState("Find the winning move.");
  const [hintOpen, setHintOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const puzzle = DAILY_PUZZLES[index];
  const completed = new Set(state?.completed ?? []);
  const unlocked = index === 0 || completed.has(DAILY_PUZZLES[index - 1].id);
  const legal = useMemo(() => selected ? game.moves({ square: selected, verbose: true }).map(move => move.to) : [], [game, selected]);

  useEffect(() => {
    arena<PuzzleState>("puzzle-state").then(result => {
      setState(result);
      const next = DAILY_PUZZLES.findIndex(item => !result.completed.includes(item.id));
      setIndex(next < 0 ? DAILY_PUZZLES.length - 1 : next);
    }).catch(error => setMessage(error instanceof Error ? error.message : "Puzzle progress could not load."));
  }, []);
  useEffect(() => { setGame(new Chess(puzzle.fen)); setSelected(null); setHintOpen(false); setMessage(completed.has(puzzle.id) ? "Solved today. Replay it for practice." : "Find the winning move."); }, [puzzle.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function reset() { setGame(new Chess(puzzle.fen)); setSelected(null); setMessage("Try again. Look for checks, captures and threats."); }
  async function play(square: Square) {
    if (!unlocked || busy) return;
    const piece = game.get(square);
    if (!selected) { if (piece?.color === game.turn()) setSelected(square); return; }
    if (piece?.color === game.turn()) { setSelected(square); return; }
    const copy = new Chess(game.fen());
    let move;
    try { move = copy.move({ from: selected, to: square, promotion: "q" }); } catch { setSelected(null); return; }
    const uci = `${move.from}${move.to}${move.promotion ?? ""}`;
    setSelected(null);
    if (uci !== puzzle.solution) { setMessage("That move works on the board, but it misses the fastest win. Try again."); return; }
    setGame(copy);
    if (completed.has(puzzle.id)) { setMessage("Correct — excellent pattern recognition!"); return; }
    setBusy(true); setMessage("Correct! Securing your Gold…");
    try {
      const result = await arena<PuzzleState & { awarded: boolean; gold_delta: number }>("claim-puzzle", { puzzle_id: puzzle.id, move: uci });
      setState(result); onReward();
      setMessage(result.awarded ? `Solved! +${result.gold_delta} Gold added.` : "This puzzle was already claimed today.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Reward could not be claimed."); }
    finally { setBusy(false); }
  }
  function coachSpeak() {
    const text = hintOpen ? puzzle.hint : `${puzzle.title}. ${puzzle.theme}. Find the winning move.`;
    if ("speechSynthesis" in window) { window.speechSynthesis.cancel(); window.speechSynthesis.speak(new SpeechSynthesisUtterance(text)); }
    setHintOpen(true);
  }

  return <section className="puzzle-page">
    <button className="back-button" type="button" onClick={onClose}><ArrowLeft size={16}/>Match Lobby</button>
    <header className="puzzle-hero"><div><span>Daily tactics trail</span><h1>Puzzle Quest</h1><p>Solve all 10 positions. Each first solve earns 2 Gold, plus 5 Gold for finishing the trail.</p></div><div className="puzzle-gold"><Coins/><strong>{state?.gold ?? "—"}</strong><small>Your Gold</small></div></header>
    <div className="puzzle-trail" aria-label="Daily puzzle levels">{DAILY_PUZZLES.map((item, level) => { const done = completed.has(item.id), open = level === 0 || completed.has(DAILY_PUZZLES[level - 1].id); return <button type="button" key={item.id} className={`${level === index ? "active" : ""} ${done ? "done" : ""}`} disabled={!open} onClick={() => setIndex(level)} aria-label={`Puzzle ${level + 1}: ${done ? "complete" : open ? "available" : "locked"}`}><span>{done ? <Check/> : open ? level + 1 : <LockKeyhole/>}</span><small>{done ? "Solved" : open ? "Play" : "Locked"}</small></button>; })}</div>
    <div className="puzzle-workspace">
      <div className="puzzle-board-wrap"><div className="puzzle-board" aria-label={`Chess puzzle: ${puzzle.title}`}>{game.board().flat().map((piece, cell) => { const row = Math.floor(cell / 8), column = cell % 8, square = (`${"abcdefgh"[column]}${8 - row}`) as Square; return <button type="button" key={square} aria-label={`${square}${piece ? ` ${piece.color === "w" ? "white" : "black"} ${piece.type}` : " empty"}`} className={`puzzle-square ${(row + column) % 2 ? "dark" : "light"} ${selected === square ? "selected" : ""} ${legal.includes(square) ? "legal" : ""} ${piece?.color === "w" ? "white-piece" : "black-piece"}`} onClick={() => void play(square)}><span className="puzzle-piece">{piece ? symbols[piece.color + piece.type] : ""}</span>{column === 0 && <small className="puzzle-rank">{8 - row}</small>}{row === 7 && <small className="puzzle-file">{"abcdefgh"[column]}</small>}</button>; })}</div></div>
      <aside className="puzzle-coach"><div className="coach-avatar"><img src="/puzzles/coach-patty.webp" alt="Coach Patty, a friendly white queen chess character"/></div><span>Free local coach</span><h2>Coach Patty</h2><p>{message}</p>{hintOpen && <div className="coach-hint"><Lightbulb/>{puzzle.hint}</div>}<div className="coach-actions"><button type="button" onClick={() => setHintOpen(value => !value)}><Lightbulb/>Hint</button><button type="button" onClick={coachSpeak}><Volume2/>Read</button><button type="button" onClick={reset}><RotateCcw/>Reset</button></div><div className="puzzle-detail"><span>Level {index + 1} of 10</span><strong>{puzzle.title}</strong><small>{puzzle.theme} · White to move</small></div></aside>
    </div>
  </section>;
}
