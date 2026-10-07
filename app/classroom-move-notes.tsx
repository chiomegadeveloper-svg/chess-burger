"use client";
import {useEffect,useRef,useState} from "react";
import {createPortal} from "react-dom";
import {ChevronLeft,ChevronRight,ChevronsLeft,ChevronsRight} from "lucide-react";
import {classroom} from "./classroom-client";
import {historyPositions,historyPositionIndex,sameHistoryPosition,type HistoryNote,type HistoryPosition} from "./classroom-history";
import "./classroom-move-notes.css";

type Page={notes:HistoryNote[];has_more:boolean};
type Navigation=Page&{points:HistoryPosition[];index:number;expectedFen:string};
export default function ClassroomMoveNotes({roomId,studentId,fen,busy,onRestore,controlsTarget}:{roomId:string;studentId?:string;fen:string;busy:boolean;onRestore:(id:number,before:boolean)=>Promise<void>;controlsTarget?:HTMLElement|null}){
  const [page,setPage]=useState<Page>({notes:[],has_more:false});
  const [error,setError]=useState("");const [working,setWorking]=useState(false);
  const generation=useRef(0);
  const navigationRef=useRef<Navigation|null>(null),operation=useRef(false);
  const [navigation,setNavigation]=useState<Navigation|null>(null);
  const updateNavigation=(next:Navigation|null)=>{navigationRef.current=next;setNavigation(next)};
  useEffect(()=>{if(navigationRef.current&&!sameHistoryPosition(navigationRef.current.expectedFen,fen))updateNavigation(null)},[fen]);
  useEffect(()=>{
    const token=++generation.current;let pending=false;
    setPage({notes:[],has_more:false});setError("");
    updateNavigation(null);
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
  const restore=async(id:number,before=false)=>{
    if(operation.current||busy)return;operation.current=true;setWorking(true);setError("");
    const note=page.notes.find(item=>item.id===id),points=historyPositions(page.notes),targetFen=before?note?.before_fen:note?.fen;
    if(targetFen)updateNavigation({...page,points,index:historyPositionIndex(points,targetFen),expectedFen:targetFen});
    try{await onRestore(id,before)}catch(e){updateNavigation(null);setError(e instanceof Error?e.message:"Could not restore this position.")}finally{operation.current=false;setWorking(false)}
  };
  const navigate=async(direction:"first"|"previous"|"next"|"latest")=>{
    if(operation.current||busy)return;operation.current=true;setWorking(true);setError("");const token=generation.current;
    try{
      let current=navigationRef.current||{...page,points:historyPositions(page.notes),index:historyPositionIndex(historyPositions(page.notes),fen),expectedFen:fen};
      if(current.index<0)throw Error("Waiting for the latest move to finish saving. Try again shortly.");
      // Freeze the navigation sequence: restores create audit records, not new forward steps.
      while(current.has_more&&(direction==="first"||direction==="previous"&&current.index===0)){
        const oldest=current.notes.at(-1)?.id;if(!oldest)break;
        const more=await classroom<Page>("move-notes",{room_id:roomId,student_id:studentId,before_id:oldest});
        if(generation.current!==token)return;
        if(more.has_more&&!more.notes.some(note=>note.id<oldest))throw Error("Earlier history could not load. Try again.");
        const notes=[...current.notes,...more.notes.filter(note=>!current.notes.some(old=>old.id===note.id))],points=historyPositions(notes),selected=current.points[current.index];
        let index=points.findIndex(point=>point.id===selected.id&&point.before===selected.before);
        if(index<0)index=historyPositionIndex(points.slice(0,Math.max(1,points.length-current.points.length+1)),selected.fen);
        current={notes,has_more:more.has_more,points,index:Math.max(0,index),expectedFen:current.expectedFen};
        setPage(previous=>({notes:[...previous.notes,...more.notes.filter(note=>!previous.notes.some(old=>old.id===note.id))],has_more:more.has_more}));
      }
      const index=direction==="first"?0:direction==="latest"?current.points.length-1:direction==="previous"?Math.max(0,current.index-1):Math.min(current.points.length-1,current.index+1);
      const selected=current.points[index];if(!selected)return;
      const next={...current,index,expectedFen:selected.fen};updateNavigation(next);
      if(!sameHistoryPosition(fen,selected.fen))await onRestore(selected.id,selected.before);
    }catch(e){updateNavigation(null);setError(e instanceof Error?e.message:"Could not restore history.")}finally{operation.current=false;setWorking(false)}
  };
  const points=navigation?.points||historyPositions(page.notes),position=navigation?.index??historyPositionIndex(points,fen),hasEarlier=(navigation?.has_more??page.has_more)||position>0,disabled=busy||working||position<0||Boolean(error);
  const controls=<nav className="classroom-history-controls" aria-label="Teacher-only board history">
    <span className="history-controls-label">MOVE HISTORY</span><div>
      <button type="button" aria-label="First recorded position" title="First recorded position" disabled={disabled||!hasEarlier} onClick={()=>void navigate("first")}><ChevronsLeft/></button>
      <button type="button" aria-label="Previous move" title="Previous move · teacher or student" disabled={disabled||!hasEarlier} onClick={()=>void navigate("previous")}><ChevronLeft/></button>
      <output aria-live="polite">{working?"Restoring…":position<0?"Syncing…":`${position+1} / ${points.length}${(navigation?.has_more??page.has_more)?"+":""}`}</output>
      <button type="button" aria-label="Next move" title="Next move · teacher or student" disabled={disabled||position>=points.length-1} onClick={()=>void navigate("next")}><ChevronRight/></button>
      <button type="button" aria-label="Latest recorded position" title="Latest recorded position" disabled={disabled||position>=points.length-1} onClick={()=>void navigate("latest")}><ChevronsRight/></button>
    </div><small>Restore a position, then continue teaching or playing.</small>
  </nav>;
  return <>{controlsTarget&&createPortal(controls,controlsTarget)}<aside className="classroom-move-notes" aria-label="Teacher-only move notes">
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
  </aside></>;
}
