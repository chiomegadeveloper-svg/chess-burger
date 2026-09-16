import type {SupabaseClient} from '@supabase/supabase-js';
import type {PlayerProfile} from './supabase';

export async function profileRequest(client:SupabaseClient,method:'GET'|'PUT'='GET',profile?:Partial<PlayerProfile>){
 const{data:{session}}=await client.auth.getSession();if(!session)throw Error('Your login expired. Sign in again.');
 const response=await fetch('/api/profile',{method,headers:{Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:method==='PUT'?JSON.stringify(profile):undefined,cache:'no-store'});
 const data=await response.json() as {profile:PlayerProfile|null;error?:string;code?:string};if(!response.ok)throw Object.assign(new Error(data.error??'Profile service is unavailable.'),{code:data.code});return data.profile;
}