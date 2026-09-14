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
function Emblem({reward,unlocked}:{reward:RewardDefinition;unlocked:boolean}){const Icon=icons[reward.id];return <article className={unlocked?"reward-emblem unlocked":"reward-emblem locked"} title={`${reward.name} — ${reward.requirement}`}><span className={`reward-seal ${reward.kind}`}><Icon aria-hidden="true"/></span><strong>{reward.name}</strong><small>{reward.requirement}</small></article>;}
export default function RewardEmblems(){
 const [unlocked,setUnlocked]=useState<RewardId[]>([]),[ready,setReady]=useState(false);
 useEffect(()=>{let alive=true;arena<{unlocked:RewardId[]}>('rewards').then(data=>{if(alive)setUnlocked(data.unlocked);}).catch(()=>{}).finally(()=>{if(alive)setReady(true);});return()=>{alive=false;};},[]);
 return <section className="reward-emblems-panel"><header><div><span>CHESS BURGER REWARDS</span><h2>20 Unlockable Emblems</h2></div><b>{ready?`${unlocked.length} / ${REWARDS.length}`:"…"}</b></header><p>Play, climb, and connect to unlock rewards.</p><div className="reward-emblem-grid">{REWARDS.map(reward=><Emblem key={reward.id} reward={reward} unlocked={unlocked.includes(reward.id)}/>)}</div></section>;
}
