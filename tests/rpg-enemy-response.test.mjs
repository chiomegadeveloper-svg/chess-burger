import test from 'node:test';import assert from 'node:assert/strict';import * as R from '../api/_rpg/core.mjs';
const battle=()=>R.createBattle(R.profile({heroId:'assassin',name:'Warrior',level:1,stats:[200,4,4,4,20,4],active:['basic','punch',null,null]}),R.monster('windee',1),'monster');
test('a monster uses an affordable attack even when AP/MP is below the old recovery threshold',()=>{
 const b=battle();b.actors[1].ap=4;b.actors[1].mp=2;R.finishTurn(b);assert.equal(b.turn,0);assert.ok(b.events.some(e=>e.side===1&&e.skill==='basic'));assert.equal(b.actors[0].hp<200,true);
});
test('every blocked monster turn records defense/recovery, returns control, and eventually attacks again',()=>{
 const b=battle();b.actors[1].ap=0;b.actors[1].mp=0;
 for(let round=0;round<6;round++){const seq=b.eventSeq||0;R.finishTurn(b);assert.equal(b.turn,0);const actions=b.events.filter(e=>e.id>seq&&e.side===1);assert.equal(actions.length,1);assert.ok(actions[0].skill||['defend','recover'].includes(actions[0].kind));}
 assert.ok(b.report.actors[1].attacks>0);
});
test('cooldowns and strategic defense never skip a monster response or create a PvP AI turn',()=>{
 const b=battle();b.actors[1].ready.basic=100;R.finishTurn(b);assert.equal(b.events.at(-1).kind,'defend');assert.equal(b.turn,0);
 const p=battle();p.kind='pvp';R.finishTurn(p);assert.equal(p.turn,1);assert.equal(p.events.length,0);
});
