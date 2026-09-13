'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {Home,MapPin,Swords,Trophy,UserRound,Globe2,UsersRound,Flag,ChevronRight,ArrowLeft,Radio,CircleHelp,CreditCard,ShoppingBag,ShieldCheck} from 'lucide-react';
import {toast} from 'sonner';
import {Toaster} from '@/components/ui/sonner';
import Offline from './offline';
import SharedBoard from './shared-board';
import Account from './account';
import CommunityFeed from './community-feed';
import RecentPlays from './recent-plays';
import NearbyMap from './nearby-map';
import LocalPairing from './local-pairing';
import Cms from './cms';
import Tournaments from './tournaments';
import OnlinePlay,{OnlineGame} from './online-play';
import Rankings from './rankings';
import LiveChannel from './live-channel';
import {applyResult} from './cbr';
import {SavedGame,saveGame} from './game-history';
import {getSupabase,PlayerProfile} from './supabase';
import {authStorage} from './auth-storage';
import {queueOffline,syncOffline} from './offline-sync';
import {arena} from './arena-client';
import {useGpsPresence} from './gps-presence';
import {type ArenaMatch,type ArenaPlayer,timeControl,winDelta} from './game-rules';
import {profileRequest} from './profile-client';
import {SocialHub,MatchResult,type MatchSummary} from './social';
import PublicProfile from './public-profile';

const modes=[
 {name:'Play Online',sub:'Random opponent · within 20 CBR',meta:'Find match',Icon:Globe2,key:'online'},
 {name:'Nearby Match',sub:'See GPS-active players on the map',meta:'Open map',Icon:MapPin,key:'map'},
 {name:'Offline Board',sub:'Local Wi-Fi · QR & pairing code',meta:'Pair devices',Icon:UsersRound,key:'pairing'},
 {name:'Territory Invasion',sub:'Claim a 200 m zone',meta:'+10 CBR',Icon:Flag,key:'territory'},
];
const navigation=[{key:'home',label:'Home',Icon:Home},{key:'map',label:'Map',Icon:MapPin},{key:'card',label:'Card',Icon:CreditCard},{key:'play',label:'Play',Icon:Swords},{key:'shop',label:'Shop',Icon:ShoppingBag},{key:'rank',label:'Rank',Icon:Trophy},{key:'profile',label:'Profile',Icon:UserRound}];
type Invite=ArenaMatch&{host_name:string;host_avatar:string};
export default function Page(){
 const [tab,setTab]=useState('profile'),[profile,setProfile]=useState<PlayerProfile|null>(null),[replayGame,setReplayGame]=useState<SavedGame|null>(null),[showSplash,setShowSplash]=useState(true),[member,setMember]=useState<boolean|null>(null);
 const [matchId,setMatchId]=useState(''),[target,setTarget]=useState<ArenaPlayer|null>(null),[viewedUserId,setViewedUserId]=useState(''),[invites,setInvites]=useState<Invite[]>([]),[activeId,setActiveId]=useState(''),[offlineControl,setOfflineControl]=useState('10+0');
 const [summary,setSummary]=useState<MatchSummary|null>(null);
 const shownResults=useRef(new Set<string>());
 const showOnlineResult=useCallback((m:ArenaMatch)=>{const ownId=profile?.user_id;if(!ownId||m.status!=='finished'||![m.white_id,m.black_id].includes(ownId))return;const key=ownId+':'+m.id;if(shownResults.current.has(key))return;const side=m.white_id===ownId?'white':'black',matchPlayer=side==='white'?m.white:m.black,opponent=side==='white'?m.black:m.white;const player=matchPlayer??{user_id:ownId,display_name:profile.display_name,username:profile.username,avatar_url:profile.avatar_url,cbr:profile.cbr,wins:profile.wins,losses:profile.losses,win_streak:profile.win_streak};shownResults.current.add(key);setSummary({id:m.id,outcome:m.result==='draw'?'draw':m.result===side?'win':'loss',player,delta:m.rating_changes?.[ownId]??(player.cbr-(side==='white'?m.white_cbr:m.black_cbr)),opponent});},[profile]);
 const [localRating,setLocalRating]=useState({cbr:88,win_streak:0,wins:0,losses:0});
 const scroller=useRef<HTMLDivElement>(null),gps=useGpsPresence(profile?.user_id);
 const refreshProfile=useCallback(async()=>{try{const c=await getSupabase();if(!c)return;const {data:{session}}=await c.auth.getSession();if(!session)return;await syncOffline();const data=await profileRequest(c);if(!data){setMember(false);setTab('profile');return;}setMember(true);let current=data;try{const live=await arena<{profile:PlayerProfile}>('me');current=live.profile;}catch{}setProfile(current);setLocalRating({cbr:current.cbr,win_streak:current.win_streak,wins:current.wins,losses:current.losses});authStorage.setItem('cb-staff-profile',JSON.stringify(current));}catch{}},[]);
 const openMatch=(id:string)=>{setMatchId(id);setActiveId(id);setTab('game');};
 const onSaved=(p:PlayerProfile)=>{setMember(true);setProfile(p);setLocalRating({cbr:p.cbr??88,win_streak:p.win_streak??0,wins:p.wins??0,losses:p.losses??0});window.dispatchEvent(new Event('cb-profile-saved'));void refreshProfile();setTab('home');};
 function rateLocal(result:'win'|'loss'|'draw',gameId:string,opponentCbr?:number){
  const ledgerKey='cb-local-rated-'+(profile?.user_id??'guest-device'),ledger=JSON.parse(localStorage.getItem(ledgerKey)??'[]') as string[];if(ledger.includes(gameId))return null;
  const rated=applyResult({...localRating},result);if(result==='win'&&opponentCbr!==undefined){rated.rating_delta=winDelta(localRating.cbr,opponentCbr,rated.win_streak);rated.cbr=localRating.cbr+rated.rating_delta;}
  rated.rating_delta=rated.cbr-localRating.cbr;
  const next={cbr:rated.cbr,wins:rated.wins,losses:rated.losses,win_streak:rated.win_streak};setLocalRating(next);localStorage.setItem('cb-local-rating',JSON.stringify(next));localStorage.setItem(ledgerKey,JSON.stringify([...ledger,gameId]));
  if(profile){const updated={...profile,...next};setProfile(updated);if(profile.user_id==='guest-device')localStorage.setItem('cb-guest-profile',JSON.stringify(updated));else authStorage.setItem('cb-staff-profile',JSON.stringify(updated));}
  toast.success('Offline CBR '+(rated.rating_delta>=0?'+':'')+rated.rating_delta);return rated.rating_delta;
 }
 function localResult(m:ArenaMatch,id:string){if(profile&&profile.user_id!=='guest-device'&&profile.user_id===id)queueOffline(m,id);if(navigator.onLine)void refreshProfile();const side=id===m.white_id?'white':'black',result=m.result==='draw'?'draw':m.result===side?'win':'loss';const delta=rateLocal(result,m.id,side==='white'?m.black_cbr:m.white_cbr);if(delta===null)return;setSummary({id:m.id,outcome:result,delta,player:{...applyResult(localRating,result),cbr:Math.max(0,localRating.cbr+delta)},opponent:side==='white'?m.black:m.white,local:true});saveGame({id:m.id,white:m.white?.display_name??'White',black:m.black?.display_name??'Black',pgn:m.pgn,score:m.result==='draw'?'½–½':m.result==='white'?'1–0':'0–1',startedAt:new Date(m.created_at).toISOString(),updatedAt:new Date().toISOString(),ratedAt:new Date().toISOString(),ratingDelta:delta});}
 useEffect(()=>{
  const splash=setTimeout(()=>setShowSplash(false),5000);
  if('serviceWorker' in navigator){const updating=!!navigator.serviceWorker.controller;let reloaded=false;if(updating)navigator.serviceWorker.addEventListener('controllerchange',()=>{if(reloaded)return;reloaded=true;location.reload();},{once:true});navigator.serviceWorker.register('/sw.js').then(async reg=>{await reg.update();const ready=await navigator.serviceWorker.ready;(ready.active??navigator.serviceWorker.controller)?.postMessage({type:'CACHE_ASSETS',paths:performance.getEntriesByType('resource').map(e=>e.name)});}).catch(()=>{});}
  try{const raw=!navigator.onLine?authStorage.getItem('cb-staff-profile')??localStorage.getItem('cb-guest-profile'):localStorage.getItem('cb-guest-profile');if(raw)setProfile(JSON.parse(raw));const rating=localStorage.getItem('cb-local-rating');if(rating)setLocalRating(JSON.parse(rating));}catch{}
  window.addEventListener('online',refreshProfile);void refreshProfile();let unsubscribe=()=>{};void getSupabase().then(c=>{if(!c)return;const {data}=c.auth.onAuthStateChange(event=>{if(event==='SIGNED_IN')setTimeout(()=>void refreshProfile(),0);});unsubscribe=()=>data.subscription.unsubscribe();}).catch(()=>{});
  const hash=()=>{const params=new URLSearchParams(location.hash.slice(1));if(params.has('tournament'))setTab('tournaments');if(params.has('match')){const code=params.get('match')!;void arena<{match:ArenaMatch}>('join',{code}).then(d=>openMatch(d.match.id)).catch(e=>{toast.info((e as Error).message);setTab('online');});}};hash();window.addEventListener('hashchange',hash);
  const clear=()=>{setMember(false);setProfile(null);setSummary(null);setActiveId('');setInvites([]);setLocalRating({cbr:88,wins:0,losses:0,win_streak:0});setTab('profile');};window.addEventListener('cb-signed-out',clear);
  return()=>{clearTimeout(splash);unsubscribe();window.removeEventListener('online',refreshProfile);window.removeEventListener('cb-signed-out',clear);window.removeEventListener('hashchange',hash);};
 },[refreshProfile]);
 useEffect(()=>{if(!profile||profile.user_id==='guest-device')return;let live=true,pending=false;const poll=async()=>{if(pending||!navigator.onLine)return;pending=true;try{const d=await arena<{invites:Invite[];match:ArenaMatch|null;completed?:ArenaMatch|null}>('state');if(live){setInvites(d.invites);if(d.completed)showOnlineResult(d.completed);if(d.match?.status==='finished')showOnlineResult(d.match);setActiveId(d.match?.status==='active'?d.match.id:'');}}catch{}finally{pending=false;}};void poll();const timer=setInterval(poll,4000);return()=>{live=false;clearInterval(timer);};},[profile?.user_id,showOnlineResult]);
 useEffect(()=>{scroller.current?.scrollTo(0,0);},[tab]);
 const active=['offline','pairing','online','game','watch','channel','replay','tournaments'].includes(tab)?'play':tab==='cms'?'profile':tab==='territory'?'map':tab;
 const back=<button className="back-button" onClick={()=>setTab('play')}><ArrowLeft size={15}/>Match Lobby</button>;
 const staff=profile&&['owner','admin'].includes(profile.role);
 const navigate=(next:string)=>{if(!member){setTab('profile');toast.info('Register and save your profile to unlock Chess Burger.');return;}setTab(next);};
 let content;
 if(tab==='home')content=<CommunityFeed onOpenProfile={userId=>{setViewedUserId(userId);setTab('public-profile');}}/>;
 else if(tab==='public-profile')content=<PublicProfile currentUserId={profile?.user_id} userId={viewedUserId} onClose={()=>setTab('home')}/>;
 else if(tab==='play')content=<section className="play-page"><div className="page-heading"><h1>Match Lobby</h1><button className="text-button" onClick={()=>setTab('channel')}><Radio size={15}/>Channel</button></div><p className="page-caption">Choose your board.</p><div className="mode-list">{modes.map(({name,sub,meta,Icon,key})=><button key={key} className="match-row available" onClick={()=>{setTarget(null);setTab(key);}}><span className="mode-symbol"><Icon size={21}/></span><span className="mode-copy"><strong>{name}</strong><small>{sub}</small></span><span className="mode-meta">{meta}</span><ChevronRight size={15}/></button>)}</div><div className="lobby-pair-grid lobby-shortcuts"><button className="cloud-panel" onClick={()=>setTab('pairing')}><CreditCard/><strong>Offline QR pairing</strong><span>Host or scan a local board</span></button><button className="cloud-panel" onClick={()=>{setTarget(null);setTab('online');}}><Swords/><strong>Code & join</strong><span>Open a friend’s online room</span></button></div><p className="lobby-footnote">CBR counts in every mode. Offline results save to this device and sync to your signed-in account when you reconnect.</p></section>;
 else if(tab==='online')content=<>{back}<OnlinePlay profile={profile} target={target} onMatch={openMatch} onLogin={()=>setTab('profile')}/></>;
 else if(tab==='game'||tab==='watch')content=<>{back}<OnlineGame key={matchId+tab} id={matchId} profile={profile} watch={tab==='watch'} onFinished={m=>{showOnlineResult(m);void refreshProfile();window.dispatchEvent(new Event('cb-profile-saved'));}}/></>;
 else if(tab==='pairing')content=<>{back}<LocalPairing profile={profile} startSameDevice={c=>{setOfflineControl(c);setTab('offline');}} startOnlineMatch={openMatch} onResult={localResult}/></>;
 else if(tab==='offline')content=<>{back}<SharedBoard profile={profile} control={offlineControl} onResult={localResult}/></>;
 else if(tab==='replay')content=<>{back}<Offline key={replayGame?.id} replayGame={replayGame} playerName={profile?.display_name} onClose={()=>setTab('profile')}/></>;
 else if(tab==='map'||tab==='territory')content=<NearbyMap {...gps} territory={tab==='territory'} onInvite={p=>{setTarget(p);setTab('online');}} onClaimed={()=>void refreshProfile()}/>;
 else if(tab==='rank')content=<Rankings profile={profile}/>;
 else if(tab==='channel')content=<>{back}<LiveChannel onWatch={id=>{setMatchId(id);setTab('watch');}}/></>;
 else if(tab==='tournaments')content=<Tournaments profile={profile}/>;
 else if(tab==='card')content=<section className="profile-page card-only-view"><div className="page-heading"><h1>User card</h1><span className="sample-label">Player identity</span></div><Account cardOnly onLoaded={setProfile} onSaved={onSaved} onMembershipChange={setMember}/></section>;
 else if(tab==='shop')content=<section className="shop-page"><div className="page-heading"><h1>Chess Burger shop</h1><span className="sample-label">{profile?.gold_points??0} Gold</span></div><div className="shop-grid">{[['♞','Avatar frames','Decorative player-card frames.'],['♛','Board themes','Metallic boards and pieces.'],['♟','Gold rewards','Reward items for your collection.']].map(([icon,name,desc])=><article key={name}><span className="shop-icon">{icon}</span><div><h2>{name}</h2><p>{desc}</p></div><span className="shop-status">Coming soon</span></article>)}</div></section>;
 else if(tab==='cms'&&staff)content=<Cms profile={profile} onClose={()=>setTab('profile')}/>;
 else content=<section className="profile-page"><div className="page-heading"><h1>Player profile</h1></div><Account onLoaded={setProfile} onSaved={onSaved} onOpenCms={()=>setTab('cms')} onMembershipChange={m=>{setMember(m);if(!m)setTab('profile');}}/>{member===true&&<RecentPlays onReplay={g=>{setReplayGame(g);setTab('replay');}}/>}</section>;
 if(member===false&&tab!=='profile')content=<section className="profile-page registration-gate"><div className="page-heading"><h1>Create your player profile</h1></div><Account onLoaded={setProfile} onSaved={onSaved} onMembershipChange={setMember}/></section>;
 return <main className="app-shell">{showSplash&&<div className="splash-screen" role="status" aria-label="Chess Burger is loading"><img src="/cburger_logo.png" alt="Chess Burger"/><strong>CHESS <b>BURGER</b></strong></div>}<header className="app-header"><div className="brand"><img src="/cburger_logo.png" alt="Chess Burger"/><span>CHESS <b>BURGER</b></span></div><div className="header-actions"><button aria-label="About Chess Burger" onClick={()=>toast.info('Chess Burger',{description:'Online, nearby, and local chess. Your next move starts here.'})}><CircleHelp size={18}/></button><button className="header-avatar" aria-label="Open profile" onClick={()=>setTab('profile')}>{profile?.avatar_url?<img src={profile.avatar_url} alt={profile.display_name}/>:profile?.display_name?.[0]?.toUpperCase()??<UserRound size={16}/>}</button></div></header>
 <div className={'scroll-area '+(['offline','game','watch','replay'].includes(tab)?'board-scroll ':'')+(tab==='rank'?'rank-scroll':'')} ref={scroller}>{activeId&&tab!=='game'&&<button className="resume-match" onClick={()=>openMatch(activeId)}>Return to your active match <ChevronRight size={15}/></button>}{invites.length>0&&tab!=='game'&&<div className="invite-inbox cloud-panel">{invites.map(i=><div key={i.id}><strong>{i.host_name} invited you</strong><span>{timeControl(i.control).group} · {timeControl(i.control).label}</span><button className="gold-button" onClick={()=>void arena<{match:ArenaMatch}>('join',{code:i.code}).then(r=>openMatch(r.match.id)).catch(e=>toast.error(e.message))}>Accept</button><button onClick={()=>void arena('cancel-room',{id:i.id}).then(()=>setInvites(v=>v.filter(m=>m.id!==i.id)))}>Decline</button></div>)}</div>}{content}</div>
 <nav className="bottom-nav" aria-label="Main navigation">{navigation.map(({key,label,Icon})=><button key={key} aria-current={active===key?'page':undefined} className={(active===key?'active ':'')+(key==='play'?'play-nav':'')} onClick={()=>key==='profile'?setTab(key):navigate(key)}><span className="nav-icon-shell"><Icon size={20} strokeWidth={1.7}/></span><span>{label}</span></button>)}</nav><MatchResult result={summary} onClose={()=>{setSummary(null);setMatchId('');setActiveId('');setTab('play');}}/><SocialHub profile={profile} onOpenProfile={id=>{setViewedUserId(id);setTab('public-profile');}}/><Toaster theme="light" position="top-center" richColors closeButton/></main>;
}
