'use client';
import {useEffect,useState} from 'react';
import {ChevronRight,Clock3,RefreshCw,Swords,Trophy,Timer,Medal} from 'lucide-react';
import {toast} from 'sonner';
import {chessMath} from './chess-math-client';
import './chess-math-attack.css';

type Question={id:string;kind:'math'|'logic';prompt:string;mode:'choice'|'exact';options?:string[]};
type Attempt={id:string;correct:number;mistakes:number;question_number:number;started_at:string;elapsed_ms:number;question:Question|null};
type Leader={user_id:string;username:string;display_name:string|null;avatar_url:string|null;correct?:number;elapsed_ms?:number;correct_per_minute?:number;total_correct?:number;attempts?:number};
type Leaders={score:Leader[];pace:Leader[];lifetime:Leader[]};
const empty:Leaders={score:[],pace:[],lifetime:[]};
const duration=(ms:number)=>{const seconds=Math.floor(ms/1000);return `${Math.floor(seconds/3600)?`${Math.floor(seconds/3600)}:`:''}${String(Math.floor(seconds/60)%60).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;};

export default function ChessMathAttack(){
 const [open,setOpen]=useState(false),[attempt,setAttempt]=useState<Attempt|null>(null),[leaders,setLeaders]=useState<Leaders>(empty);
 const [entry,setEntry]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const [feedback,setFeedback]=useState(''),[finished,setFinished]=useState<Attempt|null>(null),[now,setNow]=useState(Date.now);
 const load=async()=>{setLoading(true);try{
  const response=await chessMath<{active:Attempt|null;leaders:Leaders}>('attack-state');
  setAttempt(response.active);setLeaders(response.leaders||empty);setError('');if(response.active)setOpen(true);
 }catch(issue){setError(issue instanceof Error?issue.message:'Quiz ATTACK is unavailable.');}finally{setLoading(false)}};
 useEffect(()=>{void load()},[]);
 useEffect(()=>{if(!attempt)return;const tick=window.setInterval(()=>setNow(Date.now()),1000);return()=>window.clearInterval(tick)},[attempt]);
 const start=async()=>{setBusy(true);try{
  const response=await chessMath<{attempt:Attempt;resumed:boolean}>('attack-start');
  setAttempt(response.attempt);setFinished(null);setOpen(true);setFeedback('');setEntry('');setNow(Date.now());setError('');
  if(response.resumed)toast.info('Your Quiz ATTACK attempt has resumed.');
 }catch(issue){toast.error(issue instanceof Error?issue.message:'Could not start Quiz ATTACK.');}finally{setBusy(false)}};
 const answer=async(value:string)=>{
  if(!attempt||!attempt.question||busy)return;
  const answer=value.trim();if(!/^\S+$/.test(answer))return toast.error('Enter exactly one word or number.');
  setBusy(true);try{
   const response=await chessMath<{correct:boolean;attempt:Attempt;leaders?:Leaders}>('attack-answer',{question_number:attempt.question_number,answer});
   setEntry('');setFeedback(response.correct?'Correct!':'Mistake recorded.');
   if(response.attempt.question){setAttempt(response.attempt);}else{
    setFinished(response.attempt);setAttempt(null);setLeaders(response.leaders||empty);
    setFeedback('Third mistake. Your attempt is complete.');
   }
   setError('');
  }catch(issue){const message=issue instanceof Error?issue.message:'Could not submit answer.';setError(message);toast.error(message);}
  finally{setBusy(false)}
 };
 const boards=[
  {key:'score' as const,title:'Most correct answers',subtitle:'Best completed attempt',Icon:Trophy,metric:(row:Leader)=>`${row.correct||0} correct`,detail:(row:Leader)=>duration(row.elapsed_ms||0)},
  {key:'pace' as const,title:'Most correct in shortest time',subtitle:'Correct per minute · at least 10 correct',Icon:Timer,metric:(row:Leader)=>`${row.correct_per_minute||0}/min`,detail:(row:Leader)=>`${row.correct||0} correct · ${duration(row.elapsed_ms||0)}`},
  {key:'lifetime' as const,title:'Users of all time',subtitle:'Total correct across completed attempts',Icon:Medal,metric:(row:Leader)=>`${row.total_correct||0} correct`,detail:(row:Leader)=>`${row.attempts||0} attempts`}
 ];
 return <section className="chess-attack" aria-labelledby="chess-attack-title">
  <header><span className="chess-attack-icon"><Swords size={25}/></span><div><small>ENDLESS CHESS MATH CHALLENGE</small><h2 id="chess-attack-title">Quiz ATTACK</h2><p>No time limit. Keep answering until your third mistake. Your elapsed time is recorded.</p></div>{attempt&&!open?<button type="button" onClick={()=>setOpen(true)}>Resume <ChevronRight size={15}/></button>:!attempt?<button type="button" onClick={()=>void start()} disabled={busy||loading}>{busy?'Starting…':finished?'Play again':'Enter portal'} <ChevronRight size={15}/></button>:null}</header>
  {error&&<p className="chess-attack-error" role="alert">{error}</p>}
  {open&&attempt?.question&&<div className="chess-attack-play"><div className="chess-attack-status"><strong>Question {attempt.question_number}</strong><span>{attempt.correct} correct · {attempt.mistakes} / 3 mistakes</span><time><Clock3 size={14}/>{duration(Math.max(attempt.elapsed_ms,Date.now()-Date.parse(attempt.started_at),now-Date.parse(attempt.started_at)))}</time></div><p className="chess-attack-prompt">{attempt.question.prompt}</p>{attempt.question.mode==='choice'?<div className="chess-attack-options">{attempt.question.options?.map(option=><button key={option} type="button" disabled={busy} onClick={()=>void answer(option)}>{option}<ChevronRight size={15}/></button>)}</div>:<form className="chess-attack-exact" onSubmit={event=>{event.preventDefault();void answer(entry)}}><label htmlFor="chess-attack-answer">Exact answer · one word or number</label><div><input id="chess-attack-answer" autoComplete="off" value={entry} maxLength={24} onChange={event=>setEntry(event.target.value.replace(/\s/g,''))} placeholder="Your answer"/><button type="submit" disabled={!entry||busy}>Answer</button></div></form>}<footer><span role="status">{feedback}</span><button type="button" onClick={()=>setOpen(false)}>Leave and resume later</button></footer></div>}
  {finished&&<div className="chess-attack-finish" role="status"><Trophy size={23}/><div><strong>{finished.correct} correct answers</strong><span>Ended after 3 mistakes · {duration(finished.elapsed_ms)}</span></div><button type="button" onClick={()=>void start()} disabled={busy}>Try again</button></div>}
  <div className="chess-attack-rankings"><div className="chess-attack-rank-head"><div><small>QUIZ ATTACK RANKINGS</small><h3>Top 10 players</h3></div><button type="button" onClick={()=>void load()} disabled={loading}><RefreshCw size={14}/>Refresh</button></div><div className="chess-math-board-grid">{boards.map(({key,title,subtitle,Icon,metric,detail})=><article className="chess-math-board" key={key}><header><Icon size={20}/><div><h3>{title}</h3><p>{subtitle}</p></div></header>{!leaders[key].length?<p className="chess-math-empty">{loading?'Loading rankings…':'No completed attempts yet.'}</p>:<ol>{leaders[key].slice(0,10).map((row,index)=><li key={row.user_id}><b className="chess-math-place">{index+1}</b>{row.avatar_url?<img src={row.avatar_url} alt=""/>:<span className="chess-math-avatar">{(row.display_name||row.username||'?')[0]}</span>}<span className="chess-math-player"><strong>{row.display_name||row.username}</strong><small>@{row.username}</small></span><span className="chess-math-metric"><b>{metric(row)}</b><small>{detail(row)}</small></span></li>)}</ol>}</article>)}</div></div>
 </section>;
}
