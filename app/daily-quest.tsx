"use client";
import {useEffect,useState} from "react";
import {getSupabase} from "./supabase";
import {toast} from "sonner";
import "./daily-quest.css";

type Kind="cbg"|"arena_ticket"|"cbr";
type Quest={quest_day:string;targets:Record<string,number>;reward_kind:Kind;reward_amount:number;claimed_at:string|null};
type State={quest:Quest;progress:Record<string,number>;server_now:string};
const names:Record<string,string>={puzzles:"Solve puzzles",online:"Play online games",cpu:"Play CPU games",quiz:"Play Quiz ATTACK games",arena:"Play an Arena game"};
const rewardNames:Record<Kind,string>={cbg:"CBG",arena_ticket:"Arena Ticket",cbr:"CBR"};
export async function questRequest<T>(action:string,body:Record<string,unknown>={}):Promise<T>{
  const client=await getSupabase(),session=client?(await client.auth.getSession()).data.session:null;
  if(!session)throw Error("Sign in to open Daily Quest.");
  const response=await fetch("/api/grand-arena",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({action,...body}),cache:"no-store"});
  const data=await response.json() as T&{error?:string};
  if(!response.ok)throw Error(data.error??"Daily Quest is temporarily unavailable.");
  return data;
}

export default function DailyQuest(){
  const [state,setState]=useState<State|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  async function refresh(){try{setState(await questRequest<State>("quest-state"));setError("");}catch(e){setError((e as Error).message);}}
  useEffect(()=>{void refresh();const timer=window.setInterval(()=>void refresh(),30000);return()=>window.clearInterval(timer);},[]);
  const quest=state?.quest,progress=state?.progress??{};
  const entries=Object.entries(quest?.targets??{}),required=entries.filter(([key])=>key!=="arena");
  const done=required.length>0&&required.every(([key,target])=>(progress[key]??0)>=target);
  return <section className="daily-quest" aria-label="Daily Quest"><header><div><small>NEW EACH DAY · PHILIPPINE TIME</small><h2>Daily Quest</h2><p>Complete today’s chess missions and claim your reward.</p></div><span className="quest-mark" aria-hidden="true">♞</span></header>
    {error&&<p role="alert" className="quest-error">{error}</p>}
    {!quest&&!error&&<p role="status">Loading today’s quests…</p>}
    {quest&&<><div className="quest-reward"><span>YOUR REWARD</span><strong>{quest.reward_amount.toLocaleString()} {rewardNames[quest.reward_kind]}</strong><small>{quest.claimed_at?"Claimed today":"Set by the owner when this quest was assigned"}</small></div>
      <div className="quest-list">{entries.map(([key,target])=>{const count=Math.min(progress[key]??0,target),complete=count>=target;return <article key={key} className={complete?"complete":""}><span className="quest-symbol" aria-hidden="true">{key==="puzzles"?"♟":key==="online"?"♜":key==="cpu"?"♞":key==="quiz"?"♛":"♚"}</span><div><strong>{names[key]??key}</strong><small>{key==="arena"?"Optional bonus activity":"Required mission"}</small><div className="quest-meter" role="progressbar" aria-label={names[key]} aria-valuenow={count} aria-valuemin={0} aria-valuemax={target}><span style={{width:`${count/target*100}%`}} /></div></div><b>{count}/{target}</b></article>})}</div>
      <div className="quest-actions"><button type="button" onClick={()=>void refresh()} disabled={busy}>Refresh progress</button><button type="button" disabled={busy||!done||!!quest.claimed_at} onClick={()=>{setBusy(true);void questRequest<State>("quest-claim").then(next=>{setState(next);toast.success("Daily Quest reward claimed!");window.dispatchEvent(new Event("cb-profile-saved"));}).catch(e=>toast.error((e as Error).message)).finally(()=>setBusy(false));}}>{quest.claimed_at?"Reward claimed":busy?"Claiming…":"Claim reward"}</button></div>
      <p className="quest-footnote">Quests reset at midnight in the Philippines. Arena is optional and does not block your reward.</p></>}
  </section>;
}

export function DailyQuestCms(){
  const [settings,setSettings]=useState<{reward_kind:Kind;reward_amount:number}|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  useEffect(()=>{void questRequest<{settings:{reward_kind:Kind;reward_amount:number}}>("quest-owner-settings").then(data=>setSettings(data.settings)).catch(e=>setError((e as Error).message));},[]);
  return <section className="cms-panel daily-quest quest-cms"><header><div><small>OWNER SETTINGS</small><h2>Daily Quest reward</h2><p>Set the reward for newly assigned quests. Existing daily rewards remain fixed.</p></div></header>{error&&<p role="alert" className="quest-error">{error}</p>}{settings?<div className="quest-cms-fields"><label>Reward type<select value={settings.reward_kind} onChange={e=>setSettings({...settings,reward_kind:e.target.value as Kind})}><option value="cbg">Chess Burger Gold (CBG)</option><option value="arena_ticket">Arena Tickets</option><option value="cbr">Chess Burger Rating (CBR)</option></select></label><label>Amount<input type="number" min={1} max={10000} value={settings.reward_amount} onChange={e=>setSettings({...settings,reward_amount:Number(e.target.value)})}/></label><button type="button" disabled={busy} onClick={()=>{setBusy(true);void questRequest<{settings:typeof settings}>("quest-save-owner-settings",{kind:settings.reward_kind,amount:settings.reward_amount}).then(data=>{setSettings(data.settings);toast.success("Daily Quest reward saved.");}).catch(e=>toast.error((e as Error).message)).finally(()=>setBusy(false));}}>{busy?"Saving…":"Save reward"}</button></div>:!error&&<p role="status">Loading reward settings…</p>}</section>;
}
