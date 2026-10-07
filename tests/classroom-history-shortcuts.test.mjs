import test from 'node:test';
import assert from 'node:assert/strict';
import {Chess} from 'chess.js';
import {historyPositions,historyPositionIndex,sameHistoryPosition} from '../app/classroom-history.ts';
const note=(id,before_fen,fen)=>({id,before_fen,fen,notation:'',actor:id%2?'Teacher':'Student',move_number:null,color:null,created_at:''});
test('both actors navigate chronological positions even when notes arrive newest first',()=>{
 const b=new Chess(),states=['start'];for(const san of ['e4','e5','Nf3']){b.move(san);states.push(b.fen())}
 const notes=states.slice(1).map((fen,i)=>note(i+1,states[i],fen)).reverse();const points=historyPositions(notes);
 assert.deepEqual(points.map(p=>p.fen),states);assert.deepEqual(points.map(p=>[p.id,p.before]),[[1,true],[1,false],[2,false],[3,false]]);
 assert.equal(historyPositionIndex(points,states[2]),2);
});
test('starting FEN aliases and consecutive identical snapshots do not create phantom steps',()=>{
 const start=new Chess().fen();assert.ok(sameHistoryPosition('start',start));const b=new Chess();b.move('e4');
 const points=historyPositions([note(1,'start',start),note(2,start,b.fen()),note(3,b.fen(),b.fen())]);assert.equal(points.length,2);assert.equal(points[1].id,2);
});
test('restored positions keep the earlier future and a continuing branch in chronology',()=>{
 const b=new Chess();b.move('e4');const e4=b.fen();b.move('e5');const e5=b.fen();const branch=new Chess(e4);branch.move('c5');
 const points=historyPositions([note(1,'start',e4),note(2,e4,e5),note(3,e5,e4),note(4,e4,branch.fen())]);
 assert.deepEqual(points.map(p=>p.fen),['start',e4,e5,e4,branch.fen()]);assert.equal(historyPositionIndex(points,e4),3);
});
test('pagination preserves the pre-move boundary and missing/current positions are detected',()=>{
 const b=new Chess();b.move('e4');const e4=b.fen();b.move('e5');const e5=b.fen();b.move('Nf3');
 const recent=historyPositions([note(3,e5,b.fen())]);assert.equal(recent[0].fen,e5);assert.equal(recent[0].before,true);
 const all=historyPositions([note(3,e5,b.fen()),note(2,e4,e5),note(1,'start',e4)]);assert.equal(all[0].fen,'start');assert.equal(historyPositionIndex(all,'not a board'),-1);assert.deepEqual(historyPositions([]),[]);
});
