'use client';
import {Component,useEffect,useMemo,useState,type ErrorInfo,type ReactNode} from 'react';
import {Crown,Flag} from 'lucide-react';
import NearbyMap from './nearby-map';
import {arena} from './arena-client-v46';
import type {ArenaPlayer} from './game-rules';
import type {Position} from './gps-presence';

type Zone={id:string;user_id:string;kingdom_name?:string|null;is_owner?:boolean};
type Props={enabled:boolean;position:Position|null;toggle:()=>void;error:string;userId?:string;onInvite:(player:ArenaPlayer)=>void;onOpenProfile:(userId:string)=>void;territory?:boolean;onClaimed:()=>void};

class MapRecovery extends Component<{children:ReactNode},{failed:boolean}>{
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 componentDidCatch(error:Error,info:ErrorInfo){console.error('territory-map.render-failed',{message:error.message,stack:info.componentStack});}
 render(){if(this.state.failed)return <section className="cloud-panel map-recovery" role="alert"><h2>Map needs to reload</h2><p>Your account and kingdom are safe. A map component failed to open.</p><button className="gold-button" onClick={()=>window.location.reload()}>Return and reload</button></section>;return this.props.children;}
}

export default function NearbyMapV46(props:Props){
 const [zones,setZones]=useState<Zone[]>([]),[name,setName]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const own=useMemo(()=>zones.find(zone=>zone.is_owner||zone.user_id===props.userId)??null,[zones,props.userId]);
 async function reload(){if(!props.enabled||!props.position)return;try{const result=await arena<{territories?:Zone[]}>('nearby');setZones(Array.isArray(result?.territories)?result.territories:[]);setMessage('');}catch(error){setZones(current=>Array.isArray(current)?current:[]);setMessage((error as Error).message);}}
 useEffect(()=>{if(!props.enabled||!props.position){setZones([]);return;}void reload();const timer=setInterval(()=>void reload(),5000);return()=>clearInterval(timer);},[props.enabled,props.position?.lat,props.position?.lng]);
 useEffect(()=>{if(own)setName(own.kingdom_name||'');},[own?.id,own?.kingdom_name]);
 async function claim(){setBusy(true);setMessage('');try{await arena('claim');await reload();props.onClaimed();setMessage('Your 2 km kingdom is active.');}catch(error){setMessage((error as Error).message);}finally{setBusy(false);}}
 async function save(){if(!own)return;setBusy(true);setMessage('');try{const result=await arena<{territory:Zone}>('territory-name',{territory_id:own.id,kingdom_name:name});setZones(current=>current.map(zone=>zone.id===own.id?{...zone,...result.territory}:zone));setMessage('Kingdom name saved.');}catch(error){setMessage((error as Error).message);}finally{setBusy(false);}}
 return <MapRecovery><div className="territory-v46"><NearbyMap {...props}/>{props.territory!==false&&<section className="cloud-panel territory-v46-panel">{own?<><Crown/><div><h2>{own.kingdom_name||'Your 2 km kingdom'}</h2><p>You rule this territory. The invasion option is now closed.</p><label>Kingdom name<input value={name} maxLength={40} placeholder="Example: Omega Kingdom" onChange={event=>setName(event.target.value)}/></label></div><button className="gold-button" disabled={busy||name.trim().length<3} onClick={()=>void save()}>{busy?'Saving…':'Save name'}</button></>:<><Flag/><div><h2>Claim a 2 km territory</h2><p>Costs 48 Gold. Each player can rule one kingdom.</p></div><button className="gold-button" disabled={busy||!props.enabled||!props.position} onClick={()=>void claim()}>{busy?'Invading…':'Invade · 48 Gold'}</button></>}</section>}{message&&<p className="inline-error" role="status">{message}</p>}</div></MapRecovery>;
}
