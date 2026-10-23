import {Chess,type Square,type PieceSymbol,type Color} from 'chess.js';
/** Placement is idempotent; a second king relocates the existing king safely. */
export function placeClassroomPiece(fen:string,square:Square,code:string){
 const board=new Chess(fen==='start'?new Chess().fen():fen,{skipValidation:true});
 const piece={color:code[0] as Color,type:code[1] as PieceSymbol},existing=board.get(square);
 if(existing?.color===piece.color&&existing.type===piece.type)return board.fen();
 if(piece.type==='k')for(const row of board.board())for(const old of row)if(old?.type==='k'&&old.color===piece.color)board.remove(old.square);
 board.remove(square);
 if(!board.put(piece,square))throw Error('This piece cannot be placed here.');
 return board.fen();
}
