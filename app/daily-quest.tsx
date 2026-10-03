"use client";
import {useEffect,useState} from "react";
import {getSupabase} from "./supabase";
import {toast} from "sonner";
import "./daily-quest.css";

type Combo={reward_cbg:number;reward_cbr:number;reward_tickets:number};
type Quest=Combo&{quest_day:string;targets:Record<string,number>;claimed_at:string|null;reward_combo_legacy:boolean;reward_kind?:string;reward_amount?:number};
type State={quest:Quest;progress:Record<string,number>;server_now:string};
const names:Record<string,string>={puzzles:"Solve puzzles",online:"Play online games",cpu:"Play CPU games",quiz:"Play Quiz ATTACK games",arena:"Play an Arena game"};
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
  useEffect(()=>{void refresh();const timer=window.setInterval(()=>void refresh(),30000);const changed=()=>void refresh();const storage=(event:StorageEvent)=>{if(event.key==="cb-daily-quest-reward-change")changed();};window.addEventListener("cb-daily-quest-settings-changed",changed);window.addEventListener("storage",storage);return()=>{window.clearInterval(timer);window.removeEventListener("cb-daily-quest-settings-changed",changed);window.removeEventListener("storage",storage);};},[]);
  const quest=state?.quest,progress=state?.progress??{};
  const entries=Object.entries(quest?.targets??{}),required=entries.filter(([key])=>key!=="arena");
  const done=required.length>0&&required.every(([key,target])=>(progress[key]??0)>=target);
  return <section className="daily-quest" aria-label="Daily Quest"><header><div><small>NEW EACH DAY · PHILIPPINE TIME</small><h2>Daily Quest</h2><p>Complete today’s chess missions and claim your reward.</p></div><img className="quest-treasure" src="/daily-quest-reward-chest.webp" width={190} height={190} alt="Treasure chest with CBG, CBR, and an Arena Ticket" /></header>
    {error&&<p role="alert" className="quest-error">{error}</p>}
    {!quest&&!error&&<p role="status">Loading today’s quests…</p>}
    {quest&&<><div className="quest-reward"><span>{quest.reward_combo_legacy?"PREVIOUS REWARD":"YOUR COMBO REWARD"}</span><strong>{quest.reward_combo_legacy?`${quest.reward_amount??0} ${quest.reward_kind==="arena_ticket"?"Arena Tickets":(quest.reward_kind??"CBG").toUpperCase()}`:<>{quest.reward_cbg.toLocaleString()} CBG <i>+</i> {quest.reward_cbr.toLocaleString()} CBR <i>+</i> {quest.reward_tickets.toLocaleString()} Arena {quest.reward_tickets===1?"Ticket":"Tickets"}</>}</strong><small>{quest.claimed_at?"Claimed today":"Owner changes apply until you claim"}</small></div>
      <div className="quest-list">{entries.map(([key,target])=>{const count=Math.min(progress[key]??0,target),complete=count>=target;return <article key={key} className={complete?"complete":""}><span className="quest-symbol" aria-hidden="true">{key==="puzzles"?"♟":key==="online"?"♜":key==="cpu"?"♞":key==="quiz"?"♛":"♚"}</span><div><strong>{names[key]??key}</strong><small>{key==="arena"?"Optional bonus activity":"Required mission"}</small><div className="quest-meter" role="progressbar" aria-label={names[key]} aria-valuenow={count} aria-valuemin={0} aria-valuemax={target}><span style={{width:`${count/target*100}%`}} /></div></div><b>{count}/{target}</b></article>})}</div>
      <div className="quest-actions"><button type="button" onClick={()=>void refresh()} disabled={busy}>Refresh progress</button><button type="button" disabled={busy||!done||!!quest.claimed_at} onClick={()=>{setBusy(true);void questRequest<State>("quest-claim").then(next=>{setState(next);toast.success("Daily Quest reward claimed!");window.dispatchEvent(new Event("cb-profile-saved"));}).catch(e=>toast.error((e as Error).message)).finally(()=>setBusy(false));}}>{quest.claimed_at?"Reward claimed":busy?"Claiming…":"Claim reward"}</button></div>
      <p className="quest-footnote">Quests reset at midnight in the Philippines. Arena is optional and does not block your reward.</p></>}
  </section>;
}

export function DailyQuestCms(){
  const [settings,setSettings]=useState<Combo|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  useEffect(()=>{void questRequest<{settings:Combo}>("quest-owner-settings").then(data=>setSettings(data.settings)).catch(e=>setError((e as Error).message));},[]);
  return <section className="cms-panel daily-quest quest-cms"><header><div><small>OWNER SETTINGS</small><h2>Daily Quest combo reward</h2><p>Set all three amounts. Changes apply to today’s unclaimed quests; claimed rewards stay recorded.</p></div></header>{error&&<p role="alert" className="quest-error">{error}</p>}{settings?<div className="quest-cms-fields"><label>CBG<input type="number" min={1} max={10000} value={settings.reward_cbg} onChange={e=>setSettings({...settings,reward_cbg:Number(e.target.value)})}/></label><label>CBR<input type="number" min={1} max={10000} value={settings.reward_cbr} onChange={e=>setSettings({...settings,reward_cbr:Number(e.target.value)})}/></label><label>Arena Tickets<input type="number" min={1} max={10} value={settings.reward_tickets} onChange={e=>setSettings({...settings,reward_tickets:Number(e.target.value)})}/></label><button type="button" disabled={busy} onClick={()=>{setBusy(true);void questRequest<{settings:Combo}>("quest-save-owner-settings",{cbg:settings.reward_cbg,cbr:settings.reward_cbr,tickets:settings.reward_tickets}).then(data=>{setSettings(data.settings);window.dispatchEvent(new Event("cb-daily-quest-settings-changed"));try{localStorage.setItem("cb-daily-quest-reward-change",String(Date.now()));}catch{}toast.success("Daily Quest combo saved. Unclaimed quests will refresh.");}).catch(e=>toast.error((e as Error).message)).finally(()=>setBusy(false));}}>{busy?"Saving…":"Save combo"}</button></div>:!error&&<p role="status">Loading combo settings…</p>}</section>;
}
