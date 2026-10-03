import { createClient } from "@supabase/supabase-js";
import { AccessToken, DataPacket_Kind, RoomServiceClient, TrackSource } from "livekit-server-sdk";
import { Chess } from "chess.js";
import chessMathHandler from "./_chess-math.js";
import chessMathAttackHandler from "./_chess-math-attack.js";

/** Locked student boards accept one legal White chess move per update. */
function legalStudentMove(before:string,after:string){
  try{
    const position=new Chess(before==="start"?new Chess().fen():before,{skipValidation:true});
    if(position.turn()!=="w")return false;
    return position.moves({verbose:true}).some(move=>{
      const next=new Chess(position.fen(),{skipValidation:true});
      next.move(move);
      return next.fen()===after;
    });
  }catch{return false;}
}

type Req={method?:string;headers:{authorization?:string|string[]};body?:Record<string,unknown>};
type Res={status:(n:number)=>Res;json:(v:unknown)=>void;setHeader:(k:string,v:string)=>void};
const fail=(status:number,message:string):never=>{const e=Error(message) as Error&{status:number};e.status=status;throw e;};

export default async function handler(req:Req,res:Res){
  const action=req.body?.action;
  if(typeof action==="string"&&["chess-math-state","chess-math-start","chess-math-finish"].includes(action)){
    // Vercel's request properties can be non-enumerable, so spreading req drops headers.
    return chessMathHandler({method:req.method,headers:req.headers,body:{...req.body,action:action.slice("chess-math-".length)}},res);
  }
  if(typeof action==="string"&&["chess-math-attack-state","chess-math-attack-start","chess-math-attack-answer"].includes(action)){
    return chessMathAttackHandler({method:req.method,headers:req.headers,body:{...req.body,action:action.slice("chess-math-attack-".length)}},res);
  }
  res.setHeader("Cache-Control","no-store");
  try{
    if(req.method!=="POST")fail(405,"Method not allowed.");
    const url=process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.VITE_SUPABASE_URL||process.env.SUPABASE_URL;
    const key=process.env.SUPABASE_SERVICE_ROLE_KEY||"";
    if(!url)return fail(503,"Classroom server is missing NEXT_PUBLIC_SUPABASE_URL or VITE_SUPABASE_URL.");
    if(!key)fail(503,"Classroom server is missing SUPABASE_SERVICE_ROLE_KEY.");
    const client=createClient(url,key,{auth:{persistSession:false}});
    const raw=req.headers.authorization,token=(Array.isArray(raw)?raw[0]:raw||"").replace(/^Bearer\s+/i,"");
    const auth=await client.auth.getUser(token);
    if(auth.error||!auth.data.user)return fail(401,"Please sign in again.");
    const userId=auth.data.user.id,body=req.body||{},action=String(body.action||"");
    const freeClassroom=async()=>{const setting=await client.from("cb_classroom_settings").select("*").eq("id",true).single();if(setting.error)fail(500,setting.error.message);return setting.data?.cbc_enabled===false;};
const activeEnrollment=async(roomId:string,studentId:string,now:string,free:boolean,allowGrace=false)=>{const enrollment=await client.from("cb_classroom_enrollments").select("student_id,access_expires_at").eq("room_id",roomId).eq("student_id",studentId).maybeSingle();if(enrollment.error)fail(500,enrollment.error.message);return enrollment.data&&(free||enrollment.data.access_expires_at>now||(allowGrace&&Date.parse(enrollment.data.access_expires_at)+8*60_000>Date.parse(now)))?enrollment.data:null;};
    const gate=await client.from("cb_profiles").select("*").eq("user_id",userId).maybeSingle();
    if(gate.error)fail(500,gate.error.message);
    if(!String(gate.data?.avatar_url??"").includes(`/storage/v1/object/public/cb-profile-media/${userId}/avatar-`))fail(403,"Complete registration and save a profile picture to unlock Chess Burger.");
    if(gate.data?.agreement_version===null)fail(403,"Review and accept the End User Agreement to continue.");
    if(action.startsWith("library-")){
      const q=async(query:any)=>{const result=await query;if(result.error){const message=String(result.error.message||"");if(result.error.code==="42P01"||result.error.code==="PGRST205"||/relation .*cb_seba_(folders|materials).* does not exist|schema cache/i.test(message))fail(503,"Teacher library is not ready. Run supabase/0078_seba_teacher_library.sql in Supabase SQL Editor.");fail(500,message)}return result.data};
      const validId=(value:unknown)=>/^[a-f0-9]{8}-[a-f0-9-]{27}$/i.test(String(value||""));
      if(action==="library-list"){
        const [folders,materials]=await Promise.all([
          q(client.from("cb_seba_folders").select("id,name,created_at").eq("teacher_id",userId).order("created_at")),
          q(client.from("cb_seba_materials").select("id,folder_id,name,fen,annotations,source_puzzle_id,hint,solution,updated_at").eq("teacher_id",userId).order("updated_at",{ascending:false}).limit(300))
        ]);
        return res.status(200).json({folders,materials});
      }
      const roomId=String(body.room_id||"");
      if(!validId(roomId))fail(400,"Choose an active classroom.");
      const room=await q(client.from("cb_classroom_rooms").select("id").eq("id",roomId).eq("teacher_id",userId).eq("status","active").gt("expires_at",new Date().toISOString()).maybeSingle());
      if(!room)fail(403,"Only the active teacher can edit teaching materials.");
      if(action==="library-folder-create"){
        const name=String(body.name||"").trim().slice(0,60);if(!name)fail(400,"Name your folder.");
        const folder=await q(client.from("cb_seba_folders").insert({teacher_id:userId,name}).select("id,name").single());
        return res.status(200).json({folder});
      }
      if(action==="library-folder-rename"){
        if(!validId(body.folder_id))fail(400,"Choose a folder.");
        const name=String(body.name||"").trim().slice(0,60);if(!name)fail(400,"Name your folder.");
        const folder=await q(client.from("cb_seba_folders").update({name}).eq("teacher_id",userId).eq("id",String(body.folder_id)).select("id,name").maybeSingle());
        if(!folder)fail(404,"Folder not found.");return res.status(200).json({folder});
      }
      if(action==="library-save"){
        const folderId=String(body.folder_id||"");if(!validId(folderId))fail(400,"Choose a folder.");
        const folder=await q(client.from("cb_seba_folders").select("id").eq("id",folderId).eq("teacher_id",userId).maybeSingle());
        if(!folder)fail(403,"This is not your folder.");
        const name=String(body.name||"").trim().slice(0,90);if(!name)fail(400,"Name the material.");
        let fen=String(body.fen||"");try{fen=new Chess(fen==="start"?undefined:fen,{skipValidation:true}).fen()}catch{fail(400,"Invalid board position.")}
        const material=await q(client.from("cb_seba_materials").insert({teacher_id:userId,folder_id:folderId,name,fen,
          annotations:Array.isArray(body.annotations)?body.annotations.slice(0,120):[],
          source_puzzle_id:String(body.source_puzzle_id||"").slice(0,90)||null,
          hint:String(body.hint||"").slice(0,500),solution:Array.isArray(body.solution)?body.solution.slice(0,30).map((move:unknown)=>String(move).slice(0,5)):[]
        }).select("id").single());
        return res.status(200).json({material});
      }
      if(action==="library-rename"){
        const id=String(body.material_id||""),name=String(body.name||"").trim().slice(0,90);if(!validId(id)||!name)fail(400,"Choose and name a material.");
        const material=await q(client.from("cb_seba_materials").update({name,updated_at:new Date().toISOString()}).eq("id",id).eq("teacher_id",userId).select("id").maybeSingle());
        if(!material)fail(404,"Material not found.");return res.status(200).json({material});
      }
      fail(400,"Unknown material action.");
    }
    if(action==="voice-token"){
      const roomId=String(body.room_id||""),now=new Date().toISOString();
      if(!roomId)fail(400,"Classroom is required.");
      const room=await client.from("cb_classroom_rooms").select("id,teacher_id,status,expires_at").eq("id",roomId).eq("status","active").gt("expires_at",now).maybeSingle();
      if(room.error)fail(500,room.error.message);
      const voiceRoom=room.data;
      if(!voiceRoom)fail(404,"Active classroom not found.");
      const teacher=voiceRoom!.teacher_id===userId;
      if(!teacher){
        if(!await activeEnrollment(roomId,userId,now,await freeClassroom()))fail(403,"Your classroom access has expired. Renew with 1 CBC.");
      }
      const livekitUrl=process.env.LIVEKIT_URL||"",apiKey=process.env.LIVEKIT_API_KEY||"",apiSecret=process.env.LIVEKIT_API_SECRET||"";
      if(!livekitUrl||!apiKey||!apiSecret)fail(503,"SEba Voice is not configured. Add the LiveKit Cloud environment variables.");
      const profile=await client.from("cb_profiles").select("display_name,username").eq("user_id",userId).maybeSingle();
      if(profile.error)fail(500,profile.error.message);
      const participantName=String(profile.data?.display_name||profile.data?.username||(teacher?"Teacher":"Student")).slice(0,80);
      const accessToken=new AccessToken(apiKey,apiSecret,{identity:userId,name:participantName,ttl:"10m",metadata:JSON.stringify({role:teacher?"teacher":"student"})});
      accessToken.addGrant({roomJoin:true,room:`seba-${roomId}`,canPublish:true,canPublishSources:[TrackSource.MICROPHONE,TrackSource.CAMERA],canSubscribe:true,canPublishData:true});
      return res.status(200).json({server_url:livekitUrl,participant_token:await accessToken.toJwt()});
    }
    if(action==="media-control"){
      const roomId=String(body.room_id||""),operation=String(body.operation||""),studentId=String(body.student_id||"");
      if(!/^[a-f0-9-]{36}$/i.test(roomId)||!["mute-all","mute-student","request-unmute","close-all-cameras","ack-hand"].includes(operation))fail(400,"Invalid classroom media action.");
      const active=await client.from("cb_classroom_rooms").select("id").eq("id",roomId).eq("teacher_id",userId).eq("status","active").gt("expires_at",new Date().toISOString()).maybeSingle();
      if(active.error)fail(500,active.error.message);
      if(!active.data)fail(403,"Only this room's active teacher can control class media.");
      if(["mute-student","request-unmute","ack-hand"].includes(operation)){
        if(!/^[a-f0-9-]{36}$/i.test(studentId))fail(400,"Choose a student.");
        if(!await activeEnrollment(roomId,studentId,new Date().toISOString(),await freeClassroom()))fail(404,"Student is no longer in this classroom.");
      }
      const livekitUrl=process.env.LIVEKIT_URL||"",apiKey=process.env.LIVEKIT_API_KEY||"",apiSecret=process.env.LIVEKIT_API_SECRET||"";
      if(!livekitUrl||!apiKey||!apiSecret)fail(503,"SEba media is not configured.");
      const service=new RoomServiceClient(livekitUrl.replace(/^wss:/,"https:").replace(/^ws:/,"http:"),apiKey,apiSecret),liveRoom=`seba-${roomId}`;
      const people=await service.listParticipants(liveRoom);
      if(["mute-student","request-unmute","ack-hand"].includes(operation)&&!people.some(person=>person.identity===studentId))fail(409,"This student is not connected to class media.");
      const targets=people.filter(person=>operation==="close-all-cameras"||operation==="mute-all"?operation==="close-all-cameras"||person.identity!==userId:person.identity===studentId);
      if(operation==="mute-all"||operation==="mute-student"||operation==="close-all-cameras"){
        const source=operation==="close-all-cameras"?TrackSource.CAMERA:TrackSource.MICROPHONE;
        await Promise.all(targets.flatMap(person=>person.tracks.filter(track=>track.source===source&&!track.muted).map(track=>service.mutePublishedTrack(liveRoom,person.identity,track.sid,true))));
      }
      const command=operation==="mute-all"||operation==="mute-student"?"media:mute":operation==="close-all-cameras"?"media:camera-off":operation==="request-unmute"?"media:unmute-request":"hand:ack";
      await service.sendData(liveRoom,new TextEncoder().encode(command),DataPacket_Kind.RELIABLE,{destinationIdentities:operation==="mute-student"||operation==="request-unmute"||operation==="ack-hand"?[studentId]:operation==="mute-all"?people.filter(person=>person.identity!==userId).map(person=>person.identity):people.map(person=>person.identity)});
      return res.status(200).json({ok:true,affected:targets.length});
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
      const joinedIds=validJoined.map((row:any)=>row.room.id);
      const trainingRooms=joinedIds.length?await client.from("cb_online_trainings").select("room_id").in("room_id",joinedIds):{data:[],error:null};
      if(trainingRooms.error)fail(500,trainingRooms.error.message);
      const trainingIds=new Set((trainingRooms.data||[]).map((row:any)=>row.room_id));
      return res.status(200).json({wallet:wallet.data,gold:profile.data?.gold_points||0,settings:settings.data,owned:(owned.data||[]).map((r:any)=>({...r,student_count:byRoom[r.id]||0})),joined:validJoined.map((row:any)=>({...row,room:{...row.room,training_room:trainingIds.has(row.room.id)}})),active:active.data||[]});
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
      if(typeof body.cbc_enabled!=="boolean")fail(400,"Choose whether CBC is enabled.");
      const existing=await client.from("cb_classroom_settings").select("*").eq("id",true).single();if(existing.error)fail(500,existing.error.message);
      const schemaReady=Object.hasOwn(existing.data||{},"cbc_enabled");
      if(!schemaReady&&body.cbc_enabled===false)fail(409,"Apply the classroom database update before enabling free access.");
      const patch:Record<string,number|boolean|string>={id:true,updated_at:new Date().toISOString()};if(schemaReady)patch.cbc_enabled=body.cbc_enabled as boolean;
      for(const key of keys){const value=Number(body[key]);if(!Number.isInteger(value)||value<0||value>1000000)fail(400,`Invalid ${key}.`);patch[key]=value;}
      const saved=await client.from("cb_classroom_settings").upsert(patch).select("*").single();if(saved.error)fail(500,saved.error.message);return res.status(200).json({settings:{...saved.data,cbc_enabled:saved.data.cbc_enabled!==false}});
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
      const training=await client.from("cb_online_trainings").select("id").eq("room_id",roomId).maybeSingle();
      if(training.error)fail(500,training.error.message);
      if(training.data)fail(409,"Ask the training owner to remove your registration if you need to leave this class.");
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
      const trainingRoom=await client.from("cb_online_trainings").select("id").eq("room_id",roomId).maybeSingle();
      if(trainingRoom.error)fail(500,trainingRoom.error.message);
      const free=await freeClassroom();
      if(!teacher&&!await activeEnrollment(roomId,userId,now,free,true))fail(403,"Your eight-minute CBC grace period ended. Renew in Classroom to rejoin.");
      await client.from("cb_classroom_workspaces").upsert({room_id:roomId},{onConflict:"room_id",ignoreDuplicates:true});
      const [workspace,enrollments,boards,wallet,economy,profile,lessonLog]=await Promise.all([
        client.from("cb_classroom_workspaces").select("*").eq("room_id",roomId).single(),
        client.from("cb_classroom_enrollments").select("student_id,access_expires_at").eq("room_id",roomId),
        client.from("cb_classroom_student_boards").select("*").eq("room_id",roomId),
        client.from("cb_classroom_wallets").select("cbc").eq("user_id",userId).maybeSingle(),
        client.from("cb_classroom_settings").select("*").eq("id",true).single(),
        client.from("cb_profiles").select("gold_points,display_name,username").eq("user_id",userId).single(),
        teacher?client.from("cb_classroom_lesson_events").select("id,scope,student_id,fen,annotations,label,created_at").eq("room_id",roomId).order("created_at",{ascending:false}).limit(100):Promise.resolve({data:[],error:null})
      ]);
      for(const result of [workspace,enrollments,boards,wallet,economy,profile,lessonLog])if(result.error)fail(500,result.error.message);
      const admitted=(enrollments.data||[]).filter((row:any)=>free||row.access_expires_at>now||(Date.parse(row.access_expires_at)+8*60_000>Date.parse(now)&&(teacher||row.student_id===userId)));
      const studentIds=admitted.map((row:any)=>row.student_id);
      const profiles=studentIds.length?await client.from("cb_profiles").select("user_id,display_name,username,avatar_url").in("user_id",studentIds):{data:[],error:null};
      if(profiles.error)fail(500,profiles.error.message);
      const profileMap=new Map((profiles.data||[]).map((p:any)=>[p.user_id,p]));
      const boardMap=new Map((boards.data||[]).map((b:any)=>[b.student_id,b]));
      const students=admitted.map((e:any)=>({...(profileMap.get(e.student_id)||{user_id:e.student_id,display_name:"Student"}),access_expires_at:e.access_expires_at,board:boardMap.get(e.student_id)||{room_id:roomId,student_id:e.student_id,fen:"start",free_movement:false,version:0}}));
      return res.status(200).json({role:teacher?"teacher":"student",room:{...room.data,training_room:!!trainingRoom.data},workspace:workspace.data,students,lesson_log:(lessonLog.data||[]).filter((event:any)=>event.label!=="Student move starting position"),own_student_id:teacher?null:userId,coach_name:teacher?(profile.data?.display_name||profile.data?.username||"Coach"):null,wallet:{cbc:wallet.data?.cbc||0},economy:{gold:profile.data?.gold_points||0,cbc_gold_price:economy.data?.cbc_gold_price||0,cbc_enabled:economy.data?.cbc_enabled!==false,classroom_features_ready:Object.hasOwn(economy.data||{},"cbc_enabled")}});
    }
    if(action==="set-student-movement"){
      const roomId=String(body.room_id||""),studentId=String(body.student_id||""),now=new Date().toISOString();
      if(!/^[a-f0-9-]{36}$/i.test(roomId)||!/^[a-f0-9-]{36}$/i.test(studentId)||typeof body.unlocked!=="boolean")fail(400,"Choose a valid student and movement mode.");
      const room=await client.from("cb_classroom_rooms").select("id").eq("id",roomId).eq("teacher_id",userId).eq("status","active").gt("expires_at",now).maybeSingle();
      if(room.error)fail(500,room.error.message);if(!room.data)fail(403,"Only this room's teacher can unlock student boards.");
      if(!await activeEnrollment(roomId,studentId,now,await freeClassroom()))fail(404,"Student is no longer active in this classroom.");
      const board=await client.from("cb_classroom_student_boards").upsert({room_id:roomId,student_id:studentId,free_movement:body.unlocked,updated_by:userId,updated_at:now},{onConflict:"room_id,student_id"}).select("*").single();
      if(board.error)fail(500,board.error.message);
      return res.status(200).json({board:board.data});
    }
    if(action==="takeback-student"){
      const roomId=String(body.room_id||""),studentId=String(body.student_id||""),shared=body.shared===true,now=new Date().toISOString();
      if(!/^[a-f0-9-]{36}$/i.test(roomId)||!/^[a-f0-9-]{36}$/i.test(studentId))fail(400,"Choose a valid student and room.");
      const room=await client.from("cb_classroom_rooms").select("id").eq("id",roomId).eq("teacher_id",userId).eq("status","active").gt("expires_at",now).maybeSingle();
      if(room.error)fail(500,room.error.message);if(!room.data)fail(403,"Only the active teacher can take back student moves.");
      const free=await freeClassroom();
      if(!await activeEnrollment(roomId,studentId,now,free))fail(404,"Student is no longer active in this classroom.");
      if(shared){const active=await client.from("cb_classroom_enrollments").select("student_id",{count:"exact",head:true}).eq("room_id",roomId).gt("access_expires_at",free?"1970-01-01T00:00:00Z":now);if(active.error)fail(500,active.error.message);if(active.count!==1)fail(409,"Shared takeback requires a one-on-one session.");}
      const table=shared?"cb_classroom_workspaces":"cb_classroom_student_boards";
      const board=await client.from(table).select("fen").eq("room_id",roomId).eq(shared?"room_id":"student_id",shared?roomId:studentId).maybeSingle();
      if(board.error)fail(500,board.error.message);const currentFen=board.data?.fen;if(!currentFen)fail(409,"Student board has not been created yet.");
      const history=await client.from("cb_classroom_lesson_events").select("id,scope,student_id,fen,label,created_at").eq("room_id",roomId).order("id",{ascending:false}).limit(500);
      if(history.error)fail(500,history.error.message);
      const scope=shared?"shared":"student",moves:{id:number;before:string;after:string;created_at:string}[]=[];let before="",beforeId=0,beforeAt="";
      for(const event of (history.data||[]).reverse()){
        if(event.scope==="assignment"&&(!event.student_id||event.student_id===studentId)&&(!shared||event.label.startsWith("Puzzle assigned"))) {moves.length=0;before="";continue;}
        if(shared&&event.scope==="master"){moves.length=0;before="";continue;}
        if(event.scope!==scope||event.student_id!==studentId)continue;
        if(event.label==="Student move starting position"){before=event.fen;beforeId=event.id;beforeAt=event.created_at;continue;}
        if(event.label==="Student moved a piece"||shared&&event.label==="Student moved on the shared board"){
          if(before&&before!==event.fen)moves.push({id:beforeId,before,after:event.fen,created_at:beforeAt});before="";
        }else if(event.label==="Teacher took back student move"){while(moves.length&&moves.at(-1)?.after!==event.fen)moves.pop();before="";}
        else {moves.length=0;before="";}
      }
      if(body.list===true)return res.status(200).json({positions:currentFen===moves.at(-1)?.after?moves.map((move,index)=>({id:move.id,fen:move.before,created_at:move.created_at,move_number:index+1})).reverse():[]});
      const last=moves.at(-1),targetId=body.target_event_id===undefined?last?.id:Number(body.target_event_id),target=moves.find(move=>move.id===targetId),beforeFen=target?.before,afterFen=last?.after;
      if(!beforeFen||!afterFen||currentFen!==afterFen)fail(409,"This move position is no longer available. Refresh the history.");
      const updated=await client.from(table).update({fen:beforeFen,updated_by:userId,updated_at:now}).eq("room_id",roomId).eq("fen",afterFen).select("fen").maybeSingle();
      if(updated.error)fail(500,updated.error.message);if(!updated.data)fail(409,"The board changed. Try again after it syncs.");
      const logged=await client.from("cb_classroom_lesson_events").insert({room_id:roomId,actor_id:userId,scope,student_id:studentId,fen:beforeFen,annotations:[],label:"Teacher took back student move"});
      if(logged.error)fail(500,logged.error.message);
      return res.status(200).json({fen:beforeFen,shared});
    }
    if(action==="workshop-update"){
      const roomId=String(body.room_id||""),kind=String(body.kind||""),now=new Date().toISOString();
      const room=await client.from("cb_classroom_rooms").select("teacher_id,status,expires_at").eq("id",roomId).single();
      if(room.error||!room.data||room.data.status!=="active"||room.data.expires_at<=now)return fail(404,"Active classroom not found.");
      const teacher=room.data.teacher_id===userId;
      const free=await freeClassroom();
      if(!teacher&&!await activeEnrollment(roomId,userId,now,free))fail(403,"Your classroom access has expired.");
      const fen=String(body.fen||"start");if(fen.length>160)fail(400,"Invalid board position.");
      if(["assign-puzzle","reset-puzzle","assign-board"].includes(kind)){
        if(!teacher)fail(403,"Only the teacher can assign student boards.");
        let assignedFen=fen;
        if(kind==="reset-puzzle"){
          const lastPuzzle=await client.from("cb_classroom_lesson_events").select("fen").eq("room_id",roomId).eq("scope","assignment").like("label","Puzzle assigned to%").order("created_at",{ascending:false}).limit(1).maybeSingle();
          if(lastPuzzle.error)fail(500,lastPuzzle.error.message);
          if(!lastPuzzle.data)return fail(409,"Assign a puzzle before resetting student boards.");
          assignedFen=lastPuzzle.data.fen;
        }
        const targetStudentId=kind==="reset-puzzle"?String(body.student_id||""):"";
        if(targetStudentId&&!/^[a-f0-9-]{36}$/i.test(targetStudentId))fail(400,"Choose a valid student.");
        const enrollmentQuery=client.from("cb_classroom_enrollments").select("student_id").eq("room_id",roomId).gt("access_expires_at",free?"1970-01-01T00:00:00Z":now);
        const enrollments=await (targetStudentId?enrollmentQuery.eq("student_id",targetStudentId):enrollmentQuery);
        if(enrollments.error)fail(500,enrollments.error.message);
        const assignments=(enrollments.data||[]).map(row=>({room_id:roomId,student_id:row.student_id,fen:assignedFen,annotations:[],updated_by:userId,updated_at:now}));
        if(assignments.length){
          const saved=await client.from("cb_classroom_student_boards").upsert(assignments,{onConflict:"room_id,student_id"});
          if(saved.error)fail(500,saved.error.message);
        }
        const label=kind==="assign-puzzle"?`Puzzle assigned to ${assignments.length} student${assignments.length===1?"":"s"}`:kind==="reset-puzzle"?`Puzzle reset for ${assignments.length} student${assignments.length===1?"":"s"}`:`Teacher board sent to ${assignments.length} student${assignments.length===1?"":"s"}`;
        const logged=await client.from("cb_classroom_lesson_events").insert({room_id:roomId,actor_id:userId,scope:"assignment",student_id:targetStudentId||null,fen:assignedFen,annotations:[],label});
        if(logged.error)fail(500,logged.error.message);
        return res.status(200).json({assigned:assignments.length,fen:assignedFen});
      }
      if(kind==="reset-own-board"){
        if(teacher)fail(403,"Only students can reset their own practice board.");
        const saved=await client.from("cb_classroom_student_boards").upsert({
          room_id:roomId,student_id:userId,fen:"start",annotations:[],updated_by:userId,updated_at:now
        },{onConflict:"room_id,student_id"}).select("*").single();
        if(saved.error)fail(500,saved.error.message);
        const logged=await client.from("cb_classroom_lesson_events").insert({
          room_id:roomId,actor_id:userId,scope:"student",student_id:userId,
          fen:"start",annotations:[],label:"Student reset their practice board"
        });
        if(logged.error)fail(500,logged.error.message);
        return res.status(200).json({board:saved.data});
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
        const activeCount=await client.from("cb_classroom_enrollments").select("student_id",{count:"exact",head:true}).eq("room_id",roomId).gt("access_expires_at",free?"1970-01-01T00:00:00Z":now);
        if(activeCount.error)fail(500,activeCount.error.message);if(activeCount.count!==1)fail(409,"Shared board is available only for one-on-one sessions.");
        const movement=await client.from("cb_classroom_student_boards").select("*").eq("room_id",roomId).eq("student_id",userId).maybeSingle();if(movement.error)fail(500,movement.error.message);
        const previous=await client.from("cb_classroom_workspaces").select("fen").eq("room_id",roomId).single();if(previous.error)fail(500,previous.error.message);
        if(!movement.data?.free_movement&&!legalStudentMove(previous.data?.fen||"start",fen))fail(400,"Your board is locked to one legal White move at a time.");
        if(previous.data?.fen!==fen){const snapshot=await client.from("cb_classroom_lesson_events").insert({room_id:roomId,actor_id:userId,scope:"shared",student_id:userId,fen:previous.data?.fen||"start",annotations:[],label:"Student move starting position"});if(snapshot.error)fail(500,snapshot.error.message);}
        const saved=await client.from("cb_classroom_workspaces").update({fen,updated_by:userId,updated_at:now}).eq("room_id",roomId).select("*").single();
        if(saved.error)fail(500,saved.error.message);const logged=await client.from("cb_classroom_lesson_events").insert({room_id:roomId,actor_id:userId,scope:"shared",student_id:userId,fen,annotations:saved.data.annotations||[],label:"Student moved on the shared board"});if(logged.error)fail(500,logged.error.message);return res.status(200).json({workspace:saved.data});
      }
      if(kind==="student"){
        const studentId=teacher?String(body.student_id||""):userId;
        if(!await activeEnrollment(roomId,studentId,now,free))fail(403,"Student classroom access is not active.");
        const boardPatch:Record<string,unknown>={room_id:roomId,student_id:studentId,fen,updated_by:userId,updated_at:now};
        if(teacher&&Array.isArray(body.annotations))boardPatch.annotations=body.annotations.slice(0,80);
        if(!teacher){const previous=await client.from("cb_classroom_student_boards").select("*").eq("room_id",roomId).eq("student_id",studentId).maybeSingle();if(previous.error)fail(500,previous.error.message);if(!previous.data?.free_movement&&!legalStudentMove(previous.data?.fen||"start",fen))fail(400,"Your board is locked to one legal White move at a time.");if((previous.data?.fen||"start")!==fen){const snapshot=await client.from("cb_classroom_lesson_events").insert({room_id:roomId,actor_id:userId,scope:"student",student_id:studentId,fen:previous.data?.fen||"start",annotations:[],label:"Student move starting position"});if(snapshot.error)fail(500,snapshot.error.message);}}
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
    if(action==="gift-room-cbc"){
      const roomId=String(body.room_id||""),studentId=String(body.student_id||""),quantity=Number(body.quantity||0),now=new Date().toISOString();
      if(!Number.isInteger(quantity)||quantity<1||quantity>1000)fail(400,"Choose 1 to 1000 CBC.");
      const room=await client.from("cb_classroom_rooms").select("teacher_id").eq("id",roomId).eq("status","active").gt("expires_at",now).maybeSingle();
      if(room.error)fail(500,room.error.message);
      if(room.data?.teacher_id!==userId)fail(403,"Only this classroom teacher can gift CBC.");
      if(!await activeEnrollment(roomId,studentId,now,await freeClassroom(),true))fail(400,"Select an enrolled student within their renewal window.");
      const profile=await client.from("cb_profiles").select("username").eq("user_id",studentId).single();
      if(profile.error||!profile.data?.username)fail(400,"Student username unavailable.");
      const result=await client.rpc("cb_gift_cbc",{p_sender_id:userId,p_username:profile.data.username,p_quantity:quantity,p_request_id:String(body.request_id||"")});
      if(result.error)fail(400,result.error.message);
      return res.status(200).json(result.data);
    }
    if(action==="gift-cbc"){
      const result=await client.rpc("cb_gift_cbc",{p_sender_id:userId,p_username:String(body.username||""),p_quantity:Number(body.quantity||0),p_request_id:String(body.request_id||"")});if(result.error)fail(400,result.error.message);return res.status(200).json(result.data);
    }
    fail(400,"Unknown classroom action.");
  }catch(error){const e=error as Error&{status?:number};res.status(e.status||500).json({error:e.message||"Classroom request failed."});}
}
