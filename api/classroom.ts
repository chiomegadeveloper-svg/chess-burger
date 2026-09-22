import { createClient } from "@supabase/supabase-js";

type Req={method?:string;headers:{authorization?:string|string[]};body?:Record<string,unknown>};
type Res={status:(n:number)=>Res;json:(v:unknown)=>void;setHeader:(k:string,v:string)=>void};
const fail=(status:number,message:string):never=>{const e=Error(message) as Error&{status:number};e.status=status;throw e;};

export default async function handler(req:Req,res:Res){
  res.setHeader("Cache-Control","no-store");
  try{
    if(req.method!=="POST")fail(405,"Method not allowed.");
    const url=process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
    if(!url||!key)fail(500,"Classroom server is not configured.");
    const client=createClient(url,key,{auth:{persistSession:false}});
    const raw=req.headers.authorization,token=(Array.isArray(raw)?raw[0]:raw||"").replace(/^Bearer\s+/i,"");
    const auth=await client.auth.getUser(token);
    if(auth.error||!auth.data.user)fail(401,"Please sign in again.");
    const userId=auth.data.user.id,body=req.body||{},action=String(body.action||"");
    if(action==="state"){
      await client.from("cb_classroom_wallets").upsert({user_id:userId},{onConflict:"user_id",ignoreDuplicates:true});
      const [wallet,owned,joined,active,settings]=await Promise.all([
        client.from("cb_classroom_wallets").select("cbc").eq("user_id",userId).single(),
        client.from("cb_classroom_rooms").select("*").eq("teacher_id",userId).eq("status","active").gt("expires_at",new Date().toISOString()).order("created_at",{ascending:false}),
        client.from("cb_classroom_enrollments").select("joined_at,room:cb_classroom_rooms(*)").eq("student_id",userId).order("joined_at",{ascending:false}),
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
      const result=await client.rpc("cb_buy_cbc",{p_user_id:userId,p_quantity:Number(body.quantity||0),p_request_id:String(body.request_id||"")});if(result.error)fail(400,result.error.message);return res.status(200).json(result.data);
    }
    if(action==="save-settings"){
      const profile=await client.from("cb_profiles").select("role").eq("user_id",userId).single();if(profile.data?.role!=="owner")fail(403,"Owner access required.");
      const keys=["cbc_gold_price","pawn_cbg","pawn_cbc","bishop_cbg","bishop_cbc","knight_cbg","knight_cbc","rook_cbg","rook_cbc","queen_cbg","queen_cbc","king_cbg","king_cbc"];
      const patch:Record<string,number|boolean|string>={id:true,updated_at:new Date().toISOString()};for(const key of keys){const value=Number(body[key]);if(!Number.isInteger(value)||value<0||value>1000000)fail(400,`Invalid ${key}.`);patch[key]=value;}
      const saved=await client.from("cb_classroom_settings").upsert(patch).select("*").single();if(saved.error)fail(500,saved.error.message);return res.status(200).json({settings:saved.data});
    }
    if(action==="create"){
      const result=await client.rpc("cb_create_classroom",{p_user_id:userId,p_package:String(body.package||""),p_name:String(body.name||""),p_request_id:String(body.request_id||"")});
      if(result.error)fail(400,result.error.message);return res.status(200).json({room:result.data});
    }
    if(action==="join"){
      const result=await client.rpc("cb_join_classroom",{p_user_id:userId,p_code:String(body.code||""),p_request_id:String(body.request_id||"")});
      if(result.error)fail(400,result.error.message);return res.status(200).json({room:result.data});
    }
    if(action==="rename"){
      const result=await client.rpc("cb_rename_classroom",{p_user_id:userId,p_room_id:String(body.room_id||""),p_name:String(body.name||"")});
      if(result.error)fail(400,result.error.message);return res.status(200).json({ok:true});
    }
    if(action==="gift-cbc"){
      const result=await client.rpc("cb_gift_cbc",{p_sender_id:userId,p_username:String(body.username||""),p_quantity:Number(body.quantity||0),p_request_id:String(body.request_id||"")});if(result.error)fail(400,result.error.message);return res.status(200).json(result.data);
    }
    fail(400,"Unknown classroom action.");
  }catch(error){const e=error as Error&{status?:number};res.status(e.status||500).json({error:e.message||"Classroom request failed."});}
}
