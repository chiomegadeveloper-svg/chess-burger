import {getSupabase} from './supabase';
export async function rpgOwner<T>(action:string,body:Record<string,unknown>={}):Promise<T>{
 const client=await getSupabase(),auth=await client?.auth.getSession(),session=auth?.data.session;
 if(!session)throw Error('Sign in again to use the CMS.');
 const response=await fetch('/api/profile?feature=rpg',{method:'POST',headers:{Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({action,...body}),cache:'no-store',signal:AbortSignal.timeout(20000)});
 const data=await response.json();if(!response.ok)throw Error(data.error||'RPG owner action failed.');return data as T;
}
