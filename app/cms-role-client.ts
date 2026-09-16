import {getSupabase} from './supabase';

export async function setCmsRole(username:string,role:'owner'|'admin'|'player'){
 const client=await getSupabase();
 if(!client)throw Error('Supabase is not configured in Vercel yet.');
 const {error}=await client.rpc('cb_set_role',{p_username:username.replace(/^@+/,'').trim().toLowerCase(),p_role:role});
 if(error)throw Error(error.message);
}