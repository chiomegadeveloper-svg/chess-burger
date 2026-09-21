"use client";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Coins, Gift, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { arena } from "./arena-client";
import { feedBanner } from "./feed-banner-catalog";

type Reward = { day:number; kind:"gold"|"banner"; amount?:number; days?:number; product_id?:string; name?:string };
type Status = { day:number; claimed_today:boolean; rewards:Reward[] };
const PREVIEW:Reward[]=[
  {day:1,kind:"gold",amount:10},{day:2,kind:"banner",days:3,product_id:"pastel-blush",name:"Random Pastel"},
  {day:3,kind:"gold",amount:18},{day:4,kind:"gold",amount:18},{day:5,kind:"banner",days:3,product_id:"pastel-mint",name:"Random Pastel"},
  {day:6,kind:"gold",amount:18},{day:7,kind:"banner",days:5,product_id:"pastel-violet",name:"Random Pastel"},
];

export default function DailyRewards({open,onClose,onClaimed}:{open:boolean;onClose:()=>void;onClaimed:()=>void}){
  const [status,setStatus]=useState<Status|null>(null),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState("");
  const load=useCallback(async()=>{setLoading(true);setError("");try{const data=await arena<Status>("daily-reward-status");setStatus(data);if(data.claimed_today)onClose();}catch(e){setError((e as Error).message);}finally{setLoading(false);}},[onClose]);
  useEffect(()=>{if(!open)return;let live=true;setTimeout(()=>{if(live)void load();},0);return()=>{live=false;};},[open,load]);
  useEffect(()=>{if(!open)return;const key=(event:KeyboardEvent)=>{if(event.key==="Escape")onClose();};document.addEventListener("keydown",key);const old=document.body.style.overflow;document.body.style.overflow="hidden";return()=>{document.removeEventListener("keydown",key);document.body.style.overflow=old;};},[open,onClose]);
  if(!open||typeof document==="undefined")return null;
  const shown=status??{day:1,claimed_today:false,rewards:PREVIEW},today=shown.rewards[shown.day-1];
  const claim=async()=>{if(!status){void load();return;}setBusy(true);try{const result=await arena<Status&{reward:Reward}>("claim-daily-reward");setStatus(result);onClaimed();toast.success(result.reward.kind==="gold"?`${result.reward.amount} Gold claimed`:`${result.reward.name} banner added to your Bag`);onClose();}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
  return createPortal(<div className="daily-reward-backdrop"><section className="daily-reward-modal" role="dialog" aria-modal="true" aria-labelledby="daily-reward-title">
    <button className="daily-reward-close" aria-label="Close daily rewards" onClick={onClose}><X size={18}/></button>
    <div className="daily-reward-heading"><span>7-DAY LOGIN STREAK</span><h2 id="daily-reward-title">Daily Rewards</h2><p>Sign in every day. Claim today&apos;s prize and keep your streak alive.</p></div>
    <div className="daily-reward-grid">{shown.rewards.map(reward=>{const banner=reward.product_id?feedBanner(reward.product_id):null,current=reward.day===shown.day,done=reward.day<shown.day||shown.claimed_today&&current;return <article key={reward.day} className={`daily-reward-card day-${reward.day}${current?" current":""}${done?" claimed":""}`}>
      <div className="daily-reward-day">DAY {reward.day}</div><div className="daily-reward-art">{reward.kind==="gold"?<><span className="daily-coin"><Coins/></span><strong>{reward.amount}</strong><small>GOLD</small></>:<><i style={{background:banner?.background}}/><strong>{reward.days} DAYS</strong><small>{reward.name??"PASTEL BANNER"}</small></>}</div>
      <footer>{done?<><Check size={14}/> Claimed</>:current?"TODAY":"LOCKED"}</footer>
    </article>})}</div>
    {error&&<div className="daily-reward-error" role="alert"><span>{error}</span><button onClick={()=>void load()}><RefreshCw size={14}/>Retry</button></div>}
    <div className="daily-reward-action"><div><Gift size={20}/><span>{loading?"Checking today’s reward…":<>Today&apos;s reward<b>{today?.kind==="gold"?`${today.amount} Gold`:`${today?.name} · ${today?.days} days`}</b></>}</span></div><button disabled={busy||loading||shown.claimed_today} onClick={()=>void claim()}>{busy?"Claiming…":loading?"Please wait…":error?"Try again":"Claim reward"}</button></div>
  </section></div>,document.body);
}
