import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {Chess} from 'chess.js';
import * as R from '../api/_rpg/core.mjs';
import P from '../api/_rpg/src/progression.js';
import C from '../api/_rpg/src/inventory-core.js';
import Offline from '../api/_rpg/src/offline-rules.js';
import {gameRequest} from '../api/_rpg/service.mjs';
import {read} from '../api/_rpg/store.mjs';
import {database} from './helpers/rpg-db.mjs';
const engine=Offline.create({Rules:R,Chess}),gps=()=>({lat:11.26,lng:125,accuracy:5,time:Date.now()});
async function fixture({potion=false}={}){const db=database(),call=(body,user='a')=>gameRequest(db,user,'POST',body,{roadPoints:async()=>[{lat:11.2602,lng:125}],rng:()=>.01});await call({action:'register',heroId:'rogue',name:'Offline Hero',skill:'punch'});const row=[...db.rows.values()].find(r=>r.item_kind==='rpg_profile');C.gainXp(row.metadata.state,P.threshold(88));if(potion){row.metadata.state.currentHp=10;C.place(row.metadata.state,row.metadata.state.items[0],'bag',0,0);}const batch=await call({action:'spawn',gps:gps()});row.metadata.encounters[0].level=1;const data=await call({action:'encounter',target:batch.encounters[0].id,gps:gps(),offline:true});return {db,call,data};}
test('harvest gains 20% of the selected maximum, rounds whole points and respects remaining room',()=>{
 const b=R.createBattle(R.profile({heroId:'rogue',name:'Hero',level:1,stats:[20,4,4,4,101,4],active:['basic',null,null,null],maxAp:99}),R.monster('erpack',1));
 b.actors[0].ap=0;b.actors[0].mp=0;assert.equal(R.harvestResult(b,0,'ap',true,'win'),20);assert.equal(R.harvestResult(b,0,'mp',true,'win'),20);
 b.actors[0].mp=100;assert.equal(R.harvestResult(b,0,'mp',true,'win'),1);assert.equal(R.harvestResult(b,0,'mp',false,'miss'),0);
 assert.equal(R.harvestAmount({maxAp:20},'ap'),4);assert.equal(R.harvestAmount({maxMp:38},'mp'),8);
});
test('offline turns replay from the locked server encounter; duplicate sync never repeats rewards',async()=>{
 const f=await fixture(),b=structuredClone(f.data.battle),ctx={...f.data.offline,elapsed:0,usedPotions:[],solved:[]},command={action:'attack',skill:'basic',t:100};
 engine.apply(b,command,ctx,100);assert.equal(b.status,'finished');assert.equal(b.winner,0);
 assert.equal((await read(f.db,'a')).battle.version,0,'local play makes no server turn writes');
 const input={action:'offlineFinish',sessionId:f.data.offline.id,battleId:b.id,commands:[command],winner:999,stats:[99999]};
 const result=await f.call(input);assert.equal(result.offlineSynced,true);assert.equal(result.battle.winner,0);assert.equal(result.battle.actors[0].hp,b.actors[0].hp);assert.equal((await read(f.db,'a')).awards.length,1);
 await f.call(input);assert.equal((await read(f.db,'a')).awards.length,1);assert.ok((await read(f.db,'a')).encounters[0].consumed);
});
test('forged skills, resources, potion ownership, clocks, unfinished results and other accounts are rejected',async()=>{
 const f=await fixture(),base={action:'offlineFinish',sessionId:f.data.offline.id,battleId:f.data.battle.id};
 for(const commands of [[{action:'attack',skill:'not-a-skill',t:1}],[{action:'usePotion',uid:'forged',t:1}],[{action:'defend',t:-1}],[{action:'leave',t:300001}],[{action:'defend',t:1}]])await assert.rejects(f.call({...base,commands}));
 await f.call({action:'register',heroId:'mage',name:'Other Hero',skill:'punch'},'b');await assert.rejects(f.call({...base,commands:[{action:'leave',t:1}]},'b'),/no longer available/);
 assert.equal((await read(f.db,'a')).awards.length,0);assert.equal((await read(f.db,'a')).battle.version,0);
});
test('local journal survives reload, needs no network to advance, and clears only after acknowledgement',async()=>{
 const f=await fixture(),storage=new Map(),window={RPGLive:{key:()=> 'account-a'},RPGBattleRules:R,RPGOfflineRules:Offline,Chess};
 vm.runInNewContext(fs.readFileSync('rpg/src/offline-combat.js','utf8'),{window,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},Date,JSON});
 const controller=window.RPGOfflineCombat.open(f.data.offline,f.data.battle,'rogue');controller.act({action:'attack',skill:'basic'});assert.equal(controller.battle.status,'finished');assert.equal(storage.size,1);
 const resumed=window.RPGOfflineCombat.resume('rogue');assert.equal(resumed.battle.id,controller.battle.id);assert.equal(resumed.payload().commands.length,1);
 const result=await f.call(JSON.parse(JSON.stringify(resumed.payload())));assert.equal(result.offlineSynced,true);resumed.clear();assert.equal(storage.size,0);
});
test('offline puzzle, chess, potion and five-minute expiry replay with the same resource totals',async()=>{
 const puzzles=JSON.parse(fs.readFileSync('api/_rpg/puzzles.json','utf8')),p=puzzles.find(p=>p.pool==='regular'),hero=R.profile({heroId:'tank',name:'Replay Hero',level:20,stats:[500,4,4,4,101,4],active:['basic','punch',null,null],maxAp:99});hero.mp=0;hero.ap=0;hero.hp=400;
 const b=R.createBattle(hero,R.monster('chaanack',1)),ctx={puzzles:[p],elos:[750],potions:[{uid:'owned',defId:'health_potion'}],usedPotions:[],solved:[],elapsed:0};let t=10;
 engine.apply(b,{action:'harvest',resource:'mp'},ctx,t++);
 while(b.challenge){const c=b.challenge;engine.apply(b,{action:'puzzleMove',move:p.moves[c.step]},ctx,t++);}
 assert.equal(b.harvestResult.amount,20);assert.equal(b.harvestResult.requested,20);assert.deepEqual(ctx.solved,[p.id]);
 engine.apply(b,{action:'harvest',resource:'ap'},ctx,t++);
 const moves=['e2e4','e7e5','d1h5','b8c6','f1c4','g8f6','h5f7'];
 for(let i=0;i<moves.length;i++)engine.apply(b,{action:i===moves.length-1?'chessFinish':'chessSave',move:moves[i]},ctx,t++);
 assert.equal(b.harvestResult.amount,20);assert.equal(b.actors[0].ap,20);assert.equal(b.harvestResult.success,true);
 const before=b.actors[0].hp;engine.apply(b,{action:'usePotion',uid:'owned'},ctx,t++);assert.deepEqual(ctx.usedPotions,['owned']);assert.equal(b.events.findLast(e=>e.kind==='potion').hpAfter,Math.min(500,before+100));assert.throws(()=>engine.apply(b,{action:'usePotion',uid:'owned'},ctx,t++),/not available/);
 engine.apply(b,{action:'timeout'},ctx,300000);assert.equal(b.status,'finished');assert.equal(b.endReason,'battle_limit');assert.equal(b.winner,null);
});
test('offline chess flag is an unsuccessful harvest and cannot grant a victory by submitting after the clock',()=>{
 const actor=R.profile({heroId:'tank',name:'Clock Hero',level:20,stats:[500,4,4,4,101,4],active:['basic',null,null,null],maxAp:99});actor.ap=0;
 const b=R.createBattle(actor,R.monster('chaanack',1)),ctx={puzzles:[],elos:[750],potions:[],usedPotions:[],solved:[],elapsed:0};engine.apply(b,{action:'harvest',resource:'ap'},ctx,0);engine.apply(b,{action:'chessSave',move:'e2e4'},ctx,60000);assert.equal(b.harvestResult.success,false);assert.equal(b.harvestResult.amount,0);assert.equal(b.challenge,null);
});

test('settlement consumes an issued bag potion once while saving the final hero health',async()=>{
 const f=await fixture({potion:true}),b=structuredClone(f.data.battle),ctx={...f.data.offline,elapsed:0,usedPotions:[],solved:[]},uid=ctx.potions[0].uid,commands=[{action:'usePotion',uid,t:10},{action:'attack',skill:'basic',t:20}];
 for(const command of commands)engine.apply(b,command,ctx,command.t);assert.equal(b.status,'finished');const input={action:'offlineFinish',sessionId:f.data.offline.id,battleId:b.id,commands};const settled=await f.call(input);assert.equal(settled.game.items.some(i=>i.uid===uid),false);assert.equal(settled.game.currentHp,b.actors[0].hp);const count=settled.game.items.length;assert.equal((await f.call(input)).game.items.length,count);assert.equal((await read(f.db,'a')).awards.length,1);
});
