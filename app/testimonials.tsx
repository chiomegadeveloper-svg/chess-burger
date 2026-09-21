"use client";
import { useCallback, useEffect, useState } from "react";
import { Heart, Trash2 } from "lucide-react";
import { arena } from "./arena-client";

type Testimonial = { id:string;author_id:string;display_name:string;username:string;avatar_url:string;body:string;heart_count:number;hearted:boolean;created_at:string };
export default function Testimonials({ profileId, currentUserId }: { profileId:string; currentUserId?:string }) {
  const [items,setItems]=useState<Testimonial[]>([]),[body,setBody]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const load=useCallback(()=>arena<{testimonials:Testimonial[]}>("profile-testimonials",{user_id:profileId}).then(data=>{setItems(data.testimonials);setError("");}).catch(cause=>setError((cause as Error).message)),[profileId]);
  useEffect(()=>{if(profileId)void load();},[load,profileId]);
  const act=async(action:string,input:Record<string,unknown>)=>{setBusy(true);setError("");try{await arena(action,input);await load();}catch(cause){setError((cause as Error).message);}finally{setBusy(false);}};
  const submit=async(event:React.FormEvent)=>{event.preventDefault();const message=body.trim();if(!message)return;await act("testimonial-add",{user_id:profileId,body:message});setBody("");};
  return <section className="testimonials cloud-panel"><header><div><span>COMMUNITY VOICES</span><h2>Testimonials</h2></div><small>{items.length} entries</small></header>
    {currentUserId&&currentUserId!==profileId&&<form onSubmit={submit}><textarea value={body} maxLength={400} required placeholder="Write a respectful testimonial…" onChange={event=>setBody(event.target.value)}/><button className="gold-button" disabled={busy||!body.trim()} type="submit">Post testimonial</button></form>}
    {error&&<p className="inline-error" role="alert">{error}</p>}
    {!items.length?<p className="testimonial-empty">No testimonials yet.</p>:<div className="testimonial-list">{items.map(item=><article key={item.id}><span className="testimonial-avatar">{item.avatar_url?<img src={item.avatar_url} alt=""/>:item.display_name.charAt(0)}</span><div><strong>{item.display_name}</strong><small>@{item.username} · {new Date(item.created_at).toLocaleDateString()}</small><p>{item.body}</p><button type="button" className={item.hearted?"hearted":""} disabled={busy} onClick={()=>void act("testimonial-heart",{id:item.id})}><Heart size={14} fill={item.hearted?"currentColor":"none"}/>{item.heart_count}</button></div>{currentUserId===profileId&&<button type="button" className="testimonial-delete" disabled={busy} aria-label="Delete testimonial" onClick={()=>void act("testimonial-delete",{id:item.id})}><Trash2 size={15}/></button>}</article>)}</div>}
  </section>;
}
