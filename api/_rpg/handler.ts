import {createClient} from '@supabase/supabase-js';
import {gameRequest} from './service.mjs';
import {ownerRequest} from './owner.mjs';
type Req={method?:string;query?:Record<string,string|string[]|undefined>;body?:unknown;headers:Record<string,string|string[]|undefined>};
type Res={status:(code:number)=>Res;json:(body:unknown)=>void;setHeader:(name:string,value:string)=>void};
export default async function handler(req:Req,res:Res){
 res.setHeader('Cache-Control','no-store');
 try{
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL??process.env.VITE_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)return res.status(503).json({error:'RPG account service is unavailable.'});
  const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  if(req.method==='GET'&&req.query?.health==='1'){const r=await client.from('cb_inventory_items').select('user_id').limit(0);let merchantReady:boolean|undefined;if(req.query?.merchant==='1'){const probe=await client.rpc('cb_rpg_merchant_trade',{p_user_id:null,p_request_id:null,p_revision:0,p_delta:0,p_document:null});merchantReady=!probe.error||probe.error.message==='Your CBG account is unavailable';}let rewardsReady:boolean|undefined;if(req.query?.rewards==='1'){const probe=await client.rpc('cb_rpg_battle_reward',{p_user_id:null,p_battle_id:null});rewardsReady=!probe.error||probe.error.message==='Your CBG account is unavailable';}return res.status(r.error?503:200).json({ready:!r.error,...(rewardsReady===undefined?{}:{rewardsReady}),...(merchantReady===undefined?{}:{merchantReady})});}
  if(!['GET','POST','DELETE'].includes(req.method||''))return res.status(405).json({error:'Method not allowed.'});
  const origin=req.headers.origin,host=req.headers.host;
  if(req.headers['sec-fetch-site']==='cross-site'||(origin&&new URL(String(origin)).host!==String(host)))return res.status(403).json({error:'Request not allowed.'});
  const authorization=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');if(!authorization)return res.status(401).json({error:'Sign in to Chess Burger to play RPG.'});
  const auth=await client.auth.getUser(authorization);if(auth.error||!auth.data.user)return res.status(401).json({error:'Your login expired. Reopen RPG after signing in.'});
  const profile=await client.from('cb_profiles').select('agreement_version,avatar_url,role').eq('user_id',auth.data.user.id).single();
  if(profile.error||profile.data.agreement_version===null)return res.status(403).json({error:'Complete your Chess Burger registration first.'});
  let body=typeof req.body==='string'?JSON.parse(req.body):req.body||{};if(JSON.stringify(body).length>100000)return res.status(413).json({error:'Game request is too large.'});
  if(req.method==='GET')body={channel:req.query?.channel,action:req.query?.action,generation:req.query?.generation};
  if(String(body.action||'').startsWith('owner_')){if(req.method!=='POST')return res.status(405).json({error:'Method not allowed.'});return res.status(200).json(await ownerRequest(client,auth.data.user.id,profile.data.role,body));}
  return res.status(200).json(await gameRequest(client,auth.data.user.id,req.method||'GET',body));
 }catch(error){const e=error as Error&{status?:number;code?:string;distance?:number};return res.status(e.status||503).json({error:e.status?e.message:'RPG service is temporarily unavailable. Please retry.',...(e.code?{code:e.code}:{}),...(Number.isFinite(e.distance)?{distance:e.distance}:{})});}
}
