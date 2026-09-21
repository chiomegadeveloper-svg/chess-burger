"use client";

import { useEffect, useMemo, useState } from "react";
import { Chess, type Square } from "chess.js";
import { ArrowLeft, Check, Coins, Lightbulb, LockKeyhole, RotateCcw, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { arena } from "./arena-client";
import { DAILY_PUZZLES, PUZZLE_CHAPTERS } from "./puzzle-data";

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
  const chapter = PUZZLE_CHAPTERS[puzzle.chapter - 1];
  const chapterPuzzles = DAILY_PUZZLES.filter(item => item.chapter === puzzle.chapter);
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
  function openChapter(number:number){const first=(number-1)*10;if(first>0&&!completed.has(DAILY_PUZZLES[first-1].id))return;const next=DAILY_PUZZLES.findIndex((item,itemIndex)=>item.chapter===number&&itemIndex>=first&&!completed.has(item.id));setIndex(next<0?first+9:next);}
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
    if (completed.has(puzzle.id)) { setMessage("Correct — excellent pattern recognition!");toast.success(`Puzzle ${puzzle.number} solved again!`,{description:`Chapter ${puzzle.chapter}: ${chapter.title} · Practice replay`});return; }
    setBusy(true); setMessage("Correct! Securing your Gold…");
    try {
      const result = await arena<PuzzleState & { awarded: boolean; gold_delta: number }>("claim-puzzle", { puzzle_id: puzzle.id, move: uci });
      setState(result); onReward();
      setMessage(result.awarded ? `Solved! +${result.gold_delta} Gold added.` : "This puzzle was already claimed.");
      if(result.awarded)toast.success(`Puzzle ${puzzle.number} solved!`,{description:result.gold_delta>2?`+2 Gold · +5 Gold chapter bonus`:`+${result.gold_delta} Gold added to your balance`});
      else toast.success(`Puzzle ${puzzle.number} solved!`,{description:"Reward already claimed for this puzzle."});
    } catch (error) { setMessage(error instanceof Error ? error.message : "Reward could not be claimed."); }
    finally { setBusy(false); }
  }
  function coachSpeak() {
    const text = hintOpen ? puzzle.hint : `${puzzle.title}. ${puzzle.theme}. Find the winning move.`;
    if ("speechSynthesis" in window) {
      const speech = window.speechSynthesis,utterance = new SpeechSynthesisUtterance(text),voices=speech.getVoices();
      const femaleName=/(female|samantha|zira|aria|jenny|ava|susan|karen|moira|tessa|victoria|serena|siri)/i;
      utterance.voice=voices.find(voice=>/^en-PH$/i.test(voice.lang)&&femaleName.test(voice.name))
        ??voices.find(voice=>/^en-PH$/i.test(voice.lang))
        ??voices.find(voice=>/^en-(US|GB|AU)$/i.test(voice.lang)&&femaleName.test(voice.name))
        ??voices.find(voice=>/^en/i.test(voice.lang)&&femaleName.test(voice.name))
        ??voices.find(voice=>/^en/i.test(voice.lang))
        ??null;
      utterance.lang=utterance.voice?.lang??"en-PH";
      utterance.rate=.94;utterance.pitch=1.12;utterance.volume=1;
      speech.cancel();speech.speak(utterance);
    }
    setHintOpen(true);
  }

  return <section className="puzzle-page">
    <button className="back-button" type="button" onClick={onClose}><ArrowLeft size={16}/>Match Lobby</button>
    <header className="puzzle-hero"><div><span>100-puzzle campaign</span><h1>Puzzle Quest</h1><p>10 chapters with 10 unique puzzles each. Earn 2 Gold per first solve and a 5-Gold chapter bonus.</p></div><div className="puzzle-gold"><Coins/><strong>{state?.gold ?? "—"}</strong><small>Your Gold</small></div></header>
    <div className="puzzle-chapters" aria-label="Puzzle chapters">{PUZZLE_CHAPTERS.map(item=>{const first=(item.number-1)*10,open=first===0||completed.has(DAILY_PUZZLES[first-1].id),done=completed.has(DAILY_PUZZLES[first+9].id);return <button type="button" key={item.number} className={`${item.number===puzzle.chapter?"active":""} ${done?"done":""}`} disabled={!open} onClick={()=>openChapter(item.number)}><b>{open?item.number:<LockKeyhole/>}</b><span><small>{item.difficulty}</small><strong>{item.title}</strong></span></button>})}</div>
    <div className="chapter-heading"><div><span>Chapter {chapter.number} · {chapter.difficulty}</span><h2>{chapter.title}</h2><p>{chapter.description}</p></div><strong>{chapterPuzzles.filter(item=>completed.has(item.id)).length}/10 solved</strong></div>
    <div className="puzzle-trail" aria-label={`Chapter ${chapter.number} puzzle levels`}>{chapterPuzzles.map(item => {const level=DAILY_PUZZLES.indexOf(item),done=completed.has(item.id),open=level===0||completed.has(DAILY_PUZZLES[level-1].id);return <button type="button" key={item.id} className={`${level===index?"active":""} ${done?"done":""}`} disabled={!open} onClick={()=>setIndex(level)} aria-label={`Puzzle ${item.number}: ${done?"complete":open?"available":"locked"}`}><span>{done?<Check/>:open?item.number:<LockKeyhole/>}</span><small>{done?"Solved":open?"Play":"Locked"}</small></button>})}</div>
    <div className="puzzle-workspace">
      <div className="puzzle-board-wrap"><div className="puzzle-board" aria-label={`Chess puzzle: ${puzzle.title}`}>{game.board().flat().map((piece, cell) => { const row = Math.floor(cell / 8), column = cell % 8, square = (`${"abcdefgh"[column]}${8 - row}`) as Square; return <button type="button" key={square} aria-label={`${square}${piece ? ` ${piece.color === "w" ? "white" : "black"} ${piece.type}` : " empty"}`} className={`puzzle-square ${(row + column) % 2 ? "dark" : "light"} ${selected === square ? "selected" : ""} ${legal.includes(square) ? "legal" : ""} ${piece?.color === "w" ? "white-piece" : "black-piece"}`} onClick={() => void play(square)}><span className="puzzle-piece">{piece ? symbols[piece.color + piece.type] : ""}</span>{column === 0 && <small className="puzzle-rank">{8 - row}</small>}{row === 7 && <small className="puzzle-file">{"abcdefgh"[column]}</small>}</button>; })}</div></div>
      <aside className="puzzle-coach"><div className="coach-avatar"><img src="/puzzles/coach-patty.webp" alt="Coach Patty, a friendly white queen chess character"/></div><span>Free local coach</span><h2>Coach Patty</h2><p>{message}</p>{hintOpen && <div className="coach-hint"><Lightbulb/>{puzzle.hint}</div>}<div className="coach-actions"><button type="button" onClick={() => setHintOpen(value => !value)}><Lightbulb/>Hint</button><button type="button" onClick={coachSpeak}><Volume2/>Read</button><button type="button" onClick={reset}><RotateCcw/>Reset</button></div><div className="puzzle-detail"><span>Chapter {puzzle.chapter} · Puzzle {puzzle.number}</span><strong>{puzzle.title}</strong><small>{puzzle.difficulty} · {puzzle.theme} · White to move</small></div></aside>
    </div>
  </section>;
}
