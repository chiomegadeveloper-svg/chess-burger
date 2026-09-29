"use client";

import {useEffect,useState} from "react";
import {createPortal} from "react-dom";
import "./update-gate.css";

declare const __CHESS_BURGER_BUILD_ID__: string;

export default function UpdateGate() {
  const [available,setAvailable]=useState(false);
  const [restarting,setRestarting]=useState(false);

  useEffect(()=>{
    let active=true;
    async function check() {
      if (!navigator.onLine || document.visibilityState === "hidden") return;
      try {
        const response=await fetch(`/version.json?check=${Date.now()}`,{cache:"no-store"});
        if (!response.ok) return;
        const version=await response.json() as {buildId?:string};
        if (active && version.buildId && version.buildId!==__CHESS_BURGER_BUILD_ID__) setAvailable(true);
      } catch { /* Keep the current app usable during a temporary connection failure. */ }
    }
    void check();
    const timer=window.setInterval(()=>void check(),60_000);
    const onVisible=()=>{if(document.visibilityState==="visible")void check()};
    window.addEventListener("focus",onVisible);
    window.addEventListener("online",onVisible);
    document.addEventListener("visibilitychange",onVisible);
    return()=>{active=false;window.clearInterval(timer);window.removeEventListener("focus",onVisible);window.removeEventListener("online",onVisible);document.removeEventListener("visibilitychange",onVisible)};
  },[]);

  useEffect(()=>{
    if (!available) return;
    const root=document.getElementById("root");
    if (root) root.inert=true;
    return ()=>{if(root)root.inert=false};
  },[available]);

  if (!available) return null;
  return createPortal(<div className="cb-update-backdrop" role="alertdialog" aria-modal="true" aria-labelledby="cb-update-title" aria-describedby="cb-update-description">
    <section className="cb-update-card">
      <img src="/cburger_logo.png" alt=""/>
      <h2 id="cb-update-title">Chess Burger has an update</h2>
      <p id="cb-update-description">Restart the app to get the latest features and fixes.</p>
      <button type="button" autoFocus disabled={restarting} onClick={()=>{
        setRestarting(true);
        void (async()=>{
          try { await navigator.serviceWorker?.getRegistration().then(reg=>reg?.update()); }
          catch { /* Reload even if the service worker update check fails. */ }
          finally { window.location.reload(); }
        })();
      }}>{restarting?"Restarting…":"Restart app now"}</button>
    </section>
  </div>,document.body);
}
