import type {Chess,Square} from "chess.js";

// Permit the familiar king-to-rook gesture while chess.js still validates the castle.
export function castlingDestination(board:Chess,from:Square,to:Square):Square{
 const king=board.get(from),rook=board.get(to);
 if(king?.type!=="k"||rook?.type!=="r"||rook.color!==king.color||from[1]!==to[1])return to;
 const destination=(`${to[0]>from[0]?"g":"c"}${from[1]}`) as Square;
 return board.moves({square:from,verbose:true}).some(move=>move.to===destination&&(move.flags.includes("k")||move.flags.includes("q")))?destination:to;
}
