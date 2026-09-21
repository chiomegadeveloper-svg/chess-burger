"use client";
import { useState } from "react";
import { Camera, ImageIcon, X } from "lucide-react";

export default function ProfilePhotoBucket({ photos, name, onUpload, busy = false }: { photos?: string[]; name: string; onUpload?: (file:File,index:number)=>void; busy?:boolean }) {
  const [selected, setSelected] = useState("");
  const slots = Array.from({ length: 4 }, (_, index) => photos?.[index] ?? "");
  return <section className="profile-featured-bucket cloud-panel">
    <header><div><span>PROFILE GALLERY</span><h2>Featured photos</h2></div><small>4 highlights</small></header>
    <div>{slots.map((photo, index) => <div className="featured-photo-slot" key={index}>{photo ? <button type="button" onClick={() => setSelected(photo)} aria-label={`Open featured photo ${index + 1}`}><img src={photo} alt={`${name} featured photo ${index + 1}`} /></button> : <span className="featured-photo-empty"><ImageIcon/><small>Empty</small></span>}{onUpload&&<label><Camera size={13}/>{photo?"Replace":"Upload"}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={event=>{const input=event.currentTarget,file=input.files?.[0];input.value="";if(file)onUpload(file,index);}}/></label>}</div>)}</div>
    {selected && <div className="featured-photo-viewer" role="dialog" aria-modal="true" aria-label="Featured photo" onClick={() => setSelected("")}><button type="button" onClick={() => setSelected("")} aria-label="Close photo"><X/></button><button className="featured-photo-expanded" type="button" onClick={() => setSelected("")} aria-label="Return to thumbnails"><img src={selected} alt={`${name} featured`} /></button></div>}
  </section>;
}
