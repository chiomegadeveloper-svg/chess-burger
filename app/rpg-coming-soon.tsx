"use client";
import {useEffect,useRef} from "react";
import {createPortal} from "react-dom";
import {ArrowLeft} from "lucide-react";
export default function RpgComingSoon({onBack}:{onBack:()=>void}){
 const back=useRef<HTMLButtonElement>(null);
 useEffect(()=>{
  const previous=document.activeElement as HTMLElement|null;
  back.current?.focus();
  const handle=(event:KeyboardEvent)=>{if(event.key==="Escape"){event.preventDefault();onBack();}if(event.key==="Tab"){event.preventDefault();back.current?.focus();}};
  document.addEventListener("keydown",handle,true);
  return ()=>{document.removeEventListener("keydown",handle,true);previous?.focus();};
 },[onBack]);
 const panel=<section className="rpg-coming-window" role="dialog" aria-modal="true" aria-labelledby="rpg-coming-title">
  <img className="rpg-coming-backdrop" src="/play-selection/rpg.webp" alt=""/>
  <div className="rpg-coming-panel"><img src="/cburger_logo.png" alt="Chess Burger"/><span>CHESS BURGER · RPG</span><h1 id="rpg-coming-title">RPG Game coming in a short while</h1><p>Your next adventure is taking shape.</p><button ref={back} type="button" onClick={onBack}><ArrowLeft size={17}/>Go back</button></div>
 </section>;
 return typeof document === "undefined"?null:createPortal(panel,document.body);
}
