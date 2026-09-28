'use client';
import {useEffect,useState} from 'react';
import {Crown,Medal,Trophy} from 'lucide-react';
import {arena} from './arena-client';
import {Avatar} from './match-board';
import {levelFor} from './cbr';
import type {ArenaPlayer} from './game-rules';
import type {PlayerProfile} from './supabase';
export default function Rankings({profile,onOpenProfile}:{profile:PlayerProfile|null;onOpenProfile:(userId:string)=>void}){
 const [players,setPlayers]=useState<ArenaPlayer[]>([]),[mine,setMine]=useState<{profile:PlayerProfile;rank:number}|null>(null),[error,setError]=useState(''),[rankError,setRankError]=useState(''),[loading,setLoading]=useState(true);
 useEffect(()=>{let alive=true,pending=false;const load=async()=>{if(pending)return;pending=true;const results=await Promise.allSettled([arena<{players:ArenaPlayer[]}>('ranks',{},true),profile&&profile.user_id!=='guest-device'?arena<{profile:PlayerProfile;rank:number}>('me'):Promise.resolve(null)]);pending=false;if(!alive)return;
  if(results[0].status==='fulfilled'){setPlayers(results[0].value.players);setError('')}else setError(results[0].reason instanceof Error?results[0].reason.message:'Rankings are temporarily unavailable.');
  if(results[1].status==='fulfilled'){if(results[1].value)setMine(results[1].value);setRankError('')}else setRankError('Your rank is temporarily unavailable.');setLoading(false)};void load();const timer=setInterval(load,15000);return()=>{alive=false;clearInterval(timer);};},[profile?.user_id]);
 const self=mine?.profile??profile;
 const dailyGold=(rank:number)=>rank===1?10:rank===2?9:rank===3?8:5;
 return <section className="rank-page"><div className="page-heading"><h1>CBR Rankings</h1><span className="sample-label">Daily Gold rewards</span></div><div className="leaderboard cloud-leaderboard"><div className="leaderboard-heading"><h2>Top 10</h2><span>CBR / Daily reward</span></div>{players.map((p,i)=>{const Icon=[Crown,Medal,Trophy][i],rank=i+1;return <button type="button" className="ranking-line ranking-profile-link" key={p.user_id} onClick={()=>onOpenProfile(p.user_id)} aria-label={`View ${p.display_name}'s profile and portfolio`}><span className={'rank-number podium-'+i}>{Icon?<Icon aria-label={'Rank '+rank} size={19}/>:String(rank).padStart(2,'0')}</span><span className="rank-avatar-shell"><Avatar player={p}/>{p.online&&<i className="rank-online-dot" title="Online now" aria-label="Online now"/>}</span><strong>{p.display_name}</strong><span className="rating">{p.cbr.toLocaleString()}<small>+{dailyGold(rank)} Gold / day</small></span></button>})}{!players.length&&<p className="account-note" role="status">{error||(loading?'Loading CBR rankings…':'No ranked players yet.')}</p>}</div><div className="current-rank current-rank-bottom"><span>Your rank<strong>{mine?'#'+mine.rank:loading?'Loading…':rankError?'Unavailable':'Unranked'}</strong></span><span>CBR<strong>{self?.cbr??88}</strong></span><span>Level<strong>{levelFor(self?.cbr??88).level}</strong></span></div>{error&&players.length>0&&<p role="status">{error}</p>}{rankError&&<p role="status">{rankError}</p>}</section>;
}
