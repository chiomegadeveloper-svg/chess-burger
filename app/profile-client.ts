import type {SupabaseClient} from '@supabase/supabase-js';
import type {PlayerProfile} from './supabase';

const fields='user_id,username,display_name,bio,avatar_url,card_photo_url,country_code,featured_photos,featured_badges,cbr,gold_points,win_streak,wins,losses,role,created_at';

export async function profileRequest(client:SupabaseClient,method:'GET'|'PUT'='GET',profile?:Partial<PlayerProfile>){
 const{data:{session}}=await client.auth.getSession();if(!session)throw Error('Your login expired. Sign in again.');
 if(method==='GET'){
  const {data,error}=await client.from('cb_profiles').select(fields).eq('user_id',session.user.id).maybeSingle();
  if(error)throw Object.assign(new Error(error.message),{code:error.code});
  return data as PlayerProfile|null;
 }
 const input=profile??{};
 const payload={
  user_id:session.user.id,
  username:String(input.username??'').replace(/^@+/,'').trim().toLowerCase(),
  display_name:String(input.display_name??'').trim(),
  bio:String(input.bio??'').trim(),
  avatar_url:String(input.avatar_url??''),
  country_code:String(input.country_code??'PH').toUpperCase(),
  featured_photos:Array.isArray(input.featured_photos)?input.featured_photos:[],
  featured_badges:Array.isArray(input.featured_badges)?input.featured_badges:[],
 };
 const {data,error}=await client.from('cb_profiles').upsert(payload,{onConflict:'user_id'}).select(fields).single();
 if(error){
  const code=error.code==='23505'?'username_taken':error.code;
  throw Object.assign(new Error(code==='username_taken'?'That username is already taken. Choose another one.':error.message),{code});
 }
 return data as PlayerProfile;
}