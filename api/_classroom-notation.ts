import { Chess } from "chess.js";

/** SAN only for an actual legal move; teaching edits are explicitly labelled. */
export function classroomNotation(before:string,after:string){
  const normalize=(fen:string)=>fen==="start"?new Chess().fen():fen;
  const original=normalize(before),target=normalize(after);
  if(original===target)return {notation:"Saved position",move_number:null,color:null};
  try{
    for(const color of [original.split(" ")[1],original.split(" ")[1]==="w"?"b":"w"]){
      const parts=original.split(" ");
      if(parts[1]!==color){parts[1]=color;parts[3]="-";}
      const board=new Chess(parts.join(" "),{skipValidation:true});
      for(const move of board.moves({verbose:true})){
        const next=new Chess(board.fen(),{skipValidation:true});next.move(move);
        // Free teaching moves reset counters. Piece layout, rights and turn must agree.
        if(next.fen()===target||next.fen().split(" ").slice(0,3).join(" ")===target.split(" ").slice(0,3).join(" ")&&target.split(" ")[3]==="-")
          return {notation:move.san,move_number:Number(parts[5])||1,color:move.color};
      }
    }
    const from=new Chess(original,{skipValidation:true}),to=new Chess(target,{skipValidation:true});
    const removed=from.board().flat().filter(piece=>piece&&to.get(piece.square)?.type!==piece.type||piece&&to.get(piece.square)?.color!==piece.color);
    const added=to.board().flat().filter(piece=>piece&&from.get(piece.square)?.type!==piece.type||piece&&from.get(piece.square)?.color!==piece.color);
    if(added.length===1){
      const end=added[0]!;const start=removed.find(piece=>piece?.type===end.type&&piece.color===end.color);
      if(start)return {notation:`Teach: ${end.type==="p"?"":end.type.toUpperCase()}${start.square}–${end.square}`,move_number:null,color:end.color};
    }
  }catch{/* Piece setup can intentionally omit kings. */}
  return {notation:after==="start"?"Reset to start":"Position setup / restore",move_number:null,color:null};
}
