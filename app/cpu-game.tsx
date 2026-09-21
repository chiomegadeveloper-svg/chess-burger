"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, ChevronLeft, RotateCcw, Shield, Trophy, X } from "lucide-react";
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
const ROBOT_NAMES = ["Nova Knight", "Byte Bishop", "Rook-9", "Pixel Pawn", "Quantum Queen", "Neon Castle", "Astro Gambit", "Circuit Sage", "Mecha Mate", "Orbit King"] as const;
const ROBOT_COLORS = [["#38d9e8", "#163f59"], ["#f0bf58", "#68451e"], ["#9b7cff", "#352769"], ["#63df9a", "#185a3d"], ["#ff7f8e", "#672833"]] as const;
function robotAvatar(index: number) { const [accent,dark]=ROBOT_COLORS[index%ROBOT_COLORS.length];const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="${accent}"/><stop offset="1" stop-color="${dark}"/></linearGradient></defs><rect width="96" height="96" rx="24" fill="${dark}"/><path d="M48 15v9M43 12h10" stroke="${accent}" stroke-width="5" stroke-linecap="round"/><rect x="20" y="25" width="56" height="48" rx="16" fill="url(#g)" stroke="#e9fbff" stroke-width="3"/><circle cx="37" cy="46" r="6" fill="#fff"/><circle cx="59" cy="46" r="6" fill="#fff"/><path d="M34 61h28" stroke="#fff" stroke-width="5" stroke-linecap="round"/><path d="M14 43v17M82 43v17" stroke="${accent}" stroke-width="7" stroke-linecap="round"/><path d="M31 79h34" stroke="${accent}" stroke-width="8" stroke-linecap="round"/></svg>`;return `data:image/svg+xml,${encodeURIComponent(svg)}`; }

function createMatch(player: ArenaPlayer, level: (typeof levels)[number], control: string): ArenaMatch {
  const now = Date.now();
  const milliseconds = timeControl(control).seconds * 1000;
  const identity=crypto.getRandomValues(new Uint32Array(1))[0]%ROBOT_NAMES.length;
  return { id: crypto.randomUUID(), host_id: player.user_id, white_id: player.user_id, black_id: "chess-burger-ai", invite_to: null, code: "CPU", control, status: "active", pgn: "", white_ms: milliseconds, black_ms: milliseconds, last_tick: now, version: 0, result: null, white_cbr: player.cbr, black_cbr: level.elo, rating_applied: 1, created_at: now, server_now: now, reactions: "{}", play_mode: "normal", white: player, black: { user_id: "chess-burger-ai", username: `ai_level_${level.level}`, display_name: ROBOT_NAMES[identity], avatar_url: robotAvatar(identity), country_code: "AI", cbr: level.elo, gold_points: 0, wins: 0, losses: 0, win_streak: 0 } };
}

export default function CpuGame({ player, onClose, onReward }: { player: ArenaPlayer; onClose: () => void; onReward: () => void }) {
  const [selectedLevel, setSelectedLevel] = useState<(typeof levels)[number] | null>(null), [control, setControl] = useState("10+0"), [match, setMatch] = useState<ArenaMatch | null>(null), [engineReady, setEngineReady] = useState(false), [thinking, setThinking] = useState(false), [engineError, setEngineError] = useState(""), [rewardStatus, setRewardStatus] = useState(""), [endReason,setEndReason]=useState<"checkmate"|"timeout"|"resigned"|"aborted"|"">(""),[showStats,setShowStats]=useState(false),[settledStats,setSettledStats]=useState<{cbr:number;gold:number;cbrDelta:number;goldDelta:number}|null>(null);
  const workerRef = useRef<Worker | null>(null), matchRef = useRef<ArenaMatch | null>(null), levelRef = useRef<(typeof levels)[number] | null>(null), claimedRef = useRef(new Set<string>()),aiWatchdogRef=useRef<number|null>(null);
  useEffect(() => { matchRef.current = match; }, [match]);
  useEffect(() => { levelRef.current = selectedLevel; }, [selectedLevel]);
  useEffect(() => {
    if (!selectedLevel) return;
    setEngineReady(false); setEngineError("");
    const worker = new Worker("/stockfish/stockfish-19-lite-single.js");
    workerRef.current = worker;
    worker.onerror = () => { setThinking(false); setEngineError("The AI engine could not start on this device. Refresh and try again."); };
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
        if(aiWatchdogRef.current!==null){window.clearTimeout(aiWatchdogRef.current);aiWatchdogRef.current=null;}
        const uci = line.split(/\s+/)[1], current = matchRef.current;
        if (!current || current.status !== "active" || !uci || uci === "(none)") { setThinking(false); return; }
        const movedAt=Date.now(),blackRemaining=Math.max(0,current.black_ms-Math.max(0,movedAt-current.last_tick));
        if(blackRemaining<=0){setThinking(false);return;}
        const chess = gameFromPgn(current.pgn);
        try {
          chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.slice(4, 5) || "q" });
          const result = boardResult(chess);
          const increment=timeControl(current.control).increment*1000;
          setMatch((value) => { if (!value||value.id!==current.id) return value; const next = { ...value, pgn: chess.pgn(), black_ms:blackRemaining+increment, version: value.version + 1, status: result ? "finished" as const : "active" as const, result, last_tick:movedAt, server_now:movedAt }; if(result){setEndReason("checkmate");setShowStats(true);} matchRef.current = next; return next; });
        } catch { setEngineError("The AI returned an invalid move. Start a new CPU game."); }
        setThinking(false);
      }
    };
    worker.postMessage("uci");
    return () => { if(aiWatchdogRef.current!==null){window.clearTimeout(aiWatchdogRef.current);aiWatchdogRef.current=null;}worker.postMessage("quit"); worker.terminate(); workerRef.current = null; };
  }, [selectedLevel]);

  useEffect(()=>{const timer=window.setInterval(()=>{const current=matchRef.current;if(!current||current.status!=="active")return;const chess=gameFromPgn(current.pgn),whiteTurn=chess.turn()==="w",remaining=(whiteTurn?current.white_ms:current.black_ms)-Math.max(0,Date.now()-current.last_tick);if(remaining>0)return;workerRef.current?.postMessage("stop");setThinking(false);const endedAt=Date.now(),next={...current,status:"finished" as const,result:whiteTurn?"black" as const:"white" as const,white_ms:whiteTurn?0:current.white_ms,black_ms:whiteTurn?current.black_ms:0,last_tick:endedAt,server_now:endedAt,version:current.version+1};matchRef.current=next;setMatch(next);setEndReason("timeout");setShowStats(true);},250);return()=>window.clearInterval(timer);},[]);

  useEffect(() => {
    if (!match || match.status !== "finished" || match.result === "draw" || !match.result || !selectedLevel || claimedRef.current.has(match.id)) return;
    const won = match.result === "white";
    claimedRef.current.add(match.id); setRewardStatus(won ? "Awarding your victory…" : "Updating your CBR…");
    arena<{ awarded: boolean; cbr:number;gold:number;cbr_delta: number; gold_delta: number }>("claim-cpu-reward", { game_id: match.id, control: match.control, level: selectedLevel.level, pgn: match.pgn, outcome: won ? "win" : "loss" })
      .then((result) => { setSettledStats({cbr:Number(result.cbr),gold:Number(result.gold),cbrDelta:Number(result.cbr_delta),goldDelta:Number(result.gold_delta)});setRewardStatus(result.awarded ? (won ? `Victory reward: +${result.gold_delta} Gold · +${result.cbr_delta} CBR` : `CPU loss: ${result.cbr_delta} CBR · no Gold deducted`) : "This CPU result was already recorded."); onReward(); })
      .catch((error) => { claimedRef.current.delete(match.id); setRewardStatus(error instanceof Error ? error.message : "Reward could not be awarded. Try again."); });
  }, [match, onReward, selectedLevel]);

  function start(level: (typeof levels)[number]) { if(aiWatchdogRef.current!==null){window.clearTimeout(aiWatchdogRef.current);aiWatchdogRef.current=null;}const next = createMatch(player, level, control); setSelectedLevel(level); setMatch(next); matchRef.current = next; setRewardStatus("");setSettledStats(null);setEndReason("");setShowStats(false);setThinking(false); }
  function playerMove(move: { from: string; to: string; promotion?: string }) {
    if (!match || thinking || !engineReady) return;
    const chess = gameFromPgn(match.pgn);
    try { chess.move({ from: move.from, to: move.to, promotion: move.promotion || "q" }); } catch { return; }
    const movedAt=Date.now(),remaining=Math.max(0,match.white_ms-Math.max(0,movedAt-match.last_tick));
    if(remaining<=0)return;
    const result = boardResult(chess),increment=timeControl(match.control).increment*1000,next = { ...match, pgn: chess.pgn(),white_ms:remaining+increment, version: match.version + 1, status: result ? "finished" as const : "active" as const, result, last_tick:movedAt, server_now:movedAt };
    setMatch(next); matchRef.current = next;if(result){setEndReason("checkmate");setShowStats(true);}
    if (!result) { const expectedVersion=next.version,thinkTime=selectedLevel?.think??300;setThinking(true); workerRef.current?.postMessage(`position fen ${chess.fen()}`); workerRef.current?.postMessage(`go movetime ${thinkTime}`);if(aiWatchdogRef.current!==null)window.clearTimeout(aiWatchdogRef.current);aiWatchdogRef.current=window.setTimeout(()=>{const current=matchRef.current;if(!current||current.status!=="active"||current.version!==expectedVersion||gameFromPgn(current.pgn).turn()!=="b")return;const fallbackGame=gameFromPgn(current.pgn),legal=fallbackGame.moves({verbose:true});if(!legal.length)return;const choice=legal[(current.version+(selectedLevel?.level??1))%legal.length],playedAt=Date.now(),remaining=Math.max(0,current.black_ms-Math.max(0,playedAt-current.last_tick));if(remaining<=0)return;fallbackGame.move({from:choice.from,to:choice.to,promotion:choice.promotion||"q"});const fallbackResult=boardResult(fallbackGame),increment=timeControl(current.control).increment*1000,fallback={...current,pgn:fallbackGame.pgn(),black_ms:remaining+increment,version:current.version+1,status:fallbackResult?"finished" as const:"active" as const,result:fallbackResult,last_tick:playedAt,server_now:playedAt};matchRef.current=fallback;setMatch(fallback);setThinking(false);aiWatchdogRef.current=null;if(fallbackResult){setEndReason("checkmate");setShowStats(true);}},Math.max(3200,thinkTime+1800)); }
  }
  function resign(){if(aiWatchdogRef.current!==null)window.clearTimeout(aiWatchdogRef.current);workerRef.current?.postMessage("stop");setThinking(false);setEndReason("resigned");setShowStats(true);setMatch(value=>value?{...value,status:"finished",result:"black",version:value.version+1}:value);}
  function abort(){if(aiWatchdogRef.current!==null)window.clearTimeout(aiWatchdogRef.current);workerRef.current?.postMessage("stop");setThinking(false);setEndReason("aborted");setRewardStatus("Aborted CPU game · no CBR or Gold change");setSettledStats({cbr:player.cbr,gold:player.gold_points,cbrDelta:0,goldDelta:0});setShowStats(true);setMatch(value=>value?{...value,status:"cancelled",result:null,version:value.version+1}:value);}

  if (!selectedLevel || !match) return <section className="cpu-setup"><button className="back-button" type="button" onClick={onClose}><ChevronLeft size={16}/>Match Lobby</button><div className="page-heading"><div><span className="cpu-eyebrow">Chess Burger AI Arena</span><h1>Play with CPU</h1><p>Wins earn Gold and CBR; losses deduct CBR only. CPU games never change your live-match count.</p></div><Bot size={38}/></div><div className="cpu-rewards"><strong>CPU rating</strong><span>Bullet: win +2 Gold/+2 CBR · loss −3 CBR</span><span>Blitz: win +3 Gold/+3 CBR · loss −4 CBR</span><span>Rapid: win +5 Gold/+5 CBR · loss −6 CBR</span></div><div className="cpu-time-controls" aria-label="CPU time control">{TIME_CONTROLS.map(item=><button type="button" className={control===item.id?"active":""} aria-pressed={control===item.id} key={item.id} onClick={()=>setControl(item.id)}><strong>{item.label}</strong><small>{item.group} · win +{REWARDS[item.group as keyof typeof REWARDS]} / loss −{LOSSES[item.group as keyof typeof LOSSES]}</small></button>)}</div><div className="cpu-levels" role="list" aria-label="AI strength levels">{levels.map(level=><button type="button" role="listitem" key={level.level} onClick={()=>start(level)}><span>{level.level}</span><div><strong>{level.label}</strong><small>Approx. {level.elo} strength</small></div></button>)}</div></section>;
  const moves=gameFromPgn(match.pgn).history().length,outcome=match.status==="cancelled"?"aborted":match.result==="white"?"win":match.result==="black"?"loss":"draw";
  return <section className="cpu-game"><button className="back-button" type="button" onClick={onClose}><ChevronLeft size={16}/>Match Lobby</button><div className="cpu-game-status"><img src={match.black?.avatar_url} alt=""/><div><strong>{match.black?.display_name}</strong><small>AI Level {selectedLevel.level} · {selectedLevel.label}</small></div><span>{engineError||(thinking?`${match.black?.display_name} is thinking…`:engineReady?`${timeControl(match.control).group} · You play White`:"Loading AI engine…")}</span></div>{rewardStatus&&<div className="cpu-reward-status" role="status">{rewardStatus}</div>}<div className="cpu-board-actions"><button type="button" onClick={()=>start(selectedLevel)}><RotateCcw size={15}/>New game</button><button type="button" onClick={()=>{workerRef.current?.postMessage("stop");setThinking(false);setMatch(null);setSelectedLevel(null);}}>Change setup</button></div><MatchBoard match={match} ownId={player.user_id} onMove={playerMove} onResign={resign} onAbort={abort} busy={thinking||!engineReady} connection="AI · Local engine"/>{showStats&&<div className="cpu-result-overlay"><section className="cpu-result-dialog" role="dialog" aria-modal="true" aria-labelledby="cpu-result-title"><button className="cpu-result-close" type="button" aria-label="Close statistics" onClick={()=>setShowStats(false)}><X size={18}/></button><div className={`cpu-result-icon ${outcome}`}>{outcome==="win"?<Trophy/>:outcome==="aborted"?<Shield/>:<Bot/>}</div><h1 id="cpu-result-title">{outcome==="win"?"You won!":outcome==="loss"?endReason==="resigned"?"You resigned":"AI won":outcome==="aborted"?"Game aborted":"Game drawn"}</h1><p>Against {match.black?.display_name}</p><div className="cpu-result-players"><div><img src={player.avatar_url} alt=""/><strong>{player.display_name}</strong><small>You · White</small></div><b>VS</b><div><img src={match.black?.avatar_url} alt=""/><strong>{match.black?.display_name}</strong><small>AI Level {selectedLevel.level}</small></div></div><div className="cpu-result-stats"><div><strong>{timeControl(match.control).label}</strong><span>{timeControl(match.control).group}</span></div><div><strong>{moves}</strong><span>Moves played</span></div><div><strong className={(settledStats?.cbrDelta??0)<0?"negative":"positive"}>{settledStats?`${settledStats.cbrDelta>0?"+":""}${settledStats.cbrDelta}`:outcome==="draw"?"0":"…"}</strong><span>CBR change</span></div><div><strong className="gold">{settledStats?`${settledStats.goldDelta>0?"+":""}${settledStats.goldDelta}`:outcome==="draw"?"0":"…"}</strong><span>Gold change</span></div></div><p className="cpu-result-reason">{endReason==="resigned"?"Result recorded by resignation.":endReason==="aborted"?"No rating or Gold was changed.":rewardStatus||"Final game statistics"}</p><div className="cpu-result-actions"><button type="button" onClick={()=>start(selectedLevel)}><RotateCcw size={16}/>Play again</button><button type="button" onClick={()=>{setShowStats(false);setMatch(null);setSelectedLevel(null);}}>Change setup</button><button type="button" onClick={onClose}>Match Lobby</button></div></section></div>}</section>;
}
