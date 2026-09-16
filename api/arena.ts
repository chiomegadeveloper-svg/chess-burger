import { admin, errorBody, json, userFromRequest } from "./_supabase";

const now = () => new Date().toISOString();
const unlocked = (p: any) => {
  const level = p.cbr >= 955001 ? 20 : p.cbr >= 590001 ? 19 : p.cbr >= 365001 ? 18 : p.cbr >= 226001 ? 17 : p.cbr >= 140001 ? 16 : p.cbr >= 86501 ? 15 : p.cbr >= 53501 ? 14 : p.cbr >= 33001 ? 13 : p.cbr >= 20381 ? 12 : p.cbr >= 12585 ? 11 : p.cbr >= 7745 ? 10 : p.cbr >= 4753 ? 9 : p.cbr >= 2905 ? 8 : p.cbr >= 1761 ? 7 : p.cbr >= 1057 ? 6 : p.cbr >= 617 ? 5 : p.cbr >= 353 ? 4 : p.cbr >= 177 ? 3 : p.cbr >= 89 ? 2 : 1;
  const out:string[]=[]; if(level>=2)out.push("rookie-flame");if(p.wins>=3)out.push("knights-steel");if(p.wins+p.losses>=10)out.push("burger-blitz");if(level>=5)out.push("golden-pawn");if(p.cbr-88>=100)out.push("cbr-climber");if(p.wins>=10)out.push("neon-board");if(level>=10)out.push("burger-master");if(p.win_streak>=3)out.push("silver-rook");if(level>=15)out.push("golden-king");if(p.cbr-88>=500)out.push("cb-champion");if(p.win_streak>=5)out.push("flaming-queen");if(p.wins>=25)out.push("cyber-knight");if(level>=20)out.push("burger-crown");if(p.cbr>=1000)out.push("grandmaster-gold");if(p.wins>=100)out.push("cb-supreme");return out;
};
async function profileFor(userId:string) {
 const {data,error}=await admin().from("cb_profiles").select("*").eq("user_id",userId).maybeSingle();
 if(error)throw error;if(!data)throw new Error("Save your player profile first.");return data;
}
const staff=(p:any)=>p.role==="owner"||p.role==="admin";
export default async function arena(request:Request) {
 try {
  const publicRequest=request.method==="GET";
  const input:any=publicRequest?Object.fromEntries(new URL(request.url).searchParams):(await request.json());
  const action=String(input.action??"");
  const db=admin();
  if(publicRequest) {
   if(action==="feed") {
    const {data,error}=await db.from("cb_feed").select("*").or("expires_at.is.null,expires_at.gt."+now()).order("created_at",{ascending:false}).limit(50);
    if(error)throw error;return json({events:data??[]});
   }
   if(action==="ranks") {
    const {data,error}=await db.from("cb_profiles").select("user_id,username,display_name,avatar_url,country_code,cbr,gold_points,wins,losses,win_streak").order("cbr",{ascending:false}).order("wins",{ascending:false}).limit(10);
    if(error)throw error;return json({players:data??[]});
   }
   if(action==="app-feature") {
    const {data,error}=await db.from("cb_app_settings").select("value").eq("key","app_feature").maybeSingle();
    if(error)throw error;return json({image_url:String(data?.value?.image_url??"")});
   }
   return json({error:"Unknown public action."},404);
  }
  const user=await userFromRequest(request),p=await profileFor(user.id);
  if(action==="me")return json({profile:p});
  if(action==="rewards")return json({unlocked:unlocked(p)});
  if(action==="heart"||action==="hearts") {
   if(action==="hearts") {const{data,error}=await db.from("cb_feed_reactions").select("feed_id").eq("user_id",user.id);if(error)throw error;return json({ids:(data??[]).map(x=>x.feed_id)});}
   const feedId=String(input.id??"");if(!feedId)throw new Error("Feed item is required.");
   if(input.liked) {const{error}=await db.from("cb_feed_reactions").upsert({feed_id:feedId,user_id:user.id},{onConflict:"feed_id,user_id"});if(error)throw error;}
   else {const{error}=await db.from("cb_feed_reactions").delete().eq("feed_id",feedId).eq("user_id",user.id);if(error)throw error;}
   return json({ok:true});
  }
  if(["cms-announcements","save-announcement","delete-announcement","set-app-feature"].includes(action)&&!staff(p))return json({error:"Owner or GM access is required."},403);
  if(action==="cms-announcements") {
   const{data,error}=await db.from("cb_feed").select("id,content,image_url,expires_at").eq("kind","announcement").or("expires_at.is.null,expires_at.gt."+now()).order("created_at",{ascending:false});if(error)throw error;return json({posts:data??[]});
  }
  if(action==="save-announcement") {
   const content=String(input.content??"").trim().slice(0,500),image_url=String(input.image_url??"").trim().slice(0,2048),expires_at=String(input.expires_at??"");if(!content&&!image_url)throw new Error("Add text or an image.");if(!expires_at||Date.parse(expires_at)<=Date.now())throw new Error("Choose a future end date.");
   const id=String(input.id??"");const payload={user_id:user.id,kind:"announcement",display_name:"Chess Burger",content,image_url,expires_at,created_at:now()};
   const q=id?db.from("cb_feed").update({content,image_url,expires_at}).eq("id",id).select().single():db.from("cb_feed").insert(payload).select().single();
   const {data,error}=await q;if(error)throw error;await db.from("cb_admin_logs").insert({actor_user_id:user.id,action:id?"announcement_update":"announcement_create",details:{id:data.id,expires_at}});return json({ok:true,post:data});
  }
  if(action==="delete-announcement") {const id=String(input.id??"");const{error}=await db.from("cb_feed").delete().eq("id",id).eq("kind","announcement");if(error)throw error;return json({ok:true});}
  if(action==="set-app-feature") {const image_url=String(input.url??"").trim();const{error}=await db.from("cb_app_settings").upsert({key:"app_feature",value:{image_url},updated_at:now()});if(error)throw error;return json({ok:true});}
  return json({error:"This Vercel action is still being migrated."},501);
 } catch(error) {return errorBody(error);}
}