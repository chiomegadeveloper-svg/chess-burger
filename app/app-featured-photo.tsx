"use client";
import {useEffect,useState} from 'react';
import {arena} from './arena-client';
import {Dialog,DialogContent,DialogHeader,DialogTitle} from '@/components/ui/dialog';
export default function AppFeaturedPhoto(){
 const [image,setImage]=useState(''),[error,setError]=useState(false),[open,setOpen]=useState(false);
 useEffect(()=>{let active=true;arena<{image_url:string}>('app-feature',{},true).then(data=>{if(active)setImage(data.image_url);}).catch(()=>{if(active)setError(true);});return()=>{active=false;};},[]);
 return <><figure className="card-feature-photo">{image?<button onClick={()=>setOpen(true)} aria-label="Expand app featured photo"><img src={image} alt="Chess Burger announcement or advertisement"/></button>:<span>{error?'App featured photo is temporarily unavailable.':'App announcements and advertisements will appear here.'}</span>}</figure><Dialog open={open} onOpenChange={setOpen}><DialogContent className="photo-dialog"><DialogHeader><DialogTitle>App featured photo</DialogTitle></DialogHeader><img src={image} alt="Chess Burger announcement or advertisement"/></DialogContent></Dialog></>;
}
