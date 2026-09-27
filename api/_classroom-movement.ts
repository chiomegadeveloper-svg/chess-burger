import { Chess } from "chess.js";

/** Locked student boards accept one legal White chess move per update. */
export function legalStudentMove(before:string,after:string){
  try{
    const position=new Chess(before==="start"?new Chess().fen():before,{skipValidation:true});
    if(position.turn()!=="w")return false;
    return position.moves({verbose:true}).some(move=>{
      const next=new Chess(position.fen(),{skipValidation:true});
      next.move(move);
      return next.fen()===after;
    });
  }catch{return false;}
}
