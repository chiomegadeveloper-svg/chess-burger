import {createCipheriv,createDecipheriv,createHash,hkdfSync,randomBytes} from "node:crypto";

export type CertificateRow={id:string;student_id:string;student_name:string;title:string;coach_name:string;session_started_at:string;issued_at:string;rank:number|null};
const key=()=>{
 const secret=process.env.CERTIFICATE_ENCRYPTION_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!secret)throw Error("Certificate encryption is not configured.");
 return Buffer.from(hkdfSync("sha256",Buffer.from(secret),Buffer.from("chess-burger-certificates"),Buffer.from("seba-v1"),32));
};
const seal=(value:unknown)=>{const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",key(),iv),body=Buffer.concat([cipher.update(JSON.stringify(value)),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),body]).toString("base64url")};
export const unseal=<T>(value:string):T=>{const raw=Buffer.from(value,"base64url"),decipher=createDecipheriv("aes-256-gcm",key(),raw.subarray(0,12));decipher.setAuthTag(raw.subarray(12,28));return JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)),decipher.final()]).toString("utf8")) as T};
export const hashCode=(code:string)=>createHash("sha256").update(code).digest("hex");
export async function issueProof(db:any,row:CertificateRow){
 if(!row.student_name?.trim())return null;
 const existing=await db.from("cb_seba_certificate_proofs").select("sealed_code").eq("certificate_id",row.id).maybeSingle();
 if(existing.error)throw existing.error;
 if(existing.data)return unseal<string>(existing.data.sealed_code);
 const code=randomBytes(32).toString("base64url");
 const snapshot={id:row.id,student_name:row.student_name,title:row.title,coach_name:row.coach_name,session_started_at:row.session_started_at,issued_at:row.issued_at,rank:row.rank};
 const saved=await db.from("cb_seba_certificate_proofs").insert({certificate_id:row.id,student_id:row.student_id,code_hash:hashCode(code),sealed_code:seal(code),sealed_snapshot:seal(snapshot)});
 if(saved.error){if(saved.error.code==="23505"){const retry=await db.from("cb_seba_certificate_proofs").select("sealed_code").eq("certificate_id",row.id).single();if(retry.error)throw retry.error;return unseal<string>(retry.data.sealed_code)}throw saved.error}
 return code;
}
