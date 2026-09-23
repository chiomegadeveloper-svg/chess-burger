"use client";
/* Reward artwork is already optimized WebP; a native image avoids Vinext's next/image runtime crash. */
/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useState } from "react";
import { Check, Gift, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { arena } from "./arena-client";
import "./daily-rewards.css";

type Reward = { day:number; kind:"gold"|"banner"|"arena_ticket"|"bag_slot"; amount?:number; days?:number; product_id?:string; name?:string };
type Status = { day:number; claimed_today:boolean; rewards:Reward[] };
const rewardName=(reward?:Reward)=>!reward?"Reward":reward.kind==="gold"?`${reward.amount} Gold`:reward.kind==="arena_ticket"?`${reward.amount} Arena ticket${reward.amount===1?"":"s"}`:reward.kind==="bag_slot"?`${reward.amount} Bag slot${reward.amount===1?"":"s"}`:`${reward.name??"Feed Banner"} · ${reward.days??reward.amount} days`;
const PREVIEW:Reward[]=[
  {day:1,kind:"gold",amount:10},{day:2,kind:"banner",days:3,product_id:"pastel-blush",name:"Random Pastel"},
  {day:3,kind:"gold",amount:18},{day:4,kind:"gold",amount:18},{day:5,kind:"banner",days:3,product_id:"pastel-mint",name:"Random Pastel"},
  {day:6,kind:"gold",amount:18},{day:7,kind:"banner",days:5,product_id:"pastel-violet",name:"Random Pastel"},
];

export default function DailyRewards(){
  const [status,setStatus]=useState<Status|null>(null),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(""),[detailsDay,setDetailsDay]=useState<number|null>(null);
  const load=useCallback(async()=>{setLoading(true);setError("");try{setStatus(await arena<Status>("daily-reward-status"));}catch(e){setError((e as Error).message);}finally{setLoading(false);}},[]);
  useEffect(()=>{const initial=window.setTimeout(()=>void load(),0),timer=window.setInterval(()=>void load(),60_000);return()=>{window.clearTimeout(initial);window.clearInterval(timer);};},[load]);
  const safeDay=Math.min(7,Math.max(1,Number(status?.day)||1)),safeRewards=Array.isArray(status?.rewards)&&status.rewards.length===7?status.rewards:PREVIEW,shown={day:safeDay,claimed_today:Boolean(status?.claimed_today),rewards:safeRewards},today=shown.rewards[shown.day-1];
  const claim=async()=>{if(!status){void load();return;}setBusy(true);setError("");try{const result=await arena<Status&{reward?:Reward}>("claim-daily-reward"),reward=result?.reward;setStatus(result);window.dispatchEvent(new Event("cb-profile-saved"));toast.success(reward?`${rewardName(reward)} claimed`:"Daily reward claimed");}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
  return <section className="daily-reward-page" aria-labelledby="daily-reward-title"><div className="daily-reward-modal">
    <div className="daily-reward-heading"><div className="daily-reward-title"><span className="daily-reward-gift"><Gift/></span><span><small>DAILY LOGIN</small><h2 id="daily-reward-title">Reward Streak</h2></span></div><span className="daily-streak-badge">Day {shown.day} of 7</span><p>Open Chess Burger daily and claim your prize. A new reward becomes available at 12:01 AM Philippine time.</p></div>
    <div className="daily-reward-grid">{shown.rewards.map(reward=>{const current=reward.day===shown.day,done=reward.day<shown.day||shown.claimed_today&&current,details=`Day ${reward.day}: ${rewardName(reward)}`;return <article key={reward.day} tabIndex={0} role="button" aria-expanded={detailsDay===reward.day} aria-describedby={`reward-detail-${reward.day}`} aria-label={`${details}. Tap to ${detailsDay===reward.day?"hide":"show"} details.`} onClick={()=>setDetailsDay(day=>day===reward.day?null:reward.day)} onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();setDetailsDay(day=>day===reward.day?null:reward.day);}}} className={`daily-reward-card ${reward.kind} day-${reward.day}${current?" current":""}${done?" claimed":""}${detailsDay===reward.day?" details-open":""}`}>
      <div className="daily-reward-day">DAY {reward.day}</div><div className="daily-reward-art"><img className="daily-reward-icon" width={128} height={128} src={`/daily-rewards/day-${reward.day}.webp`} alt={details}/><strong>{reward.kind==="banner"?`${reward.days??reward.amount} DAYS`:reward.amount}</strong><small>{reward.kind==="gold"?"GOLD":reward.kind==="arena_ticket"?"ARENA TICKETS":reward.kind==="bag_slot"?"BAG SLOTS":reward.name??"FEED BANNER"}</small></div><div className="daily-reward-tooltip" id={`reward-detail-${reward.day}`} role="tooltip"><b>{rewardName(reward)}</b><span>{reward.kind==="gold"?"Added to your Gold balance.":reward.kind==="banner"?"Banner activated from your Bag.":reward.kind==="arena_ticket"?"Added to your Arena tickets.":"Added to your Bag capacity."}</span></div>
      <footer>{done?<><Check size={14}/> Claimed</>:current?"TODAY":"LOCKED"}</footer>
    </article>})}</div>
    {error&&<div className="daily-reward-error" role="alert"><span>{error}</span><button onClick={()=>void load()}><RefreshCw size={14}/>Retry</button></div>}
    <div className="daily-reward-action"><div><Gift size={20}/><span>{loading?"Checking today’s reward…":<>Today&apos;s reward<b>{rewardName(today)}</b></>}</span></div><button disabled={busy||loading||shown.claimed_today} onClick={()=>void claim()}>{busy?"Claiming…":loading?"Please wait…":shown.claimed_today?"Claimed today":error?"Try again":"Claim reward"}</button></div>
  </div></section>;
}
