'use client';
import {useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import {Shield} from 'lucide-react';
import {arena} from './arena-client';
import {levelFor} from './cbr';
import {AvatarFrameOverlay} from './avatar-frame-art';
import {REWARDS} from './reward-definitions';
import {RewardMark} from './reward-emblems';
import './feed-card-snapshot.css';

type CardData={profile:{user_id:string;display_name:string;username:string;country_code:string;avatar_url:string;avatar_frame_id?:string|null;cbr:number;gold_points:number;wins:number;losses:number;featured_badges:string[]};card_summary?:{cbc:number|null;tickets:number|null;guild_name:string;guild_logo_url:string}};
const cache=new Map<string,CardData>();
const flag=(code:string)=>/^[A-Z]{2}$/.test(code)?String.fromCodePoint(...[...code].map(letter=>127397+letter.charCodeAt(0))):'🌐';

export default function FeedCardSnapshot({userId}:{userId:string}){
 const [data,setData]=useState<CardData|null>(cache.get(userId)??null);
 useEffect(()=>{let active=true;setData(cache.get(userId)??null);
  void arena<CardData>('public-profile',{user_id:userId}).then(value=>{if(active){cache.set(userId,value);setData(value);}}).catch(()=>{if(active)setData(null);});
  return()=>{active=false};
 },[userId]);
 if(typeof document==='undefined')return null;
 const profile=data?.profile,level=levelFor(profile?.cbr??88),wins=profile?.wins??0,losses=profile?.losses??0;
 const selected=(profile?.featured_badges??[]).map(id=>REWARDS.find(reward=>reward.id===id)).filter((reward):reward is (typeof REWARDS)[number]=>!!reward).slice(0,10);
 return createPortal(<div className="feed-card-snapshot-wrap" aria-live="polite"><article className="feed-card-snapshot" aria-label={profile?`${profile.display_name}'s player card`:'Loading player card'}>
  {!profile?<p>Loading player card…</p>:<>
   <header><img src="/cburger_logo.png" alt=""/><span>VANGUARD · PLAYER CARD</span></header>
   <div className="feed-snapshot-hero"><div className="feed-snapshot-avatar"><div>{profile.avatar_url?<img src={profile.avatar_url} alt=""/>:profile.display_name.charAt(0)}</div><AvatarFrameOverlay frameId={profile.avatar_frame_id}/></div>
    <div className="feed-snapshot-name"><small>@{profile.username.replace(/^@+/,'')} · {flag(profile.country_code)}</small><h2>{profile.display_name}</h2><p>Level {level.level} · {level.name}</p></div>
    <div className="feed-snapshot-insignia"><img src={`/levels/level-${String(level.level-1).padStart(2,'0')}.png`} alt={`Level ${level.level}`}/><span>{data?.card_summary?.guild_logo_url?<img src={data.card_summary.guild_logo_url} alt={`${data.card_summary.guild_name} guild`}/>:<Shield aria-label="No guild"/>}</span></div>
   </div>
   <div className="feed-snapshot-stats">{[[profile.cbr,'CBR'],[profile.gold_points,'CBG'],[data?.card_summary?.cbc??'—','CBC'],[data?.card_summary?.tickets??'—','Arena tickets'],[wins+losses?`${Math.round(wins/(wins+losses)*100)}%`:'0%','Win rate']].map(([value,label])=><div key={label}><strong>{typeof value==='number'?value.toLocaleString():value}</strong><small>{label}</small></div>)}</div>
   <section className="feed-snapshot-emblems"><h3>Vanguard Emblems <small>{selected.length} / 10</small></h3><div>{Array.from({length:10},(_,index)=>{const reward=selected[index];return <span key={index} title={reward?.name||`Empty emblem slot ${index+1}`}>{reward?<RewardMark id={reward.id}/>:<i>{index+1}</i>}</span>})}</div></section>
  </>}
 </article></div>,document.body);
}
