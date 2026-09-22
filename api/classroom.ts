import { createClient } from "@supabase/supabase-js";

type Req={method?:string;headers:{authorization?:string|string[]};body?:Record<string,unknown>};
type Res={status:(n:number)=>Res;json:(v:unknown)=>void;setHeader:(k:string,v:string)=>void};
const fail=(status:number,message:string):never=>{const e=Error(message) as Error&{status:number};e.status=status;throw e;};

export default async function handler(req:Req,res:Res){
  res.setHeader("Cache-Control","no-store");
  try{
    if(req.method!=="POST")fail(405,"Method not allowed.");
    const url=process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.VITE_SUPABASE_URL||process.env.SUPABASE_URL;
    const key=process.env.SUPABASE_SERVICE_ROLE_KEY||"";
    if(!url)fail(503,"Classroom server is missing NEXT_PUBLIC_SUPABASE_URL or VITE_SUPABASE_URL.");
    if(!key)fail(503,"Classroom server is missing SUPABASE_SERVICE_ROLE_KEY.");
    const client=createClient(url,key,{auth:{persistSession:false}});
    const raw=req.headers.authorization,token=(Array.isArray(raw)?raw[0]:raw||"").replace(/^Bearer\s+/i,"");
    const auth=await client.auth.getUser(token);
    if(auth.error||!auth.data.user)fail(401,"Please sign in again.");
    const userId=auth.data.user.id,body=req.body||{},action=String(body.action||"");
    const audit=async(auditAction:string,details:Record<string,unknown>={})=>{
      const actor=await client.from("cb_profiles").select("display_name,username,role").eq("user_id",userId).single();
      if(actor.error)fail(500,`Classroom activity identity could not be loaded: ${actor.error.message}`);
      const logged=await client.from("cb_admin_logs").insert({actor_user_id:userId,action:auditAction,details:{actor_name:actor.data.display_name,actor_username:actor.data.username,actor_role:actor.data.role,economy:"classroom",...details}});
      if(logged.error)fail(500,`Classroom activity could not be logged: ${logged.error.message}`);
    };
    const hasActiveTeacherSession=async()=>{
      const current=await client.from("cb_classroom_rooms").select("id").eq("teacher_id",userId).eq("status","active").gt("expires_at",new Date().toISOString()).limit(1);
      if(current.error)fail(500,current.error.message);
      return Boolean(current.data?.length);
    };
    const hasActiveStudentAccess=async()=>{
      const current=await client.from("cb_classroom_enrollments").select("room_id,room:cb_classroom_rooms!inner(id)").eq("student_id",userId).gt("access_expires_at",new Date().toISOString()).eq("room.status","active").gt("room.expires_at",new Date().toISOString()).limit(1);
      if(current.error)fail(500,current.error.message);
      return Boolean(current.data?.length);
    };
    if(action==="state"){
      await client.from("cb_classroom_wallets").upsert({user_id:userId},{onConflict:"user_id",ignoreDuplicates:true});
      const [wallet,owned,joined,active,settings]=await Promise.all([
        client.from("cb_classroom_wallets").select("cbc").eq("user_id",userId).single(),
        client.from("cb_classroom_rooms").select("*").eq("teacher_id",userId).eq("status","active").gt("expires_at",new Date().toISOString()).order("created_at",{ascending:false}),
        client.from("cb_classroom_enrollments").select("joined_at,access_expires_at,room:cb_classroom_rooms(*)").eq("student_id",userId).order("joined_at",{ascending:false}),
        client.from("cb_classroom_rooms").select("id,name,package_kind,max_students,expires_at,teacher_id,students:cb_classroom_enrollments(count)").eq("status","active").gt("expires_at",new Date().toISOString()).order("created_at",{ascending:false}).limit(60),
        client.from("cb_classroom_settings").select("*").eq("id",true).single()
      ]);
      for(const result of [wallet,owned,joined,active,settings])if(result.error)fail(500,result.error.message);
      const roomIds=(owned.data||[]).map((r:any)=>r.id);
      const counts=roomIds.length?await client.from("cb_classroom_enrollments").select("room_id").in("room_id",roomIds):{data:[],error:null};
      if(counts.error)fail(500,counts.error.message);
      const byRoom:Record<string,number>={};for(const row of counts.data||[])byRoom[row.room_id]=(byRoom[row.room_id]||0)+1;
      const profile=await client.from("cb_profiles").select("gold_points,role").eq("user_id",userId).single();
      return res.status(200).json({wallet:wallet.data,gold:profile.data?.gold_points||0,settings:settings.data,owned:(owned.data||[]).map((r:any)=>({...r,student_count:byRoom[r.id]||0})),joined:joined.data||[],active:active.data||[]});
    }
    if(action==="buy-cbc"){
      const quantity=Number(body.quantity||0),requestId=String(body.request_id||"");
      const result=await client.rpc("cb_buy_cbc",{p_user_id:userId,p_quantity:quantity,p_request_id:requestId});if(result.error)fail(400,result.error.message);
      await audit("classroom_cbc_purchased",{quantity,request_id:requestId,current_cbc:result.data?.cbc,current_cbg:result.data?.gold});
      return res.status(200).json(result.data);
    }
    if(action==="save-settings"){
      const profile=await client.from("cb_profiles").select("role").eq("user_id",userId).single();if(profile.data?.role!=="owner")fail(403,"Owner access required.");
      const keys=["cbc_gold_price","pawn_cbg","pawn_cbc","bishop_cbg","bishop_cbc","knight_cbg","knight_cbc","rook_cbg","rook_cbc","queen_cbg","queen_cbc","king_cbg","king_cbc"];
      const patch:Record<string,number|boolean|string>={id:true,updated_at:new Date().toISOString()};for(const key of keys){const value=Number(body[key]);if(!Number.isInteger(value)||value<0||value>1000000)fail(400,`Invalid ${key}.`);patch[key]=value;}
      const previous=await client.from("cb_classroom_settings").select("*").eq("id",true).single();if(previous.error)fail(500,previous.error.message);
      const saved=await client.from("cb_classroom_settings").upsert(patch).select("*").single();if(saved.error)fail(500,saved.error.message);
      await audit("classroom_settings_updated",{previous:previous.data,current:saved.data});
      return res.status(200).json({settings:saved.data});
    }
    if(action==="create"){
      if(await hasActiveStudentAccess())fail(409,"You are currently an active student. Finish your classroom access before creating a teacher session.");
      const packageKind=String(body.package||""),roomName=String(body.name||""),requestId=String(body.request_id||"");
      const result=await client.rpc("cb_create_classroom",{p_user_id:userId,p_package:packageKind,p_name:roomName,p_request_id:requestId});
      if(result.error)fail(400,result.error.message);
      await audit("classroom_room_created",{package:packageKind,room_name:roomName,room_id:result.data?.id,cbg_paid:result.data?.cbg_paid,cbc_included:result.data?.cbc_included,request_id:requestId});
      return res.status(200).json({room:result.data});
    }
    if(action==="join"){
      if(await hasActiveTeacherSession())fail(409,"You have an active teacher session. A teacher cannot enter a student classroom.");
      const code=String(body.code||""),requestId=String(body.request_id||"");
      const result=await client.rpc("cb_join_classroom",{p_user_id:userId,p_code:code,p_request_id:requestId});
      if(result.error)fail(400,result.error.message);
      await audit("classroom_access_started",{room_id:result.data?.id,room_name:result.data?.name,access_expires_at:result.data?.access_expires_at,request_id:requestId});
      return res.status(200).json({room:result.data});
    }
    if(action==="extend-access"){
      if(await hasActiveTeacherSession())fail(409,"You have an active teacher session. A teacher cannot renew student classroom access.");
      const roomId=String(body.room_id||""),requestId=String(body.request_id||"");
      const result=await client.rpc("cb_extend_classroom_access",{p_user_id:userId,p_room_id:roomId,p_request_id:requestId});
      if(result.error)fail(400,result.error.message);
      await audit("classroom_access_extended",{room_id:roomId,access_expires_at:result.data?.access_expires_at,current_cbc:result.data?.cbc,request_id:requestId});
      return res.status(200).json(result.data);
    }
    if(action==="rename"){
      const roomId=String(body.room_id||""),roomName=String(body.name||"");
      const previous=await client.from("cb_classroom_rooms").select("name").eq("id",roomId).eq("teacher_id",userId).single();
      const result=await client.rpc("cb_rename_classroom",{p_user_id:userId,p_room_id:roomId,p_name:roomName});
      if(result.error)fail(400,result.error.message);
      await audit("classroom_room_renamed",{room_id:roomId,previous_name:previous.data?.name,room_name:roomName});
      return res.status(200).json({ok:true});
    }
    if(action==="gift-cbc"){
      const username=String(body.username||""),quantity=Number(body.quantity||0),requestId=String(body.request_id||"");
      const result=await client.rpc("cb_gift_cbc",{p_sender_id:userId,p_username:username,p_quantity:quantity,p_request_id:requestId});if(result.error)fail(400,result.error.message);
      await audit("classroom_cbc_gifted",{recipient_username:username.replace(/^@+/,""),quantity,gift_fee_cbg:4,current_cbc:result.data?.cbc,recipient_cbc:result.data?.recipient_cbc,request_id:requestId});
      return res.status(200).json(result.data);
    }
    fail(400,"Unknown classroom action.");
  }catch(error){const e=error as Error&{status?:number};res.status(e.status||500).json({error:e.message||"Classroom request failed."});}
}
