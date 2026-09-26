"use client";
import {useCallback,useEffect,useState} from "react";
import {getSupabase, type PlayerProfile} from "./supabase";
import {uploadStaffImage,validateImageFile} from "./media";
import "./online-training.css";

type Category="u12"|"u15"|"u20"|"all";
type Training={id:string;title:string;coach_name:string;poster_url:string;starts_at:string;capacity:number;category:Category;invitation_text:string;registered:number;confirmed:number};
type Registrant={id:string;full_name:string;birthdate:string;confirmed:boolean;invited_at:string|null;invite_token:string};
type Managed=Training&{status:string;registrants:Registrant[]};
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

export function OnlineTrainings({profile,initialId="",invite="",onCreateAccount}:{profile?:PlayerProfile|null;initialId?:string;invite?:string;onCreateAccount?:()=>void}){
 const[trainings,setTrainings]=useState<Training[]>([]),[selected,setSelected]=useState(initialId),[name,setName]=useState(profile?.display_name??""),[birthdate,setBirthdate]=useState(""),[busy,setBusy]=useState(false),[status,setStatus]=useState(""),[error,setError]=useState("");
 const load=useCallback(async()=>{try{setError("");setTrainings(await rpc<Training[]>("cb_training_public",{p_id:initialId||null}));}catch(e){setError((e as Error).message);}},[initialId]);
 useEffect(()=>{void load();},[load]);
 useEffect(()=>{setSelected(initialId);},[initialId]);
 const training=trainings.find(item=>item.id===selected);
 async function join(){if(!training)return;setBusy(true);setError("");try{validateAge(training,birthdate);const result=await rpc<string>("cb_training_register",{p_id:training.id,p_full_name:name.trim(),p_birthdate:birthdate,p_invite:invite||null});setStatus(result==="confirmed"?"Your training place is confirmed with your Chess Burger account.":"Request received, but your place is not confirmed yet. The owner will share an invitation link. Create or sign in to your Chess Burger account and accept that invitation to finish registration.");await load();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <section className="online-training-page">
  <header className="online-training-heading"><img src="/cburger_logo.png" alt=""/><div><small>CHESS BURGER · FREE LEARNING</small><h1>Online Trainings</h1><p>Choose a session and register for free.</p></div></header>
  {error&&<p className="online-training-error" role="alert">{error}</p>}{status&&<p className="online-training-success" role="status">{status}</p>}
  {!training&&<div className="online-training-grid">{trainings.map(item=><button className="online-training-card" type="button" key={item.id} onClick={()=>setSelected(item.id)}>
   {item.poster_url?<img src={item.poster_url} alt={`${item.title} poster`}/>:<span className="online-training-placeholder">♟</span>}
   <span><small>{categoryLabels[item.category]} · FREE</small><strong>{item.title}</strong><em>{new Date(item.starts_at).toLocaleString()} · {item.confirmed}/{item.capacity} confirmed</em><b>View training →</b></span>
  </button>)}{!trainings.length&&!error&&<p>No training sessions are open right now.</p>}</div>}
  {training&&<article className="online-training-details"><button className="online-training-back" type="button" onClick={()=>setSelected("")}>← All trainings</button>
   {training.poster_url&&<img className="online-training-poster" src={training.poster_url} alt={`${training.title} event poster`}/>}
   <div className="online-training-info"><small>{categoryLabels[training.category]} · FREE TRAINING</small><h2>{training.title}</h2><p>{training.invitation_text||"Join the Chess Burger online training session."}</p>
   <dl><div><dt>Coach</dt><dd>{training.coach_name}</dd></div><div><dt>Schedule</dt><dd>{new Date(training.starts_at).toLocaleString()}</dd></div><div><dt>Participants</dt><dd>{training.confirmed} confirmed · {training.registered}/{training.capacity} registered</dd></div></dl>
   <div className="online-training-join-layout"><div className="online-training-form"><h3>{invite?"Accept your invitation":profile?"Register for free":"Request an invitation"}</h3>
    {!profile&&!invite&&<p>A Chess Burger account is required to confirm your training place. You can send a request now; the owner will invite you to complete registration.</p>}
    {invite&&!profile&&<p>Sign in or create your Chess Burger account to confirm this personal invitation.</p>}
    <label>Complete name<input autoComplete="name" maxLength={80} value={name} onChange={e=>setName(e.target.value)} required/></label>
    <label>Birthdate<input type="date" value={birthdate} max={new Date().toISOString().slice(0,10)} onChange={e=>setBirthdate(e.target.value)} required/></label>
    <button type="button" disabled={busy||!name.trim()||!birthdate||(!!invite&&!profile)||!!status} onClick={()=>void join()}>{busy?"Submitting…":invite?"Confirm invitation":profile?"Join training":"Request invitation"}</button>
    {!profile&&onCreateAccount&&<button className="online-training-secondary" type="button" onClick={onCreateAccount}>Open Chess Burger and create an account</button>}
   </div><TrainingInstallCard/></div></div></article>}
 </section>;
}

export function OnlineTrainingCms({profile}:{profile:PlayerProfile}){
 const[events,setEvents]=useState<Managed[]>([]),[id,setId]=useState<string|null>(null),[title,setTitle]=useState(""),[coach,setCoach]=useState(""),[startsAt,setStartsAt]=useState(""),[capacity,setCapacity]=useState(20),[category,setCategory]=useState<Category>("all"),[poster,setPoster]=useState(""),[message,setMessage]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const load=useCallback(async()=>{try{setEvents(await rpc<Managed[]>("cb_training_manage"));}catch(e){setError((e as Error).message);}},[]);
 useEffect(()=>{void load();},[load]);
 function edit(event:Managed){setId(event.id);setTitle(event.title);setCoach(event.coach_name);setStartsAt(new Date(new Date(event.starts_at).getTime()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16));setCapacity(event.capacity);setCategory(event.category);setPoster(event.poster_url);setMessage(event.invitation_text);}
 function reset(){setId(null);setTitle("");setCoach("");setStartsAt("");setCapacity(20);setCategory("all");setPoster("");setMessage("");}
 async function save(){setBusy(true);setError("");try{const created=await rpc<string>("cb_training_save",{p_id:id,p_title:title,p_coach_name:coach,p_poster_url:poster,p_starts_at:new Date(startsAt).toISOString(),p_capacity:capacity,p_category:category,p_invitation_text:message});await load();setNotice(`Training published. Share this registration link: ${link(created)}`);await navigator.clipboard.writeText(link(created)).catch(()=>{});reset();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function upload(file:File){setBusy(true);setError("");try{validateImageFile(file);setPoster(await uploadStaffImage(file,profile.user_id));setNotice("Poster uploaded. Publish the training to make it visible.");}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function inviteRegistrant(reg:Registrant,event:Managed){setBusy(true);setError("");try{const token=await rpc<string>("cb_training_invite",{p_registration_id:reg.id});const url=link(event.id,token);await navigator.clipboard.writeText(url);setNotice(`Invitation for ${reg.full_name} copied. Share this link with the registrant: ${url}`);await load();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <section className="cms-panel online-training-cms"><header><small>OWNER CONTROL</small><h2>Online Trainings</h2><p>Create a free session and personalize its invitation.</p></header>
  {error&&<p className="online-training-error" role="alert">{error}</p>}{notice&&<p className="online-training-success" role="status">{notice}</p>}
  <div className="online-training-fields"><label>Event name<input value={title} maxLength={100} onChange={e=>setTitle(e.target.value)}/></label><label>Coach name<input value={coach} maxLength={80} onChange={e=>setCoach(e.target.value)}/></label>
   <label>Date and time<input type="datetime-local" value={startsAt} onChange={e=>setStartsAt(e.target.value)}/></label><label>Participant limit<input type="number" min={1} max={500} value={capacity} onChange={e=>setCapacity(Number(e.target.value))}/></label>
   <label>Age category<select value={category} onChange={e=>setCategory(e.target.value as Category)}>{Object.entries(categoryLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
   <label>Poster image<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e=>{const file=e.target.files?.[0];if(file)void upload(file);}}/></label></div>
  {poster&&<img className="online-training-cms-poster" src={poster} alt="Training poster preview"/>}
  <label>Personal invitation text<textarea value={message} maxLength={500} onChange={e=>setMessage(e.target.value)} placeholder="Tell registrants what to expect…"/></label>
  <div className="cms-actions"><button disabled={busy||!title.trim()||!coach.trim()||!startsAt} onClick={()=>void save()}>{busy?"Saving…":id?"Update online training":"Create online training & copy link"}</button>{id&&<button onClick={reset}>Cancel edit</button>}</div>
  <div className="online-training-managed">{events.map(event=><article key={event.id}><h3>{event.title}</h3><p>{new Date(event.starts_at).toLocaleString()} · {categoryLabels[event.category]} · {event.registrants.length}/{event.capacity} registered</p><div className="cms-actions"><button onClick={()=>edit(event)}>Edit</button><button onClick={()=>void navigator.clipboard.writeText(link(event.id)).then(()=>setNotice(`Registration link copied: ${link(event.id)}`)).catch(()=>setError("Could not copy the link."))}>Copy registration link</button></div>
   <h4>Registrants</h4>{event.registrants.map(reg=><div className="online-training-registrant" key={reg.id}><span><b>{reg.full_name}</b><small>{reg.confirmed?"Confirmed Chess Burger user":reg.invited_at?"Invited · awaiting account":"Awaiting invitation"}</small></span>{!reg.confirmed&&<button disabled={busy} onClick={()=>void inviteRegistrant(reg,event)}>Invite & copy link</button>}</div>)}{!event.registrants.length&&<p>No registrants yet.</p>}</article>)}</div>
 </section>;
}
