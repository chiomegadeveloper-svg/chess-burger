'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {ArrowLeft,Check,ChevronRight,Clock3,Crown,Medal,RefreshCw,Timer,Trophy} from 'lucide-react';
import {toast} from 'sonner';
import {chessMath} from './chess-math-client';
import './chess-math.css';

type Difficulty='easy'|'medium'|'hard';
type Question={id:string;kind:'math'|'logic';prompt:string;mode:'choice'|'exact';options?:string[]};
type Session={id:string;difficulty:Difficulty;duration_seconds:number;started_at:string;expires_at:string;questions:Question[]};
type Answer={id:string;answer:string};
type Leader={user_id:string;username:string;display_name:string|null;avatar_url:string|null;score?:number;total?:number;elapsed_ms?:number;ms_per_correct?:number;finishes?:number};
type Leaders={score:Leader[];speed:Leader[];finishers:Leader[]};
type Result={score:number;total:number;answered:number;elapsed_ms:number;difficulty:Difficulty;late?:boolean};
const durations=[60,120,180,300] as const;
const levels:Difficulty[]=['easy','medium','hard'];
const empty:Leaders={score:[],speed:[],finishers:[]};
const formatTime=(seconds:number)=>`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
const storageKey=(id:string)=>`cb-chess-math-answers:${id}`;
function recover(session:Session){
  try{
    const saved=JSON.parse(localStorage.getItem(storageKey(session.id))||'[]') as Answer[];
    const ids=new Set(session.questions.map(question=>question.id));
    return saved.filter(row=>ids.has(row.id)&&/^\S+$/.test(row.answer));
  }catch{return []}
}

export default function ChessMath({onExit}:{onExit:()=>void}){
  const [difficulty,setDifficulty]=useState<Difficulty>('easy'),[count,setCount]=useState(10),[duration,setDuration]=useState(120);
  const [leaders,setLeaders]=useState<Leaders>(empty),[session,setSession]=useState<Session|null>(null),[answers,setAnswers]=useState<Answer[]>([]),[entry,setEntry]=useState('');
  const [result,setResult]=useState<Result|null>(null),[now,setNow]=useState(()=>Date.now()),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const finishing=useRef(false),answering=useRef(false),loadRequest=useRef(0);
  const hydrate=useCallback((active:Session)=>{const saved=recover(active);setSession(active);setAnswers(saved);setDifficulty(active.difficulty);setNow(Date.now());setResult(null);},[]);
  const load=useCallback(async(level:Difficulty)=>{
    const request=++loadRequest.current;
    setLoading(true);
    try{const response=await chessMath<{active:Session|null;leaders:Leaders;rankings_error?:string|null}>('state',{difficulty:level});if(request!==loadRequest.current)return;setLeaders(response.leaders||empty);if(response.active)hydrate(response.active);setError(response.rankings_error||'');}
    catch(issue){if(request===loadRequest.current)setError(issue instanceof Error?issue.message:'Chess Math is unavailable.');}
    finally{if(request===loadRequest.current)setLoading(false)}
  },[hydrate]);
  useEffect(()=>{const timer=window.setTimeout(()=>void load('easy'),0);return()=>window.clearTimeout(timer)},[load]);
  useEffect(()=>{if(!session)return;const timer=window.setInterval(()=>setNow(Date.now()),250);return()=>window.clearInterval(timer)},[session]);
  const remaining=session?Math.max(0,Math.ceil((Date.parse(session.expires_at)-now)/1000)):0;
  const current=session?.questions[answers.length];

  const finish=useCallback(async(active:Session,submitted:Answer[])=>{
    if(finishing.current)return;
    finishing.current=true;setBusy(true);
    try{
      const response=await chessMath<{result:Result;leaders:Leaders}>('finish',{id:active.id,answers:submitted});
      localStorage.removeItem(storageKey(active.id));setSession(null);setAnswers([]);setEntry('');setResult(response.result);setLeaders(response.leaders||empty);setError('');
    }catch(issue){toast.error(issue instanceof Error?issue.message:'Could not save your quiz. Retry to submit your answers.');}
    finally{finishing.current=false;setBusy(false)}
  },[]);
  useEffect(()=>{if(session&&(remaining===0||answers.length===session.questions.length)&&!finishing.current)void finish(session,answers)},[session,remaining,answers,finish]);
  const start=async()=>{
    setBusy(true);
    try{const response=await chessMath<{session:Session;resumed:boolean}>('start',{difficulty,count,duration_seconds:duration});hydrate(response.session);setNow(Date.now());if(response.resumed)toast.info('Your active Chess Math quiz has resumed.');setError('');}
    catch(issue){toast.error(issue instanceof Error?issue.message:'Could not start Chess Math.');}
    finally{setBusy(false)}
  };
  const advance=(answer:string)=>{
    if(!session||!current||busy||answering.current||remaining===0)return;
    const value=answer.trim();
    if(!/^\S+$/.test(value))return toast.error('Enter exactly one word or number.');
    answering.current=true;
    const next=[...answers,{id:current.id,answer:value}];
    localStorage.setItem(storageKey(session.id),JSON.stringify(next));
    setAnswers(next);setEntry('');
    if(next.length===session.questions.length)void finish(session,next);
    requestAnimationFrame(()=>{answering.current=false});
  };
  const changeDifficulty=(level:Difficulty)=>{if(session)return;setDifficulty(level);void load(level)};
  const boards=[
    {key:'score' as const,title:'Highest Score',subtitle:'Best single timed quiz',Icon:Trophy,metric:(row:Leader)=>`${row.score}/${row.total}`,detail:(row:Leader)=>`${(Number(row.elapsed_ms||0)/1000).toFixed(1)}s`},
    {key:'speed' as const,title:'Fastest Answers',subtitle:'Seconds per correct · ≥70% accuracy',Icon:Timer,metric:(row:Leader)=>`${(Number(row.ms_per_correct||0)/1000).toFixed(2)}s`,detail:(row:Leader)=>`${row.score}/${row.total} correct`},
    {key:'finishers' as const,title:'Top Finishers',subtitle:'Quizzes fully answered',Icon:Medal,metric:(row:Leader)=>String(row.finishes||0),detail:()=> 'completed'},
  ];
  return <section className="chess-math-page">
    <button type="button" className="chess-math-back" onClick={onExit}><ArrowLeft size={15}/>Classroom</button>
    <header className="chess-math-hero"><div className="chess-math-mark"><img src="/classroom/chess-math-mascot.webp" alt=""/></div><div><small>CHESS BURGER · CLASSROOM</small><h1>Chess Math</h1><p>Think in pieces. Solve the trade. Beat the clock.</p></div><span className="chess-math-bank-count">1,000 questions<br/><b>500 Math · 500 Logic</b></span></header>
    <div className="chess-math-values" aria-label="Chess piece values"><strong>PIECE VALUES</strong>{[['Q','Queen','9'],['R','Rook','5'],['B','Bishop','3'],['N','Knight','3'],['P','Pawn','1'],['K','King','—']].map(([symbol,name,value])=><span key={symbol}><b>{symbol}</b><small>{name}</small><em>{value}</em></span>)}<small className="chess-math-king-note">King has no material value.</small></div>
    {session?<section className="chess-math-quiz" aria-label="Timed Chess Math quiz"><div className="chess-math-quiz-top"><div><small>{session.difficulty.toUpperCase()} · {current?.kind==='logic'?'MATERIAL LOGIC':'PIECE MATH'}</small><h2>Question {Math.min(answers.length+1,session.questions.length)} <span>/ {session.questions.length}</span></h2></div><strong className={remaining<=15?'chess-math-clock urgent':'chess-math-clock'}><Clock3 size={18}/>{formatTime(remaining)}</strong></div><div className="chess-math-progress"><span style={{width:`${answers.length/session.questions.length*100}%`}}/></div>{current&&<><p className="chess-math-prompt">{current.prompt}</p>{current.mode==='choice'?<div className="chess-math-options">{current.options?.map(option=><button key={option} disabled={busy||remaining===0} type="button" onClick={()=>advance(option)}>{option}<ChevronRight size={17}/></button>)}</div>:<form className="chess-math-exact" onSubmit={event=>{event.preventDefault();advance(entry)}}><label htmlFor="chess-math-answer">Exact answer · one word or number</label><div><input id="chess-math-answer" autoComplete="off" maxLength={24} value={entry} onChange={event=>setEntry(event.target.value.replace(/\s/g,''))} placeholder="Type your answer"/><button type="submit" disabled={!entry||busy||remaining===0}>Answer <ChevronRight size={15}/></button></div></form>}</>}<footer><span><Check size={14}/>{answers.length} answered</span><span>Quiz ends when time runs out or all answers are submitted.</span><button type="button" disabled={busy} onClick={()=>void finish(session,answers)}>{busy?'Saving…':'Finish now'}</button></footer></section>:<>
      {result&&<section className="chess-math-result" role="status"><Crown size={25}/><div><small>{result.late?'TIME EXPIRED · RESULT NOT SCORED':'QUIZ COMPLETE'}</small><h2>{result.score} / {result.total} correct</h2><p>{result.answered} answered · {(result.elapsed_ms/1000).toFixed(1)} seconds · {result.difficulty} difficulty</p></div><button type="button" onClick={()=>setResult(null)}>New quiz</button></section>}
      <section className="chess-math-setup"><div className="chess-math-section-head"><div><small>YOUR NEXT CHALLENGE</small><h2>Set up a timed quiz</h2></div><span>10–50 questions</span></div><div className="chess-math-controls"><div><label>Difficulty</label><div className="chess-math-segments">{levels.map(level=><button type="button" key={level} className={difficulty===level?'selected':''} onClick={()=>changeDifficulty(level)}>{level}</button>)}</div></div><div><label htmlFor="chess-math-count">Number of questions</label><input id="chess-math-count" type="number" min={10} max={50} step={1} value={count} onChange={event=>setCount(Number(event.target.value))}/></div><div><label>Time limit</label><div className="chess-math-segments chess-math-times">{durations.map(seconds=><button type="button" key={seconds} className={duration===seconds?'selected':''} onClick={()=>setDuration(seconds)}>{seconds/60}m</button>)}</div></div></div><div className="chess-math-start-row"><p>Math and material-trade questions are mixed randomly. Answers alternate between multiple choice and exact entry.</p><button type="button" disabled={busy||count<10||count>50||!Number.isInteger(count)} onClick={()=>void start()}>{busy?'Preparing…':'Start Chess Math'} <ChevronRight size={17}/></button></div></section>
    </>}
    <section className="chess-math-rankings"><div className="chess-math-section-head"><div><small>CLASSROOM RANKINGS · {difficulty.toUpperCase()}</small><h2>Top 10 players</h2></div><button type="button" disabled={loading} onClick={()=>void load(difficulty)}><RefreshCw size={14}/>Refresh</button></div>{error&&<p className="chess-math-error" role="alert">{error}</p>}<div className="chess-math-board-grid">{boards.map(({key,title,subtitle,Icon,metric,detail})=><article className="chess-math-board" key={key}><header><Icon size={20}/><div><h3>{title}</h3><p>{subtitle}</p></div></header>{loading&&!leaders[key].length?<p className="chess-math-empty">Loading rankings…</p>:!leaders[key].length?<p className="chess-math-empty">No scores yet. Take the first spot.</p>:<ol>{leaders[key].slice(0,10).map((row,index)=><li key={row.user_id}><b className="chess-math-place">{index+1}</b>{row.avatar_url?<img src={row.avatar_url} alt=""/>:<span className="chess-math-avatar">{(row.display_name||row.username||'?')[0]}</span>}<span className="chess-math-player"><strong>{row.display_name||row.username}</strong><small>@{row.username}</small></span><span className="chess-math-metric"><b>{metric(row)}</b><small>{detail(row)}</small></span></li>)}</ol>}</article>)}</div></section>
  </section>;
}
