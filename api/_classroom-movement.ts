import {Chess} from "chess.js";
/** Locked student boards accept one legal move by the room's approved student side. */
export function legalStudentMove(before:string,after:string,color:"w"|"b"="w",strictTurn=false){
  try{
    const parts=(before==="start"?new Chess().fen():before).split(" ");
    if(strictTurn&&parts[1]!==color)return false;
    if(parts[1]!==color){parts[1]=color;parts[3]="-";}
    const position=new Chess(parts.join(" "),{skipValidation:true});
    return position.moves({verbose:true}).some(move=>{
      const next=new Chess(position.fen(),{skipValidation:true});
      next.move(move);
      return next.fen()===after;
    });
  }catch{return false;}
}

export function legalPlayMove(before:string,after:string){
  try{
    const position=new Chess(before==="start"?new Chess().fen():before,{skipValidation:true});
    return position.moves({verbose:true}).some(move=>{
      const next=new Chess(position.fen(),{skipValidation:true});next.move(move);return next.fen()===after;
    });
  }catch{return false;}
}

