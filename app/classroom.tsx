"use client";
import {useCallback,useEffect,useState} from "react";
import {ArrowLeft,BookOpen,Clock,Copy,GraduationCap,KeyRound,RefreshCw,ShoppingBag,Users} from "lucide-react";
import {toast} from "sonner";
import {classroom} from "./classroom-client";
import "./classroom.css";
import "./classroom-timed-access.css";

const PACKAGES=[
  {kind:"pawn",name:"Room Pawn",slots:5,hours:12},
  {kind:"bishop",name:"Room Bishop",slots:10,hours:24},
  {kind:"knight",name:"Room Knight",slots:15,hours:72},
  {kind:"rook",name:"Room Rook",slots:20,hours:120},
  {kind:"queen",name:"Room Queen",slots:30,hours:168},
  {kind:"king",name:"Room King",slots:40,hours:336},
] as const;
type Room={id:string;name:string;package_kind:string;invite_code:string;max_students:number;student_count?:number;cbc_included?:number;expires_at:string;status?:string;teacher?:{display_name?:string;username?:string;avatar_url?:string};students?:Array<{count:number}>};
type Settings={cbc_gold_price:number}&Record<`${string}_${"cbg"|"cbc"}`,number>;
type Enrollment={joined_at:string;access_expires_at:string;room:Room};
type State={wallet:{cbc:number};gold:number;settings:Settings;owned:Room[];joined:Enrollment[];active:Room[]};
const duration=(hours:number)=>hours<24?`${hours} hours`:hours===24?"1 day":hours===168?"1 week":hours===336?"2 weeks":`${hours/24} days`;
const activeStudentAccess=(state:State|null)=>state?.joined?.some(({access_expires_at,room})=>new Date(access_expires_at).getTime()>Date.now()&&room.status!=="closed"&&new Date(room.expires_at).getTime()>Date.now())??false;

export default function Classroom({onBack,onOpenShop}:{onBack:()=>void;onOpenShop:()=>void}){
  const [role,setRole]=useState<""|"teacher"|"student">("");
  const [state,setState]=useState<State|null>(null),[busy,setBusy]=useState(false),[selected,setSelected]=useState("pawn"),[name,setName]=useState(""),[code,setCode]=useState("");
  const load=useCallback(()=>classroom<State>("state").then(setState).catch(e=>toast.error(e.message)),[]);
  useEffect(()=>{void load()},[load]);
  const teacherActive=(state?.owned?.length??0)>0,studentActive=activeStudentAccess(state);
  const chooseRole=(next:"teacher"|"student")=>{
    if(next==="student"&&teacherActive)return toast.error("Student access is locked while you have an active teacher session.");
    if(next==="teacher"&&studentActive)return toast.error("Teacher access is locked while you are active as a student.");
    setRole(next);
  };
  const create=async()=>{if(!name.trim())return toast.error("Name your Room Session.");setBusy(true);try{const result=await classroom<{room:Room}>("create",{package:selected,name,request_id:crypto.randomUUID()});toast.success(`${result.room.name} created`,{description:`Student code: ${result.room.invite_code}`});setName("");await load()}catch(e){toast.error(e instanceof Error?e.message:"Unable to create room.")}finally{setBusy(false)}};
  const join=async()=>{setBusy(true);try{const result=await classroom<{room:Room}>("join",{code:code.trim().toUpperCase(),request_id:crypto.randomUUID()});toast.success(`Welcome to ${result.room.name}`);setCode("");await load()}catch(e){toast.error(e instanceof Error?e.message:"Unable to join room.")}finally{setBusy(false)}};
  const extend=async(room:Room)=>{setBusy(true);try{await classroom("extend-access",{room_id:room.id,request_id:crypto.randomUUID()});toast.success("30 classroom minutes added",{description:"1 CBC was used from My Bag."});await load()}catch(e){toast.error(e instanceof Error?e.message:"Unable to extend classroom access.")}finally{setBusy(false)}};
  const rename=async(room:Room)=>{const next=window.prompt("Rename Room Session",room.name)?.trim();if(!next||next===room.name)return;setBusy(true);try{await classroom("rename",{room_id:room.id,name:next});toast.success("Room renamed.");await load()}catch(e){toast.error(e instanceof Error?e.message:"Unable to rename room.")}finally{setBusy(false)}};
  return <section className="classroom-page">
    <button className="back-button" type="button" onClick={role?()=>setRole(""):onBack}><ArrowLeft size={15}/>{role?"Student Lobby":"Play selection"}</button>
    <header className="classroom-hero"><span>CHESSBURGER LEARNING</span><h1>Classroom</h1><p>Create welcoming chess rooms or join your instructor with a private code.</p></header>
    {!role?<div className="classroom-role-grid">
      <button disabled={studentActive} aria-disabled={studentActive} title={studentActive?"Finish your active student access before becoming a teacher.":undefined} onClick={()=>chooseRole("teacher")}><img src="/classroom/teacher.webp" alt="Chess instructor"/><span><small>CREATE & TEACH</small><strong>Teacher</strong><b>{studentActive?"Locked while active as Student":"Open instructor tools"}</b></span></button>
      <button disabled={teacherActive} aria-disabled={teacherActive} title={teacherActive?"Your active teacher session must end before entering as a student.":undefined} onClick={()=>chooseRole("student")}><img src="/classroom/student.webp" alt="Chess student"/><span><small>JOIN & LEARN</small><strong>Student</strong><b>{teacherActive?"Locked while teaching":"Enter a classroom"}</b></span></button>
    </div>:<>
      <div className="classroom-wallets">
        <article><img src="/classroom/cbc-token.webp" alt="CBC token"/><span><small>CLASSROOM CREDITS</small><strong>{state?.wallet?.cbc??0} CBC</strong></span></article>
        <article><span><small>CHESSBURGER GOLD</small><strong>{state?.gold??0} CBG</strong></span></article>
        <button type="button" onClick={onOpenShop}>Open Shop</button>
      </div>
      {role==="teacher"?<div className="classroom-columns">
        <section className="classroom-panel"><div className="panel-title"><GraduationCap/><span><small>TEACHER DESK</small><h2>Create Room Session</h2></span></div><div className="room-packages">{PACKAGES.map(p=>{const cbg=state?.settings?.[`${p.kind}_cbg`]??0,cbc=state?.settings?.[`${p.kind}_cbc`]??0;return <button key={p.kind} className={selected===p.kind?"selected":""} onClick={()=>setSelected(p.kind)}><b>{p.name}</b><span><Users size={13}/>{p.slots} students</span><span><Clock size={13}/>{duration(p.hours)}</span><strong>{cbg&&cbc?`${cbg.toLocaleString()} CBG · includes ${cbc.toLocaleString()} CBC`:"Awaiting owner setup"}</strong></button>})}</div><label>Room Session name<input maxLength={60} value={name} onChange={e=>setName(e.target.value)} placeholder="Example: Coach Maria's Endgames"/></label><button className="classroom-primary" disabled={busy} onClick={()=>void create()}>{busy?"Creating…":"Create Room Session"}</button></section>
        <section className="classroom-panel"><div className="panel-title"><BookOpen/><span><small>CLASSROOM SESSION TAB</small><h2>Your active rooms</h2></span></div><div className="session-list">{state?.owned?.length?state.owned.map(r=><article key={r.id}><div><small>{r.package_kind.toUpperCase()}</small><h3>{r.name}</h3><span>{r.student_count??0}/{r.max_students} students · package added {r.cbc_included??0} CBC to your Bag · ends {new Date(r.expires_at).toLocaleString()}</span></div><button onClick={()=>navigator.clipboard.writeText(r.invite_code).then(()=>toast.success("Code copied"))}><KeyRound size={14}/>{r.invite_code}<Copy size={12}/></button><button onClick={()=>void rename(r)}>Rename</button></article>):<p className="empty-room">No active Room Sessions yet.</p>}</div></section>
      </div>:<div className="classroom-student-area"><header className="student-lobby-heading"><div><small>CHESSBURGER LEARNING</small><h2>Student Lobby</h2><p>Use your instructor’s private code and continue your active classes.</p></div><button type="button" disabled={busy} onClick={()=>void load()}><RefreshCw size={15}/>Refresh</button></header><div className="classroom-columns">
        <section className="classroom-panel join-panel"><div className="panel-title"><KeyRound/><span><small>PRIVATE CLASS CODE</small><h2>Join a Room Session</h2></span></div><div className="student-credit-status"><img src="/classroom/cbc-token.webp" alt="CBC"/><span><small>30-MINUTE CLASS CREDITS</small><strong>{state?.wallet?.cbc??0} CBC</strong></span><button type="button" onClick={onOpenShop}><ShoppingBag size={14}/>Buy CBC</button></div><p>Every 1 CBC gives you 30 minutes inside a Room Session. When your time expires, use another CBC to continue. Your teacher can gift CBC to your username.</p><label>8-character classroom code<input maxLength={8} value={code} onChange={e=>setCode(e.target.value.replace(/[^a-z0-9]/gi,"").toUpperCase())} placeholder="PAWN1234" autoCapitalize="characters"/></label><button className="classroom-primary" disabled={busy||code.length!==8||(state?.wallet?.cbc??0)<1} onClick={()=>void join()}>{busy?"Checking classroom…":(state?.wallet?.cbc??0)<1?"Buy or receive CBC to enter":"Enter Room · 1 CBC / 30 min"}</button></section>
        <section className="classroom-panel"><div className="panel-title"><BookOpen/><span><small>MY CLASSROOMS</small><h2>Enrolled sessions</h2></span></div><div className="session-list">{state?.joined?.length?state.joined.map(({room,access_expires_at})=>{const active=new Date(access_expires_at).getTime()>Date.now();return <article key={room.id} className={active?"access-active":"access-expired"}><div><small>{room.package_kind?.toUpperCase()} · {active?"ACCESS ACTIVE":"TIME EXPIRED"}</small><h3>{room.name}</h3><span>{active?`Paid access until ${new Date(access_expires_at).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}`:"Spend 1 CBC to continue for another 30 minutes."}</span></div><button type="button" disabled={busy||(state?.wallet?.cbc??0)<1} onClick={()=>void extend(room)}>{active?"Add 30 min · 1 CBC":"Renew 30 min · 1 CBC"}</button></article>}):<p className="empty-room">Enter your teacher's code to join a room.</p>}</div></section>
      </div></div>}
      <section className="classroom-panel active-directory"><div className="panel-title"><Users/><span><small>ACTIVE NOW</small><h2>Classroom Sessions</h2></span></div><div className="active-room-grid">{state?.active?.map(r=><article key={r.id}><b>{r.name}</b><span>{r.package_kind} · {r.students?.[0]?.count??0}/{r.max_students} students</span><small>Private code required</small></article>)}</div></section>
    </>}
  </section>
}
