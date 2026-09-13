import {env} from 'cloudflare:workers';
import {authenticatedAccount,loadOrImportProfile} from '../../profile-server';
export async function POST(request:Request){
 const settings=env as unknown as Record<string,string|undefined>;
 const authorization=request.headers.get('Authorization');
 if(!authorization?.startsWith('Bearer '))return Response.json({error:'Sign in as Owner or GM.'},{status:401});
 try{
 if(!env.DB)return Response.json({error:"Profile storage is unavailable."},{status:503});
 const account=await authenticatedAccount(request,settings);if(!account)return Response.json({error:'Sign in again.'},{status:401});const profile=await loadOrImportProfile(env.DB,account.user,account.client);if(!profile||!['owner','admin'].includes(profile.role))return Response.json({error:'Owner or GM access required.'},{status:403});
 if(Number(request.headers.get('content-length')??0)>100000)return Response.json({error:'Tournament is too large.'},{status:413});
 const body=await request.text();if(body.length>100000)return Response.json({error:'Tournament is too large.'},{status:413});const{trf}=JSON.parse(body);if(typeof trf!=='string'||trf.length>90000||!trf.includes('001'))return Response.json({error:'Valid TRF data is required.'},{status:400});
 const endpoint=settings.SWISS_API_URL,apiKey=settings.SWISS_API_KEY;
 if(!endpoint||!apiKey)return Response.json({error:'Swiss API is not configured. Ask the Owner to set the provider URL and API key, or create an offline club tournament.'},{status:503});
 if(!endpoint.startsWith('https://'))return Response.json({error:'Configure an HTTPS Swiss provider endpoint.'},{status:503});
 const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({apikey:apiKey,action:'pair',trf}),signal:AbortSignal.timeout(20000),redirect:'error'});
 if(!response.ok)return Response.json({error:'Swiss provider could not complete the request.'},{status:502});
 const data=await response.json() as {errornumber:number;errormessage:string;pairings:unknown;nextroundnumber:number};
 if(Number(data.errornumber)!==0)return Response.json({error:'Swiss provider rejected the tournament. Review the TRF and pairing settings.'},{status:422});
 const pairings=Array.isArray(data.pairings)?data.pairings:Object.values(data.pairings as Record<string,unknown>??{});
 return Response.json({pairings,round:data.nextroundnumber},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Pairing service is unavailable. Your tournament remains saved.'},{status:502});}
}
