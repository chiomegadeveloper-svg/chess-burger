'use client';
import {useEffect,useRef,useState} from 'react';
import {arena} from './arena-client';
export type Position={lat:number;lng:number;accuracy:number};
export function useGpsPresence(userId?:string){
 const [enabled,setEnabled]=useState(false),[position,setPosition]=useState<Position|null>(null),[error,setError]=useState('');const latest=useRef<Position|null>(null);
 useEffect(()=>{if(!enabled||!userId||userId==='guest-device')return;if(!navigator.geolocation){setError('GPS is unavailable in this browser.');setEnabled(false);return;}
  let alive=true,lastSent=0,lastFix=0;const send=async()=>{if(!latest.current||Date.now()-lastFix>45000)return;try{await arena('presence',{gps:true,...latest.current});}catch(e){if(alive)setError((e as Error).message);}};
  const watch=navigator.geolocation.watchPosition(p=>{if(!alive)return;lastFix=Date.now();latest.current={lat:p.coords.latitude,lng:p.coords.longitude,accuracy:p.coords.accuracy};setPosition(latest.current);setError('');if(Date.now()-lastSent>10000){lastSent=Date.now();void send();}},e=>{if(!alive)return;setError(e.code===1?'Location permission was denied. Enable it in your browser settings.':'Waiting for a reliable GPS reading.');if(e.code===1)setEnabled(false);},{enableHighAccuracy:true,maximumAge:15000,timeout:20000});
  const timer=setInterval(send,15000);return()=>{alive=false;navigator.geolocation.clearWatch(watch);clearInterval(timer);latest.current=null;void arena('presence',{gps:false}).catch(()=>{});};
 },[enabled,userId]);
 function toggle(){if(enabled){setEnabled(false);setPosition(null);}else if(!userId||userId==='guest-device')setError('Sign in before sharing your location with nearby players.');else {setError('');setEnabled(true);}}
 return {enabled,position,error,toggle};
}
