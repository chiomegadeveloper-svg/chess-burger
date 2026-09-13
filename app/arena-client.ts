import {getSupabase} from './supabase';
export async function arena<T=any>(action:string,body:Record<string,unknown>={},isPublic=false):Promise<T>{
 let headers:Record<string,string>={'Content-Type':'application/json'};
 if(!isPublic){const c=await getSupabase();const session=c?(await c.auth.getSession()).data.session:null;if(!session)throw Error('Sign in and save your profile to play with other players.');headers.Authorization='Bearer '+session.access_token;}
 const qs=new URLSearchParams({action,...Object.fromEntries(Object.entries(body).map(([k,v])=>[k,String(v)]))});
 const response=await fetch('/api/arena'+(isPublic?'?'+qs:''),{method:isPublic?'GET':'POST',headers,body:isPublic?undefined:JSON.stringify({...body,action}),cache:'no-store'});
 const data=await response.json() as {error?:string};if(!response.ok)throw Error(data.error??'Connection interrupted. Please try again.');return data as T;
}
