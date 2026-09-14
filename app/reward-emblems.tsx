"use client";
import {useEffect,useState} from "react";
import {BadgeCheck,Brain,Crown,Flag,Flame,Grid3X3,Medal,MessageCircleHeart,Mountain,Shield,Star,Trophy,Users, type LucideIcon} from "lucide-react";
import {arena} from "./arena-client";
import {REWARDS,type RewardDefinition,type RewardId} from "./reward-definitions";
import "./reward-emblems.css";

const icons:Record<RewardId,LucideIcon>={
 "rookie-flame":Flame,"knights-steel":Shield,"burger-blitz":Flag,"first-checkmate":BadgeCheck,"golden-pawn":Flag,
 "cbr-climber":Mountain,"neon-board":Grid3X3,"burger-master":Crown,"silver-rook":Shield,"friendly-challenger":Users,
 "tactical-thinker":Brain,"midnight-board":Grid3X3,"golden-king":Crown,"cb-champion":Trophy,"flaming-queen":Flame,
 "community-legend":MessageCircleHeart,"cyber-knight":Star,"burger-crown":Crown,"grandmaster-gold":Medal,"cb-supreme":Trophy,
};
export function RewardMark({id}:{id:RewardId}){const Icon=icons[id];return <Icon aria-hidden="true"/>;}
function Emblem({reward,unlocked}:{reward:RewardDefinition;unlocked:boolean}){const Icon=icons[reward.id];return <article className={unlocked?"reward-emblem unlocked":"reward-emblem locked"} title={`${reward.name} — ${reward.requirement}`}><span className={`reward-seal ${reward.kind}`}><Icon aria-hidden="true"/></span><strong>{reward.name}</strong><small>{reward.requirement}</small></article>;}
function useRewardUnlocks(){const [unlocked,setUnlocked]=useState<RewardId[]>([]),[ready,setReady]=useState(false);useEffect(()=>{let alive=true;arena<{unlocked:RewardId[]}>('rewards').then(data=>{if(alive)setUnlocked(data.unlocked);}).catch(()=>{}).finally(()=>{if(alive)setReady(true);});return()=>{alive=false;};},[]);return {unlocked,ready};}

export function FeaturedRewardSlots({selected}:{selected:string[]}){const {unlocked,ready}=useRewardUnlocks();const chosen=selected.filter((id):id is RewardId=>REWARDS.some(reward=>reward.id===id)&&unlocked.includes(id as RewardId)).slice(0,5);return <section className="card-featured-rewards"><header><Medal/><span><strong>Featured Emblems</strong><small>{ready?`${chosen.length} of 5 selected`:"Loading rewards…"}</small></span></header><div className="featured-reward-slots" aria-label="Five featured reward emblem slots">{Array.from({length:5},(_,index)=>{const id=chosen[index],reward=id&&REWARDS.find(item=>item.id===id);return reward?<span className={`featured-reward-slot ${reward.kind}`} key={index} title={reward.name}><i><RewardMark id={reward.id}/></i><small>{reward.name}</small></span>:<span className="featured-reward-slot empty" key={index} aria-label="Empty featured emblem slot"><i>?</i><small>Locked</small></span>;})}</div></section>;}

export function FeaturedRewardPicker({selected,onChange}:{selected:string[];onChange:(next:string[])=>void}){const {unlocked,ready}=useRewardUnlocks();const known=selected.filter((id):id is RewardId=>REWARDS.some(reward=>reward.id===id));const toggle=(id:RewardId)=>{if(!unlocked.includes(id))return;if(known.includes(id))onChange(known.filter(item=>item!==id));else if(known.length<5)onChange([...known,id]);};return <section className="featured-reward-picker"><header><div><span>PLAYER CARD</span><h2>Featured reward emblems</h2></div><b>{known.length} / 5</b></header><p>Choose up to five unlocked rewards to display on your player card. Empty slots use a black frame.</p><div>{REWARDS.map(reward=>{const isUnlocked=unlocked.includes(reward.id),chosen=known.includes(reward.id);return <button type="button" key={reward.id} className={`${isUnlocked?"unlocked":"locked"}${chosen?" selected":""}`} disabled={!isUnlocked||(!chosen&&known.length>=5)} onClick={()=>toggle(reward.id)} title={isUnlocked?`Feature ${reward.name}`:`Locked — ${reward.requirement}`}><span className={`reward-seal ${reward.kind}`}><RewardMark id={reward.id}/></span><small>{reward.name}</small></button>;})}</div>{!ready&&<em>Loading your unlocked rewards…</em>}</section>;}
export default function RewardEmblems(){
 const {unlocked,ready}=useRewardUnlocks();
 return <section className="reward-emblems-panel"><header><div><span>CHESS BURGER REWARDS</span><h2>20 Unlockable Emblems</h2></div><b>{ready?`${unlocked.length} / ${REWARDS.length}`:"…"}</b></header><p>Play, climb, and connect to unlock rewards.</p><div className="reward-emblem-grid">{REWARDS.map(reward=><Emblem key={reward.id} reward={reward} unlocked={unlocked.includes(reward.id)}/>)}</div></section>;
}
