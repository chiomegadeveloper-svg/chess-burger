"use client";
import {useEffect,useState} from "react";
import {toast} from "sonner";
import {getSupabase} from "./supabase";
import {TIME_CONTROLS} from "./game-rules";
import {ArenaBattle,BattleRoster,battleLabel} from "./arena-sessions";
import "./arena-owner-cms.css";

type Settings={losses_to_eliminate:number;upcoming_weekly_limit:number;prize_mode:"fixed"|"auto";fixed_prize_gold:number;match_control:string};
type OwnerState={settings:Settings;sessions:ArenaBattle[]};
const localTime=(iso:string)=>new Date(Date.parse(iso)+8*3600000).toISOString().slice(0,16);
async function request(action:string,body:Record<string,unknown>={}):Promise<OwnerState>{
  const client=await getSupabase(),session=client?(await client.auth.getSession()).data.session:null;
  if(!session)throw Error("Sign in again.");
  const response=await fetch("/api/grand-arena",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({action,...body}),cache:"no-store"});
  const data=await response.json() as OwnerState & {error?:string};if(!response.ok)throw Error(data.error||"Arena controls are unavailable.");return data;
}
export default function ArenaCms(){
  const [state,setState]=useState<OwnerState|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const [editing,setEditing]=useState<string|null>(null),[title,setTitle]=useState("Arena Chess Battle"),[start,setStart]=useState(""),[end,setEnd]=useState(""),[lossLimit,setLossLimit]=useState(3);
  useEffect(()=>{let alive=true;void request("owner-settings").then(data=>{if(alive){setState(data);setLossLimit(data.settings.losses_to_eliminate);}}).catch(e=>{if(alive)setError((e as Error).message);});return()=>{alive=false;};},[]);
  async function save(action:string,body:Record<string,unknown>){if(busy)return;setBusy(true);setError("");try{const result=await request(action,body);setState(result);toast.success(action==="save-owner-session"?"Arena battle published. Reservations stay with this session.":"Arena controls saved.");if(action==="save-owner-session"){setEditing(null);setTitle("Arena Chess Battle");setStart("");setEnd("");}if(action==="save-owner-session"||!editing)setLossLimit(result.settings.losses_to_eliminate);}catch(e){setError((e as Error).message);toast.error((e as Error).message);}finally{setBusy(false);}}
  function edit(battle:ArenaBattle){setEditing(battle.id);setTitle(battle.title);setStart(localTime(battle.starts_at));setEnd(localTime(battle.ends_at));setLossLimit(battle.loss_limit);}
  function update(values:Partial<Settings>){setState(current=>current?{...current,settings:{...current.settings,...values}}:current);}
  return <div className="cms-panel arena-cms-panel"><div><span>OWNER CONTROL</span><h2>Grand Arena</h2><p className="cms-note">Publish dated battles in Philippine time. Only published battles appear in Arena, Play Selection and the Home invitation.</p></div>
    {error&&<p role="alert" className="arena-cms-error">{error}</p>}
    {!state?<p>{error?"Apply the required migration, then reopen Grand Arena CMS.":"Loading Arena controls…"}</p>:<>
      <div className="arena-owner-controls">
        <label>Default losses before elimination<input type="number" min={1} max={10} value={state.settings.losses_to_eliminate} onChange={e=>update({losses_to_eliminate:Number(e.target.value)})}/></label>
        <label>Maximum battles per week / upcoming display<input type="number" min={1} max={12} value={state.settings.upcoming_weekly_limit} onChange={e=>update({upcoming_weekly_limit:Number(e.target.value)})}/></label>
        <label>Match time control<select value={state.settings.match_control} onChange={e=>update({match_control:e.target.value})}>{TIME_CONTROLS.map(control=><option key={control.id} value={control.id}>{control.group} · {control.label}</option>)}</select></label>
        <label>Daily Champion prize<select value={state.settings.prize_mode} onChange={e=>update({prize_mode:e.target.value as "fixed"|"auto"})}><option value="fixed">Owner-set fixed prize</option><option value="auto">Auto · 10% of tickets used across the day</option></select></label>
        {state.settings.prize_mode==="fixed"&&<label>CBG per session (combined for daily winner)<input type="number" min={0} max={1000000} value={state.settings.fixed_prize_gold} onChange={e=>update({fixed_prize_gold:Number(e.target.value)})}/></label>}
      </div>
      <p className="cms-note">Weeks run Monday–Sunday in Philippine time. Public pages show the next {state.settings.upcoming_weekly_limit} battles. Loss limit, time control and prize defaults apply to new battles; use Edit to change a future battle’s loss limit.</p>
      <div className="arena-cms-rules"><b>Scoring</b><span>Win +1 · Draw +0.5 · Three consecutive wins +2 bonus</span><span>{state.settings.losses_to_eliminate} losses eliminate by default · Each win grants +4 CBR</span></div>
      <button disabled={busy} onClick={()=>void save("save-owner-settings",{settings:state.settings})}>{busy?"Saving…":"Save Arena controls"}</button>
      <form className="arena-owner-editor" onSubmit={e=>{e.preventDefault();void save("save-owner-session",{id:editing,title,starts_at:`${start}:00+08:00`,ends_at:`${end}:00+08:00`,loss_limit:lossLimit});}}>
        <h3>{editing?"Edit scheduled battle":"Create an Arena battle"}</h3>
        <label>Battle title<input required maxLength={80} value={title} onChange={e=>setTitle(e.target.value)}/></label>
        <label>Starts · Philippine time<input type="datetime-local" required value={start} onChange={e=>setStart(e.target.value)}/></label>
        <label>Ends · Philippine time<input type="datetime-local" required value={end} onChange={e=>setEnd(e.target.value)}/></label>
        <label>Losses before elimination<input type="number" required min={1} max={10} value={lossLimit} onChange={e=>setLossLimit(Number(e.target.value))}/></label>
        <p className="cms-note">Battles must last 30 minutes–24 hours and cannot overlap. Edits keep paid registrations; changes appear on the public schedule. Active battles cannot be edited.</p>
        <button disabled={busy}>{busy?"Saving…":editing?"Save battle changes":"Publish Arena battle"}</button>
        {editing&&<button type="button" disabled={busy} onClick={()=>{setEditing(null);setTitle("Arena Chess Battle");setStart("");setEnd("");setLossLimit(state.settings.losses_to_eliminate);}}>Cancel edit</button>}
      </form>
      <h3>Published battles &amp; rosters</h3>
      {!state.sessions.length?<p>No battles published yet.</p>:<div className="arena-schedule-list">{state.sessions.map(battle=><article key={battle.id}><h3>{battle.title}</h3><p>{battleLabel(battle)} · PH time</p><p>Eliminated after {battle.loss_limit} losses</p><BattleRoster battle={battle}/><button type="button" disabled={busy||Date.parse(battle.starts_at)<=Date.now()} onClick={()=>edit(battle)}>Edit battle</button></article>)}</div>}
    </>}
  </div>;
}
