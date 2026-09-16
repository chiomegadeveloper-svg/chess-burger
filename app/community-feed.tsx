"use client";

import {useCallback,useEffect,useState,useRef} from "react";
import {Heart,ChevronLeft,ChevronRight,Swords} from "lucide-react";
import {toast} from "sonner";
import {FeedEvent,getSupabase} from "./supabase";
import {arena} from "./arena-client";
import {SocialButtons} from "./social";
import {levelFor} from "./cbr";
import type {ArenaMatch} from "./game-rules";
type CommunityEvent=FeedEvent&{origin?:"arena"};

type FeedTab="recent"|"popular"|"first_blood"|"announcement";
const PAGE_SIZE=10;
const labels:Record<string,string>={profile_created:"New player",profile_updated:"Profile",win:"Win",first_blood:"First blood",new_reward:"Reward",top10:"Top 10",announcement:"Announcement"};

export default function CommunityFeed({onOpenProfile,onMatch}:{onOpenProfile:(userId:string)=>void;onMatch:(id:string)=>void}){
 const[tab,setTab]=useState<FeedTab>("recent"),[page,setPage]=useState(1),[events,setEvents]=useState<CommunityEvent[]>([]);
 const[challenges,setChallenges]=useState<CommunityEvent[]>([]),[accepting,setAccepting]=useState<string|null>(null);
 const request=useRef(0);
 const[total,setTotal]=useState(0),[status,setStatus]=useState("Loading activity…"),[userId,setUserId]=useState<string|null>(null),[reacted,setReacted]=useState<Set<string>>(new Set());
 const refresh=useCallback(async()=>{
  const seq=++request.current;
  const [localFeed]=await Promise.allSettled([arena<{events:CommunityEvent[]}>('feed',{},true)]);
  if(seq!==request.current)return;
  const all=[...(localFeed.status==='fulfilled'?localFeed.value.events:[])].filter(e=>!e.expires_at||Date.parse(e.expires_at)>Date.now());
  setChallenges(all.filter(e=>e.kind==='challenge').sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at)));
  let rows=all.filter(e=>e.kind!=='challenge').sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at)).slice(0,50);
  if(tab==='first_blood')rows=rows.filter(e=>e.kind==='first_blood');
  if(tab==='announcement')rows=rows.filter(e=>e.kind==='announcement');
  if(tab==='popular')rows.sort((a,b)=>b.heart_count-a.heart_count||Date.parse(b.created_at)-Date.parse(a.created_at));
  setTotal(rows.length);const pages=Math.max(1,Math.ceil(rows.length/PAGE_SIZE));if(page>pages){setPage(pages);return;}
  setEvents(rows.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE));
  setStatus(rows.length||all.some(e=>e.kind==='challenge')?'':localFeed.status==='rejected'?'Community activity is temporarily unavailable.':'No activity in this view yet.');
  try{const c=await getSupabase(),session=c?(await c.auth.getSession()).data.session:null;if(seq!==request.current)return;setUserId(session?.user.id??null);
   if(c&&session){const [supHearts,gameHearts]=await Promise.allSettled([c.from('cb_feed_reactions').select('feed_id').eq('user_id',session.user.id),arena<{ids:string[]}>('hearts')]);if(seq===request.current)setReacted(new Set([...(supHearts.status==='fulfilled'?supHearts.value.data??[]:[]).map(r=>r.feed_id as string),...(gameHearts.status==='fulfilled'?gameHearts.value.ids:[])]));}else setReacted(new Set());
  }catch{}
 },[page,tab]);
 useEffect(()=>{let active=true;const load=()=>void refresh().catch(()=>{if(active)setStatus('Community activity is temporarily unavailable.');});load();const timer=setInterval(load,10000);const expiry=setInterval(()=>setEvents(rows=>rows.filter(e=>!e.expires_at||Date.parse(e.expires_at)>Date.now())),1000);window.addEventListener('cb-profile-saved',load);return()=>{active=false;request.current++;clearInterval(timer);clearInterval(expiry);window.removeEventListener('cb-profile-saved',load);};},[refresh]);
 const pendingHearts=useRef(new Set<string>());
 async function toggleHeart(event:CommunityEvent){
  if(!userId){toast.info('Sign in from Profile to react.');return;}if(pendingHearts.current.has(event.id))return;pendingHearts.current.add(event.id);
  const has=reacted.has(event.id);setReacted(prev=>{const next=new Set(prev);if(has)next.delete(event.id);else next.add(event.id);return next;});
  setEvents(prev=>prev.map(item=>item.id===event.id?{...item,heart_count:Math.max(0,item.heart_count+(has?-1:1))}:item));
  try{await arena('heart',{id:event.id,liked:!has});}
  catch{toast.error('Reaction was not saved.');await refresh();}finally{pendingHearts.current.delete(event.id);}
 }
 async function acceptChallenge(event:CommunityEvent){
  if(!userId){toast.info('Sign in to accept this challenge.');return;}
  if(accepting)return;
  setAccepting(event.id);
  try{const r=await arena<{match:ArenaMatch}>('accept-challenge',{id:event.id.slice('challenge:'.length)});onMatch(r.match.id);}
  catch(e){toast.error((e as Error).message);void refresh();}
  finally{setAccepting(null);}
 }
 function selectTab(next:FeedTab){request.current++;setEvents([]);setStatus("Loading activity…");setTab(next);setPage(1);}
 const pages=Math.max(1,Math.min(5,Math.ceil(total/PAGE_SIZE)));
 return <section className="feed-page">
  <div className="page-heading"><h1>Community feed</h1><span className="sample-label">Latest 50</span></div>
  <div className="feed-tabs" role="tablist" aria-label="Community feed views">
   <button role="tab" aria-selected={tab==="recent"} onClick={()=>selectTab("recent")}>Recent feed</button>
   <button role="tab" aria-selected={tab==="popular"} onClick={()=>selectTab("popular")}>Popular</button>
   <button role="tab" aria-selected={tab==="first_blood"} onClick={()=>selectTab("first_blood")}>First blood</button>
   <button role="tab" aria-selected={tab==="announcement"} onClick={()=>selectTab("announcement")}>Announcements</button>
  </div>
  {challenges.length>0&&<section className="pinned-challenges" aria-label="Open challenges"><h2>Open challenges</h2>{challenges.map(event=><article className="pinned-challenge" key={event.id}>
    <span className="challenge-glow" aria-hidden="true"/><span className="challenge-info"><Swords size={19}/><span><strong>{event.display_name}</strong><small>{event.content.replace(/^is looking for a /,'').replace(/^is looking for /,'')}</small></span></span>
    <button className="gold-button" disabled={accepting!==null||event.user_id===userId} onClick={()=>void acceptChallenge(event)}>{event.user_id===userId?'Your challenge':accepting===event.id?'Joining…':'Accept challenge'}</button>
  </article>)}</section>}
  {status&&<p className="account-note" role="status">{status}</p>}
  <ol className="community-list">{events.map(event=>{const date=new Date(event.created_at),level=levelFor(event.cbr),announcement=event.kind==='announcement',avatarUrl=announcement?'/cburger_logo.png':event.avatar_url;return <li key={event.id} className={`feed-cloud kind-${event.kind}`}>
   <button className="feed-player" disabled={announcement} onClick={()=>!announcement&&onOpenProfile(event.user_id)} aria-label={announcement?'Chess Burger announcement':`Open ${event.display_name}'s profile`}><span className="feed-avatar">{avatarUrl?<img src={avatarUrl} alt=""/>:event.display_name.charAt(0)}</span>{!announcement&&<img className="feed-level" src={`/levels/level-${String(level.level-1).padStart(2,"0")}.png`} alt={`Level ${level.level}`}/>}</button>
   <div className="feed-copy"><div className="feed-meta"><span className="feed-kind">{labels[event.kind]??event.kind.replaceAll("_"," ")}</span><time dateTime={event.created_at}>{date.toLocaleDateString([],{month:"short",day:"numeric"})} · {date.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</time></div><p>{announcement?<strong className="feed-name">Chess Burger</strong>:<button className="feed-name" onClick={()=>onOpenProfile(event.user_id)}>{event.display_name}</button>}<span className="feed-activity"> {event.content||"shared an update."}</span></p>{event.image_url&&<img className="announcement-image" src={event.image_url} alt="Announcement"/>}<div className="feed-rewards">{event.cbr_delta!==0&&<span className="feed-detail">{event.cbr_delta>0?"+":""}{event.cbr_delta} CBR</span>}{event.gold_delta!==0&&<span className="feed-gold">{event.gold_delta>0?"+":""}{event.gold_delta} Gold</span>}</div>{!announcement&&userId&&event.user_id!==userId&&<SocialButtons key={userId+":"+event.user_id} target={event.user_id} compact/>}</div>
   <button className={"heart-button "+(reacted.has(event.id)?"reacted":"")} aria-label={(reacted.has(event.id)?"Remove":"Add")+" heart reaction"} aria-pressed={reacted.has(event.id)} onClick={()=>void toggleHeart(event)}><Heart size={17} fill={reacted.has(event.id)?"currentColor":"none"}/><span>{event.heart_count}</span></button>
  </li>})}</ol>
  {total>PAGE_SIZE&&<nav className="feed-pagination" aria-label="Feed pages"><button disabled={page===1} onClick={()=>setPage(p=>p-1)}><ChevronLeft size={15}/>Previous</button><span>Page {page} of {pages}</span><button disabled={page>=pages} onClick={()=>setPage(p=>p+1)}>Next<ChevronRight size={15}/></button></nav>}
 </section>;
}
