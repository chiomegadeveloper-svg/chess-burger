"use client";
import {useCallback,useEffect,useState} from "react";
import {arena} from "./arena-client";
import type {ArenaMatch} from "./game-rules";
import {AvatarFrameOverlay} from "./avatar-frame-art";
import FeedCardSnapshot from "./feed-card-snapshot";
import {useRef} from "react";
import {Chess} from "chess.js";
import "./scheduled-challenges.css";

export type ScheduledChallenge={
  id:string;host_id:string;target_id:string|null;host_name:string;target_name:string|null;
  host_avatar_url:string;target_avatar_url:string;host_frame_id:string|null;target_frame_id:string|null;
  control:string;scheduled_at:string;created_at:string;proposal_at:string|null;
  status:"pending"|"countered"|"accepted";match_id:string|null;match_status:string|null;
  wager_kind:"none"|"cbg"|"cbr";wager_amount:number;
};
const dateTime=(value:string)=>new Date(value).toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short"});
const localValue=(value:string)=>{const d=new Date(value);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)};
export default function ScheduledChallenges({userId,onMatch,compact=false}:{userId?:string|null;onMatch:(id:string)=>void;compact?:boolean}){
  const [watchId,setWatchId]=useState<string|null>(null),[watchMatch,setWatchMatch]=useState<{status:string;pgn:string;result:string|null;white_name:string;black_name:string;control:string}|null>(null),[watchError,setWatchError]=useState(""),[items,setItems]=useState<ScheduledChallenge[]>([]),[error,setError]=useState(""),[busy,setBusy]=useState(""),[counter,setCounter]=useState<Record<string,string>>({}),[hoverUser,setHoverUser]=useState<string|null>(null),[confirmWager,setConfirmWager]=useState<ScheduledChallenge|null>(null);
  const hoverTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  useEffect(()=>()=>{if(hoverTimer.current)clearTimeout(hoverTimer.current)},[]);
  const showCard=(id:string)=>{if(hoverTimer.current)clearTimeout(hoverTimer.current);hoverTimer.current=setTimeout(()=>setHoverUser(id),220)};
  const hideCard=()=>{if(hoverTimer.current)clearTimeout(hoverTimer.current);setHoverUser(null)};
  useEffect(()=>{if(!watchId)return;let active=true;const load=async()=>{try{const r=await arena<{match:{status:string;pgn:string;result:string|null;white_name:string;black_name:string;control:string}}>("schedule-spectate",{id:watchId});if(active){setWatchMatch(r.match);setWatchError("")}}catch(e){if(active)setWatchError((e as Error).message)}};void load();const timer=window.setInterval(()=>void load(),3000);return()=>{active=false;window.clearInterval(timer)}},[watchId]);
  const game=new Chess();if(watchMatch?.pgn){try{game.loadPgn(watchMatch.pgn)}catch{/* Keep the last readable board when a match record is incomplete. */}}
  const glyphs:Record<string,string>={wk:"♔",wq:"♕",wr:"♖",wb:"♗",wn:"♘",wp:"♙",bk:"♚",bq:"♛",br:"♜",bb:"♝",bn:"♞",bp:"♟"};
  const refresh=useCallback(async()=>{if(!userId)return;try{const r=await arena<{challenges:ScheduledChallenge[]}>("schedule-list");setItems(r.challenges);setError("");}catch(e){setError((e as Error).message)}},[userId]);
  useEffect(()=>{void refresh();const timer=window.setInterval(()=>{if(document.visibilityState==="visible")void refresh()},30000);const changed=()=>void refresh();window.addEventListener("cb-profile-saved",changed);return()=>{window.clearInterval(timer);window.removeEventListener("cb-profile-saved",changed)}},[refresh]);
  const action=async(item:ScheduledChallenge,response:string)=>{
    setBusy(item.id);setError("");
    try{
      if(response==="launch"){
        const r=await arena<{match:ArenaMatch}>("schedule-launch",{id:item.id});
        if(r.match.status==="active")onMatch(r.match.id);
        else {setError("Invitation opened. The other player can accept it from notifications. Keep this tab open.");await refresh()}
      }else{await arena("schedule-respond",{id:item.id,response,scheduled_at:counter[item.id]?new Date(counter[item.id]).toISOString():undefined});setConfirmWager(null);await refresh();window.dispatchEvent(new Event("cb-profile-saved"))}
    }catch(e){setError((e as Error).message)}finally{setBusy("")}
  };
  if(!userId)return <p className="account-note">Sign in to view scheduled challenges.</p>;
  const visible=items;
  return <section className={compact?"scheduled-challenges compact":"scheduled-challenges"} aria-label="Scheduled chess challenges">
    {!compact&&<h2>Scheduled challenges</h2>}
    {error&&!compact&&<p role="alert" className="account-note">{error}</p>}
    {visible.length===0&&!compact&&<p className="account-note">No scheduled challenges yet. Create one from Challenge a Player.</p>}
    {visible.map(item=>{
      const host=item.host_id===userId,target=item.target_id===userId,due=Date.parse(item.scheduled_at),now=Date.now();
      const wager=item.wager_kind==='none'?'No wager':`${item.wager_amount} ${item.wager_kind.toUpperCase()} wager`;const canOpen=item.status==="accepted"&&(host||target)&&now>=due-15*60000&&now<=due+30*60000;
      return <article key={item.id} className="scheduled-card">
        <div><strong>{compact?(item.match_status==="active"?"A mighty chess battle is live":item.status==="accepted"?"A mighty chess battle is scheduled":"A chess challenge awaits"):(host?"Your challenge":item.host_name+" challenges "+(item.target_name??"anyone"))}</strong>{compact&&<span>{item.host_name} vs. {item.target_name??"any challenger"} · {item.match_status==="active"?"Watch it live now.":item.status==="accepted"?`Watch it live here on ${dateTime(item.scheduled_at)}.`:`Scheduled for ${dateTime(item.scheduled_at)}.`}</span>}<span>{item.control} · {dateTime(item.scheduled_at)} · {Intl.DateTimeFormat().resolvedOptions().timeZone}</span><span>{wager} · {item.status==="countered"?"Reschedule offered":item.status==="accepted"?"Accepted":item.target_id?"Awaiting reply":"Open to anyone"}</span>{item.proposal_at&&<span>Proposed: {dateTime(item.proposal_at)}</span>}</div>
        <div className="scheduled-versus" aria-label={`${item.host_name} versus ${item.target_name??"an open challenger"}`}>
          <button type="button" className="scheduled-player" aria-label={`Preview ${item.host_name}'s user card`} onMouseEnter={()=>showCard(item.host_id)} onMouseLeave={hideCard} onFocus={()=>setHoverUser(item.host_id)} onBlur={hideCard} onClick={()=>setHoverUser(item.host_id)}>
            <span className={`feed-avatar scheduled-avatar${item.host_frame_id?" has-avatar-frame":""}`}>{item.host_avatar_url?<img src={item.host_avatar_url} alt=""/>:item.host_name.charAt(0)}<AvatarFrameOverlay frameId={item.host_frame_id}/></span>
          </button>
          <img className="scheduled-vs" src="/challenge-vs.png" alt="versus"/>
          {item.target_id?<button type="button" className="scheduled-player" aria-label={`Preview ${item.target_name??"challenger"}'s user card`} onMouseEnter={()=>showCard(item.target_id!)} onMouseLeave={hideCard} onFocus={()=>setHoverUser(item.target_id)} onBlur={hideCard} onClick={()=>setHoverUser(item.target_id)}>
            <span className={`feed-avatar scheduled-avatar${item.target_frame_id?" has-avatar-frame":""}`}>{item.target_avatar_url?<img src={item.target_avatar_url} alt=""/>:(item.target_name??"?").charAt(0)}<AvatarFrameOverlay frameId={item.target_frame_id}/></span>
          </button>:<span className="scheduled-avatar scheduled-open" aria-label="Waiting for a challenger">?</span>}
        </div>
        <div className="scheduled-actions">
          {!host&&!item.target_id&&item.status==="pending"&&<button disabled={!!busy} onClick={()=>item.wager_kind==="none"?void action(item,"join"):setConfirmWager(item)}>{item.wager_kind==="none"?"Accept slot":`Review ${wager}`}</button>}
          {target&&item.status==="pending"&&<><button disabled={!!busy} onClick={()=>item.wager_kind==="none"?void action(item,"accept"):setConfirmWager(item)}>{item.wager_kind==="none"?"Accept invitation":`Review ${wager}`}</button><label>Offer new time<input type="datetime-local" min={localValue(new Date(Date.now()+15*60000).toISOString())} max={localValue(new Date(Date.parse(item.created_at)+5*86400000).toISOString())} value={counter[item.id]??""} onChange={e=>setCounter(v=>({...v,[item.id]:e.target.value}))}/></label><button disabled={!!busy||!counter[item.id]} onClick={()=>void action(item,"counter")}>Offer reschedule</button><button disabled={!!busy} onClick={()=>void action(item,"reject")}>Decline invitation</button></>}
          {target&&item.status==="countered"&&<><button disabled={!!busy} onClick={()=>void action(item,"withdraw-counter")}>Cancel reschedule offer</button><button disabled={!!busy} onClick={()=>void action(item,"reject")}>Decline invitation</button></>}
          {host&&item.status==="countered"&&<><button disabled={!!busy} onClick={()=>void action(item,"accept")}>Agree to new time</button><button disabled={!!busy} onClick={()=>void action(item,"reject")}>Reject offer</button></>}
          {host&&item.status==="pending"&&<button disabled={!!busy} onClick={()=>void action(item,"reject")}>Cancel</button>}
          {(host||target)&&item.status==="accepted"&&!item.match_id&&<button disabled={!!busy} onClick={()=>void action(item,"reject")}>Cancel challenge</button>}
          {canOpen&&<button disabled={!!busy} onClick={()=>void action(item,"launch")}>Open match</button>}
          {item.status==="accepted"&&item.match_id&&["waiting","active"].includes(item.match_status??"")&&<button onClick={()=>{setWatchMatch(null);setWatchError("");setWatchId(item.id)}}>Watch live</button>}
        </div>
      </article>
    })}
    {hoverUser&&<FeedCardSnapshot userId={hoverUser}/>}
    {watchId&&<div className="scheduled-wager-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setWatchId(null)}}><div className="scheduled-watch-dialog" role="dialog" aria-modal="true" aria-label="Live chess battle"><div className="scheduled-watch-head"><strong>{watchMatch?watchMatch.white_name+" vs. "+watchMatch.black_name:"Loading battle…"}</strong><button type="button" onClick={()=>setWatchId(null)} aria-label="Close live battle">×</button></div>{watchError?<p role="alert">{watchError}</p>:<><p>{watchMatch?.status==="active"?"Live · Updates every 3 seconds":watchMatch?.status==="finished"?"Battle finished"+(watchMatch.result?" · "+watchMatch.result:""):"Waiting for both players to join"}</p><div className="scheduled-watch-board" role="img" aria-label="Current live chess position">{game.board().flatMap((rank,row)=>rank.map((piece,col)=><span key={row+"-"+col} className={(row+col)%2?"dark":"light"}>{piece?glyphs[piece.color+piece.type]:""}</span>))}</div></>}</div></div>}
    {confirmWager&&<div className="scheduled-wager-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setConfirmWager(null)}}><div className="scheduled-wager-dialog" role="dialog" aria-modal="true" aria-label="Confirm challenge wager"><h3>Confirm wager invitation</h3><p>{confirmWager.host_name} offers a {confirmWager.wager_amount} {confirmWager.wager_kind.toUpperCase()} wager for {confirmWager.control} on {dateTime(confirmWager.scheduled_at)}.</p><p>Accept only if you agree to the wager. You can decline or offer another time before accepting.</p><div><button type="button" disabled={!!busy} onClick={()=>setConfirmWager(null)}>Review later</button><button type="button" disabled={!!busy} onClick={()=>void action(confirmWager,confirmWager.target_id?"accept":"join")}>Accept wager</button></div></div></div>}
  </section>
}
