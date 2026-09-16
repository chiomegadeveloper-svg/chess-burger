'use client';
import {useEffect} from 'react';
import {getSupabase} from './supabase';

/** A short-lived activity signal. Never stores GPS coordinates in Supabase. */
export function useLivePresence(userId?:string, gpsEnabled=false, activeMatchId=''){
  useEffect(()=>{
    if(!userId || userId==='guest-device')return;
    let alive=true, sending=false;
    const heartbeat=async()=>{
      if(!alive || sending || !navigator.onLine || document.visibilityState==='hidden')return;
      sending=true;
      try{
        const client=await getSupabase();
        if(!client || !alive)return;
        const {data:{session}}=await client.auth.getSession();
        if(!session || session.user.id!==userId || !alive)return;
        const {error}=await client.from('cb_live_presence').upsert({
          user_id:userId,
          seen_at:new Date().toISOString(),
          gps_enabled:gpsEnabled,
          match_id:activeMatchId || null
        },{onConflict:'user_id'});
        if(error)console.warn('Live presence unavailable:',error.message);
      }catch(e){console.warn('Live presence unavailable:',e);}
      finally{sending=false;}
    };
    void heartbeat();
    const timer=window.setInterval(()=>void heartbeat(),15000);
    const resumed=()=>void heartbeat();
    document.addEventListener('visibilitychange',resumed);
    window.addEventListener('online',resumed);
    return()=>{
      alive=false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange',resumed);
      window.removeEventListener('online',resumed);
    };
  },[userId,gpsEnabled,activeMatchId]);
}
