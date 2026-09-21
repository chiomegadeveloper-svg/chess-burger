"use client";
import { useCallback, useEffect, useState } from "react";
import { Check, Gift, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { arena } from "./arena-client";
import "./daily-rewards.css";

type Reward = { day:number; kind:"gold"|"banner"; amount?:number; days?:number; product_id?:string; name?:string };
type Status = { day:number; claimed_today:boolean; rewards:Reward[] };
const PREVIEW:Reward[]=[
  {day:1,kind:"gold",amount:10},{day:2,kind:"banner",days:3,product_id:"pastel-blush",name:"Random Pastel"},
  {day:3,kind:"gold",amount:18},{day:4,kind:"gold",amount:18},{day:5,kind:"banner",days:3,product_id:"pastel-mint",name:"Random Pastel"},
  {day:6,kind:"gold",amount:18},{day:7,kind:"banner",days:5,product_id:"pastel-violet",name:"Random Pastel"},
];

export default function DailyRewards(){
  const [status,setStatus]=useState<Status|null>(null),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState("");
  const load=useCallback(async()=>{setLoading(true);setError("");try{setStatus(await arena<Status>("daily-reward-status"));}catch(e){setError((e as Error).message);}finally{setLoading(false);}},[]);
  useEffect(()=>{const initial=window.setTimeout(()=>void load(),0),timer=window.setInterval(()=>void load(),60_000);return()=>{window.clearTimeout(initial);window.clearInterval(timer);};},[load]);
  const shown=status??{day:1,claimed_today:false,rewards:PREVIEW},today=shown.rewards[shown.day-1];
  const claim=async()=>{if(!status){void load();return;}setBusy(true);setError("");try{const result=await arena<Status&{reward:Reward}>("claim-daily-reward");setStatus(result);window.dispatchEvent(new Event("cb-profile-saved"));toast.success(result.reward.kind==="gold"?`${result.reward.amount} Gold claimed`:`${result.reward.name} banner added to your Bag`);}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
  return <section className="daily-reward-page" aria-labelledby="daily-reward-title"><div className="daily-reward-modal">
    <div className="daily-reward-heading"><div className="daily-reward-title"><span className="daily-reward-gift"><Gift/></span><span><small>DAILY LOGIN</small><h2 id="daily-reward-title">Reward Streak</h2></span></div><span className="daily-streak-badge">Day {shown.day} of 7</span><p>Open Chess Burger daily and claim your prize. A new reward becomes available at 12:01 AM Philippine time.</p></div>
    <div className="daily-reward-grid">{shown.rewards.map(reward=>{const current=reward.day===shown.day,done=reward.day<shown.day||shown.claimed_today&&current;return <article key={reward.day} className={`daily-reward-card ${reward.kind} day-${reward.day}${current?" current":""}${done?" claimed":""}`}>
      <div className="daily-reward-day">DAY {reward.day}</div><div className="daily-reward-art"><img className="daily-reward-icon" src={`/daily-rewards/day-${reward.day}.webp`} alt=""/><strong>{reward.kind==="gold"?reward.amount:`${reward.days} DAYS`}</strong><small>{reward.kind==="gold"?"GOLD":reward.name??"PASTEL BANNER"}</small></div>
      <footer>{done?<><Check size={14}/> Claimed</>:current?"TODAY":"LOCKED"}</footer>
    </article>})}</div>
    {error&&<div className="daily-reward-error" role="alert"><span>{error}</span><button onClick={()=>void load()}><RefreshCw size={14}/>Retry</button></div>}
    <div className="daily-reward-action"><div><Gift size={20}/><span>{loading?"Checking today’s reward…":<>Today&apos;s reward<b>{today?.kind==="gold"?`${today.amount} Gold`:`${today?.name} · ${today?.days} days`}</b></>}</span></div><button disabled={busy||loading||shown.claimed_today} onClick={()=>void claim()}>{busy?"Claiming…":loading?"Please wait…":shown.claimed_today?"Claimed today":error?"Try again":"Claim reward"}</button></div>
  </div></section>;
}
