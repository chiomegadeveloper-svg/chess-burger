import type {SupabaseClient} from '@supabase/supabase-js';
import type {PlayerProfile} from './supabase';

async function withSupabaseRole(client:SupabaseClient,profile:PlayerProfile|null){
 if(!profile)return null;
 try{
  const {data}=await client.from('cb_profiles').select('role').eq('user_id',profile.user_id).maybeSingle();
  const role=data?.role;
  return role==='owner'||role==='admin'||role==='player'?{...profile,role}:profile;
 }catch{return profile;}
}

export async function profileRequest(client:SupabaseClient,method:'GET'|'PUT'='GET',profile?:Partial<PlayerProfile>){
 const{data:{session}}=await client.auth.getSession();if(!session)throw Error('Your login expired. Sign in again.');
 const response=await fetch('/api/profile',{method,headers:{Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:method==='PUT'?JSON.stringify(profile):undefined,cache:'no-store'});
 const data=await response.json() as {profile:PlayerProfile|null;error?:string;code?:string};if(!response.ok)throw Object.assign(new Error(data.error??'Profile service is unavailable.'),{code:data.code});
 return withSupabaseRole(client,data.profile);
}