'use client';
import {useEffect,useState} from 'react';
import {ChevronLeft,ChevronRight,Crown,RefreshCw,Trophy,Target,Swords,Calculator,Bot,Grid3X3} from 'lucide-react';
import {readArenaResponse} from './arena-response';
import {levelFor} from './cbr';
import {cbrBoard,rankingModes,type Board,type RankingResult} from './ranking-boards';
import type {PlayerProfile} from './supabase';
import './rankings-hub.css';
const icons=[Target,Swords,Calculator,Bot,Grid3X3];
function BoardPanel({board,profile,onOpenProfile}:{board:Board;profile:PlayerProfile|null;onOpenProfile:(id:string)=>void}){
 const [page,setPage]=useState(1),[sessionId,setSessionId]=useState(''),[refresh,setRefresh]=useState(0),[result,setResult]=useState<RankingResult|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const [sessions,setSessions]=useState<NonNullable<RankingResult['sessions']>>([]);
 const userId=profile?.user_id&&profile.user_id!=='guest-device'?profile.user_id:null;
 useEffect(()=>{const controller=new AbortController();setLoading(true);setError('');setResult(null);
 const query=new URLSearchParams({action:'rankings',board:board.key,page:String(page)});if(userId)query.set('user_id',userId);if(sessionId)query.set('session_id',sessionId);
 void fetch(`/api/grand-arena?${query}`,{cache:'no-store',signal:controller.signal}).then(response=>readArenaResponse<RankingResult>(response,'Rankings are temporarily unavailable. Please try again shortly.')).then(data=>{if(!controller.signal.aborted){setResult(data);if(data.sessions)setSessions(data.sessions);}}).catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Rankings are temporarily unavailable.');}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();
 },[board.key,page,sessionId,userId,refresh]);
 const current=result?.page??page,rows=result?.rows??[],isCbr=board.key==='cbr';
 return <section className={`rh-board ${isCbr?'rh-cbr':''}`} aria-label={board.title}>
  <header className="rh-board-head"><div><span className="rh-eyebrow">{isCbr?'MAIN LEADERBOARD':'GAME LEADERBOARD'}</span><h2>{board.title}</h2><p>{board.description}</p></div><button className="rh-refresh" type="button" disabled={loading} onClick={()=>setRefresh(value=>value+1)} aria-label={`Refresh ${board.title}`}><RefreshCw size={16}/><span>Refresh</span></button></header>
  {board.key==='arena_session'&&<label className="rh-session">Arena session<select value={sessionId} onChange={event=>{setSessionId(event.target.value);setPage(1);}}><option value="">Current or most recent Arena</option>{sessions.map(s=><option key={s.id} value={s.id}>{s.title} · {new Date(s.starts_at).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:'Asia/Manila'})} PH</option>)}</select></label>}
  <div className="rh-list-head"><span>{current===1?'Top 10':`Ranks ${(current-1)*10+1}–${Math.min(current*10,result?.total??current*10)}`}</span><span>{board.unit}</span></div>
  {error?<div className="rh-empty rh-error" role="alert"><Trophy size={28}/><p>{error}</p><button type="button" onClick={()=>setRefresh(value=>value+1)}>Try again</button></div>:loading?<div className="rh-loading" role="status" aria-label="Loading rankings">{Array.from({length:5},(_,i)=><span key={i}/>)}<p>Loading rankings…</p></div>:rows.length?<ol className="rh-rows" start={(current-1)*10+1}>{rows.map(row=>{
   const own=row.user_id===userId,reward=isCbr&&row.rank<=10?(row.rank===1?10:row.rank===2?9:row.rank===3?8:5):0;
   return <li key={row.user_id} className={`${row.rank<=3?'rh-podium':''} ${own?'rh-own':''}`}><button type="button" className="rh-player-row" onClick={()=>onOpenProfile(row.user_id)} aria-label={`Rank ${row.rank}: view ${row.display_name||row.username||'Player'} profile`}>
    <span className="rh-position">{row.rank===1?<Crown size={21}/>:String(row.rank).padStart(2,'0')}</span><span className="rh-avatar">{row.avatar_url?<img src={row.avatar_url} alt="" width={44} height={44} loading="lazy" onError={event=>{event.currentTarget.onerror=null;event.currentTarget.src='/cburger_logo.png';}}/>:<span>{(row.display_name||row.username||'P').replace(/^@/,'').slice(0,1).toUpperCase()}</span>}</span>
    <span className="rh-player-name"><strong>{row.display_name||row.username||'Player'}{own&&<i>YOU</i>}</strong><small>{row.username?'@'+row.username.replace(/^@/,''):row.detail}</small></span><span className="rh-value"><strong>{Number(row.value).toLocaleString(undefined,{maximumFractionDigits:2})}</strong><small>{board.unit}</small></span><span className="rh-detail">{row.detail}{reward>0&&<b>+{reward} CBG / day</b>}</span>
   </button></li>;
  })}</ol>:<div className="rh-empty" role="status"><Trophy size={32}/><strong>No results yet</strong><p>Complete a game in this category to earn a place.</p></div>}
  <footer className="rh-pagination"><span>{result?`${result.total.toLocaleString()} ranked players`:'10 players per page'}</span><nav aria-label={`${board.title} pages`}><button type="button" aria-label={`Previous ${board.title} page`} disabled={loading||!result||current<=1} onClick={()=>setPage(current-1)}><ChevronLeft size={17}/></button><span>Page {current} / {result?.pages??1}</span><button type="button" aria-label={`Next ${board.title} page`} disabled={loading||!result||current>=result.pages} onClick={()=>setPage(current+1)}><ChevronRight size={17}/></button></nav></footer>
  {userId&&<div className="rh-my-rank"><span>Your position<strong>{loading?'…':result?.mine?`#${result.mine.rank}`:error?'Unavailable':'Unranked'}</strong></span><span>{isCbr?'Your CBR':board.unit}<strong>{isCbr?(result?.mine?.value??profile?.cbr??88).toLocaleString():result?.mine?.value.toLocaleString()??'—'}</strong></span>{isCbr&&<span>Level<strong>{levelFor(result?.mine?.value??profile?.cbr??88).level}</strong></span>}</div>}
 </section>;
}
export default function Rankings({profile,onOpenProfile}:{profile:PlayerProfile|null;onOpenProfile:(id:string)=>void}){
 const [modeKey,setModeKey]=useState('puzzle'),[boardKey,setBoardKey]=useState('puzzle_today');
 const mode=rankingModes.find(item=>item.key===modeKey)??rankingModes[0],board=mode.boards.find(item=>item.key===boardKey)??mode.boards[0];
 return <div className="rankings-hub"><header className="rh-hero"><span className="rh-hero-icon"><Trophy size={28}/></span><div><span className="rh-eyebrow">CHESS BURGER · HALL OF PLAYERS</span><h1>Rankings</h1><p>One place for every challenge. Find the leaders and your next goal.</p></div></header>
  <BoardPanel board={cbrBoard} profile={profile} onOpenProfile={onOpenProfile}/>
  <section className="rh-game-section" aria-labelledby="rh-games-title"><header className="rh-games-head"><div><span className="rh-eyebrow">EXPLORE THE GAME</span><h2 id="rh-games-title">Game leaderboards</h2></div><span>Top 10 · 10 players per page</span></header>
   <div className="rh-mode-tabs" role="group" aria-label="Choose a game">{rankingModes.map((item,i)=>{const Icon=icons[i];return <button type="button" key={item.key} aria-pressed={item.key===modeKey} onClick={()=>{setModeKey(item.key);setBoardKey(item.boards[0].key);}}><Icon size={19}/><span>{item.label}</span></button>;})}</div>
   <label className="rh-category">Ranking category<select value={board.key} onChange={event=>setBoardKey(event.target.value)}>{mode.boards.map(item=><option key={item.key} value={item.key}>{item.title}</option>)}</select></label>
   <BoardPanel key={board.key} board={board} profile={profile} onOpenProfile={onOpenProfile}/>
  </section>
 </div>;
}
