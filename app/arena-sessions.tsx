"use client";
import {useEffect, useState} from "react";
import "./arena-registration.css";

export type ArenaBattle = {
  id: string; date: string; title: string; slot: number;
  starts_at: string; ends_at: string; loss_limit: number; registered: boolean;
  players: {user_id: string; status: string; player?: {display_name: string; username?: string; avatar_url: string} | null}[];
};
export function battleLabel(battle: ArenaBattle) {
  const date = new Date(battle.starts_at).toLocaleString([], {weekday:"short",month:"short",day:"numeric",hour:"numeric",minute:"2-digit",timeZone:"Asia/Manila"});
  const end = new Date(battle.ends_at).toLocaleString([], {month:"short",day:"numeric",hour:"numeric",minute:"2-digit",timeZone:"Asia/Manila"});
  return `${date} – ${end}`;
}
export function BattleRoster({battle}: {battle: ArenaBattle}) {
  return <><h4>{battle.players.length} registered {battle.players.length===1?"player":"players"}</h4>
    {battle.players.length ? <ul>{battle.players.map(row=><li key={row.user_id}><img src={row.player?.avatar_url||"/cburger_logo.png"} alt=""/><span>{row.player?.display_name||row.player?.username||"Player"}<small>{row.status==="registered"?"Waiting for Arena to open":row.status==="waiting"?"Checked in · standby":row.status==="playing"?"In match":row.status==="eliminated"?"Eliminated":"Champion"}</small></span></li>)}</ul> : <p>No registrations yet. Reserve your place!</p>}
  </>;
}
export function BattleCards({battles, onRegister, busy=false, tickets}: {battles:ArenaBattle[];onRegister:(battle:ArenaBattle)=>void;busy?:boolean;tickets?:number}) {
  if (!battles.length) return <p>No upcoming battles published. Check back for the owner’s next Arena schedule.</p>;
  return <div className="arena-schedule-list">{battles.map(battle=><article key={battle.id}>
    <h3>{battle.title}</h3><p className="arena-schedule-time">{battleLabel(battle)} · PH time</p>
    <p>{battle.loss_limit} {battle.loss_limit===1?"loss eliminates":"losses eliminate"}</p>
    <button type="button" className="gold-button" disabled={busy||battle.registered||(tickets!==undefined&&tickets<1)} onClick={()=>onRegister(battle)}>{battle.registered?"Registered · waiting for Arena to open":busy?"Please wait…":"Register now · 1 ticket"}</button>
    <BattleRoster battle={battle}/>
  </article>)}</div>;
}
export default function PublicArenaSessions({onOpen}: {onOpen:()=>void}) {
  const [state,setState]=useState<{upcoming:ArenaBattle[];current:ArenaBattle|null}|null>(null);
  const [error,setError]=useState("");
  useEffect(()=>{
    const controller=new AbortController();
    const load=async()=>{try{const response=await fetch("/api/grand-arena?action=window",{cache:"no-store",signal:controller.signal});const data=await response.json() as {upcoming:ArenaBattle[];current:ArenaBattle|null;error?:string};if(!response.ok)throw Error(data.error||"Arena schedules are unavailable.");setState(data);setError("");}catch(e){if(!controller.signal.aborted)setError((e as Error).message);}};
    void load();const timer=setInterval(()=>void load(),15000);
    return()=>{controller.abort();clearInterval(timer);};
  },[]);
  return <section className="arena-upcoming"><div className="arena-section-title"><div><span>OWNER-SCHEDULED BATTLES</span><h2>Grand Arena schedule &amp; waiting rosters</h2></div></div>
    {error?<p role="alert">{error}</p>:!state?<p>Loading the owner’s Arena schedule…</p>:<>
      {state.current&&<article className="arena-live-roster"><h3>{state.current.title} · Arena open</h3><p>{battleLabel(state.current)} · PH time</p><BattleRoster battle={state.current}/><button className="gold-button" onClick={onOpen}>Enter Arena</button></article>}
      <BattleCards battles={state.upcoming} onRegister={onOpen}/>
    </>}
  </section>;
}
