"use client";
import {useEffect,useRef,useState} from "react";
import "./splash-screen.css";

export default function SplashScreen({onDone}:{onDone:()=>void}){
  const video=useRef<HTMLVideoElement>(null),done=useRef(false),callback=useRef(onDone),started=useRef(false);
  callback.current=onDone;
  const [playing,setPlaying]=useState(false),[still,setStill]=useState(false);
  const finish=()=>{if(done.current)return;done.current=true;callback.current()};
  useEffect(()=>{
    let disposed=false;
    const reduced=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fallback=()=>{if(disposed)return;video.current?.pause();setStill(true);setPlaying(false)};
    if(reduced)fallback();else void video.current?.play().catch(fallback);
    // A blocked, slow or stalled video must never trap the user on the splash.
    const timer=window.setTimeout(()=>{if(!done.current){done.current=true;callback.current()}},6500);
    const staticTimer=window.setTimeout(()=>{if(!started.current&&!done.current){done.current=true;callback.current()}},5000);
    return()=>{disposed=true;window.clearTimeout(timer);window.clearTimeout(staticTimer);video.current?.pause()};
  },[]);
  return <div className="splash-screen splash-video-screen" role="status" aria-label="Chess Burger is loading">
    <div className="splash-video-stage">
      <img className="splash-video-poster" src="/splash/chess-burger-splash-poster.webp" alt="Chess Burger pieces charging into battle"/>
      <video ref={video} className={`splash-video ${playing&&!still?"is-playing":""}`} muted playsInline preload="auto" disablePictureInPicture
        aria-hidden="true" poster="/splash/chess-burger-splash-poster.webp"
        onPlaying={()=>{if(!still){started.current=true;setPlaying(true)}}} onEnded={finish}
        onError={()=>{setStill(true);setPlaying(false)}}>
        <source src="/splash/chess-burger-splash.mp4" type="video/mp4"/>
      </video>
    </div>
    <small>CHESS BURGER ALL RIGHTS RESERVED 2026</small>
  </div>;
}
