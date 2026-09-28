'use client';
import {useEffect} from 'react';
import {arena} from './arena-client';
import {getSupabase} from './supabase';

/** A short-lived activity signal. Never stores GPS coordinates in Supabase. */
export function useLivePresence(userId?:string, gpsEnabled=false, activeMatchId='', cbr=88){
  useEffect(()=>{
    if(!userId || userId==='guest-device')return;
    let alive=true, sending=false, directAvailable=true;
    const heartbeat=async()=>{
      if(!alive || sending || !navigator.onLine || document.visibilityState==='hidden')return;
      sending=true;
      try{
        // The existing self-only presence policy lets a signed-in player write
        // their own heartbeat directly, saving a Vercel Function invocation.
        if(directAvailable){
          try{
            const client=await getSupabase();
            const session=client?(await client.auth.getSession()).data.session:null;
            if(client&&session?.user.id===userId){
              const saved=await client.from('cb_live_presence').upsert({user_id:userId,seen_at:new Date().toISOString()},{onConflict:'user_id'});
              if(!saved.error)return;
            }
            directAvailable=false;
          }catch{directAvailable=false}
        }
        // Older databases without the presence policy still use the server.
        if(alive)await arena('heartbeat');
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
