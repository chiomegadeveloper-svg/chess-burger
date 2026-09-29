'use client';
import {useEffect,useState} from 'react';
import {Clock3, Medal, RefreshCw, Shield, Trophy, Zap} from 'lucide-react';
import {arena} from './arena-client';
import './cpu-rankings.css';

type Row={user_id:string;username:string;display_name:string|null;avatar_url:string|null;wins:number;cbr_gain:number};
type Category='today'|'week'|'all_time'|'rapid'|'blitz'|'bullet';
type Leaders=Record<Category,Row[]>;
const categories=[
  {key:'today',title:'Players Today',meta:'Philippine time · resets daily',Icon:Clock3},
  {key:'week',title:'Players This Week',meta:'Monday to Sunday · Philippine time',Icon:Medal},
  {key:'all_time',title:'Players All Time',meta:'Every recorded CPU victory',Icon:Trophy},
  {key:'rapid',title:'Rapid Players',meta:'All-time Rapid wins',Icon:Shield},
  {key:'blitz',title:'Blitz Players',meta:'All-time Blitz wins',Icon:Zap},
  {key:'bullet',title:'Bullet Players',meta:'All-time Bullet wins',Icon:Zap},
] as const;

export default function CpuRankings({userId}:{userId:string}){
  const [leaders,setLeaders]=useState<Leaders|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const load=async()=>{setLoading(true);try{const result=await arena<{leaders:Leaders}>('cpu-rankings');setLeaders(result.leaders);setError('')}catch(e){setError(e instanceof Error?e.message:'CPU rankings are temporarily unavailable.')}finally{setLoading(false)}};
  useEffect(()=>{let active=true;void arena<{leaders:Leaders}>('cpu-rankings').then(result=>{if(active){setLeaders(result.leaders);setError('')}}).catch(e=>{if(active)setError(e instanceof Error?e.message:'CPU rankings are temporarily unavailable.')}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[]);
  return <section className="cpu-rankings" aria-labelledby="cpu-rankings-title">
    <header className="cpu-rankings-heading"><div><small>CHESS BURGER · AI ARENA</small><h2 id="cpu-rankings-title">CPU Top Rankings</h2><p>Six Top 10 boards, ranked by CPU wins. CPU CBR gained breaks a tie.</p></div><button type="button" disabled={loading} onClick={()=>void load()} aria-label="Refresh CPU rankings"><RefreshCw size={15} className={loading?'cpu-ranking-spin':''}/> Refresh</button></header>
    {error&&<p className="cpu-rankings-error" role="alert">{error}</p>}
    <div className="cpu-rankings-grid">{categories.map(({key,title,meta,Icon},index)=>{const rows=leaders?.[key]??[];return <section key={key} className="cpu-ranking-card" aria-label={`Top 10 ${title}`}>
      <header><div className="cpu-ranking-icon"><Icon size={18}/></div><div><small>{index<3?'OVERALL':'TIME CONTROL'}</small><h3>Top 10 {title}</h3><p>{meta}</p></div></header>
      {loading&&!leaders?<p className="cpu-ranking-empty">Loading rankings…</p>:!rows.length?<p className="cpu-ranking-empty">No CPU victories yet. Be the first to rank.</p>:<ol>{rows.slice(0,10).map((row,position)=><li key={row.user_id} className={`${position<3?'cpu-ranking-podium':''} ${row.user_id===userId?'cpu-ranking-own':''}`}>
        <span className="cpu-ranking-place">{position+1}</span>{row.avatar_url?<img src={row.avatar_url} alt=""/>:<span className="cpu-ranking-avatar">{(row.display_name||row.username||'?').slice(0,1).toUpperCase()}</span>}
        <div className="cpu-ranking-player"><strong>{row.display_name||row.username||'Player'}{row.user_id===userId&&<i>YOU</i>}</strong><small>@{row.username}</small></div><div className="cpu-ranking-score"><strong>{Number(row.wins).toLocaleString()}</strong><small>{Number(row.cbr_gain)>0?'+':''}{Number(row.cbr_gain)} CBR</small></div>
      </li>)}</ol>}
    </section>})}</div>
  </section>;
}
