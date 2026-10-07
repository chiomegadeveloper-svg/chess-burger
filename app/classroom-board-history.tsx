"use client";
import {useState,type ReactNode} from "react";
import ClassroomMoveNotes from "./classroom-move-notes";

/** Mounted exclusively in the teacher branch; the API enforces teacher access too. */
export default function ClassroomBoardHistory({children,...props}:{children:ReactNode;roomId:string;studentId?:string;fen:string;busy:boolean;onRestore:(id:number,before:boolean)=>Promise<void>}){
  const [controlsTarget,setControlsTarget]=useState<HTMLDivElement|null>(null);
  return <section className="classroom-history-shell"><div className="classroom-board-with-notes">
    <div>{children}<div ref={setControlsTarget}/></div>
    <ClassroomMoveNotes {...props} controlsTarget={controlsTarget}/>
  </div></section>;
}
