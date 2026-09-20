'use client';
import {useEffect,useMemo,useState} from 'react';
import {Crown,Flag} from 'lucide-react';
import NearbyMap from './nearby-map';
import {arena} from './arena-client-v46';
import type {ArenaPlayer} from './game-rules';
import type {Position} from './gps-presence';

type Zone={id:string;user_id:string;kingdom_name?:string|null;is_owner?:boolean};
type Props={enabled:boolean;position:Position|null;toggle:()=>void;error:string;userId?:string;onInvite:(player:ArenaPlayer)=>void;onOpenProfile:(userId:string)=>void;territory?:boolean;onClaimed:()=>void};

export default function NearbyMapV46(props:Props){
 const [zones,setZones]=useState<Zone[]>([]),[name,setName]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const own=useMemo(()=>zones.find(zone=>zone.is_owner||zone.user_id===props.userId)??null,[zones,props.userId]);
 async function reload(){if(!props.enabled||!props.position)return;try{const result=await arena<{territories:Zone[]}>('nearby');setZones(result.territories);setMessage('');}catch(error){setMessage((error as Error).message);}}
 useEffect(()=>{if(!props.enabled||!props.position){setZones([]);return;}void reload();const timer=setInterval(()=>void reload(),5000);return()=>clearInterval(timer);},[props.enabled,props.position?.lat,props.position?.lng]);
 useEffect(()=>{if(own)setName(own.kingdom_name||'');},[own?.id,own?.kingdom_name]);
 async function claim(){setBusy(true);setMessage('');try{await arena('claim');await reload();props.onClaimed();setMessage('Your 2 km kingdom is active.');}catch(error){setMessage((error as Error).message);}finally{setBusy(false);}}
 async function save(){if(!own)return;setBusy(true);setMessage('');try{const result=await arena<{territory:Zone}>('territory-name',{territory_id:own.id,kingdom_name:name});setZones(current=>current.map(zone=>zone.id===own.id?{...zone,...result.territory}:zone));setMessage('Kingdom name saved.');}catch(error){setMessage((error as Error).message);}finally{setBusy(false);}}
 return <div className="territory-v46"><NearbyMap {...props}/>{props.territory!==false&&<section className="cloud-panel territory-v46-panel">{own?<><Crown/><div><h2>{own.kingdom_name||'Your 2 km kingdom'}</h2><p>You rule this territory. The invasion option is now closed.</p><label>Kingdom name<input value={name} maxLength={40} placeholder="Example: Omega Kingdom" onChange={event=>setName(event.target.value)}/></label></div><button className="gold-button" disabled={busy||name.trim().length<3} onClick={()=>void save()}>{busy?'Saving…':'Save name'}</button></>:<><Flag/><div><h2>Claim a 2 km territory</h2><p>Costs 48 Gold. Each player can rule one kingdom.</p></div><button className="gold-button" disabled={busy||!props.enabled||!props.position} onClick={()=>void claim()}>{busy?'Invading…':'Invade · 48 Gold'}</button></>}</section>}{message&&<p className="inline-error" role="status">{message}</p>}</div>;
}
