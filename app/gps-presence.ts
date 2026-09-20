'use client';
import {useEffect,useRef,useState} from 'react';
import {arena} from './arena-client';
export type Position={lat:number;lng:number;accuracy:number};
type TerritoryLabel={barangay:string;locality:string};
async function locateTerritory(position:Position):Promise<TerritoryLabel|undefined>{
 try{
  const url=`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&accept-language=en&lat=${position.lat}&lon=${position.lng}`;
  const data=await fetch(url,{headers:{Accept:'application/json'}}).then(r=>r.ok?r.json():null) as {address?:Record<string,string>}|null;
  const a=data?.address;if(!a)return;
  const locality=a.city||a.town||a.municipality||a.city_district||a.county;
  const barangay=a.village||a.suburb||a.neighbourhood||a.quarter||a.city_district;
  if(locality&&barangay)return {barangay,locality};
 }catch{/* Nearby play remains available if reverse lookup is unavailable. */}
}
export function useGpsPresence(userId?:string){
 const [enabled,setEnabled]=useState(false),[position,setPosition]=useState<Position|null>(null),[error,setError]=useState('');const latest=useRef<Position|null>(null),territory=useRef<TerritoryLabel|undefined>(undefined),lastLocated=useRef(0),autoStarted=useRef(false);
 useEffect(()=>{if(autoStarted.current||!userId||userId==='guest-device')return;autoStarted.current=true;setEnabled(true);},[userId]);
 useEffect(()=>{if(!enabled||!userId||userId==='guest-device')return;if(!navigator.geolocation){setError('GPS is unavailable in this browser.');setEnabled(false);return;}
  let alive=true,lastSent=0,lastFix=0;const send=async()=>{if(!latest.current||Date.now()-lastFix>45000)return;try{await arena('presence',{gps:true,...latest.current,...territory.current});}catch(e){if(alive)setError((e as Error).message);}};
  const watch=navigator.geolocation.watchPosition(p=>{if(!alive)return;lastFix=Date.now();const next={lat:p.coords.latitude,lng:p.coords.longitude,accuracy:p.coords.accuracy};latest.current=next;setPosition(next);setError('');if(Date.now()-lastLocated.current>20*60*1000){lastLocated.current=Date.now();void locateTerritory(next).then(label=>{if(label)territory.current=label;});}if(Date.now()-lastSent>3000){lastSent=Date.now();void send();}},e=>{if(!alive)return;setError(e.code===1?'Location permission was denied. Enable it in your browser settings.':'Waiting for a reliable GPS reading.');if(e.code===1)setEnabled(false);},{enableHighAccuracy:true,maximumAge:15000,timeout:20000});
  const timer=setInterval(send,5000);return()=>{alive=false;navigator.geolocation.clearWatch(watch);clearInterval(timer);latest.current=null;territory.current=undefined;void arena('presence',{gps:false}).catch(()=>{});};
 },[enabled,userId]);
 function toggle(){if(enabled){setEnabled(false);setPosition(null);}else if(!userId||userId==='guest-device')setError('Sign in before sharing your location with nearby players.');else {setError('');setEnabled(true);}}
 return {enabled,position,error,toggle};
}
