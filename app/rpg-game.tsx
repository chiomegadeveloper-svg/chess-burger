"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {ArrowLeft,RotateCw,Maximize2} from 'lucide-react';
import {getSupabase} from './supabase';
import {requestRpgLandscape} from './rpg-orientation';
export default function RpgGame({onBack,onWalletChange}:{onBack:()=>void;onWalletChange:()=>void}){
 const frame=useRef<HTMLIFrameElement>(null),[error,setError]=useState(''),[ready,setReady]=useState(false),[generation,setGeneration]=useState(0);
 const boot=useCallback(async()=>{try{const client=await getSupabase();const result=await client?.auth.getSession();const user=result?.data.session?.user;if(!user)throw Error('Sign in again before opening RPG.');frame.current?.contentWindow?.postMessage({type:'CB_RPG_BOOT',userId:user.id},location.origin);setReady(true);}catch(e){setError((e as Error).message);}},[]);
 useEffect(()=>{
  const previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;document.body.style.overflow='hidden';
  const receive=async(event:MessageEvent)=>{
   if(event.origin!==location.origin||event.source!==frame.current?.contentWindow)return;
   const message=event.data;if(message?.type==='CB_RPG_READY'){void boot();return;}
   if(message?.type==='CB_RPG_EXIT'){onBack();return;}
   if(message?.type==='CB_RPG_WALLET_CHANGED'){onWalletChange();return;}
   if(message?.type!=='CB_RPG_API'||typeof message.id!=='string'||!['GET','POST','DELETE'].includes(message.method))return;
   let status=503,data:unknown={error:'RPG connection failed. Please retry.'};
   try{
    if(JSON.stringify(message.body).length>100000)throw Error('Game request too large.');
    const client=await getSupabase(),auth=await client?.auth.getSession(),session=auth?.data.session;if(!session)throw Error('Your login expired. Reopen RPG after signing in.');
    let url='/api/profile?feature=rpg';if(message.method==='GET'){const q=new URLSearchParams();if(message.body?.channel)q.set('channel',message.body.channel);if(message.body?.action)q.set('action',message.body.action);if(message.body?.generation)q.set('generation',message.body.generation);url+='&'+q;}
    const response=await fetch(url,{method:message.method,headers:{Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:message.method==='GET'?undefined:JSON.stringify(message.body),cache:'no-store',signal:AbortSignal.timeout(40000)});status=response.status;data=await response.json();
   }catch(e){data={error:(e as Error).message||'RPG connection failed.'};}
   frame.current?.contentWindow?.postMessage({type:'CB_RPG_REPLY',id:message.id,status,data},location.origin);
  };
  window.addEventListener('message',receive);
  return ()=>{window.removeEventListener('message',receive);document.body.style.overflow=overflow;screen.orientation?.unlock?.();if(document.fullscreenElement)void document.exitFullscreen().catch(()=>{});previous?.focus();};
 },[boot,onBack,onWalletChange]);
 const panel=<section className="rpg-live-shell" aria-label="Chess Burger RPG">
  {!ready&&!error&&<div className="rpg-live-loading" role="status">Opening your adventure…</div>}
  {error?<div className="rpg-live-loading" role="alert"><p>{error}</p><button type="button" onClick={onBack}><ArrowLeft size={17}/>Back to Chess Burger</button><button type="button" onClick={()=>{setError('');setReady(false);setGeneration(v=>v+1);}}>Retry</button></div>:<iframe key={generation} ref={frame} src="/rpg/index.html" title="Chess Burger RPG game" allow="geolocation; fullscreen" allowFullScreen onLoad={()=>void boot()}/>}
  <div className="rpg-rotate-gate"><RotateCw size={44}/><h1>Play RPG in landscape</h1><p>Rotate your device or widen your window to continue.</p><button type="button" onClick={requestRpgLandscape}><Maximize2 size={16}/>Enter full screen</button><button type="button" onClick={onBack}><ArrowLeft size={16}/>Back to Chess Burger</button></div>
 </section>;
 return typeof document==='undefined'?null:createPortal(panel,document.body);
}
