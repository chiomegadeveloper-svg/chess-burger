import {Chess} from 'chess.js';
const position=(fen:string)=>fen==='start'?new Chess().fen():fen;
export function assertClassroomPosition(expected:unknown,current:string){
 if(typeof expected==='string'&&position(expected)!==position(current))throw Object.assign(Error('The board changed. Your move was not applied; try again from the synced position.'),{status:409});
}
/** Compare-and-set prevents a delayed edit from replacing a newer position. */
export async function writeClassroomBoard(client:any,table:string,roomId:string,studentId:string|null,previous:any,patch:Record<string,unknown>){
 const values={...patch,version:(previous?.version||0)+1,updated_at:new Date(Math.max(Date.now(),(Date.parse(previous?.updated_at||'')||0)+1)).toISOString()};
 let query;
 if(previous){query=client.from(table).update(values).eq('room_id',roomId).eq('fen',previous.fen).eq('version',previous.version);if(studentId)query=query.eq('student_id',studentId);}
 else query=client.from(table).insert({...values,room_id:roomId,...(studentId?{student_id:studentId}:{})});
 const saved=await query.select('*').maybeSingle();
 if(saved.error||!saved.data)throw Object.assign(Error(saved.error?.code==='23505'||!saved.error?'The board changed. Refresh before moving again.':saved.error.message),{status:saved.error&&saved.error.code!=='23505'?500:409});
 return saved.data;
}
