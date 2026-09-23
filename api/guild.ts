import { createClient } from '@supabase/supabase-js';

type Req={method?:string;body?:unknown;query?:Record<string,string|string[]|undefined>;headers:Record<string,string|string[]|undefined>};
type Res={status:(code:number)=>Res;json:(value:unknown)=>void;setHeader:(name:string,value:string)=>void};
const uuid=(value:unknown)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value??''));
const first=(value:string|string[]|undefined)=>Array.isArray(value)?value[0]:value;
const fail=(status:number,message:string)=>Object.assign(new Error(message),{status});
const message=(error:unknown)=>error instanceof Error?error.message:String(error);

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
   else if(action==='join'){if(!uuid(body.guild_id))throw fail(400,'Choose a guild.');rpc='cb_guild_join';params.p_guild_id=body.guild_id;}
   else if(action==='leave')rpc='cb_guild_leave';
   else if(action==='vote'){if(!uuid(body.candidate_id))throw fail(400,'Choose a member.');rpc='cb_guild_vote';params.p_candidate=body.candidate_id;}
   else if(action==='schedule'){rpc='cb_guild_schedule';params.p_release_at=body.release_at===null?null:String(body.release_at??'');if(params.p_release_at!==null&&!Number.isFinite(Date.parse(String(params.p_release_at))))throw fail(400,'Choose a valid release date.');}
   else if(action==='artwork'){
    const kind=String(body.kind),guildId=String(body.guild_id),path=String(body.path??'');
    if(!['logo','cover'].includes(kind)||!uuid(guildId)||!new RegExp(`^${userId}/guild-${guildId}-${kind}-[0-9a-f-]{36}\\.webp$`,'i').test(path))throw fail(400,'Invalid guild image.');
    const guild=await db.from('cb_guilds').select('id,creator_id,leader_id').eq('id',guildId).single();
    if(guild.error||![guild.data.creator_id,guild.data.leader_id].includes(userId))throw fail(403,'Only the guild creator or leader can edit images.');
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
  const released=await db.rpc('cb_guild_distribute_due');
  if(released.error)throw fail(503,'Guild database is not ready. Apply supabase/0047_guilds.sql.');
  const me=await db.from('cb_guild_members').select('guild_id,leader_vote').eq('user_id',userId).maybeSingle();
  if(me.error)throw me.error;
  const profile=await db.from('cb_profiles').select('cbr').eq('user_id',userId).single();
  if(profile.error)throw profile.error;
  const guilds=await db.from('cb_guild_directory').select('*', {count:'exact'}).order('guild_points',{ascending:false}).order('created_at',{ascending:true}).range((page-1)*10,page*10-1);
  if(guilds.error)throw guilds.error;
  const detailId=selected||me.data?.guild_id;
  const details=detailId?await db.from('cb_guilds').select('id,name,logo_url,cover_url,leader_id,creator_id,chest_cbg,release_at,created_at').eq('id',detailId).maybeSingle():null;
  if(details?.error)throw details.error;
  const ids=detailId?[detailId]:[];
  const members=ids.length?await db.from('cb_guild_members').select('guild_id,user_id,joined_at,leader_vote').in('guild_id',ids):{data:[],error:null};
  if(members.error)throw members.error;
  const userIds=[...new Set((members.data??[]).map(m=>m.user_id))];
  const players=userIds.length?await db.from('cb_profiles').select('user_id,username,display_name,avatar_url,cbr').in('user_id',userIds):{data:[],error:null};
  if(players.error)throw players.error;
  const playersById=new Map((players.data??[]).map(p=>[p.user_id,p]));
  const stats=(id:string)=>{
   const list=(members.data??[]).filter(m=>m.guild_id===id).map(m=>({...m,profile:playersById.get(m.user_id)}));
   return {member_count:list.length,guild_points:list.reduce((n,m)=>n+Number(m.profile?.cbr??0),0),members:list};
  };
  return res.status(200).json({page,total:guilds.count??0,eligible:Number(profile.data.cbr)>=177,my_guild_id:me.data?.guild_id??null,guilds:guilds.data??[],detail:details?.data?{...details.data,...stats(details.data.id)}:null});
 }catch(error){const status=Number((error as {status?:number}).status)||500;if(status===500)console.error('Guild request failed',error);return res.status(status).json({error:status===500?'Guild request failed. Please retry.':message(error)});}
}
