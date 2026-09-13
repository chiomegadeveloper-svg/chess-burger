import {env} from 'cloudflare:workers';
import {ArenaError,privateAction,publicAction} from '../../arena-server';
import {authenticatedAccount,loadOrImportProfile} from '../../profile-server';
export const dynamic='force-dynamic';
const response=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
async function handle(request:Request){
 try{
  if(!env.DB)throw new ArenaError('The game service is being prepared. Please try again shortly.',503);
  const url=new URL(request.url);
  if(request.method==='GET'&&['public-profile','profile-data'].includes(url.searchParams.get('action')??''))throw new ArenaError('Sign in to view player profiles.',401);
  if(request.method==='GET')return response(await publicAction(env.DB,url.searchParams.get('action')??'',url.searchParams));
  if(Number(request.headers.get('content-length')??0)>40000)throw new ArenaError('Request is too large.',413);
  const raw=await request.text();if(raw.length>40000)throw new ArenaError('Request is too large.',413);
  let body;try{body=JSON.parse(raw);}catch{throw new ArenaError('Invalid request.');}
  const settings=env as unknown as Record<string,string|undefined>,account=await authenticatedAccount(request,settings);if(!account)throw new ArenaError('Please sign in again.',401);
  const profile=await loadOrImportProfile(env.DB,account.user,account.client);if(!profile)throw new ArenaError('Save your player profile before joining a match.',403);
  return response(await privateAction(env.DB,profile,String(body.action),body));
 }catch(e){if(e instanceof ArenaError)return response({error:e.message},e.status);console.error('Arena request failed',e);return response({error:'The game service could not complete this request. Please try again.'},500);}
}
export const GET=handle;
export const POST=handle;
