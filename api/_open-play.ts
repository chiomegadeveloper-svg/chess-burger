/* eslint-disable @typescript-eslint/no-explicit-any */
const migration='Open Play needs supabase/0102_chess_open_play.sql applied in Supabase.';
const uuid=/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
export async function openPlay(client:any,account:{id:string;profile:any},action:string,body:Record<string,any>,fail:(status:number,message:string)=>never){
 const check=(result:any)=>{if(result.error)fail(/schema cache|does not exist|could not find/i.test(result.error.message)?503:409,/schema cache|does not exist|could not find/i.test(result.error.message)?migration:result.error.message);return result.data;};
 if(action==='open-play-list'){
  const sessions=check(await client.rpc('cb_list_open_play',{p_user:account.id}));
  return {sessions,owner:account.profile.role==='owner'};
 }
 const id=body.id==null?null:String(body.id);
 if(id!==null&&!uuid.test(id))fail(400,'Choose a valid Open Play session.');
 if(action==='open-play-join'||action==='open-play-leave'){
  if(!id)fail(400,'Choose an Open Play session.');check(await client.rpc('cb_join_open_play',{p_user:account.id,p_session:id,p_join:action==='open-play-join'}));return {ok:true};
 }
 if(account.profile.role!=='owner')fail(403,'Only an owner can manage Open Play.');
 if(action==='open-play-cancel'){
  if(!id)fail(400,'Choose an Open Play session.');check(await client.rpc('cb_cancel_open_play',{p_owner:account.id,p_session:id}));return {ok:true};
 }
 if(action!=='open-play-save')fail(404,'Unknown Open Play request.');
 const lat=Number(body.lat),lng=Number(body.lng),bonus=Number(body.bonus_percent),capacity=body.capacity==null?null:Number(body.capacity);
 if(body.lat==null||body.lng==null||!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180||!Number.isInteger(bonus)||bonus<0||bonus>100||(capacity!==null&&(!Number.isInteger(capacity)||capacity<1||capacity>10000)))fail(400,'Choose a valid pin, promo from 0–100%, and joiner limit.');
 const start=new Date(String(body.starts_at)),end=new Date(String(body.ends_at));
 if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||start.getTime()<=Date.now()||end<=start)fail(400,'Choose a future start time and a later end time.');
 // Location always derives from the pin; a failed reverse lookup still gives an
 // exact, usable location. Do not trust an owner-supplied location label.
 let location=`${lat.toFixed(6)}, ${lng.toFixed(6)}`;
 try{
  const response=await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&lat=${lat}&lon=${lng}`,{headers:{'User-Agent':'ChessBurgerOpenPlay/1.0 (https://chessburger.site)','Accept-Language':'en'},signal:AbortSignal.timeout(3000)});
  if(response.ok){const result=await response.json() as {display_name?:unknown};if(typeof result.display_name==='string'&&result.display_name.trim())location=result.display_name.slice(0,300);}
 }catch{/* Coordinates remain the automatic location fallback. */}
 const saved=check(await client.rpc('cb_save_open_play',{p_owner:account.id,p_id:id,p_lat:lat,p_lng:lng,p_location:location,p_start:start.toISOString(),p_end:end.toISOString(),p_bonus:bonus,p_capacity:capacity}));
 return {session:saved};
}
