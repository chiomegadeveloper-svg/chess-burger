import {getSupabase} from './supabase';
export class ArenaRequestError extends Error{constructor(message:string,readonly status:number){super(message);this.name='ArenaRequestError';}}
export async function arena<T=any>(action:string,body:Record<string,unknown>={},isPublic=false):Promise<T>{
 const headers:Record<string,string>={'Content-Type':'application/json'};
 if(!isPublic){const c=await getSupabase();const session=c?(await c.auth.getSession()).data.session:null;if(!session)throw new ArenaRequestError('Sign in and save your profile to play with other players.',401);headers.Authorization='Bearer '+session.access_token;}
 const qs=new URLSearchParams({action,...Object.fromEntries(Object.entries(body).map(([key,value])=>[key,String(value)]))});
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 try{const response=await fetch('/api/arena'+(isPublic?'?'+qs:''),{method:isPublic?'GET':'POST',headers,body:isPublic?undefined:JSON.stringify({...body,action}),cache:'no-store',signal:controller.signal});const data=await response.json() as {error?:string};if(!response.ok)throw new ArenaRequestError(data.error??'Connection interrupted. Please try again.',response.status);return data as T;}
 catch(error){if(error instanceof ArenaRequestError)throw error;if((error as Error).name==='AbortError')throw new ArenaRequestError('The game server took too long to respond.',408);throw error;}
 finally{clearTimeout(timer);}
}
