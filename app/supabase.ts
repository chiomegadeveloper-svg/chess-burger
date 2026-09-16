"use client";
import {createClient,SupabaseClient} from '@supabase/supabase-js';
import {authStorage} from './auth-storage';
let pending:Promise<SupabaseClient|null>|undefined;
const configuredUrl=import.meta.env.VITE_SUPABASE_URL?.trim()??'';
const configuredKey=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()??'';
export function getSupabase(){
 if(!pending)pending=(configuredUrl&&configuredKey
  ? Promise.resolve({configured:true,url:configuredUrl,key:configuredKey})
  : fetch('/api/public-config',{cache:'no-store'}).then(async r=>{
  if(!r.ok)throw new Error('Account service is unavailable.');return await r.json() as {configured:boolean;url:string;key:string};
 })).then(c=>{if(!c.configured)return null;
  return createClient(c.url,c.key,{auth:{flowType:'pkce',detectSessionInUrl:true,persistSession:true,autoRefreshToken:true,storageKey:'cb-auth',storage:authStorage}});
 }).catch(e=>{pending=undefined;throw e;});
 return pending;
}
export type PlayerProfile={user_id:string;username:string;display_name:string;bio:string;avatar_url:string;card_photo_url:string;country_code:string;featured_photos:string[];featured_badges:string[];cbr:number;ocbr:number;gold_points:number;win_streak:number;wins:number;losses:number;role:"player"|"admin"|"owner";created_at:string;rating_delta?:number};
export type FeedEvent={id:string;user_id:string;kind:string;display_name:string;avatar_url:string;cbr:number;content:string;image_url:string;expires_at:string|null;cbr_delta:number;gold_delta:number;heart_count:number;created_at:string};
