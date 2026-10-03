"use client";
import {useCallback,useEffect,useState} from "react";
import {getSupabase, type PlayerProfile} from "./supabase";
import {uploadStaffImage,validateImageFile} from "./media";
import "./online-training.css";

type Category="u12"|"u15"|"u20"|"all";
type PackageKind="pawn"|"bishop"|"knight"|"rook"|"queen"|"king";
type PaymentMode="free"|"paid"|"hidden";
type Training={id:string;title:string;coach_name:string;poster_url:string;starts_at:string;capacity:number;category:Category;invitation_text:string;registered:number;confirmed:number;payment_mode:PaymentMode;price_php:number;package_kind:PackageKind|null};
type Registrant={id:string;full_name:string;birthdate:string;confirmed:boolean;approved:boolean;rejected:boolean;rejection_reason:string|null;username:string|null;invited_at:string|null;invite_token:string};
type MyTrainingStatus={id:string;training_id:string;title:string;starts_at:string;approved_at:string|null;rejected_at:string|null;rejection_reason:string|null;room_id:string|null};
type Managed=Training&{status:string;cbc_reward:number;room_id:string|null;room_code:string|null;registrants:Registrant[]};
const packages:{kind:PackageKind;slots:number;duration:string}[]=[
 {kind:"pawn",slots:5,duration:"12 hours"},{kind:"bishop",slots:10,duration:"1 day"},
 {kind:"knight",slots:15,duration:"3 days"},{kind:"rook",slots:20,duration:"5 days"},
 {kind:"queen",slots:30,duration:"7 days"},{kind:"king",slots:40,duration:"14 days"}];
const peso=(value:number)=>new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP"}).format(value);
const feeLabel=(training:Training)=>training.payment_mode==="paid"?peso(training.price_php):training.payment_mode==="free"?"FREE":null;
type InstallEvent=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:"accepted"|"dismissed"}>};
const categoryLabels:Record<Category,string>={u12:"Under 12",u15:"Under 15",u20:"Under 20",all:"All ages"};
const link=(id:string,token?:string)=>`${location.origin}/#training=${encodeURIComponent(id)}${token?`&invite=${encodeURIComponent(token)}`:""}`;
async function rpc<T>(name:string,args:Record<string,unknown>={}){
 const client=await getSupabase();if(!client)throw Error("Training registration is unavailable. Please try again.");
 const {data,error}=await client.rpc(name,args);if(error)throw Error(error.message);return data as T;
}
function ageAt(date:string,birthdate:string){const start=new Date(date),birth=new Date(`${birthdate}T12:00:00`);let age=start.getFullYear()-birth.getFullYear();if(start.getMonth()<birth.getMonth()||(start.getMonth()===birth.getMonth()&&start.getDate()<birth.getDate()))age--;return age;}
function validateAge(training:Training,birthdate:string){const age=ageAt(training.starts_at,birthdate),limit=training.category==="u12"?12:training.category==="u15"?15:training.category==="u20"?20:Infinity;if(!birthdate||!Number.isFinite(age)||age<0||age>=limit)throw Error(`Birthdate does not meet the ${categoryLabels[training.category]} category.`);}

function TrainingInstallCard(){
 const [installEvent,setInstallEvent]=useState<InstallEvent|null>(null),[installed,setInstalled]=useState(false),[busy,setBusy]=useState(false),[instructions,setInstructions]=useState("");
 useEffect(()=>{
  setInstalled(window.matchMedia("(display-mode: standalone)").matches||Boolean((navigator as Navigator&{standalone?:boolean}).standalone));
  const capture=(event:Event)=>{event.preventDefault();setInstallEvent(event as InstallEvent);};
  const complete=()=>{setInstalled(true);setInstallEvent(null);};
  window.addEventListener("beforeinstallprompt",capture);
  window.addEventListener("appinstalled",complete);
  return()=>{window.removeEventListener("beforeinstallprompt",capture);window.removeEventListener("appinstalled",complete);};
 },[]);
 async function install(){
  setInstructions("");
  if(!installEvent){
   setInstructions(/iphone|ipad|ipod/i.test(navigator.userAgent)?"Tap Share in Safari, then Add to Home Screen.":"Open your browser menu and choose Install app or Add to Home screen.");
   return;
  }
  setBusy(true);
  try{
   await installEvent.prompt();
   const choice=await installEvent.userChoice;
   setInstructions(choice.outcome==="accepted"?"Installation started. Find Chess Burger on your home screen.":"You can install Chess Burger from your browser menu anytime.");
  }catch{setInstructions("Open your browser menu and choose Install app or Add to Home screen.");}
  finally{setInstallEvent(null);setBusy(false);}
 }
 if(installed)return null;
 return <aside className="online-training-install" aria-labelledby="online-training-install-title">
  <img src="/chess-burger-installer.webp" alt="Chess Burger app and download icon" width={176} height={176}/>
  <small>YOUR CHESS APP, ONE TAP AWAY</small>
  <h3 id="online-training-install-title">Install <span>CHESS BURGER</span></h3>
  <p>Keep your training and games close. Add Chess Burger to your device.</p>
  <button type="button" onClick={()=>void install()} disabled={busy}>{busy?"Opening installer…":"Install app"}</button>
  {instructions&&<p className="online-training-install-help" role="status">{instructions}</p>}
 </aside>;
}

export function OnlineTrainings({profile,initialId="",invite="",onCreateAccount,onOpenClassroom}:{profile?:PlayerProfile|null;initialId?:string;invite?:string;onCreateAccount?:()=>void;onOpenClassroom?:()=>void}){
 const[trainings,setTrainings]=useState<Training[]>([]),[selected,setSelected]=useState(initialId),[name,setName]=useState(profile?.display_name??""),[birthdate,setBirthdate]=useState("");
 const[busy,setBusy]=useState(false),[status,setStatus]=useState(""),[error,setError]=useState("");
 const[roster,setRoster]=useState<Managed|null>(null),[myStatuses,setMyStatuses]=useState<MyTrainingStatus[]>([]);
 const load=useCallback(async()=>{try{setError("");setTrainings(await rpc<Training[]>("cb_training_public",{p_id:initialId||null}));}catch(e){setError((e as Error).message);}},[initialId]);
 useEffect(()=>{void load();},[load]);
 useEffect(()=>setSelected(initialId),[initialId]);
 useEffect(()=>{if(!profile?.user_id)return;let active=true;const refresh=async()=>{try{const rows=await rpc<MyTrainingStatus[]>("cb_training_my_status");if(active)setMyStatuses(rows)}catch{}};void refresh();const timer=window.setInterval(()=>{if(document.visibilityState==="visible")void refresh()},60_000);const onVisible=()=>{if(document.visibilityState==="visible")void refresh()};document.addEventListener("visibilitychange",onVisible);return()=>{active=false;window.clearInterval(timer);document.removeEventListener("visibilitychange",onVisible)}},[profile?.user_id]);
 const training=trainings.find(item=>item.id===selected);
 const decision=myStatuses.find(item=>item.training_id===selected);
 async function join(){
  if(!training||!profile?.username)return;
  setBusy(true);setError("");
  try{
   validateAge(training,birthdate);
   const result=await rpc<string>("cb_training_register",{p_id:training.id,p_full_name:name.trim(),p_birthdate:birthdate,p_invite:invite||null});
   setStatus(result==="approved"?"Approved! Check the schedule and be on time. Open Classroom, tap Student, then enter your approved session.":result==="rejected"?"This registration was not accepted. Ask the coach for details or try another session.":"Registration received. The owner will review it; paid trainings require payment verification before approval.");
   setMyStatuses(await rpc<MyTrainingStatus[]>("cb_training_my_status").catch(()=>[]));await load();
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 async function showRegistrants(event:Training){
  if(roster?.id===event.id){setRoster(null);return;}
  setBusy(true);setError("");
  try{const managed=await rpc<Managed[]>("cb_training_manage");setRoster(managed.find(item=>item.id===event.id)??null);}
  catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 async function approve(reg:Registrant,event:Training){
  if(!window.confirm(`Approve ${reg.full_name} for "${event.title}"? Confirm any peso payment has been received. The student will join the room and receive the training CBC award.`))return;
  setBusy(true);setError("");setStatus("");
  try{
   await rpc("cb_training_approve",{p_registration_id:reg.id});
   setStatus(`${reg.full_name} approved and added to the classroom.`);
   window.dispatchEvent(new Event("cb-profile-saved"));await showRegistrantsReload(event.id);await load();
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 async function showRegistrantsReload(eventId:string){
  const managed=await rpc<Managed[]>("cb_training_manage");setRoster(managed.find(item=>item.id===eventId)??null);
 }
 async function rejectRegistrant(reg:Registrant,event:Training){
  const reason=window.prompt(`Optional reason for ${reg.full_name} (up to 250 characters):`,"")?.trim();
  if(reason===undefined||reason.length>250)return;
  if(!window.confirm(`Decline ${reg.full_name}'s registration for "${event.title}"? They will be notified.`))return;
  setBusy(true);setError("");setStatus("");
  try{await rpc("cb_training_reject",{p_registration_id:reg.id,p_reason:reason});await showRegistrantsReload(event.id);await load();setStatus(`${reg.full_name} was notified that this registration was not accepted.`);}
  catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 async function removeRegistrant(reg:Registrant,event:Training){
  if(!window.confirm(`Remove ${reg.full_name} from "${event.title}"? Classroom access will be removed; CBC already awarded remains in the student's wallet.`))return;
  setBusy(true);setError("");setStatus("");
  try{await rpc("cb_training_remove",{p_registration_id:reg.id});await showRegistrantsReload(event.id);await load();setStatus(`${reg.full_name} removed.`);}
  catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <section className="online-training-page">
  <header className="online-training-heading"><img src="/cburger_logo.png" alt=""/><div><small>CHESS BURGER · LIVE LEARNING</small><h1>Online Trainings</h1><p>Choose a class and send your registration for owner approval.</p></div></header>
  {error&&<p className="online-training-error" role="alert">{error}</p>}{status&&<p className="online-training-success" role="status">{status}</p>}
  {!training&&<div className="online-training-grid">{trainings.map(item=><button className="online-training-card" type="button" key={item.id} onClick={()=>setSelected(item.id)}>
   {item.poster_url?<img src={item.poster_url} alt={`${item.title} poster`}/>:<span className="online-training-placeholder">♟</span>}
   <span><small>{categoryLabels[item.category]}{feeLabel(item)&&` · ${feeLabel(item)}`}</small><strong>{item.title}</strong><em>{new Date(item.starts_at).toLocaleString()} · {item.confirmed}/{item.capacity} approved</em><b>View training →</b></span>
  </button>)}{!trainings.length&&!error&&<p>{initialId?"This registration link has been deleted or is no longer available.":"No training sessions are open right now."}</p>}</div>}
  {training&&<article className="online-training-details"><button className="online-training-back" type="button" onClick={()=>setSelected("")}>← All trainings</button>
   {training.poster_url&&<img className="online-training-poster" src={training.poster_url} alt={`${training.title} event poster`}/>}
   <div className="online-training-info"><small>{categoryLabels[training.category]}{feeLabel(training)&&` · ${training.payment_mode==="paid"?"PAID · ":""}${feeLabel(training)}`}</small>
    <div className="online-training-title-row"><h2>{training.title}</h2>{profile?.role==="owner"&&<button className="online-training-roster-toggle" type="button" disabled={busy} aria-expanded={roster?.id===training.id} onClick={()=>void showRegistrants(training)}>{roster?.id===training.id?"Hide registrants":`View registrants (${training.registered})`}</button>}</div>
    <p>{training.invitation_text||"Join the Chess Burger online training session."}</p>
    <dl><div><dt>Coach</dt><dd>{training.coach_name}</dd></div><div><dt>Schedule</dt><dd>{new Date(training.starts_at).toLocaleString()}</dd></div><div><dt>Room</dt><dd>{training.package_kind?`Room ${training.package_kind} · ${training.capacity} students`:"Assigned by owner"}</dd></div><div><dt>Places</dt><dd>{training.confirmed} approved · {training.registered}/{training.capacity} registered</dd></div></dl>
    {decision?.approved_at&&<aside className="training-decision approved" role="status"><strong>Registration approved</strong><p>Check the schedule: {new Date(decision.starts_at).toLocaleString()}. Please be on time. Open Classroom, tap <b>Student</b>, then tap your approved session under <b>Enrolled sessions</b>.</p>{onOpenClassroom&&<button type="button" onClick={onOpenClassroom}>Go to Classroom → Student</button>}</aside>}
    {(decision?.rejected_at||decision&&!decision.approved_at&&Date.parse(decision.starts_at)<=Date.now())&&<aside className="training-decision declined" role="status"><strong>Registration not approved</strong><p>{decision?.rejection_reason||"You can try the next online training session or ask the coach or teacher for clarification."}</p></aside>}
    {decision&&!decision.approved_at&&!decision.rejected_at&&Date.parse(decision.starts_at)>Date.now()&&<aside className="training-decision pending" role="status"><strong>Awaiting owner approval</strong><p>We will notify you here when the owner reviews your registration.</p></aside>}
    {roster?.id===training.id&&<section className="online-training-roster" aria-label="Training registrants"><h3>Registration review</h3><ul>{roster.registrants.map(reg=><li key={reg.id}><span><strong>{reg.full_name}</strong><small>{reg.username?`@${reg.username}`:"Account pending"} · {reg.approved?"Approved and enrolled":reg.rejected?"Not accepted":"Awaiting approval"}</small></span><div className="online-training-registrant-actions">{!reg.approved&&!reg.rejected&&<button disabled={busy||!reg.confirmed} onClick={()=>void approve(reg,training)}>Approve</button>}{!reg.approved&&!reg.rejected&&<button disabled={busy} onClick={()=>void rejectRegistrant(reg,training)}>Not accepted</button>}<button className="online-training-remove" disabled={busy} onClick={()=>void removeRegistrant(reg,training)}>Remove</button></div></li>)}</ul></section>}
    <div className="online-training-join-layout"><div className="online-training-form">
     {!profile?<div className="online-training-account-gate"><small>STEP 1 · CHESS BURGER ACCOUNT</small><h3>Join Chess Burger first</h3><p>Complete your app registration, then return to this training link to submit your class registration. Visiting this link does not reserve a place.</p>{onCreateAccount&&<button className="online-training-secondary" type="button" onClick={onCreateAccount}>Create account or sign in</button>}</div>:<>
      <h3>Register for this class</h3>
      {training.payment_mode==="paid"&&<p className="online-training-payment-note">Fee: <strong>{peso(training.price_php)}</strong>. The owner will verify your payment before approving your place. Follow the payment instructions from the owner.</p>}
      <label>Complete name<input autoComplete="name" maxLength={80} value={name} onChange={e=>setName(e.target.value)} required/></label>
      <label>Chess Burger username<input value={`@${profile.username}`} readOnly aria-label="Your Chess Burger username"/></label>
      <label>Birthdate<input type="date" value={birthdate} max={new Date().toISOString().slice(0,10)} onChange={e=>setBirthdate(e.target.value)} required/></label>
      <button type="button" disabled={busy||!profile.username||!name.trim()||!birthdate||!!status} onClick={()=>void join()}>{busy?"Submitting…":invite?"Confirm invitation":"Submit registration for approval"}</button>
     </>}
    </div><TrainingInstallCard/></div></div></article>}
 </section>;
}

export function OnlineTrainingCms({profile}:{profile:PlayerProfile}){
 const[events,setEvents]=useState<Managed[]>([]),[id,setId]=useState<string|null>(null),[title,setTitle]=useState(""),[coach,setCoach]=useState(""),[startsAt,setStartsAt]=useState("");
 const[packageKind,setPackageKind]=useState<PackageKind>("bishop"),[category,setCategory]=useState<Category>("all"),[poster,setPoster]=useState(""),[message,setMessage]=useState("");
 const[paymentMode,setPaymentMode]=useState<PaymentMode>("free"),[price,setPrice]=useState(0),[reward,setReward]=useState(0);
 const[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const load=useCallback(async()=>{try{setEvents(await rpc<Managed[]>("cb_training_manage"));}catch(e){setError((e as Error).message);}},[]);
 useEffect(()=>{void load();},[load]);
 function edit(event:Managed){setId(event.id);setTitle(event.title);setCoach(event.coach_name);setStartsAt(new Date(new Date(event.starts_at).getTime()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16));setPackageKind(event.package_kind??"bishop");setCategory(event.category);setPoster(event.poster_url);setMessage(event.invitation_text);setPaymentMode(event.payment_mode??"free");setPrice(Number(event.price_php)||0);setReward(event.cbc_reward||0);}
 function reset(){setId(null);setTitle("");setCoach("");setStartsAt("");setPackageKind("bishop");setCategory("all");setPoster("");setMessage("");setPaymentMode("free");setPrice(0);setReward(0);}
 async function save(){
  setBusy(true);setError("");setNotice("");
  try{
   const saved=await rpc<string>("cb_training_save_v2",{p_id:id,p_title:title.trim(),p_coach_name:coach.trim(),p_poster_url:poster,p_starts_at:new Date(startsAt).toISOString(),p_package:packageKind,p_category:category,p_invitation_text:message,p_payment_mode:paymentMode,p_price_php:paymentMode==="paid"?price:0,p_cbc_reward:reward});
   await load();window.dispatchEvent(new Event("cb-profile-saved"));
   setNotice(`Training published and classroom created. Registration link copied: ${link(saved)}`);
   await navigator.clipboard.writeText(link(saved)).catch(()=>{});reset();
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 async function upload(file:File){setBusy(true);setError("");try{validateImageFile(file);setPoster(await uploadStaffImage(file,profile.user_id));setNotice("Poster uploaded. Save the training to publish it.");}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function inviteRegistrant(reg:Registrant,event:Managed){setBusy(true);setError("");try{const token=await rpc<string>("cb_training_invite",{p_registration_id:reg.id});const url=link(event.id,token);await navigator.clipboard.writeText(url);setNotice(`Invitation for ${reg.full_name} copied: ${url}`);await load();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function approve(reg:Registrant,event:Managed){
  if(!window.confirm(`Approve ${reg.full_name} for "${event.title}"? Verify any payment described in the poster before approval. This enrolls the student and transfers ${event.cbc_reward} CBC from your balance.`))return;
  setBusy(true);setError("");
  try{await rpc("cb_training_approve",{p_registration_id:reg.id});await load();window.dispatchEvent(new Event("cb-profile-saved"));setNotice(`${reg.full_name} approved and enrolled. ${event.cbc_reward} CBC awarded.`);}
  catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 async function rejectRegistrant(reg:Registrant,event:Managed){
  const reason=window.prompt(`Optional reason for ${reg.full_name} (up to 250 characters):`,"")?.trim();
  if(reason===undefined||reason.length>250)return;
  if(!window.confirm(`Decline ${reg.full_name}'s registration for "${event.title}"?`))return;
  setBusy(true);setError("");
  try{await rpc("cb_training_reject",{p_registration_id:reg.id,p_reason:reason});await load();setNotice(`${reg.full_name} was notified that this registration was not accepted.`);}
  catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 async function removeRegistrant(reg:Registrant,event:Managed){
  if(!window.confirm(`Remove ${reg.full_name} from "${event.title}"? Classroom access will be removed; awarded CBC remains with the student.`))return;
  setBusy(true);setError("");
  try{await rpc("cb_training_remove",{p_registration_id:reg.id});await load();setNotice(`${reg.full_name} removed.`);}
  catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 async function remove(event:Managed){
  if(!window.confirm(`Permanently delete "${event.title}" and its registration link? All invitation links become invalid, registrations are removed, and the classroom closes. CBC already awarded stays with students.`))return;
  setBusy(true);setError("");
  try{await rpc("cb_training_delete",{p_id:event.id});await load();if(id===event.id)reset();setNotice(`"${event.title}" deleted. Its registration and invitation links no longer work; the classroom is closed.`);}
  catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 const current=packages.find(item=>item.kind===packageKind)!;
 return <section className="cms-panel online-training-cms"><header><small>OWNER CONTROL</small><h2>Online Trainings</h2><p>Schedule a free or paid class with a linked classroom room.</p></header>
  {error&&<p className="online-training-error" role="alert">{error}</p>}{notice&&<p className="online-training-success" role="status">{notice}</p>}
  <div className="online-training-fields"><label>Event and room name<input value={title} maxLength={60} onChange={e=>setTitle(e.target.value)}/></label><label>Coach name<input value={coach} maxLength={80} onChange={e=>setCoach(e.target.value)}/></label>
   <label>Date and time<input type="datetime-local" value={startsAt} onChange={e=>setStartsAt(e.target.value)}/></label><label>Age category<select value={category} onChange={e=>setCategory(e.target.value as Category)}>{Object.entries(categoryLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
   <label>Poster image<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e=>{const file=e.target.files?.[0];if(file)void upload(file);}}/></label>
   <label>CBC awarded per approved student<input type="number" min={0} max={1000} step={1} value={reward} onChange={e=>setReward(Number(e.target.value))}/></label></div>
  <fieldset className="online-training-choice"><legend>Classroom room session</legend><div className="online-training-package-grid">{packages.map(item=><label key={item.kind} className={packageKind===item.kind?"selected":""}><input type="radio" name="training-package" checked={packageKind===item.kind} disabled={!!id&&!!events.find(e=>e.id===id)?.room_id} onChange={()=>setPackageKind(item.kind)}/><strong>Room {item.kind}</strong><small>{item.slots} students · {item.duration}</small></label>)}</div><p>Creates the room when you publish. The owner pays the configured room package in CBG. The room expires {current.duration} after the scheduled start.</p></fieldset>
  <fieldset className="online-training-choice"><legend>Training fee</legend><div className="online-training-mode"><label><input type="radio" name="training-mode" checked={paymentMode==="free"} onChange={()=>setPaymentMode("free")}/> Free</label><label><input type="radio" name="training-mode" checked={paymentMode==="paid"} onChange={()=>setPaymentMode("paid")}/> Paid</label><label><input type="radio" name="training-mode" checked={paymentMode==="hidden"} onChange={()=>setPaymentMode("hidden")}/> Hide fee</label></div>{paymentMode==="paid"&&<label>Price per student (PHP)<input type="number" min={0.01} max={1000000} step={0.01} value={price} onChange={e=>setPrice(Number(e.target.value))}/></label>}<p>{paymentMode==="hidden"?"No Free/Paid label or price appears in the app. Explain the terms in your event poster.":paymentMode==="paid"?"Verify payment yourself before approving. The app does not collect the training fee.":"Students see this training as free."}</p></fieldset>
  {poster&&<img className="online-training-cms-poster" src={poster} alt="Training poster preview"/>}
  <label>Invitation and payment instructions<textarea value={message} maxLength={500} onChange={e=>setMessage(e.target.value)} placeholder="Describe the class and, if paid, tell students how to pay…"/></label>
  <div className="cms-actions"><button disabled={busy||title.trim().length<3||!coach.trim()||!startsAt||!Number.isInteger(reward)||reward<0||reward>1000||(paymentMode==="paid"&&(!Number.isFinite(price)||price<=0||message.trim().length<10))} onClick={()=>void save()}>{busy?"Saving…":id?"Update online training":"Create training and room"}</button>{id&&<button onClick={reset}>Cancel edit</button>}</div>
  <div className="online-training-managed">{events.map(event=><article key={event.id}><div className="online-training-managed-heading"><h3>{event.title}</h3><b>{event.payment_mode==="hidden"?"FEE HIDDEN":event.payment_mode==="paid"?peso(event.price_php):"FREE"}</b></div><p>{new Date(event.starts_at).toLocaleString()} · Room {event.package_kind??"not linked"} · {event.registrants.filter(reg=>reg.approved).length}/{event.capacity} approved · {event.cbc_reward} CBC per approval</p><div className="cms-actions"><button type="button" disabled={busy} onClick={()=>edit(event)}>Edit</button><button type="button" disabled={busy} onClick={()=>void navigator.clipboard.writeText(link(event.id)).then(()=>setNotice(`Registration link copied: ${link(event.id)}`)).catch(()=>setError("Could not copy the link."))}>Copy link</button><button className="online-training-delete" type="button" disabled={busy} onClick={()=>void remove(event)}>Delete training & link</button></div>
   {event.room_code&&<p className="online-training-room-note">Classroom: {event.title} · room code {event.room_code}. Approved students see it in Classroom → Student portal.</p>}
   <h4>Registrants</h4>{event.registrants.map(reg=><div className="online-training-registrant" key={reg.id}><span><b>{reg.full_name}</b><small className={reg.approved?"online-training-account-active":undefined}>{reg.approved?`@${reg.username} · Approved and enrolled`:reg.rejected?"Not accepted · student notified":reg.confirmed?`@${reg.username} · Awaiting approval`:reg.invited_at?"Invited · awaiting account":"Awaiting account"}</small></span><div className="online-training-registrant-actions">{!reg.confirmed&&<button disabled={busy} onClick={()=>void inviteRegistrant(reg,event)}>Invite & copy link</button>}{reg.confirmed&&!reg.approved&&!reg.rejected&&<button disabled={busy} onClick={()=>void approve(reg,event)}>Approve · {event.cbc_reward} CBC</button>}{!reg.approved&&!reg.rejected&&<button disabled={busy} onClick={()=>void rejectRegistrant(reg,event)}>Not accepted</button>}<button className="online-training-remove" type="button" disabled={busy} onClick={()=>void removeRegistrant(reg,event)}>Remove</button></div></div>)}{!event.registrants.length&&<p>No registrants yet.</p>}</article>)}</div>
 </section>;
}
