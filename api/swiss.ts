import { createClient } from '@supabase/supabase-js';

type Req = { method?: string; headers: Record<string,string|string[]|undefined>; body?: unknown };
type Res = { status: (code:number)=>Res; json: (body:unknown)=>void; setHeader: (name:string,value:string)=>void };

export default async function handler(req:Req,res:Res) {
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST') return res.status(405).json({error:'POST required.'});
  const authHeader=req.headers.authorization;
  const token=(Array.isArray(authHeader)?authHeader[0]:authHeader??'').replace(/^Bearer\s+/i,'');
  if(!token) return res.status(401).json({error:'Sign in as Owner or GM.'});
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL??process.env.VITE_SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key) return res.status(503).json({error:'Tournament authentication is not configured.'});
  try {
    const client=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
    const {data:{user},error}=await client.auth.getUser(token);
    if(error||!user) return res.status(401).json({error:'Sign in again.'});
    const profile=await client.from('cb_profiles').select('role').eq('user_id',user.id).maybeSingle();
    if(profile.error||!['owner','admin'].includes(profile.data?.role)) return res.status(403).json({error:'Owner or GM access required.'});
    const trf=(req.body as {trf?:unknown}|undefined)?.trf;
    if(typeof trf!=='string'||trf.length>90000||!trf.includes('001')) return res.status(400).json({error:'Valid TRF data is required.'});
    const endpoint=process.env.SWISS_API_URL,apiKey=process.env.SWISS_API_KEY;
    if(!endpoint||!apiKey) return res.status(503).json({error:'Swiss API is not configured. Set SWISS_API_URL and SWISS_API_KEY in Vercel, or select Offline club Swiss.'});
    if(!endpoint.startsWith('https://')) return res.status(503).json({error:'Configure an HTTPS Swiss provider endpoint.'});
    const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({apikey:apiKey,action:'pair',trf}),signal:AbortSignal.timeout(20000),redirect:'error'});
    if(!response.ok) return res.status(502).json({error:'Swiss provider could not complete the request.'});
    const data=await response.json() as {errornumber:number;pairings:unknown;nextroundnumber:number};
    if(Number(data.errornumber)!==0) return res.status(422).json({error:'Swiss provider rejected the tournament. Review the TRF and pairing settings.'});
    const pairings=Array.isArray(data.pairings)?data.pairings:Object.values(data.pairings as Record<string,unknown>??{});
    return res.status(200).json({pairings,round:data.nextroundnumber});
  }catch{return res.status(502).json({error:'Pairing service is unavailable. Your tournament remains saved.'});}
}
