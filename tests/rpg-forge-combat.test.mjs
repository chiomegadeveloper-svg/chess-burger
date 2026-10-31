import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../api/_rpg/core.mjs';
const actor=(passives={})=>R.profile({heroId:'rogue',name:'Tester',level:1,stats:[1000,4,4,4,100,4],active:['basic',null,null,null],maxAp:100,passives});
const battle=(passives={},enemyPassives={})=>{const enemy=actor(enemyPassives);enemy.name='Enemy';return R.createBattle(actor(passives),enemy,'monster',1000);};
test('owner turn curses drain bounded resources and publish visible effects',()=>{
 const b=battle({curseLifeDrain:8,cursePoison:2,curseManaDrain:8});
 assert.equal(b.actors[0].hp,900);assert.equal(b.actors[0].mp,92);assert.equal(b.actors[1].hp,1000);
 assert.deepEqual(b.events.map(e=>e.curse),['lifeDrain','poison','manaDrain']);
 R.finishTurn(b,1100);assert.equal(b.turn,0);assert.ok(b.actors[0].hp<=800);assert.equal(b.actors[0].mp,84);
 const capped=battle({curseLifeDrain:1000,curseManaDrain:Infinity});assert.equal(capped.actors[0].hp,800);assert.equal(capped.actors[0].mp,100);
});
test('deterministic skips consume their turn and never leave AI turns stalled',()=>{
 const b=battle({curseSkip:20},{curseSkip:20});b.actors[1].ap=0;b.actors[1].mp=0;
 const replay=structuredClone(b);
 for(let i=0;i<14;i++){R.finishTurn(b,1200+i);R.finishTurn(replay,1200+i);assert.equal(b.status,'active');assert.equal(b.turn,0);assert.equal(b.challenge,null);}
 assert.deepEqual(b,replay);assert.ok(b.events.some(e=>e.curse==='skip'));assert.ok(b.report.actors[1].attacks>0);
});
test('a skipped player turn allows the next enemy action and harvest expiry still resolves',()=>{
 const b=battle({curseSkip:20});b.actors[0].curseSkipProgress=80;const attacks=b.report.actors[1].attacks;
 b.challenge={kind:'ap',side:0,moves:[],clocks:[10,10],clockAt:1000};R.timeout(b,1011);
 assert.equal(b.harvestResult.success,false);assert.equal(b.turn,0);assert.equal(b.ply,4);assert.equal(b.report.actors[1].attacks,attacks+2);
});
test('curse knockout ends battle before an affected enemy attacks',()=>{
 const b=battle({}, {cursePoison:20});b.actors[1].hp=1;R.finishTurn(b,1100);
 assert.equal(b.status,'finished');assert.equal(b.winner,0);assert.equal(b.report.actors[1].attacks,0);assert.equal(b.events.at(-1).curse,'poison');
});
test('plain actors preserve the usual single enemy response and action event timing',()=>{
 const b=battle();assert.deepEqual(b.events,[]);R.attack(b,0,'basic',1050);assert.equal(b.events.length,1);assert.equal(b.events[0].skill,'basic');
 R.finishTurn(b,1100);assert.equal(b.ply,2);assert.equal(b.turn,0);assert.equal(b.events.length,2);assert.equal(b.events[1].side,1);
});
test('forged potion keeps primary return value, restores each resource up to cap and applies bounded battle curses',()=>{
 const passives={cursePoison:18},b=battle(passives),a=b.actors[0];a.hp=500;a.mp=98;a.ap=99;
 const restored=R.potionFromItem(b,0,{defId:'health_potion',forged:{restores:[{resource:'hp',percent:8},{resource:'mp',percent:8},{resource:'ap',percent:8}],curses:[{id:'poison',value:8},{id:'manaDrain',value:2},{id:'skip',value:8}]}});
 assert.equal(restored,200);assert.equal(a.hp,780);assert.equal(a.mp,100);assert.equal(a.ap,100);assert.equal(a.passives.cursePoison,20);assert.equal(a.passives.curseManaDrain,2);assert.equal(a.passives.curseSkip,8);assert.equal(passives.cursePoison,18);
 assert.equal(b.events.filter(e=>e.kind==='potion').length,4);R.finishTurn(b,1100);assert.equal(b.turn,0);assert.equal(a.mp,98);assert.ok(b.events.some(e=>e.curse==='poison'&&!e.applied));
});
test('invalid forged effects are ignored and rejected potion attempts apply nothing',()=>{
 const b=battle();assert.throws(()=>R.potionFromItem(b,0,{defId:'health_potion',forged:{curses:[{id:'skip',value:8}]}}),/already full/);assert.deepEqual(b.actors[0].passives,{});
 b.actors[0].hp=1;R.potionFromItem(b,0,{defId:'health_potion',forged:{restores:[{resource:'hp',percent:999}],curses:[{id:'skip',value:999},{id:'bogus',value:8}]}});assert.equal(b.actors[0].hp,201);assert.deepEqual(b.actors[0].passives,{});
});

test('PvP acceptance can begin the initial cursed turn exactly once',()=>{
 const b=R.createBattle(actor({cursePoison:8}),actor(),'pvp',1000);assert.equal(b.actors[0].hp,1000);b.status='active';R.beginTurn(b,1100);R.beginTurn(b,1100);assert.equal(b.actors[0].hp,920);assert.equal(b.events.length,1);
});
