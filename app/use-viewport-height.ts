"use client";
import {useEffect} from "react";

/** Includes mobile browser chrome and the keyboard, while preserving pinch zoom. */
export function useViewportHeight(){
  useEffect(()=>{
    const viewport=window.visualViewport;
    let frame=0;
    const update=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{
      if(viewport&&Math.abs(viewport.scale-1)>.01)return;
      document.documentElement.style.setProperty("--app-viewport-height",`${Math.round(viewport?.height??window.innerHeight)}px`);
    })};
    update();window.addEventListener("resize",update);viewport?.addEventListener("resize",update);
    return()=>{cancelAnimationFrame(frame);window.removeEventListener("resize",update);viewport?.removeEventListener("resize",update);document.documentElement.style.removeProperty("--app-viewport-height")};
  },[]);
}
