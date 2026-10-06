/* eslint-disable @typescript-eslint/no-explicit-any */
import {createClient} from '@supabase/supabase-js';

type Req={method?:string;query?:Record<string,string|string[]|undefined>;body?:unknown;headers:Record<string,string|string[]|undefined>};
type Res={status:(code:number)=>Res;json:(body:unknown)=>void;setHeader:(name:string,value:string)=>void};
type Db=any;
class ArenaError extends Error{constructor(message:string,public status=409){super(message);}}
const fail=(status:number,message:string):never=>{throw new ArenaError(message,status);};
const db=():Db=>{const url=process.env.NEXT_PUBLIC_SUPABASE_URL??process.env.VITE_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY??'';if(!url||!key)return fail(503,'Arena database configuration is unavailable.');return createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});};
async function account(client:Db,req:Req){const h=req.headers.authorization,t=(Array.isArray(h)?h[0]:h??'').replace(/^Bearer\s+/i,'');if(!t)fail(401,'Please sign in again.');const a=await client.auth.getUser(t);if(a.error||!a.data.user)fail(401,'Please sign in again.');const p=await client.from('cb_profiles').select('*').eq('user_id',a.data.user.id).single();if(p.error)fail(500,p.error.message);if(p.data.agreement_version===null)fail(403,'Review and accept the End User Agreement to continue.');if(!String(p.data.avatar_url??'').includes(`/storage/v1/object/public/cb-profile-media/${a.data.user.id}/avatar-`))fail(403,'Complete registration and save a profile picture to unlock Chess Burger.');return{id:a.data.user.id,profile:p.data};}
type ArenaSlotSetting={start:string;end:string};
type ArenaSettings={losses_to_eliminate:number;upcoming_weekly_limit:number;session_slots:ArenaSlotSetting[];entry_closes_minutes:number;prize_mode:'fixed'|'auto';fixed_prize_gold:number;auto_prize_percent:number;ticket_value_gold:number;max_pair_gap:number;fallback_wait_seconds:number;match_control:string};
const defaults:ArenaSettings={losses_to_eliminate:3,upcoming_weekly_limit:4,session_slots:[{start:'19:00',end:'21:00'},{start:'22:00',end:'00:00'}],entry_closes_minutes:10,prize_mode:'fixed',fixed_prize_gold:48,auto_prize_percent:10,ticket_value_gold:28,max_pair_gap:2,fallback_wait_seconds:180,match_control:'5+0'};
const arenaControls:Record<string,{seconds:number}>={'1+0':{seconds:60},'1+1':{seconds:60},'2+1':{seconds:120},'3+0':{seconds:180},'3+2':{seconds:180},'5+0':{seconds:300},'10+0':{seconds:600},'10+5':{seconds:600},'15+10':{seconds:900}};
async function settings(client:Db):Promise<ArenaSettings>{const result=await client.from('cb_arena_settings').select('*').eq('id',true).maybeSingle();if(result.error)return defaults;const row=result.data??{};return{...defaults,...row,session_slots:Array.isArray(row.session_slots)&&row.session_slots.length?row.session_slots:defaults.session_slots};}
type ScheduledBattle={id:string;session_date:string;slot:number;starts_at:string;ends_at:string;title:string;loss_limit:number;owner_scheduled:boolean};
export function arenaWindow(at=Date.now(),config:ArenaSettings=defaults,battles:ScheduledBattle[]=[]){
  const sessions=battles.filter(row=>row.owner_scheduled).map(row=>({...row,date:row.session_date})).sort((a,b)=>Date.parse(a.starts_at)-Date.parse(b.starts_at));
  const current=sessions.find(row=>at>=Date.parse(row.starts_at)&&at<Date.parse(row.ends_at))??null;
  const upcoming=sessions.filter(row=>at<Date.parse(row.starts_at)).slice(0,config.upcoming_weekly_limit??4);
  return{open:!!current,current,next:upcoming[0]??null,upcoming,entry_open:!!current&&at<Date.parse(current.ends_at)-config.entry_closes_minutes*60000,server_now:new Date(at).toISOString(),settings:config};
}
const migrationMessage='Run supabase/0101_arena_owner_created_battles.sql in Supabase to activate owner-created Arena battles.';
async function scheduledWindow(client:Db){
  const config=await settings(client);
  const result=await client.from('cb_arena_sessions').select('*').eq('owner_scheduled',true).gt('ends_at',new Date().toISOString()).order('starts_at',{ascending:true});
  if(result.error)fail(503,migrationMessage);
  return arenaWindow(Date.now(),config,result.data??[]);
}
async function sessionRosters(client:Db,sessions:ScheduledBattle[],userId?:string){
  const ids=sessions.map(row=>row.id);
  const entries=ids.length?await client.from('cb_arena_entries').select('session_id,user_id,status,joined_at').in('session_id',ids).order('joined_at',{ascending:true}):{data:[],error:null};
  if(entries.error)fail(500,entries.error.message);
  const people=await players(client,(entries.data??[]).map((row:any)=>row.user_id));
  return sessions.map(slot=>{const registered=(entries.data??[]).filter((row:any)=>row.session_id===slot.id);return{...slot,date:slot.session_date,registered:registered.some((row:any)=>row.user_id===userId),players:registered.map((row:any)=>({user_id:row.user_id,status:row.status,player:people.get(row.user_id)?{display_name:people.get(row.user_id).display_name,username:people.get(row.user_id).username,avatar_url:people.get(row.user_id).avatar_url}:null}))};});
}
async function ownerState(client:Db){const config=await settings(client),sessions=await client.from('cb_arena_sessions').select('*').eq('owner_scheduled',true).gt('ends_at',new Date().toISOString()).order('starts_at',{ascending:true});if(sessions.error)fail(503,migrationMessage);return{settings:config,sessions:await sessionRosters(client,sessions.data??[])};}
async function players(client:Db,ids:string[]):Promise<Map<string,any>>{const unique=[...new Set(ids.filter(Boolean))];if(!unique.length)return new Map();const r=await client.from('cb_profiles').select('user_id,username,display_name,avatar_url,cbr').in('user_id',unique);if(r.error)fail(500,r.error.message);return new Map((r.data??[]).map((p:any)=>[p.user_id,p]));}
async function pair(client:Db,session:any,userId:string){
  const mine=await client.from('cb_arena_entries').select('*').eq('session_id',session?.id??'00000000-0000-0000-0000-000000000000').eq('user_id',userId).single();if(mine.error||mine.data.status!=='waiting')return null;
  const config=await settings(client),waiting=await client.from('cb_arena_entries').select('*').eq('session_id',session?.id??'00000000-0000-0000-0000-000000000000').eq('status','waiting').neq('user_id',userId).limit(50);if(waiting.error||!waiting.data?.length)return null;
  const nearest=[...waiting.data].sort((a:any,b:any)=>Math.abs(Number(a.arena_points)-Number(mine.data.arena_points))-Math.abs(Number(b.arena_points)-Number(mine.data.arena_points))||Date.parse(a.seen_at)-Date.parse(b.seen_at))[0],gap=Math.abs(Number(nearest.arena_points)-Number(mine.data.arena_points)),waited=(Date.now()-Date.parse(mine.data.seen_at))/1000;
  if(gap>config.max_pair_gap&&waited<config.fallback_wait_seconds){const active=await client.from('cb_arena_entries').select('id',{count:'exact',head:true}).eq('session_id',session?.id??'00000000-0000-0000-0000-000000000000').eq('status','playing');if((active.count??0)>0)return null;}
  const ids=[nearest.user_id,userId].sort(),profiles=await players(client,ids),matchId=crypto.randomUUID(),stamp=new Date().toISOString(),control=arenaControls[session.match_control]?session.match_control:config.match_control,clock=(arenaControls[control]??arenaControls['5+0']).seconds*1000;
  const match=await client.from('cb_matches').insert({id:matchId,host_id:ids[0],white_id:ids[0],black_id:ids[1],invite_to:null,code:Math.random().toString(36).slice(2,10).toUpperCase(),control,status:'active',white_ms:clock,black_ms:clock,last_tick:stamp,white_cbr:Number((profiles.get(ids[0]) as any)?.cbr??88),black_cbr:Number((profiles.get(ids[1]) as any)?.cbr??88),play_mode:'arena',wager_gold:0,arena_session_id:session.id,rating_applied:false}).select('*').single();
  if(match.error)return null;
  const claimed=await client.from('cb_arena_entries').update({status:'playing',current_match_id:matchId,seen_at:stamp}).eq('session_id',session?.id??'00000000-0000-0000-0000-000000000000').in('user_id',ids).eq('status','waiting').select('user_id');
  if(claimed.error||(claimed.data??[]).length!==2){await client.from('cb_matches').delete().eq('id',matchId);await client.from('cb_arena_entries').update({status:'waiting',current_match_id:null}).eq('session_id',session?.id??'00000000-0000-0000-0000-000000000000').in('user_id',ids);return null;}
  return match.data;
}
async function state(client:Db,a:any,tryPair=true){
  await client.rpc('cb_finalize_arena_sessions');const window=await scheduledWindow(client),session=window.current??window.next;
  let entry=(await client.from('cb_arena_entries').select('*').eq('session_id',session?.id??'00000000-0000-0000-0000-000000000000').eq('user_id',a.id).maybeSingle()).data??null;
  let match:any=null;if(entry?.current_match_id){match=(await client.from('cb_matches').select('*').eq('id',entry.current_match_id).maybeSingle()).data??null;if(match&&match.status==='cancelled')await client.rpc('cb_resolve_arena_cancelled_match',{p_match_id:match.id});}
  if(tryPair&&window.open&&entry?.status==='waiting'&&!match){match=await pair(client,session,a.id);entry=(await client.from('cb_arena_entries').select('*').eq('session_id',session?.id??'00000000-0000-0000-0000-000000000000').eq('user_id',a.id).maybeSingle()).data??entry;}
  const ranks=await client.from('cb_arena_entries').select('*').eq('session_id',session?.id??'00000000-0000-0000-0000-000000000000').neq('status','registered').order('arena_points',{ascending:false}).order('wins',{ascending:false}).order('joined_at',{ascending:true}).limit(25);if(ranks.error)fail(500,ranks.error.message);
  const [daily,weekly]=await Promise.all([client.from('cb_arena_awards').select('*').eq('period','daily').order('period_start',{ascending:false}).limit(20),client.from('cb_arena_awards').select('*').eq('period','weekly').order('period_start',{ascending:false}).limit(1)]);
  if(daily.error||weekly.error)fail(503,'Run supabase/0064_arena_daily_weekly_sessions.sql in Supabase, then try again.');
  const history=daily.data??[],featured=[...history,...(weekly.data??[])];const people=await players(client,[...(ranks.data??[]).map((r:any)=>r.user_id),...featured.map((r:any)=>r.user_id)]);
  const tickets=await client.from('cb_arena_tickets').select('quantity').eq('user_id',a.id).maybeSingle();if(tickets.error)fail(/cb_arena_tickets|schema cache/i.test(tickets.error.message)?503:500,/cb_arena_tickets|schema cache/i.test(tickets.error.message)?'Run supabase/0027_grand_arena.sql, then try again.':tickets.error.message);
  const showWinner=(r:any)=>r?{...r,player:people.get(r.user_id)}:null;
  return{upcoming:await sessionRosters(client,window.upcoming,a.id),window:{...window,current:window.current?(await sessionRosters(client,[window.current],a.id))[0]:null},session,entry,match,leaderboard:(ranks.data??[]).map((r:any,i:number)=>({...r,rank:i+1,player:people.get(r.user_id)})),tickets:Number(tickets.data?.quantity??0),gold:Number(a.profile.gold_points??0),dailyChampion:showWinner(history[0]),weeklyChampion:showWinner(weekly.data?.[0]),history:history.map(showWinner),server_now:new Date().toISOString()};
}

async function dailyQuest(client:Db,a:any,action:string,body:Record<string,any>){
  const date=new Date(Date.now()+480*60000).toISOString().slice(0,10);
  const config=await client.from('cb_daily_quest_settings').select('*').eq('id',true).single();
  if(config.error)fail(503,'Daily Quest needs the Supabase 0094 migration.');
  if(config.data?.reward_cbg==null||config.data?.reward_cbr==null||config.data?.reward_tickets==null)fail(503,'Daily Quest needs the Supabase 0095 combo rewards migration.');
  if(action==='quest-owner-settings'){
    if(a.profile.role!=='owner')fail(403,'Owner access is required.');
    return {settings:config.data};
  }
  if(action==='quest-save-owner-settings'){
    if(a.profile.role!=='owner')fail(403,'Owner access is required.');
    const cbg=Number(body.cbg),cbr=Number(body.cbr),tickets=Number(body.tickets);
    if(!Number.isInteger(cbg)||cbg<1||cbg>10000||!Number.isInteger(cbr)||cbr<1||cbr>10000||!Number.isInteger(tickets)||tickets<1||tickets>10)fail(400,'Choose 1–10,000 CBG, 1–10,000 CBR, and 1–10 Arena Tickets.');
    const saved=await client.from('cb_daily_quest_settings').update({reward_cbg:cbg,reward_cbr:cbr,reward_tickets:tickets,reward_kind:'cbg',reward_amount:cbg,updated_by:a.id,updated_at:new Date().toISOString()}).eq('id',true).select('*').single();
    if(saved.error)fail(500,saved.error.message);
    return {settings:saved.data};
  }
  // A stable per-player/day selection prevents refreshes from reshuffling tasks.
  const seed=`${a.id}:${date}`;let hash=2166136261;
  for(const letter of seed){hash^=letter.charCodeAt(0);hash=Math.imul(hash,16777619);}
  const unsigned=hash>>>0;
  const targets:Record<string,number>={puzzles:5+unsigned%4,online:2+(unsigned>>>3)%2,cpu:3+(unsigned>>>5)%3,quiz:2};
  const excluded=['puzzles','online','cpu','quiz'][(unsigned>>>8)%4];delete targets[excluded];
  if((unsigned>>>10)%2===0)targets.arena=1; // Bonus task, never blocks a claim.
  let quest=await client.from('cb_daily_quests').select('*').eq('user_id',a.id).eq('quest_day',date).maybeSingle();
  if(quest.error)fail(503,'Daily Quest needs the Supabase 0094 migration.');
  if(!quest.data){
    const inserted=await client.from('cb_daily_quests').upsert({user_id:a.id,quest_day:date,targets,reward_kind:'cbg',reward_amount:config.data.reward_cbg,reward_cbg:config.data.reward_cbg,reward_cbr:config.data.reward_cbr,reward_tickets:config.data.reward_tickets},{onConflict:'user_id,quest_day',ignoreDuplicates:true});
    if(inserted.error)fail(503,inserted.error.message);
    quest=await client.from('cb_daily_quests').select('*').eq('user_id',a.id).eq('quest_day',date).single();
    if(quest.error)fail(500,quest.error.message);
  }
  // Owner edits apply to active, unclaimed quests. Claimed rows are immutable history.
  if(!quest.data.claimed_at&&(quest.data.reward_cbg!==config.data.reward_cbg||quest.data.reward_cbr!==config.data.reward_cbr||quest.data.reward_tickets!==config.data.reward_tickets)){
    const changed=await client.from('cb_daily_quests').update({reward_cbg:config.data.reward_cbg,reward_cbr:config.data.reward_cbr,reward_tickets:config.data.reward_tickets,reward_kind:'cbg',reward_amount:config.data.reward_cbg}).eq('user_id',a.id).eq('quest_day',date).is('claimed_at',null).select('*').maybeSingle();
    if(changed.error)fail(500,changed.error.message);
    if(changed.data)quest={...quest,data:changed.data};
    else {quest=await client.from('cb_daily_quests').select('*').eq('user_id',a.id).eq('quest_day',date).single();if(quest.error)fail(500,quest.error.message);}
  }
  if(action==='quest-claim'){
    const claimed=await client.rpc('cb_claim_daily_quest',{p_user_id:a.id,p_day:date});
    if(claimed.error)fail(409,claimed.error.message);
    quest=await client.from('cb_daily_quests').select('*').eq('user_id',a.id).eq('quest_day',date).single();
    if(quest.error)fail(500,quest.error.message);
  }
  const progress=await client.rpc('cb_daily_quest_progress',{p_user_id:a.id,p_day:date});
  if(progress.error)fail(500,progress.error.message);
  return {quest:quest.data,progress:progress.data,server_now:new Date().toISOString()};
}

export default async function handler(req:Req,res:Res){res.setHeader('Cache-Control','no-store');try{const client=db(),body=(req.body&&typeof req.body==='object'?req.body:{}) as Record<string,any>,action=String(req.method==='GET'?req.query?.action??'window':body.action??'state');if(req.method==='GET'){const window=await scheduledWindow(client);return res.status(200).json({...window,upcoming:await sessionRosters(client,window.upcoming),current:window.current?(await sessionRosters(client,[window.current]))[0]:null});}const a=await account(client,req);if(action.startsWith('quest-'))return res.status(200).json(await dailyQuest(client,a,action,body));if(action==='owner-settings'){if(a.profile.role!=='owner')fail(403,'Owner access is required.');return res.status(200).json(await ownerState(client));}if(action==='save-owner-settings'){if(a.profile.role!=='owner')fail(403,'Owner access is required.');const input=body.settings??{},saved=await client.rpc('cb_save_arena_controls',{p_owner_id:a.id,p_loss_limit:Number(input.losses_to_eliminate),p_weekly_limit:Number(input.upcoming_weekly_limit),p_prize_mode:input.prize_mode,p_fixed_prize:Number(input.fixed_prize_gold),p_match_control:input.match_control});if(saved.error)fail(saved.error.code==='PGRST202'?503:409,saved.error.code==='PGRST202'?migrationMessage:saved.error.message);return res.status(200).json(await ownerState(client));}if(action==='save-owner-session'){if(a.profile.role!=='owner')fail(403,'Owner access is required.');const saved=await client.rpc('cb_save_arena_session',{p_owner_id:a.id,p_session_id:body.id??null,p_title:String(body.title??''),p_starts_at:body.starts_at,p_ends_at:body.ends_at,p_loss_limit:Number(body.loss_limit)});if(saved.error)fail(saved.error.code==='PGRST202'?503:409,saved.error.code==='PGRST202'?migrationMessage:saved.error.message);return res.status(200).json(await ownerState(client));}if(action==='state')return res.status(200).json(await state(client,a,body.pair!==false));if(action==='buy'){await scheduledWindow(client);const quantity=Number(body.quantity),requestId=String(body.request_id??'');if(![1,3,5].includes(quantity)||!/^[a-f0-9-]{36}$/i.test(requestId))fail(400,'Choose a valid Arena Ticket package.');const bought=await client.rpc('cb_buy_arena_tickets',{p_user_id:a.id,p_quantity:quantity,p_request_id:requestId});if(bought.error)fail(409,bought.error.message);return res.status(200).json(await state(client,{...a,profile:{...a.profile,gold_points:bought.data?.gold}},false));}if(action==='register'){const window=await scheduledWindow(client),target=window.upcoming.find(slot=>slot.id===body.session_id);if(!target)return fail(409,'Choose an available owner-created Arena battle.');const registered=await client.rpc('cb_register_grand_arena',{p_user_id:a.id,p_session_id:target.id});if(registered.error)fail(registered.error.code==='PGRST202'?503:409,registered.error.code==='PGRST202'?migrationMessage:registered.error.message);return res.status(200).json(await state(client,a,false));}if(action==='enter'){const window=await scheduledWindow(client);if(!window.current||!window.entry_open)return fail(409,'Arena entry is currently closed.');const session=window.current,entered=await client.rpc('cb_enter_grand_arena',{p_user_id:a.id,p_session_id:session.id});if(entered.error)fail(409,entered.error.message);return res.status(200).json(await state(client,a));}fail(404,'Unknown Arena request.');}catch(error){const e=error as ArenaError;return res.status(e.status??500).json({error:e.message||'Grand Arena is temporarily unavailable.'});}}

