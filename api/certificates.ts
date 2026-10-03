import {createClient} from "@supabase/supabase-js";
import {hashCode,issueProof,unseal,type CertificateRow} from "./_certificate-proof";
type Req={method?:string;headers:{authorization?:string|string[]};body?:Record<string,unknown>};
type Res={status:(n:number)=>Res;json:(v:unknown)=>void;setHeader:(k:string,v:string)=>void};
const codePattern=/^[A-Za-z0-9_-]{43}$/;
export default async function handler(req:Req,res:Res){res.setHeader("Cache-Control","no-store");try{
 if(req.method!=="POST")throw Object.assign(Error("Method not allowed."),{status:405});
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.VITE_SUPABASE_URL||process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)throw Error("Certificate service is unavailable.");
 const db=createClient(url,key,{auth:{persistSession:false}}),action=String(req.body?.action||"");
 if(action==="verify"){
  const code=String(req.body?.code||"");if(!codePattern.test(code))return res.status(200).json({valid:false});
  const found=await db.from("cb_seba_certificate_proofs").select("certificate_id,sealed_snapshot").eq("code_hash",hashCode(code)).maybeSingle();if(found.error)throw found.error;
  if(!found.data)return res.status(200).json({valid:false});
  const exists=await db.from("cb_seba_certificates").select("id").eq("id",found.data.certificate_id).maybeSingle();if(exists.error)throw exists.error;
  if(!exists.data)return res.status(200).json({valid:false});
  return res.status(200).json({valid:true,certificate:unseal(found.data.sealed_snapshot)});
 }
 if(action!=="list")throw Object.assign(Error("Unknown action."),{status:400});
 const raw=req.headers.authorization,token=(Array.isArray(raw)?raw[0]:raw||"").replace(/^Bearer\s+/i,"");
 const auth=await db.auth.getUser(token);if(auth.error||!auth.data.user)throw Object.assign(Error("Sign in to see your certificates."),{status:401});
 const rows=await db.from("cb_seba_certificates").select("id,student_id,student_name,title,coach_name,session_started_at,issued_at,rank").eq("student_id",auth.data.user.id).neq("student_name","").order("issued_at",{ascending:false}).limit(100);
 if(rows.error)throw rows.error;
 const certificates=await Promise.all((rows.data||[]).map(async(row:CertificateRow)=>({...row,code:await issueProof(db,row)})));
 return res.status(200).json({certificates});
 }catch(e){const error=e as Error&{status?:number};return res.status(error.status||500).json({error:error.message||"Certificate request failed."})}}
