import { createClient } from "@supabase/supabase-js";
import { AccessToken, TrackSource } from "livekit-server-sdk";

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
    if(action==="voice-token"){
      const roomId=String(body.room_id||""),now=new Date().toISOString();
      if(!roomId)fail(400,"Classroom is required.");
      const room=await client.from("cb_classroom_rooms").select("id,teacher_id,status,expires_at").eq("id",roomId).eq("status","active").gt("expires_at",now).maybeSingle();
      if(room.error)fail(500,room.error.message);
      const voiceRoom=room.data;
      if(!voiceRoom)fail(404,"Active classroom not found.");
      const teacher=voiceRoom!.teacher_id===userId;
      if(!teacher){
        const enrollment=await client.from("cb_classroom_enrollments").select("student_id").eq("room_id",roomId).eq("student_id",userId).gt("access_expires_at",now).maybeSingle();
        if(enrollment.error)fail(500,enrollment.error.message);
        if(!enrollment.data)fail(403,"Your paid classroom time has expired. Renew with 1 CBC.");
      }
      const livekitUrl=process.env.LIVEKIT_URL||"",apiKey=process.env.LIVEKIT_API_KEY||"",apiSecret=process.env.LIVEKIT_API_SECRET||"";
      if(!livekitUrl||!apiKey||!apiSecret)fail(503,"SEba Voice is not configured. Add the LiveKit Cloud environment variables.");
      const profile=await client.from("cb_profiles").select("display_name,username").eq("user_id",userId).maybeSingle();
      if(profile.error)fail(500,profile.error.message);
      const participantName=String(profile.data?.display_name||profile.data?.username||(teacher?"Teacher":"Student")).slice(0,80);
      const accessToken=new AccessToken(apiKey,apiSecret,{identity:userId,name:participantName,ttl:"10m",metadata:JSON.stringify({role:teacher?"teacher":"student"})});
      accessToken.addGrant({roomJoin:true,room:`seba-${roomId}`,canPublish:true,canPublishSources:[TrackSource.MICROPHONE],canSubscribe:true,canPublishData:false});
      return res.status(200).json({server_url:livekitUrl,participant_token:await accessToken.toJwt()});
    }
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
      const now=Date.now(),validJoined=(joined.data||[]).filter((row:any)=>row.room?.status==="active"&&new Date(row.room.expires_at).getTime()>now);
      return res.status(200).json({wallet:wallet.data,gold:profile.data?.gold_points||0,settings:settings.data,owned:(owned.data||[]).map((r:any)=>({...r,student_count:byRoom[r.id]||0})),joined:validJoined,active:active.data||[]});
    }
    if(action==="buy-cbc"){
      const result=await client.rpc("cb_buy_cbc",{p_user_id:userId,p_quantity:Number(body.quantity||0),p_request_id:String(body.request_id||"")});if(result.error)fail(400,result.error.message);return res.status(200).json(result.data);
    }
    if(action==="buy-cbc-for-student"){
      const result=await client.rpc("cb_buy_cbc_for_student",{p_teacher_id:userId,p_room_id:String(body.room_id||""),p_username:String(body.username||""),p_quantity:Number(body.quantity||0),p_request_id:String(body.request_id||"")});if(result.error)fail(400,result.error.message);return res.status(200).json(result.data);
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
    if(action==="extend-access"){
      const result=await client.rpc("cb_extend_classroom_access",{p_user_id:userId,p_room_id:String(body.room_id||""),p_request_id:String(body.request_id||"")});
      if(result.error)fail(400,result.error.message);return res.status(200).json(result.data);
    }
    if(action==="quit"){
      const roomId=String(body.room_id||"");
      if(!roomId)fail(400,"Classroom is required.");
      const enrollment=await client.from("cb_classroom_enrollments").select("student_id").eq("room_id",roomId).eq("student_id",userId).maybeSingle();
      if(enrollment.error)fail(500,enrollment.error.message);
      if(!enrollment.data)fail(404,"You are not enrolled in this classroom.");
      const board=await client.from("cb_classroom_student_boards").delete().eq("room_id",roomId).eq("student_id",userId);
      if(board.error)fail(500,board.error.message);
      const removed=await client.from("cb_classroom_enrollments").delete().eq("room_id",roomId).eq("student_id",userId);
      if(removed.error)fail(500,removed.error.message);
      return res.status(200).json({ok:true});
    }
    if(action==="workshop-state"){
      const roomId=String(body.room_id||""),now=new Date().toISOString();
      const room=await client.from("cb_classroom_rooms").select("*").eq("id",roomId).eq("status","active").gt("expires_at",now).single();
      if(room.error||!room.data)fail(404,"Active classroom not found.");
      const teacher=room.data.teacher_id===userId;
      const ownEnrollment=teacher?null:await client.from("cb_classroom_enrollments").select("access_expires_at").eq("room_id",roomId).eq("student_id",userId).gt("access_expires_at",now).maybeSingle();
      if(!teacher&&!ownEnrollment?.data)fail(403,"Your paid classroom time has expired. Renew with 1 CBC.");
      await client.from("cb_classroom_workspaces").upsert({room_id:roomId},{onConflict:"room_id",ignoreDuplicates:true});
      const [workspace,enrollments,boards,wallet,economy,profile,lessonLog]=await Promise.all([
        client.from("cb_classroom_workspaces").select("*").eq("room_id",roomId).single(),
        client.from("cb_classroom_enrollments").select("student_id,access_expires_at").eq("room_id",roomId).gt("access_expires_at",now),
        client.from("cb_classroom_student_boards").select("*").eq("room_id",roomId),
        client.from("cb_classroom_wallets").select("cbc").eq("user_id",userId).maybeSingle(),
        client.from("cb_classroom_settings").select("cbc_gold_price").eq("id",true).single(),
        client.from("cb_profiles").select("gold_points").eq("user_id",userId).single(),
        teacher?client.from("cb_classroom_lesson_events").select("id,scope,student_id,fen,annotations,label,created_at").eq("room_id",roomId).order("created_at",{ascending:false}).limit(100):Promise.resolve({data:[],error:null})
      ]);
      for(const result of [workspace,enrollments,boards,wallet,economy,profile,lessonLog])if(result.error)fail(500,result.error.message);
      const studentIds=(enrollments.data||[]).map((row:any)=>row.student_id);
      const profiles=studentIds.length?await client.from("cb_profiles").select("user_id,display_name,username,avatar_url").in("user_id",studentIds):{data:[],error:null};
      if(profiles.error)fail(500,profiles.error.message);
      const profileMap=new Map((profiles.data||[]).map((p:any)=>[p.user_id,p]));
      const boardMap=new Map((boards.data||[]).map((b:any)=>[b.student_id,b]));
      const students=(enrollments.data||[]).map((e:any)=>({...(profileMap.get(e.student_id)||{user_id:e.student_id,display_name:"Student"}),access_expires_at:e.access_expires_at,board:boardMap.get(e.student_id)||{room_id:roomId,student_id:e.student_id,fen:"start",version:0}}));
      return res.status(200).json({role:teacher?"teacher":"student",room:room.data,workspace:workspace.data,students,lesson_log:lessonLog.data||[],own_student_id:teacher?null:userId,wallet:{cbc:wallet.data?.cbc||0},economy:{gold:profile.data?.gold_points||0,cbc_gold_price:economy.data?.cbc_gold_price||0}});
    }
    if(action==="workshop-update"){
      const roomId=String(body.room_id||""),kind=String(body.kind||""),now=new Date().toISOString();
      const room=await client.from("cb_classroom_rooms").select("teacher_id,status,expires_at").eq("id",roomId).single();
      if(room.error||!room.data||room.data.status!=="active"||room.data.expires_at<=now)fail(404,"Active classroom not found.");
      const teacher=room.data.teacher_id===userId;
      if(!teacher){const access=await client.from("cb_classroom_enrollments").select("student_id").eq("room_id",roomId).eq("student_id",userId).gt("access_expires_at",now).maybeSingle();if(!access.data)fail(403,"Your paid classroom time has expired.");}
      const fen=String(body.fen||"start");if(fen.length>160)fail(400,"Invalid board position.");
      if(kind==="assign-puzzle"){
        if(!teacher)fail(403,"Only the teacher can assign puzzles.");
        const enrollments=await client.from("cb_classroom_enrollments").select("student_id").eq("room_id",roomId).gt("access_expires_at",now);
        if(enrollments.error)fail(500,enrollments.error.message);
        const assignments=(enrollments.data||[]).map(row=>({room_id:roomId,student_id:row.student_id,fen,annotations:[],updated_by:userId,updated_at:now}));
        if(assignments.length){
          const saved=await client.from("cb_classroom_student_boards").upsert(assignments,{onConflict:"room_id,student_id"});
          if(saved.error)fail(500,saved.error.message);
        }
        const logged=await client.from("cb_classroom_lesson_events").insert({room_id:roomId,actor_id:userId,scope:"assignment",fen,annotations:[],label:`Puzzle assigned to ${assignments.length} student${assignments.length===1?"":"s"}`});
        if(logged.error)fail(500,logged.error.message);
        return res.status(200).json({assigned:assignments.length});
      }
      if(kind==="master"){
        if(!teacher)fail(403,"Only the teacher can control the lesson board.");
        const annotations=Array.isArray(body.annotations)?body.annotations.slice(0,80):[];
        const control=String(body.time_control||"10+0").slice(0,12);
        const saved=await client.from("cb_classroom_workspaces").upsert({room_id:roomId,fen,annotations,time_control:control,selected_student_id:body.selected_student_id||null,updated_by:userId,updated_at:now},{onConflict:"room_id"}).select("*").single();
        if(saved.error)fail(500,saved.error.message);const logged=await client.from("cb_classroom_lesson_events").insert({room_id:roomId,actor_id:userId,scope:"master",fen,annotations,label:"Teacher updated the lesson board"});if(logged.error)fail(500,logged.error.message);return res.status(200).json({workspace:saved.data});
      }
      if(kind==="shared"){
        if(teacher)fail(400,"Teacher updates use the lesson board control.");
        const activeCount=await client.from("cb_classroom_enrollments").select("student_id",{count:"exact",head:true}).eq("room_id",roomId).gt("access_expires_at",now);
        if(activeCount.error)fail(500,activeCount.error.message);if(activeCount.count!==1)fail(409,"Shared board is available only for one-on-one sessions.");
        const saved=await client.from("cb_classroom_workspaces").update({fen,updated_by:userId,updated_at:now}).eq("room_id",roomId).select("*").single();
        if(saved.error)fail(500,saved.error.message);const logged=await client.from("cb_classroom_lesson_events").insert({room_id:roomId,actor_id:userId,scope:"shared",student_id:userId,fen,annotations:saved.data.annotations||[],label:"Student moved on the shared board"});if(logged.error)fail(500,logged.error.message);return res.status(200).json({workspace:saved.data});
      }
      if(kind==="student"){
        const studentId=teacher?String(body.student_id||""):userId;
        const enrollment=await client.from("cb_classroom_enrollments").select("student_id").eq("room_id",roomId).eq("student_id",studentId).gt("access_expires_at",now).maybeSingle();
        if(!enrollment.data)fail(403,"Student classroom access is not active.");
        const boardPatch:Record<string,unknown>={room_id:roomId,student_id:studentId,fen,updated_by:userId,updated_at:now};
        if(teacher&&Array.isArray(body.annotations))boardPatch.annotations=body.annotations.slice(0,80);
        const saved=await client.from("cb_classroom_student_boards").upsert(boardPatch,{onConflict:"room_id,student_id"}).select("*").single();
        if(saved.error)fail(500,saved.error.message);const logged=await client.from("cb_classroom_lesson_events").insert({room_id:roomId,actor_id:userId,scope:"student",student_id:studentId,fen,annotations:saved.data.annotations||[],label:teacher?"Teacher updated a student board":"Student moved a piece"});if(logged.error)fail(500,logged.error.message);return res.status(200).json({board:saved.data});
      }
      fail(400,"Unknown workshop update.");
    }
    if(action==="rename"){
      const result=await client.rpc("cb_rename_classroom",{p_user_id:userId,p_room_id:String(body.room_id||""),p_name:String(body.name||"")});
      if(result.error)fail(400,result.error.message);return res.status(200).json({ok:true});
    }
    if(action==="terminate"){
      const result=await client.rpc("cb_terminate_classroom",{p_user_id:userId,p_room_id:String(body.room_id||"")});
      if(result.error)fail(400,result.error.message);return res.status(200).json({ok:true});
    }
    if(action==="gift-cbc"){
      const result=await client.rpc("cb_gift_cbc",{p_sender_id:userId,p_username:String(body.username||""),p_quantity:Number(body.quantity||0),p_request_id:String(body.request_id||"")});if(result.error)fail(400,result.error.message);return res.status(200).json(result.data);
    }
    fail(400,"Unknown classroom action.");
  }catch(error){const e=error as Error&{status?:number};res.status(e.status||500).json({error:e.message||"Classroom request failed."});}
}
