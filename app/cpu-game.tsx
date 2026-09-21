"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, ChevronLeft, RotateCcw } from "lucide-react";
import { arena } from "./arena-client";
import { gameFromPgn, boardResult, TIME_CONTROLS, timeControl, type ArenaMatch, type ArenaPlayer } from "./game-rules";
import MatchBoard from "./match-board";

const levels = [
  { level: 1, label: "Beginner", elo: 1320, skill: 0, think: 80 },
  { level: 2, label: "Learner", elo: 1450, skill: 2, think: 120 },
  { level: 3, label: "Casual", elo: 1600, skill: 4, think: 180 },
  { level: 4, label: "Club", elo: 1750, skill: 6, think: 260 },
  { level: 5, label: "Skilled", elo: 1900, skill: 8, think: 360 },
  { level: 6, label: "Advanced", elo: 2050, skill: 10, think: 480 },
  { level: 7, label: "Expert", elo: 2200, skill: 13, think: 650 },
  { level: 8, label: "Master", elo: 2400, skill: 16, think: 850 },
  { level: 9, label: "Grandmaster", elo: 2600, skill: 18, think: 1100 },
  { level: 10, label: "Maximum", elo: 2850, skill: 20, think: 1400 },
] as const;

const REWARDS = { Bullet: 2, Blitz: 3, Rapid: 5 } as const;
const LOSSES = { Bullet: 3, Blitz: 4, Rapid: 6 } as const;

function createMatch(player: ArenaPlayer, level: (typeof levels)[number], control: string): ArenaMatch {
  const now = Date.now();
  const milliseconds = timeControl(control).seconds * 1000;
  return { id: crypto.randomUUID(), host_id: player.user_id, white_id: player.user_id, black_id: "stockfish-cpu", invite_to: null, code: "CPU", control, status: "active", pgn: "", white_ms: milliseconds, black_ms: milliseconds, last_tick: now, version: 0, result: null, white_cbr: player.cbr, black_cbr: level.elo, rating_applied: 1, created_at: now, server_now: now, reactions: "{}", play_mode: "normal", white: player, black: { user_id: "stockfish-cpu", username: `stockfish_level_${level.level}`, display_name: `Stockfish · Level ${level.level}`, avatar_url: "", country_code: "CPU", cbr: level.elo, gold_points: 0, wins: 0, losses: 0, win_streak: 0 } };
}

export default function CpuGame({ player, onClose, onReward }: { player: ArenaPlayer; onClose: () => void; onReward: () => void }) {
  const [selectedLevel, setSelectedLevel] = useState<(typeof levels)[number] | null>(null), [control, setControl] = useState("10+0"), [match, setMatch] = useState<ArenaMatch | null>(null), [engineReady, setEngineReady] = useState(false), [thinking, setThinking] = useState(false), [engineError, setEngineError] = useState(""), [rewardStatus, setRewardStatus] = useState("");
  const workerRef = useRef<Worker | null>(null), matchRef = useRef<ArenaMatch | null>(null), levelRef = useRef<(typeof levels)[number] | null>(null), claimedRef = useRef(new Set<string>());
  useEffect(() => { matchRef.current = match; }, [match]);
  useEffect(() => { levelRef.current = selectedLevel; }, [selectedLevel]);
  useEffect(() => {
    if (!selectedLevel) return;
    setEngineReady(false); setEngineError("");
    const worker = new Worker("/stockfish/stockfish-19-lite-single.js");
    workerRef.current = worker;
    worker.onerror = () => { setThinking(false); setEngineError("Stockfish could not start on this device. Refresh and try again."); };
    worker.onmessage = (event) => {
      const line = String(event.data ?? "");
      if (line === "uciok") {
        const level = levelRef.current; if (!level) return;
        worker.postMessage(`setoption name Skill Level value ${level.skill}`);
        worker.postMessage("setoption name UCI_LimitStrength value true");
        worker.postMessage(`setoption name UCI_Elo value ${level.elo}`);
        worker.postMessage("isready");
      } else if (line === "readyok") setEngineReady(true);
      else if (line.startsWith("bestmove ")) {
        const uci = line.split(/\s+/)[1], current = matchRef.current;
        if (!current || current.status !== "active" || !uci || uci === "(none)") { setThinking(false); return; }
        const chess = gameFromPgn(current.pgn);
        try {
          chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.slice(4, 5) || "q" });
          const result = boardResult(chess);
          setMatch((value) => { if (!value) return value; const next = { ...value, pgn: chess.pgn(), version: value.version + 1, status: result ? "finished" as const : "active" as const, result, last_tick: Date.now(), server_now: Date.now() }; matchRef.current = next; return next; });
        } catch { setEngineError("Stockfish returned an invalid move. Start a new CPU game."); }
        setThinking(false);
      }
    };
    worker.postMessage("uci");
    return () => { worker.postMessage("quit"); worker.terminate(); workerRef.current = null; };
  }, [selectedLevel]);

  useEffect(() => {
    if (!match || match.status !== "finished" || match.result === "draw" || !match.result || !selectedLevel || claimedRef.current.has(match.id)) return;
    const won = match.result === "white";
    claimedRef.current.add(match.id); setRewardStatus(won ? "Awarding your victory…" : "Updating your CBR…");
    arena<{ awarded: boolean; cbr_delta: number; gold_delta: number }>("claim-cpu-reward", { game_id: match.id, control: match.control, level: selectedLevel.level, pgn: match.pgn, outcome: won ? "win" : "loss" })
      .then((result) => { setRewardStatus(result.awarded ? (won ? `Victory reward: +${result.gold_delta} Gold · +${result.cbr_delta} CBR` : `CPU loss: ${result.cbr_delta} CBR · no Gold deducted`) : "This CPU result was already recorded."); onReward(); })
      .catch((error) => { claimedRef.current.delete(match.id); setRewardStatus(error instanceof Error ? error.message : "Reward could not be awarded. Try again."); });
  }, [match, onReward, selectedLevel]);

  function start(level: (typeof levels)[number]) { const next = createMatch(player, level, control); setSelectedLevel(level); setMatch(next); matchRef.current = next; setRewardStatus(""); setThinking(false); }
  function playerMove(move: { from: string; to: string; promotion?: string }) {
    if (!match || thinking || !engineReady) return;
    const chess = gameFromPgn(match.pgn);
    try { chess.move({ from: move.from, to: move.to, promotion: move.promotion || "q" }); } catch { return; }
    const result = boardResult(chess), next = { ...match, pgn: chess.pgn(), version: match.version + 1, status: result ? "finished" as const : "active" as const, result, last_tick: Date.now(), server_now: Date.now() };
    setMatch(next); matchRef.current = next;
    if (!result) { setThinking(true); workerRef.current?.postMessage(`position fen ${chess.fen()}`); workerRef.current?.postMessage(`go movetime ${selectedLevel?.think ?? 300}`); }
  }
  function resign() { workerRef.current?.postMessage("stop"); setThinking(false); setMatch((value) => value ? { ...value, status: "finished", result: "black", version: value.version + 1 } : value); }

  if (!selectedLevel || !match) return <section className="cpu-setup"><button className="back-button" type="button" onClick={onClose}><ChevronLeft size={16}/>Match Lobby</button><div className="page-heading"><div><span className="cpu-eyebrow">Powered by Stockfish 19 Lite</span><h1>Play with CPU</h1><p>Wins earn Gold and CBR; losses deduct CBR only. CPU games never change your live-match count.</p></div><Bot size={38}/></div><div className="cpu-rewards"><strong>CPU rating</strong><span>Bullet: win +2 Gold/+2 CBR · loss −3 CBR</span><span>Blitz: win +3 Gold/+3 CBR · loss −4 CBR</span><span>Rapid: win +5 Gold/+5 CBR · loss −6 CBR</span></div><div className="cpu-time-controls" aria-label="CPU time control">{TIME_CONTROLS.map((item) => <button type="button" className={control === item.id ? "active" : ""} aria-pressed={control === item.id} key={item.id} onClick={() => setControl(item.id)}><strong>{item.label}</strong><small>{item.group} · win +{REWARDS[item.group as keyof typeof REWARDS]} / loss −{LOSSES[item.group as keyof typeof LOSSES]}</small></button>)}</div><div className="cpu-levels" role="list" aria-label="Stockfish strength levels">{levels.map((level) => <button type="button" role="listitem" key={level.level} onClick={() => start(level)}><span>{level.level}</span><div><strong>{level.label}</strong><small>Approx. {level.elo} strength</small></div></button>)}</div></section>;
  return <section className="cpu-game"><button className="back-button" type="button" onClick={onClose}><ChevronLeft size={16}/>Match Lobby</button><div className="cpu-game-status"><Bot size={18}/><strong>Stockfish Level {selectedLevel.level}</strong><span>{engineError || (thinking ? "CPU is thinking…" : engineReady ? `${timeControl(match.control).group} · You play White` : "Loading engine…")}</span></div>{rewardStatus && <div className="cpu-reward-status" role="status">{rewardStatus}</div>}<MatchBoard match={match} ownId={player.user_id} onMove={playerMove} onResign={resign} busy={thinking || !engineReady} connection="CPU · Local engine" matchActions={<div className="cpu-actions"><button type="button" onClick={() => start(selectedLevel)}><RotateCcw size={15}/>New game</button><button type="button" onClick={() => { workerRef.current?.postMessage("stop"); setThinking(false); setMatch(null); setSelectedLevel(null); }}>Change setup</button></div>}/></section>;
}
