"use client";
import {useEffect,useRef,useState} from "react";
import {classroom} from "./classroom-client";
import "./classroom-move-notes.css";

type Note={id:number;fen:string;before_fen:string;notation:string;actor:string;move_number:number|null;color:string|null;created_at:string};
type Page={notes:Note[];has_more:boolean};
export default function ClassroomMoveNotes({roomId,studentId,fen,busy,onRestore}:{roomId:string;studentId?:string;fen:string;busy:boolean;onRestore:(id:number,before:boolean)=>Promise<void>}){
  const [page,setPage]=useState<Page>({notes:[],has_more:false});
  const [error,setError]=useState("");const [working,setWorking]=useState(false);
  const generation=useRef(0);
  useEffect(()=>{
    const token=++generation.current;let pending=false;
    setPage({notes:[],has_more:false});setError("");
    const refresh=async()=>{if(pending)return;pending=true;try{
      const result=await classroom<Page>("move-notes",{room_id:roomId,student_id:studentId});
      if(generation.current===token){setPage(previous=>({notes:[...result.notes,...previous.notes.filter(note=>note.id<(result.notes.at(-1)?.id??0))],has_more:previous.notes.length>100?previous.has_more:result.has_more}));setError("")}
    }catch(e){if(generation.current===token)setError(e instanceof Error?e.message:"Could not load move notes.")}finally{pending=false}};
    void refresh();const timer=window.setInterval(()=>void refresh(),3000);
    return()=>{generation.current++;window.clearInterval(timer)};
  },[roomId,studentId]);
  const older=async()=>{const token=generation.current;setWorking(true);try{
    const result=await classroom<Page>("move-notes",{room_id:roomId,student_id:studentId,before_id:page.notes.at(-1)?.id});
    if(generation.current===token)setPage(previous=>({notes:[...previous.notes,...result.notes.filter(note=>!previous.notes.some(old=>old.id===note.id))],has_more:result.has_more}));
  }catch(e){setError(e instanceof Error?e.message:"Could not load older notes.")}finally{setWorking(false)}};
  const restore=async(id:number,before=false)=>{setWorking(true);setError("");try{await onRestore(id,before)}catch(e){setError(e instanceof Error?e.message:"Could not restore this position.")}finally{setWorking(false)}};
  return <aside className="classroom-move-notes" aria-label="Teacher-only move notes">
    <header><span><small>TEACHER ONLY</small><h3>Move notes</h3></span><b>{page.notes.length}{page.has_more?"+":""}</b></header>
    <p>Tap a saved position to resume from there. Earlier moves stay in history. Teaching edits are labelled separately.</p>
    {error&&<p className="move-notes-error" role="alert">{error}</p>}
    {!page.notes.length&&!error&&<p>No moves yet. Teacher and student moves will appear here.</p>}
    <ol>{page.notes.map(note=><li key={note.id}>
      <button type="button" disabled={busy||working} onClick={()=>void restore(note.id)} title="Restore this position and continue" className={note.fen===fen?"current":""}>
        <span className="move-note-score">{note.move_number!==null&&<small>{note.move_number}{note.color==="b"?"…":"."}</small>}<strong>{note.notation}</strong></span>
        <span className="move-note-meta"><b>{note.actor}</b><time dateTime={note.created_at}>{new Date(note.created_at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</time><span>{note.fen===fen?"On board":"Resume here"}</span></span>
      </button>
      <button className="move-note-before" type="button" disabled={busy||working} onClick={()=>void restore(note.id,true)}>Before this move</button>
    </li>)}</ol>
    {page.has_more&&<button className="move-note-more" type="button" disabled={busy||working} onClick={()=>void older()}>Load earlier moves</button>}
  </aside>;
}
