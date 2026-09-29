import {getSupabase} from './supabase';

export type Donation={id:string;donor_id?:string;donor?:{username:string;display_name:string}|null;amount_php:number;reference_last6:string|null;status:'awaiting_payment'|'pending'|'approved'|'rejected';created_at:string;expires_at?:string;reviewed_at?:string|null;reject_reason?:string|null};

export async function donations<T>(action:string,body:Record<string,unknown>={}):Promise<T>{
  const client=await getSupabase(),session=client?(await client.auth.getSession()).data.session:null;
  if(!session)throw Error('Sign in to support Chess Burger.');
  const response=await fetch('/api/donations',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({action,...body}),cache:'no-store'});
  const raw=await response.text();
  let data:T&{error?:string};
  try{data=JSON.parse(raw) as T&{error?:string}}
  catch{throw Error(response.ok?'The donation server returned an invalid response.':'Donations are temporarily unavailable. Please try again shortly.');}
  if(!response.ok)throw Error(data.error||'Donations are temporarily unavailable.');
  return data;
}
