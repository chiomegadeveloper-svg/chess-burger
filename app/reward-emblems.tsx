"use client";
import {useEffect,useState} from "react";
import {Medal} from "lucide-react";
import {arena} from "./arena-client";
import {REWARDS,type RewardDefinition,type RewardId} from "./reward-definitions";
import {levelFor} from "./cbr";
import "./reward-emblems.css";

type RewardStats={cbr?:number;wins?:number;win_streak?:number};
const emblemArtwork:Record<RewardId,number>={
 "rookie-flame":0,"knights-steel":1,"burger-blitz":2,"first-checkmate":12,"golden-pawn":5,
 "cbr-climber":6,"neon-board":18,"burger-master":14,"silver-rook":13,"friendly-challenger":9,
 "tactical-thinker":10,"midnight-board":4,"golden-king":15,"cb-champion":19,"flaming-queen":11,
 "community-legend":8,"cyber-knight":7,"burger-crown":17,"grandmaster-gold":16,"cb-supreme":3,
};
export function RewardMark({id}:{id:RewardId}){return <img src={`/reward-emblems/emblem-${emblemArtwork[id]}.webp`} alt="" aria-hidden="true"/>;}

function localUnlocks(profile?:RewardStats):RewardId[]{
 if(!profile)return [];
 const level=levelFor(profile.cbr??88).level,wins=profile.wins??0,streak=profile.win_streak??0,gained=Math.max(0,(profile.cbr??88)-88);
 return REWARDS.filter(r=>
  (r.id==="rookie-flame"&&level>=2)||(r.id==="knights-steel"&&wins>=3)||(r.id==="burger-blitz"&&wins>=10)||
  (r.id==="golden-pawn"&&level>=5)||(r.id==="cbr-climber"&&gained>=100)||(r.id==="neon-board"&&wins>=10)||
  (r.id==="burger-master"&&level>=10)||(r.id==="silver-rook"&&streak>=3)||(r.id==="golden-king"&&level>=15)||
  (r.id==="cb-champion"&&gained>=500)||(r.id==="flaming-queen"&&streak>=5)||(r.id==="cyber-knight"&&wins>=25)||
  (r.id==="burger-crown"&&level>=20)||(r.id==="grandmaster-gold"&&(profile.cbr??0)>=1000)||(r.id==="cb-supreme"&&wins>=100)
 ).map(r=>r.id);
}
function Emblem({reward,unlocked}:{reward:RewardDefinition;unlocked:boolean}){return <article className={unlocked?"reward-emblem unlocked":"reward-emblem locked"} title={`${reward.name} — ${reward.requirement}`}><span className={`reward-seal ${reward.kind}`}><RewardMark id={reward.id}/></span><strong>{reward.name}</strong><small>{reward.requirement}</small></article>;}
function useRewardUnlocks(profile?:RewardStats){
 const[remote,setRemote]=useState<RewardId[]>([]),[ready,setReady]=useState(false);
 useEffect(()=>{let alive=true;arena<{unlocked:RewardId[]}>("rewards").then(data=>{if(alive)setRemote(data.unlocked.filter(id=>REWARDS.some(r=>r.id===id)));}).catch(()=>{}).finally(()=>{if(alive)setReady(true);});return()=>{alive=false;};},[]);
 const unlocked=Array.from(new Set<RewardId>([...localUnlocks(profile),...remote]));
 return {unlocked,ready};
}
const valid=(id:string):id is RewardId=>REWARDS.some(reward=>reward.id===id);

export function FeaturedRewardSlots({selected,profile,onChoose}:{selected:string[];profile?:RewardStats;onChoose?:()=>void}){
 const {unlocked,ready}=useRewardUnlocks(profile);
 // A previously selected emblem remains visible even if the rewards request is
 // temporarily offline. The picker only allows new selections when unlocked.
 const chosen=selected.filter(valid).slice(0,5);
 return <section className="card-featured-rewards"><header><Medal/><span><strong>Featured Emblems</strong><small>{ready?`${chosen.length} of 5 selected`:"Loading rewards…"}</small></span>{onChoose&&<button type="button" className="choose-emblems-button" onClick={onChoose}>Choose</button>}</header><div className="featured-reward-slots" aria-label="Five featured reward emblem slots">{Array.from({length:5},(_,index)=>{const id=chosen[index],reward=id&&REWARDS.find(item=>item.id===id);return reward?<span className={`featured-reward-slot ${reward.kind}`} key={index} title={reward.name}><i><RewardMark id={reward.id}/></i><small>{reward.name}</small></span>:<span className="featured-reward-slot empty" key={index} aria-label="Empty featured emblem slot"><i>?</i><small>Empty</small></span>;})}</div></section>;
}
export function CardEmblemCollection({selected,onChoose}:{selected:string[];onChoose?:()=>void}){
 const chosen=selected.filter(valid).slice(0,10);
 return <section className="card-emblem-collection" aria-label="Ten featured emblem slots"><header><Medal/><span><strong>Vanguard Emblems</strong><small>{chosen.length} / 10 selected</small></span>{onChoose&&<button type="button" className="card-emblem-choose" onClick={onChoose}>Choose emblems</button>}</header><div className="card-emblem-grid">{Array.from({length:10},(_,index)=>{const reward=REWARDS.find(item=>item.id===chosen[index]);return reward?<article key={index} className="card-emblem unlocked" title={reward.name} aria-label={`Slot ${index+1}: ${reward.name}`}><span className="card-emblem-art"><RewardMark id={reward.id}/></span><strong>{reward.name}</strong></article>:<article key={index} className="card-emblem empty" title={`Emblem slot ${index+1} is empty`} aria-label={`Emblem slot ${index+1} is empty`}><span className="card-emblem-art empty-mark">{index+1}</span><strong>Empty slot</strong></article>;})}</div></section>;
}
export function FeaturedRewardPicker({selected,onChange,profile}:{selected:string[];onChange:(next:string[])=>void;profile?:RewardStats}){
 const {unlocked,ready}=useRewardUnlocks(profile),known=selected.filter(valid);
 const toggle=(id:RewardId)=>{if(!unlocked.includes(id))return;if(known.includes(id))onChange(known.filter(item=>item!==id));else if(known.length<10)onChange([...known,id]);};
 return <section id="featured-emblem-picker" className="featured-reward-picker"><header><div><span>PLAYER CARD</span><h2>Choose your ten emblems</h2></div><b>{known.length} / 10</b></header><p>Select up to ten unlocked emblems. Select them in the order you want them displayed. Changes save immediately.</p><div>{REWARDS.map(reward=>{const isUnlocked=unlocked.includes(reward.id),chosen=known.includes(reward.id);return <button type="button" key={reward.id} className={`${isUnlocked?"unlocked":"locked"}${chosen?" selected":""}`} disabled={!isUnlocked||(!chosen&&known.length>=10)} onClick={()=>toggle(reward.id)} title={isUnlocked?`Feature ${reward.name}`:`Locked — ${reward.requirement}`}><span className={`reward-seal ${reward.kind}`}><RewardMark id={reward.id}/></span><small>{reward.name}</small>{chosen&&<b className="emblem-order">{known.indexOf(reward.id)+1}</b>}</button>;})}</div>{!ready&&<em>Checking your rewards…</em>}</section>;
}
export default function RewardEmblems({profile}:{profile?:RewardStats}){const {unlocked,ready}=useRewardUnlocks(profile);return <section className="reward-emblems-panel"><header><div><span>CHESS BURGER REWARDS</span><h2>20 Unlockable Emblems</h2></div><b>{ready?`${unlocked.length} / ${REWARDS.length}`:"…"}</b></header><p>Play, climb, and connect to unlock rewards.</p><div className="reward-emblem-grid">{REWARDS.map(reward=><Emblem key={reward.id} reward={reward} unlocked={unlocked.includes(reward.id)}/>)}</div></section>;}
