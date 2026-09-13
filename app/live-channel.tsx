'use client';
import {useEffect,useState} from 'react';
import {Radio} from 'lucide-react';
import {arena} from './arena-client';
import {Avatar} from './match-board';
import type {ArenaMatch} from './game-rules';
export default function LiveChannel({onWatch}:{onWatch:(id:string)=>void}){const [matches,setMatches]=useState<ArenaMatch[]>([]),[error,setError]=useState('');useEffect(()=>{let active=true;const refresh=async()=>{try{const d=await arena<{matches:ArenaMatch[]}>('live',{},true);if(active){setMatches(d.matches.filter(m=>m.status==='active'));setError('');}}catch(e){if(active)setError((e as Error).message);}};void refresh();const timer=setInterval(refresh,5000);return()=>{active=false;clearInterval(timer);};},[]);return <section><div className="page-heading"><h1>Live channel</h1><Radio size={20}/></div><div className="live-match-list">{matches.map(m=><button className="cloud-panel live-match" key={m.id} onClick={()=>onWatch(m.id)}><Avatar player={m.white}/><strong>{m.white?.display_name}<small>vs {m.black?.display_name}</small></strong><Avatar player={m.black}/><span>Watch · {m.control}</span></button>)}{!matches.length&&<div className="cloud-panel quiet-state"><Radio/><p>{error||'No matches are live right now. Start a match to open the next board.'}</p></div>}</div></section>;}
