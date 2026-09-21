/* eslint-disable @typescript-eslint/no-explicit-any */
import {createClient} from '@supabase/supabase-js';

type Req={method?:string;query?:Record<string,string|string[]|undefined>;body?:unknown;headers:Record<string,string|string[]|undefined>};
type Res={status:(code:number)=>Res;json:(body:unknown)=>void;setHeader:(name:string,value:string)=>void};
type Db=any;
class ArenaError extends Error{constructor(message:string,public status=409){super(message);}}
const fail=(status:number,message:string):never=>{throw new ArenaError(message,status);};
const db=():Db=>{const url=process.env.NEXT_PUBLIC_SUPABASE_URL??process.env.VITE_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY??'';if(!url||!key)fail(503,'Arena database configuration is unavailable.');return createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});};
async function account(client:Db,req:Req){const h=req.headers.authorization,t=(Array.isArray(h)?h[0]:h??'').replace(/^Bearer\s+/i,'');if(!t)fail(401,'Please sign in again.');const a=await client.auth.getUser(t);if(a.error||!a.data.user)fail(401,'Please sign in again.');const p=await client.from('cb_profiles').select('*').eq('user_id',a.data.user.id).single();if(p.error)fail(500,p.error.message);return{id:a.data.user.id,profile:p.data};}

export function arenaWindow(at=Date.now()){
  const manila=new Date(at+8*60*60*1000),year=manila.getUTCFullYear(),month=manila.getUTCMonth(),day=manila.getUTCDate(),minutes=manila.getUTCHours()*60+manila.getUTCMinutes();
  const date=`${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  const session=(slot:1|2)=>{const starts=slot===1?Date.UTC(year,month,day,11):Date.UTC(year,month,day,14),ends=slot===1?Date.UTC(year,month,day,13):Date.UTC(year,month,day,16);return{date,slot,starts_at:new Date(starts).toISOString(),ends_at:new Date(ends).toISOString()};};
  const current=minutes>=1140&&minutes<1260?session(1):minutes>=1320?session(2):null;
  const next=minutes<1140?session(1):minutes<1320?session(2):(()=>{const tomorrow=new Date(Date.UTC(year,month,day+1));const y=tomorrow.getUTCFullYear(),m=tomorrow.getUTCMonth(),d=tomorrow.getUTCDate();return{date:`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`,slot:1 as const,starts_at:new Date(Date.UTC(y,m,d,11)).toISOString(),ends_at:new Date(Date.UTC(y,m,d,13)).toISOString()};})();
  return{open:!!current,current,next,entry_open:!!current&&at<Date.parse(current.ends_at)-10*60*1000,server_now:new Date(at).toISOString()};
}
async function ensureSession(client:Db,window:ReturnType<typeof arenaWindow>){const target=window.current??window.next;const saved=await client.from('cb_arena_sessions').upsert({session_date:target.date,slot:target.slot,starts_at:target.starts_at,ends_at:target.ends_at},{onConflict:'session_date,slot'}).select('*').single();if(saved.error)fail(/cb_arena_sessions|schema cache/i.test(saved.error.message)?503:500,/cb_arena_sessions|schema cache/i.test(saved.error.message)?'Run supabase/0027_grand_arena.sql, then try again.':saved.error.message);return saved.data;}
async function players(client:Db,ids:string[]){const unique=[...new Set(ids.filter(Boolean))];if(!unique.length)return new Map();const r=await client.from('cb_profiles').select('user_id,username,display_name,avatar_url,cbr').in('user_id',unique);if(r.error)fail(500,r.error.message);return new Map((r.data??[]).map((p:any)=>[p.user_id,p]));}
async function pair(client:Db,session:any,userId:string){
  const mine=await client.from('cb_arena_entries').select('*').eq('session_id',session.id).eq('user_id',userId).single();if(mine.error||mine.data.status!=='waiting')return null;
  const waiting=await client.from('cb_arena_entries').select('*').eq('session_id',session.id).eq('status','waiting').neq('user_id',userId).order('seen_at',{ascending:true}).limit(1).maybeSingle();if(waiting.error||!waiting.data)return null;
  const ids=[waiting.data.user_id,userId].sort(),profiles=await players(client,ids),matchId=crypto.randomUUID(),stamp=new Date().toISOString();
  const match=await client.from('cb_matches').insert({id:matchId,host_id:ids[0],white_id:ids[0],black_id:ids[1],invite_to:null,code:Math.random().toString(36).slice(2,10).toUpperCase(),control:'5+0',status:'active',white_ms:300000,black_ms:300000,last_tick:stamp,white_cbr:Number((profiles.get(ids[0]) as any)?.cbr??88),black_cbr:Number((profiles.get(ids[1]) as any)?.cbr??88),play_mode:'arena',wager_gold:0,arena_session_id:session.id,rating_applied:false}).select('*').single();
  if(match.error)return null;
  const claimed=await client.from('cb_arena_entries').update({status:'playing',current_match_id:matchId,seen_at:stamp}).eq('session_id',session.id).in('user_id',ids).eq('status','waiting').select('user_id');
  if(claimed.error||(claimed.data??[]).length!==2){await client.from('cb_matches').delete().eq('id',matchId);await client.from('cb_arena_entries').update({status:'waiting',current_match_id:null}).eq('session_id',session.id).in('user_id',ids);return null;}
  return match.data;
}
async function state(client:Db,a:any,tryPair=true){
  await client.rpc('cb_finalize_arena_sessions');const window=arenaWindow(),session=await ensureSession(client,window);
  let entry=(await client.from('cb_arena_entries').select('*').eq('session_id',session.id).eq('user_id',a.id).maybeSingle()).data??null;
  let match:any=null;if(entry?.current_match_id){match=(await client.from('cb_matches').select('*').eq('id',entry.current_match_id).maybeSingle()).data??null;if(match&&match.status==='cancelled')await client.rpc('cb_resolve_arena_cancelled_match',{p_match_id:match.id});}
  if(tryPair&&window.open&&entry?.status==='waiting'&&!match){match=await pair(client,session,a.id);entry=(await client.from('cb_arena_entries').select('*').eq('session_id',session.id).eq('user_id',a.id).maybeSingle()).data??entry;}
  const ranks=await client.from('cb_arena_entries').select('*').eq('session_id',session.id).order('wins',{ascending:false}).order('arena_cbr_gain',{ascending:false}).order('joined_at',{ascending:true}).limit(25);if(ranks.error)fail(500,ranks.error.message);
  const history=await client.from('cb_arena_sessions').select('id,session_date,slot,ends_at,champion_id').not('champion_id','is',null).order('ends_at',{ascending:false}).limit(10);if(history.error)fail(500,history.error.message);
  const featured:any[]=[];for(const slot of [1,2]){const winner=(history.data??[]).find((row:any)=>Number(row.slot)===slot);if(winner)featured.push(winner);}const people=await players(client,[...(ranks.data??[]).map((r:any)=>r.user_id),...featured.map(r=>r.champion_id)]);
  const tickets=await client.from('cb_arena_tickets').select('quantity').eq('user_id',a.id).maybeSingle();if(tickets.error)fail(/cb_arena_tickets|schema cache/i.test(tickets.error.message)?503:500,/cb_arena_tickets|schema cache/i.test(tickets.error.message)?'Run supabase/0027_grand_arena.sql, then try again.':tickets.error.message);
  return{window,session,entry,match,leaderboard:(ranks.data??[]).map((r:any,i:number)=>({...r,rank:i+1,player:people.get(r.user_id)})),tickets:Number(tickets.data?.quantity??0),gold:Number(a.profile.gold_points??0),champions:featured.map(r=>({...r,player:people.get(r.champion_id)})),server_now:new Date().toISOString()};
}

export default async function handler(req:Req,res:Res){res.setHeader('Cache-Control','no-store');try{const client=db(),body=(req.body&&typeof req.body==='object'?req.body:{}) as Record<string,any>,action=String(req.method==='GET'?req.query?.action??'window':body.action??'state');if(req.method==='GET')return res.status(200).json(arenaWindow());const a=await account(client,req);if(action==='state')return res.status(200).json(await state(client,a,body.pair!==false));if(action==='buy'){const quantity=Number(body.quantity),requestId=String(body.request_id??'');if(![1,3,5].includes(quantity)||!/^[a-f0-9-]{36}$/i.test(requestId))fail(400,'Choose a valid Arena Ticket package.');const bought=await client.rpc('cb_buy_arena_tickets',{p_user_id:a.id,p_quantity:quantity,p_request_id:requestId});if(bought.error)fail(409,bought.error.message);return res.status(200).json(await state(client,{...a,profile:{...a.profile,gold_points:bought.data?.gold}},false));}if(action==='enter'){const window=arenaWindow();if(!window.current||!window.entry_open)fail(409,'Arena entry is currently closed.');const session=await ensureSession(client,window),entered=await client.rpc('cb_enter_grand_arena',{p_user_id:a.id,p_session_id:session.id});if(entered.error)fail(409,entered.error.message);return res.status(200).json(await state(client,a));}fail(404,'Unknown Arena request.');}catch(error){const e=error as ArenaError;return res.status(e.status??500).json({error:e.message||'Grand Arena is temporarily unavailable.'});}}
