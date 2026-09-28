import { getSupabase } from "./supabase";
export async function classroom<T>(action:string,body:Record<string,unknown>={}):Promise<T>{
  const client=await getSupabase(),session=client?(await client.auth.getSession()).data.session:null;
  if(!session)throw Error("Sign in to use Classroom.");
  const response=await fetch("/api/classroom",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({action,...body}),cache:"no-store"});
  const raw=await response.text();let data:{error?:string}|T;
  try{data=JSON.parse(raw)}catch{throw Error(`Classroom server unavailable (${response.status}). Please retry in a moment.`)}
  if(!response.ok)throw Error((data as {error?:string}).error||"Classroom request failed.");return data as T;
}
