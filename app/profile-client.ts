import type {SupabaseClient} from '@supabase/supabase-js';
import type {PlayerProfile} from './supabase';

const fields='*';

function profilePayload(userId:string,input:Partial<PlayerProfile>){
 return {
  user_id:userId,
  username:String(input.username??'').replace(/^@+/,'').trim().toLowerCase(),
  display_name:String(input.display_name??'').trim(),
  bio:String(input.bio??'').trim(),
  avatar_url:String(input.avatar_url??''),
  country_code:String(input.country_code??'PH').toUpperCase(),
  featured_photos:Array.isArray(input.featured_photos)?input.featured_photos:[],
  featured_badges:Array.isArray(input.featured_badges)?input.featured_badges:[],
 };
}

async function restoreLegacyProfile(client:SupabaseClient,token:string,userId:string){
 try{
  const response=await fetch('/api/profile',{headers:{Authorization:'Bearer '+token},cache:'no-store'});
  if(!response.ok)return null;
  const legacy=await response.json() as {profile?:PlayerProfile|null};
  if(!legacy.profile)return null;
  const {data,error}=await client.from('cb_profiles').upsert(profilePayload(userId,legacy.profile),{onConflict:'user_id'}).select(fields).single();
  if(error)throw error;
  return data as PlayerProfile;
 }catch{return null;}
}

export async function profileRequest(client:SupabaseClient,method:'GET'|'PUT'='GET',profile?:Partial<PlayerProfile>){
 const{data:{session}}=await client.auth.getSession();if(!session)throw Error('Your login expired. Sign in again.');
 if(method==='GET'){
  const {data,error}=await client.from('cb_profiles').select(fields).eq('user_id',session.user.id).maybeSingle();
  if(error)throw Object.assign(new Error(error.message),{code:error.code});
  if(data)return data as PlayerProfile;
  return await restoreLegacyProfile(client,session.access_token,session.user.id);
 }
 const {data,error}=await client.from('cb_profiles').upsert(profilePayload(session.user.id,profile??{}),{onConflict:'user_id'}).select(fields).single();
 if(error){
  const code=error.code==='23505'?'username_taken':error.code;
  throw Object.assign(new Error(code==='username_taken'?'That username is already taken. Choose another one.':error.message),{code});
 }
 return data as PlayerProfile;
}