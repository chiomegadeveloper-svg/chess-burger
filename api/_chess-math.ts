import {createClient} from '@supabase/supabase-js';
import {chessMathById,pickQuestions,questionView,scoreAnswers,type Difficulty} from './_chess-math-bank.js';

type Req={method?:string;headers:{authorization?:string|string[]};body?:Record<string,unknown>};
type Res={status:(code:number)=>Res;json:(body:unknown)=>void;setHeader:(key:string,value:string)=>void};
const fail=(status:number,message:string):never=>{const error=Error(message) as Error&{status:number};error.status=status;throw error;};
const migration='Apply supabase/0082_chess_math.sql in the Chess Burger Supabase SQL Editor to enable Chess Math.';
const uuid=/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const validDifficulty=(value:unknown):value is Difficulty=>value==='easy'||value==='medium'||value==='hard';
const missing=(error:{code?:string;message:string})=>['42P01','PGRST202','PGRST205'].includes(error.code||'')||/schema cache|cb_chess_math/i.test(error.message);

export default async function handler(req:Req,res:Res){
  res.setHeader('Cache-Control','no-store');
  try{
    if(req.method!=='POST')fail(405,'Method not allowed.');
    const url=process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.VITE_SUPABASE_URL||process.env.SUPABASE_URL;
    const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
    if(!url||!key)fail(503,'Chess Math server is not configured.');
    const db=createClient(url!,key!,{auth:{persistSession:false,autoRefreshToken:false}});
    const raw=req.headers.authorization,token=(Array.isArray(raw)?raw[0]:raw||'').replace(/^Bearer\s+/i,'');
    if(!token)fail(401,'Sign in to play Chess Math.');
    const auth=await db.auth.getUser(token);
    if(auth.error||!auth.data.user)fail(401,'Sign in again to play Chess Math.');
    const userId=auth.data.user!.id,body=req.body||{},action=String(body.action||'');
    const profile=await db.from('cb_profiles').select('avatar_url,agreement_version').eq('user_id',userId).maybeSingle();
    if(profile.error||!profile.data)fail(403,'Complete your Chess Burger profile first.');
    if(!String(profile.data!.avatar_url||'').includes(`/storage/v1/object/public/cb-profile-media/${userId}/avatar-`))fail(403,'Save a profile picture first.');
    if(profile.data!.agreement_version===null)fail(403,'Accept the End User Agreement first.');

    const leaders=async(difficulty:Difficulty)=>{
      const result=await db.rpc('cb_chess_math_leaders',{p_difficulty:difficulty});
      if(result.error)fail(missing(result.error)?503:500,missing(result.error)?migration:result.error.message);
      return result.data;
    };
    const active=async()=>{
      const result=await db.from('cb_chess_math_sessions').select('id,difficulty,question_ids,duration_seconds,started_at,expires_at').eq('user_id',userId).is('finished_at',null).gt('expires_at',new Date().toISOString()).order('started_at',{ascending:false}).limit(1).maybeSingle();
      if(result.error)fail(missing(result.error)?503:500,missing(result.error)?migration:result.error.message);
      return result.data;
    };
    const view=(session:{id:string;difficulty:string;question_ids:string[];duration_seconds:number;started_at:string;expires_at:string})=>({
      id:session.id,difficulty:session.difficulty,duration_seconds:session.duration_seconds,started_at:session.started_at,expires_at:session.expires_at,
      questions:session.question_ids.map((id,index)=>{const question=chessMathById.get(id);if(!question)fail(500,'A Chess Math question is missing.');return questionView(question!,session.id,index)})
    });

    if(action==='state'){
      const difficulty=validDifficulty(body.difficulty)?body.difficulty:'easy';
      const existing=await active(),rankings=await leaders(existing?.difficulty??difficulty);
      return res.status(200).json({bank:{math:500,logic:500},active:existing?view(existing):null,leaders:rankings});
    }
    if(action==='start'){
      const difficulty=body.difficulty,count=Number(body.count),duration=Number(body.duration_seconds);
      if(!validDifficulty(difficulty))fail(400,'Choose easy, medium, or hard.');
      if(!Number.isInteger(count)||count<10||count>50||![60,120,180,300].includes(duration))fail(400,'Choose 10–50 questions and a 1, 2, 3, or 5 minute timer.');
      const existing=await active();
      if(existing)return res.status(200).json({session:view(existing),resumed:true});
      const questions=pickQuestions(difficulty as Difficulty,count);
      if(questions.length!==count)fail(500,'The question bank is unavailable.');
      const started=new Date(),id=crypto.randomUUID();
      const created=await db.from('cb_chess_math_sessions').insert({id,user_id:userId,difficulty,question_ids:questions.map(question=>question.id),duration_seconds:duration,started_at:started.toISOString(),expires_at:new Date(started.getTime()+duration*1000).toISOString()}).select('id,difficulty,question_ids,duration_seconds,started_at,expires_at').single();
      if(created.error)fail(missing(created.error)?503:500,missing(created.error)?migration:created.error.message);
      return res.status(200).json({session:view(created.data!),resumed:false});
    }
    if(action==='finish'){
      const id=String(body.id||''),submitted=body.answers;
      if(!uuid.test(id)||!Array.isArray(submitted)||submitted.length>50||submitted.some(row=>!row||typeof row!=='object'||typeof row.id!=='string'||typeof row.answer!=='string'||row.answer.length>24||row.answer.trim()&&!/^\S+$/.test(row.answer.trim())))fail(400,'Submit one-word answers from this quiz.');
      const found=await db.from('cb_chess_math_sessions').select('*').eq('id',id).eq('user_id',userId).maybeSingle();
      if(found.error)fail(missing(found.error)?503:500,missing(found.error)?migration:found.error.message);
      if(!found.data)fail(404,'Chess Math session not found.');
      const session=found.data;
      if(session.finished_at)return res.status(200).json({result:{score:session.score,total:session.question_ids.length,answered:session.answered_count,elapsed_ms:session.elapsed_ms,difficulty:session.difficulty},leaders:await leaders(session.difficulty)});
      const answers=(submitted as Array<{id:string;answer:string}>).map(row=>{
        const index=/^q([1-9]|[1-4][0-9]|50)$/.test(row.id)?Number(row.id.slice(1))-1:-1;
        return {id:session.question_ids[index]||'',answer:row.answer.trim()};
      }).filter(row=>!!row.id);
      if(new Set(answers.map(row=>row.id)).size!==answers.length)fail(400,'Submit each question only once.');
      const finishedAt=new Date(),withinDeadline=finishedAt.getTime()<=Date.parse(session.expires_at)+10_000;
      const graded=withinDeadline?scoreAnswers(session.question_ids,answers):{score:0,answered:0};
      const elapsed=Math.max(0,Math.min(session.duration_seconds*1000,finishedAt.getTime()-Date.parse(session.started_at)));
      const updated=await db.from('cb_chess_math_sessions').update({finished_at:finishedAt.toISOString(),answers:withinDeadline?answers:[],score:graded.score,answered_count:graded.answered,elapsed_ms:elapsed}).eq('id',id).eq('user_id',userId).is('finished_at',null).select('score,answered_count,elapsed_ms').maybeSingle();
      if(updated.error)fail(missing(updated.error)?503:500,missing(updated.error)?migration:updated.error.message);
      if(!updated.data){const done=await db.from('cb_chess_math_sessions').select('score,answered_count,elapsed_ms').eq('id',id).eq('user_id',userId).single();if(done.error)fail(500,'Refresh your Chess Math result.');return res.status(200).json({result:{score:done.data!.score,total:session.question_ids.length,answered:done.data!.answered_count,elapsed_ms:done.data!.elapsed_ms,difficulty:session.difficulty},leaders:await leaders(session.difficulty)});}
      return res.status(200).json({result:{score:graded.score,total:session.question_ids.length,answered:graded.answered,elapsed_ms:elapsed,difficulty:session.difficulty,late:!withinDeadline},leaders:await leaders(session.difficulty)});
    }
    fail(404,'Unknown Chess Math action.');
  }catch(error){const issue=error as Error&{status?:number};res.status(issue.status||500).json({error:issue.status?issue.message:'Chess Math request failed.'});}
}
