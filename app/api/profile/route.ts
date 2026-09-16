import {env} from 'cloudflare:workers';
import {authenticatedAccount,loadOrImportProfile,mirrorProfile,saveProfile} from '../../profile-server';
import type {PlayerProfile} from '../../supabase';
export const dynamic='force-dynamic';
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
async function handle(request:Request){
 try{
  if(!env.DB)return reply({error:'Profile storage is unavailable.'},503);const settings=env as unknown as Record<string,string|undefined>,account=await authenticatedAccount(request,settings);if(!account)return reply({error:'Your login expired. Sign in again.'},401);
  if(request.method==='GET')return reply({profile:await loadOrImportProfile(env.DB,account.user,account.client)});
  if(request.method!=='PUT')return reply({error:'Method not allowed.'},405);if(Number(request.headers.get('content-length')??0)>30000)return reply({error:'Profile is too large.'},413);
  const raw=await request.text();if(raw.length>30000)return reply({error:'Profile is too large.'},413);let input:Partial<PlayerProfile>;try{input=JSON.parse(raw);}catch{return reply({error:'Profile data is invalid.'},400);}
  await loadOrImportProfile(env.DB,account.user,account.client);const profile=await saveProfile(env.DB,account.user,input);await mirrorProfile(account.client,profile);return reply({profile});
 }catch(e){const message=(e as Error).message;if(message==='account_deleted')return reply({error:'This Chess Burger account has been deleted by the owner.',code:message},403);if(message==='username_taken')return reply({error:'That username is already taken. Choose another one.',code:message},409);if(message==='username_format')return reply({error:'Username must use 3–24 lowercase letters, numbers, or underscores.',code:message},400);if(message==='name_required')return reply({error:'Enter your name (up to 60 characters).',code:message},400);console.error('Profile request failed',e);return reply({error:'Profile could not be saved. Please retry.',code:'profile_save_failed'},500);}
}
export const GET=handle;export const PUT=handle;
