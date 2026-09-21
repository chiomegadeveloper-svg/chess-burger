"use client";
import { useEffect, useState } from "react";
import { Check, Coins, Gift, X } from "lucide-react";
import { toast } from "sonner";
import { arena } from "./arena-client";
import { feedBanner } from "./feed-banner-catalog";

type Reward = { day:number; kind:"gold"|"banner"; amount?:number; days?:number; product_id?:string; name?:string };
type Status = { day:number; claimed_today:boolean; rewards:Reward[] };

export default function DailyRewards({open,onClose,onClaimed}:{open:boolean;onClose:()=>void;onClaimed:()=>void}){
  const [status,setStatus]=useState<Status|null>(null),[busy,setBusy]=useState(false);
  useEffect(()=>{if(!open)return;let live=true;arena<Status>("daily-reward-status").then(data=>{if(!live)return;setStatus(data);if(data.claimed_today)onClose();}).catch(e=>{if(!live)return;toast.error((e as Error).message);onClose();});return()=>{live=false;};},[open,onClose]);
  if(!open)return null;
  const claim=async()=>{setBusy(true);try{const result=await arena<Status&{reward:Reward}>("claim-daily-reward");setStatus(result);onClaimed();toast.success(result.reward.kind==="gold"?`${result.reward.amount} Gold claimed`:`${result.reward.name} banner added to your Bag`);onClose();}catch(e){toast.error((e as Error).message);}finally{setBusy(false);}};
  return <div className="daily-reward-backdrop"><section className="daily-reward-modal" role="dialog" aria-modal="true" aria-labelledby="daily-reward-title">
    <button className="daily-reward-close" aria-label="Close daily rewards" onClick={onClose}><X size={18}/></button>
    <header><span>DAILY LOGIN</span><h2 id="daily-reward-title">Daily Rewards</h2><p>Return every day to continue your 7-day reward streak.</p></header>
    {!status?<div className="daily-reward-loading">Preparing today&apos;s rewards…</div>:<>
      <div className="daily-reward-grid">{status.rewards.map(reward=>{const banner=reward.product_id?feedBanner(reward.product_id):null,current=reward.day===status.day,done=reward.day<status.day||status.claimed_today&&current;return <article key={reward.day} className={`daily-reward-card day-${reward.day}${current?" current":""}${done?" claimed":""}`}>
        <div className="daily-reward-art">{reward.kind==="gold"?<><Coins/><strong>{reward.amount}</strong><small>GOLD</small></>:<><i style={{background:banner?.background}}/><strong>{reward.days} DAYS</strong><small>{reward.name??"PASTEL BANNER"}</small></>}</div>
        <footer><span>Day {reward.day}</span>{done&&<Check size={15}/>}</footer>
      </article>})}</div>
      <div className="daily-reward-action"><div><Gift size={18}/><span>Today: <b>{status.rewards[status.day-1]?.kind==="gold"?`${status.rewards[status.day-1]?.amount} Gold`:`${status.rewards[status.day-1]?.name} · ${status.rewards[status.day-1]?.days} days`}</b></span></div><button disabled={busy||status.claimed_today} onClick={()=>void claim()}>{busy?"Claiming…":"Claim reward"}</button></div>
    </>}
  </section></div>;
}
