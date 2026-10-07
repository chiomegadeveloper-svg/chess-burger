export type HistoryNote={id:number;fen:string;before_fen:string;notation:string;actor:string;move_number:number|null;color:string|null;created_at:string};
export type HistoryPosition={id:number;before:boolean;fen:string};
const start="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
export const sameHistoryPosition=(a:string,b:string)=>(a==="start"?start:a)===(b==="start"?start:b);

/** Keep chronology and repeated positions, but omit consecutive identical snapshots. */
export function historyPositions(notes:HistoryNote[]):HistoryPosition[]{
  const ordered=[...notes].sort((a,b)=>a.id-b.id);
  if(!ordered.length)return [];
  const points:HistoryPosition[]=[{id:ordered[0].id,before:true,fen:ordered[0].before_fen}];
  for(const note of ordered){
    if(!sameHistoryPosition(points.at(-1)!.fen,note.fen))points.push({id:note.id,before:false,fen:note.fen});
  }
  return points;
}

export function historyPositionIndex(points:HistoryPosition[],fen:string){
  for(let index=points.length-1;index>=0;index--)if(sameHistoryPosition(points[index].fen,fen))return index;
  return -1;
}
