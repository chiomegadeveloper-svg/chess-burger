import { createClient } from '@supabase/supabase-js';

type Req={method?:string;body?:unknown;query?:Record<string,string|string[]|undefined>;headers:Record<string,string|string[]|undefined>};
type Res={status:(code:number)=>Res;json:(value:unknown)=>void;setHeader:(name:string,value:string)=>void};
const uuid=(value:unknown)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value??''));
const first=(value:string|string[]|undefined)=>Array.isArray(value)?value[0]:value;
const fail=(status:number,message:string)=>Object.assign(new Error(message),{status});
const message=(error:unknown)=>error instanceof Error?error.message:String(error);
const regionalSlugs=['tacloban','leyte','samar','biliran','s-leyte','e-samar','n-samar','cebu','davao','manila','ormoc','tambay'];
function guildArtwork<T extends {id:string;is_default?:boolean;logo_url:string;cover_url?:string}>(row:T):T{
 const region=regionalSlugs.findIndex((_,index)=>row.id===`7dcb0000-0000-4000-8000-${(index+1).toString(16).padStart(12,'0')}`);
 if(region<0)return row;
 const slug=regionalSlugs[region];
 return {...row,logo_url:`/guild/default-${slug}-logo.webp`,...(row.cover_url!==undefined?{cover_url:`/guild/default-${slug}-cover.webp`}:{})};
}

// Validate actual stored bytes instead of trusting a client-supplied URL or MIME type.
function webpSize(bytes:Uint8Array){
 const tag=(at:number)=>String.fromCharCode(...bytes.slice(at,at+4));
 if(bytes.length<30||tag(0)!=='RIFF'||tag(8)!=='WEBP')throw fail(400,'Upload a WebP image.');
 if(tag(12)==='VP8X')return {width:1+(bytes[24]|bytes[25]<<8|bytes[26]<<16),height:1+(bytes[27]|bytes[28]<<8|bytes[29]<<16)};
 if(tag(12)==='VP8L')return {width:1+(((bytes[22]&63)<<8)|bytes[21]),height:1+(((bytes[24]&15)<<10)|(bytes[23]<<2)|((bytes[22]&192)>>6))};
 if(tag(12)==='VP8 '&&bytes.length>=30)return {width:(bytes[26]|bytes[27]<<8)&0x3fff,height:(bytes[28]|bytes[29]<<8)&0x3fff};
 throw fail(400,'Invalid WebP image.');
}

export default async function handler(req:Req,res:Res){
 res.setHeader('Cache-Control','no-store');
 if(!['GET','POST'].includes(req.method??''))return res.status(405).json({error:'Method not allowed.'});
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL??process.env.VITE_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)return res.status(503).json({error:'Guild service is not configured.'});
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const token=first(req.headers.authorization)?.replace(/^Bearer\s+/i,'');
 if(!token)return res.status(401).json({error:'Sign in first.'});
 try{
  const auth=await db.auth.getUser(token);
  if(auth.error||!auth.data.user)throw fail(401,'Your session expired. Sign in again.');
  const userId=auth.data.user.id;
  const body=(req.body&&typeof req.body==='object'?req.body:{}) as Record<string,unknown>;
  if(JSON.stringify(body).length>3000)throw fail(413,'Guild request is too large.');
  if(req.method==='POST'){
   const action=String(body.action??'');
   const params:Record<string,unknown>={p_user_id:userId};
   let rpc='';
   if(action==='create'){rpc='cb_guild_create';params.p_name=String(body.name??'').trim();}
   else if(action==='rename'){rpc='cb_guild_rename';params.p_name=String(body.name??'').trim();}
   else if(action==='join'){if(!uuid(body.guild_id))throw fail(400,'Choose a guild.');rpc='cb_guild_join';params.p_guild_id=body.guild_id;}
   else if(action==='cancel_request'){if(!uuid(body.request_id))throw fail(400,'Choose a request.');rpc='cb_guild_cancel_request';params.p_request_id=body.request_id;}
   else if(action==='review_request'){if(!uuid(body.request_id)||typeof body.approve!=='boolean')throw fail(400,'Choose a request and decision.');rpc='cb_guild_review_request';params.p_request_id=body.request_id;params.p_approve=body.approve;}
   else if(action==='leave')rpc='cb_guild_leave';
   else if(action==='kick'){if(!uuid(body.member_id))throw fail(400,'Choose a member.');rpc='cb_guild_kick';params.p_member_id=body.member_id;params.p_reason=String(body.reason??'').trim();}
   else if(action==='vote'){if(!uuid(body.candidate_id))throw fail(400,'Choose a member.');rpc='cb_guild_vote';params.p_candidate=body.candidate_id;}
   else if(action==='schedule'){rpc='cb_guild_schedule';params.p_release_at=body.release_at===null?null:String(body.release_at??'');if(params.p_release_at!==null&&!Number.isFinite(Date.parse(String(params.p_release_at))))throw fail(400,'Choose a valid release date.');}
   else if(action==='artwork'){
    const kind=String(body.kind),guildId=String(body.guild_id),path=String(body.path??'');
    if(!['logo','cover'].includes(kind)||!uuid(guildId)||!new RegExp(`^${userId}/guild-${guildId}-${kind}-[0-9a-f-]{36}\\.webp$`,'i').test(path))throw fail(400,'Invalid guild image.');
    const guild=await db.from('cb_guilds').select('id,creator_id,leader_id').eq('id',guildId).single();
    if(regionalSlugs.some((_,index)=>guildId===`7dcb0000-0000-4000-8000-${(index+1).toString(16).padStart(12,'0')}`))throw fail(403,'Default guild logos and covers are permanent.');
    if(guild.error||![guild.data.creator_id,guild.data.leader_id].includes(userId))throw fail(403,'Only the guild creator or leader can edit images.');
    const membership=await db.from('cb_guild_members').select('user_id').eq('guild_id',guildId).eq('user_id',userId).maybeSingle();
    if(membership.error||!membership.data)throw fail(403,'You must still belong to this guild to edit its images.');
    const file=await db.storage.from('cb-profile-media').download(path);
    if(file.error||!file.data)throw fail(400,'Upload the image before saving it.');
    const bytes=new Uint8Array(await file.data.arrayBuffer());
    if(bytes.length>=500_000&&kind==='logo')throw fail(400,'The logo must be smaller than 500 KB.');
    if(bytes.length>=1_000_000&&kind==='cover')throw fail(400,'The cover must be smaller than 1 MB.');
    const size=webpSize(bytes);
    if(kind==='logo'&&size.width!==size.height)throw fail(400,'The guild logo must have a square crop.');
    const publicUrl=db.storage.from('cb-profile-media').getPublicUrl(path).data.publicUrl;
    const updated=await db.from('cb_guilds').update({[kind+'_url']:publicUrl}).eq('id',guildId);
    if(updated.error)throw updated.error;
    return res.status(200).json({ok:true,url:publicUrl});
   }else throw fail(400,'Unknown guild action.');
   const result=await db.rpc(rpc,params);
   if(result.error)throw fail(/schema cache|function .* does not exist|relation .* does not exist/i.test(result.error.message)?503:409,result.error.message);
   return res.status(200).json({ok:true,result:result.data});
  }
  const page=Math.min(100000,Math.max(1,Number(first(req.query?.page))||1));
  const selected=first(req.query?.guild_id);
  if(selected&&!uuid(selected))throw fail(400,'Invalid guild.');
  const [released,me,profile,kickNotice]=await Promise.all([
   db.rpc('cb_guild_distribute_due'),
   db.from('cb_guild_members').select('guild_id,leader_vote').eq('user_id',userId).maybeSingle(),
   db.from('cb_profiles').select('cbr').eq('user_id',userId).single(),
   db.from('cb_guild_kicks').select('guild_id,reason,created_at,cb_guilds(name)').eq('member_id',userId).order('created_at',{ascending:false}).limit(1).maybeSingle()
  ]);
  if(released.error)throw fail(503,'Guild database is not ready. Apply supabase/0047_guilds.sql.');
  if(me.error)throw me.error;
  if(profile.error)throw profile.error;
  if(kickNotice.error&&!/cb_guild_kicks|schema cache|does not exist/i.test(kickNotice.error.message))throw kickNotice.error;
  const search=String(first(req.query?.search)??'').trim();
  if(search.length>40||/[^\p{L}\p{N} .-]/u.test(search))throw fail(400,'Use letters, numbers or spaces to search guilds.');
  const code=String(first(req.query?.code)??'').trim().toUpperCase();
  if(code&&!/^CB-[0-9A-F]{8}$/.test(code))throw fail(400,'Enter a valid guild code (CB- plus 8 characters).');
  let listQuery=db.from('cb_guild_directory').select('id,name,logo_url,guild_points,created_at',{count:'exact'});
  if(search&&!me.data?.guild_id)listQuery=listQuery.ilike('name',`%${search}%`);
  const [guilds,lookup,myRequest,regions]=await Promise.all([
   listQuery.order('guild_points',{ascending:false}).order('created_at',{ascending:true}).range((page-1)*10,page*10-1),
   code?db.from('cb_guilds').select('id').eq('guild_code',code).maybeSingle():Promise.resolve(null),
   db.from('cb_guild_join_requests').select('id,guild_id,created_at').eq('user_id',userId).eq('status','pending').limit(1).maybeSingle(),
   db.from('cb_guilds').select('id,name,logo_url,is_default').eq('is_default',true).order('name')
  ]);
  if(guilds.error)throw guilds.error;
  if(regions.error&&!/is_default|schema cache|does not exist/i.test(regions.error.message))throw regions.error;
  if(lookup?.error)throw lookup.error;
  const detailId=code?lookup?.data?.id:selected||me.data?.guild_id;
  const detailRow=detailId?await db.from('cb_guild_directory').select('*').eq('id',detailId).maybeSingle():null;
  if(detailRow?.error)throw detailRow.error;
  const guild=detailRow?.data?guildArtwork(detailRow.data):null;
  const isMember=!!guild&&me.data?.guild_id===guild.id;
  const isLeader=isMember&&guild.leader_id===userId;
  if(myRequest.error&&!/cb_guild_join_requests|schema cache|does not exist/i.test(myRequest.error.message))throw myRequest.error;
  let requests:unknown[]=[],activity:unknown[]=[],members:unknown[]=[],analytics:unknown=null;
  if(guild&&isMember){
   const [memberRows,history,pending,metrics]=await Promise.all([
    db.from('cb_guild_members').select('guild_id,user_id,joined_at,leader_vote').eq('guild_id',guild.id),
    db.from('cb_guild_activity').select('id,actor_id,kind,detail,amount,created_at').eq('guild_id',guild.id).order('id',{ascending:false}).limit(21),
    isLeader?db.from('cb_guild_join_requests').select('id,user_id,created_at').eq('guild_id',guild.id).eq('status','pending').order('created_at',{ascending:true}).limit(18):Promise.resolve(null),
    db.rpc('cb_guild_analytics',{p_user_id:userId,p_guild_id:guild.id})
   ]);
   if(memberRows.error)throw memberRows.error;
   if(history.error&&!/cb_guild_activity|schema cache|does not exist/i.test(history.error.message))throw history.error;
   if(pending?.error&&!/cb_guild_join_requests|schema cache|does not exist/i.test(pending.error.message))throw pending.error;
   if(metrics.error&&!/cb_guild_analytics|schema cache|does not exist/i.test(metrics.error.message))throw metrics.error;
   analytics=metrics.data??null;
   const userIds=(memberRows.data??[]).map(row=>row.user_id);
   const actors=[...new Set((history.data??[]).map(row=>row.actor_id).filter(Boolean))];
   const applicantIds=(pending?.data??[]).map(row=>row.user_id);
   const [players,actorProfiles,applicants]=await Promise.all([
    userIds.length?db.from('cb_profiles').select('user_id,username,display_name,avatar_url,cbr').in('user_id',userIds):Promise.resolve({data:[],error:null}),
    actors.length?db.from('cb_profiles').select('user_id,display_name,username').in('user_id',actors):Promise.resolve({data:[],error:null}),
    applicantIds.length?db.from('cb_profiles').select('user_id,username,display_name,avatar_url,cbr').in('user_id',applicantIds):Promise.resolve({data:[],error:null})
   ]);
   if(players.error)throw players.error;
   if(actorProfiles.error)throw actorProfiles.error;
   if(applicants.error)throw applicants.error;
   const byId=new Map((players.data??[]).map(row=>[row.user_id,row]));
   members=(memberRows.data??[]).map(row=>({...row,profile:byId.get(row.user_id)}));
   const actorNames=new Map((actorProfiles.data??[]).map(row=>[row.user_id,row.display_name||row.username]));
   if((history.data??[]).length>20){const oldestKept=history.data![19].id;const removed=await db.from('cb_guild_activity').delete().eq('guild_id',guild.id).lt('id',oldestKept);if(removed.error)throw removed.error;}
   activity=(history.data??[]).slice(0,20).map(row=>({...row,actor_name:actorNames.get(row.actor_id)||'Player'}));
   if(isLeader){
    const byUser=new Map((applicants.data??[]).map(row=>[row.user_id,row]));
    requests=(pending?.data??[]).map(row=>({...row,profile:byUser.get(row.user_id)}));
   }
  }
  const detail=guild?isMember?{...guild,members}:{id:guild.id,name:guild.name,logo_url:guild.logo_url,cover_url:guild.cover_url,guild_points:guild.guild_points,member_count:guild.member_count,guild_code:guild.guild_code,is_default:guild.is_default,leader_id:guild.leader_id}:null;
  return res.status(200).json({page,total:guilds.count??0,eligible:Number(profile.data.cbr)>=177,my_guild_id:me.data?.guild_id??null,my_request:myRequest.data??null,requests,activity,analytics,kick_notice:kickNotice.data??null,regional_guilds:(regions.data??[]).map(guildArtwork),guilds:(guilds.data??[]).map(row=>{const art=guildArtwork(row);return {id:art.id,name:art.name,logo_url:art.logo_url,guild_points:art.guild_points}}),detail});
 }catch(error){const status=Number((error as {status?:number}).status)||500;if(status===500)console.error('Guild request failed',error);return res.status(status).json({error:status===500?'Guild request failed. Please retry.':message(error)});}
}
