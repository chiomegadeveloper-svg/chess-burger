'use client';
import {useEffect} from 'react';
import {arena} from './arena-client';

/** A short-lived activity signal. Never stores GPS coordinates in Supabase. */
export function useLivePresence(userId?:string, gpsEnabled=false, activeMatchId='', cbr=88){
  useEffect(()=>{
    if(!userId || userId==='guest-device')return;
    let alive=true, sending=false;
    const heartbeat=async()=>{
      if(!alive || sending || !navigator.onLine || document.visibilityState==='hidden')return;
      sending=true;
      try{
        await arena('heartbeat');
      }catch(e){console.warn('Live presence unavailable:',e);}
      finally{sending=false;}
    };
    void heartbeat();
    // Spread heartbeat writes across the minute instead of synchronizing tabs.
    const timer=window.setInterval(()=>void heartbeat(),19000+Math.floor(Math.random()*4000));
    const resumed=()=>void heartbeat();
    document.addEventListener('visibilitychange',resumed);
    window.addEventListener('online',resumed);
    return()=>{
      alive=false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange',resumed);
      window.removeEventListener('online',resumed);
    };
  },[userId]);
}
