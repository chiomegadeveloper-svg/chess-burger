import {randomInt,randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {chessMathBank,chessMathById,questionView} from './_chess-math-bank.js';

type Req={method?:string;headers:{authorization?:string|string[]};body?:Record<string,unknown>};
type Res={status:(code:number)=>Res;json:(body:unknown)=>void;setHeader:(key:string,value:string)=>void};
type Attempt={id:string;user_id:string;current_question_id:string;used_question_ids:string[];question_number:number;correct:number;mistakes:number;started_at:string;finished_at:string|null;elapsed_ms:number|null};
const fail=(status:number,message:string):never=>{const error=Error(message) as Error&{status:number};error.status=status;throw error;};
const migration='Apply supabase/0088_chess_math_attack.sql in the Supabase SQL Editor to enable Quiz ATTACK.';
const missing=(error:{code?:string;message:string})=>['42P01','PGRST202','PGRST205'].includes(error.code||'')||/schema cache|cb_chess_math_attack/i.test(error.message);
const questionIds=chessMathBank.map(question=>question.id);
const nextQuestion=(used:string[])=>{
 const seen=new Set(used);
 const available=questionIds.filter(id=>!seen.has(id));
 const pool=available.length?available:questionIds;
 return {id:pool[randomInt(pool.length)],used:available.length?used:[]};
};
const view=(row:Attempt)=>{
 const question=chessMathById.get(row.current_question_id);
 if(!question)fail(500,'Quiz ATTACK question is unavailable.');
 return {id:row.id,correct:row.correct,mistakes:row.mistakes,question_number:row.question_number,started_at:row.started_at,
  elapsed_ms:row.finished_at?row.elapsed_ms:Math.max(0,Date.now()-Date.parse(row.started_at)),
  question:row.finished_at?null:questionView(question!,row.id,row.question_number-1)};
};

export default async function handler(req:Req,res:Res){
 res.setHeader('Cache-Control','no-store');
 try{
  if(req.method!=='POST')fail(405,'Method not allowed.');
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.VITE_SUPABASE_URL||process.env.SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)fail(503,'Quiz ATTACK server is not configured.');
  const db=createClient(url!,key!,{auth:{persistSession:false,autoRefreshToken:false}});
  const raw=req.headers.authorization,token=(Array.isArray(raw)?raw[0]:raw||'').replace(/^Bearer\s+/i,'');
  if(!token)fail(401,'Sign in to play Quiz ATTACK.');
  const auth=await db.auth.getUser(token);
  if(auth.error||!auth.data.user)fail(401,'Sign in again to play Quiz ATTACK.');
  const userId=auth.data.user!.id,body=req.body||{},action=String(body.action||'');
  const profile=await db.from('cb_profiles').select('avatar_url,agreement_version,display_name').eq('user_id',userId).maybeSingle();
  if(profile.error||!profile.data)fail(403,'Complete your Chess Burger profile first.');
  if(!String(profile.data!.avatar_url||'').includes(`/storage/v1/object/public/cb-profile-media/${userId}/avatar-`))fail(403,'Save a profile picture first.');
  if(profile.data!.agreement_version===null)fail(403,'Accept the End User Agreement first.');
  const active=async()=>{
   const result=await db.from('cb_chess_math_attack').select('*').eq('user_id',userId).is('finished_at',null).maybeSingle();
   if(result.error)fail(missing(result.error)?503:500,missing(result.error)?migration:result.error.message);
   return result.data as Attempt|null;
  };
  const leaders=async()=>{
   const result=await db.rpc('cb_chess_math_attack_leaders');
   if(result.error)fail(missing(result.error)?503:500,missing(result.error)?migration:result.error.message);
   return result.data;
  };
  if(action==='state'){
   const [attempt,rankings]=await Promise.all([active(),leaders()]);
   return res.status(200).json({active:attempt?view(attempt):null,leaders:rankings});
  }
  if(action==='start'){
   let attempt=await active();
   if(attempt)return res.status(200).json({attempt:view(attempt),resumed:true});
   const id=randomUUID(),selected=nextQuestion([]);
   const created=await db.from('cb_chess_math_attack').insert({id,user_id:userId,current_question_id:selected.id,used_question_ids:[selected.id]})
    .select('*').single();
   if(created.error){
    if(created.error.code==='23505'){attempt=await active();if(attempt)return res.status(200).json({attempt:view(attempt),resumed:true});}
    fail(missing(created.error)?503:500,missing(created.error)?migration:created.error.message);
   }
   return res.status(200).json({attempt:view(created.data as Attempt),resumed:false});
  }
  if(action==='answer'){
   const index=Number(body.question_number),answer=String(body.answer||'').trim();
   if(!Number.isSafeInteger(index)||index<1||answer.length>24||!/^[^\s]+$/.test(answer))fail(400,'Submit one word or number for the current question.');
   const attempt=await active();
   if(!attempt)fail(409,'This attempt has ended. Refresh Quiz ATTACK.');
   const row=attempt!;
   if(index!==row.question_number)fail(409,'This question was already answered. Refresh Quiz ATTACK.');
   const question=chessMathById.get(row.current_question_id);
   if(!question)fail(500,'Quiz ATTACK question is unavailable.');
   const correct=answer.toLowerCase()===question!.answer.toLowerCase();
   const mistakes=row.mistakes+(correct?0:1),score=row.correct+(correct?1:0);
   const finished=mistakes>=3,selected=finished?null:nextQuestion(row.used_question_ids);
   const now=new Date(),elapsed=Math.max(0,now.getTime()-Date.parse(row.started_at));
   const update=await db.from('cb_chess_math_attack').update({
    correct:score,mistakes,question_number:index+1,
    current_question_id:selected?.id||row.current_question_id,
    used_question_ids:selected?[...selected.used,selected.id]:row.used_question_ids,
    ...(finished?{finished_at:now.toISOString(),elapsed_ms:elapsed}:{})
   }).eq('id',row.id).eq('user_id',userId).eq('question_number',index).is('finished_at',null).select('*').maybeSingle();
   if(update.error)fail(missing(update.error)?503:500,missing(update.error)?migration:update.error.message);
   if(!update.data)fail(409,'This question was already answered. Refresh Quiz ATTACK.');
   if(finished){
    const event=await db.from('cb_feed').upsert({id:row.id,user_id:userId,kind:'chess_math',display_name:profile.data!.display_name||'Player',content:`completed Quiz ATTACK with ${score} correct answers in ${Math.round(elapsed/1000)} seconds.`},{onConflict:'id',ignoreDuplicates:true});
    if(event.error)console.error('[chess-math-attack] Feed activity unavailable:',event.error);
   }
   return res.status(200).json({correct,attempt:view(update.data as Attempt),...(finished?{leaders:await leaders()}:{})});
  }
  fail(404,'Unknown Quiz ATTACK action.');
 }catch(error){
  const issue=error as Error&{status?:number};
  console.error('[chess-math-attack] Request failed:',issue);
  return res.status(issue.status||500).json({error:issue.status?issue.message:'Quiz ATTACK request failed. Please try again.'});
 }
}
