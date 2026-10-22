import test from 'node:test';
import assert from 'node:assert/strict';
import {gameRequest} from '../api/_rpg/service.mjs';
import {makeHero,saveInventory,read,insert,write} from '../api/_rpg/store.mjs';
import C from '../api/_rpg/src/inventory-core.js';
import {VectorTile} from '@mapbox/vector-tile';
import {PbfReader} from 'pbf';
import {database} from './helpers/rpg-db.mjs';

const register=(db,user='a',heroId='rogue')=>gameRequest(db,user,'POST',{action:'register',heroId,name:'Warrior '+user,skill:'punch'});
const roadPoints=async()=>Array.from({length:32},(_,i)=>({lat:11.257+i*.00015,lng:125}));
const gps=()=>({lat:11.26,lng:125,accuracy:5,time:Date.now()});
test('hero creation has two attacks, permanent identity, zero test currency, and simultaneous registrations choose one hero',async()=>{
 const db=database();const results=await Promise.allSettled([register(db),register(db,'a','mage')]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const doc=await read(db,'a');assert.equal(doc.heroId,'rogue');assert.deepEqual(doc.state.active,['basic','punch',null,null]);assert.equal(doc.state.cbg,0);assert.equal(C.validState(doc.state,doc.heroId),true);
 await assert.rejects(register(db,'a','mage'),/cannot be changed/);assert.equal((await gameRequest(db,'a','POST',{action:'init'})).game.heroId,'rogue');
});
test('client saves cannot change hero, forge XP, add unknown equipment or learn skills before leveling',()=>{
 const doc=makeHero({heroId:'rogue',name:'Warrior',skill:'punch'}),next=structuredClone(doc.state);next.level=88;next.totalXp=1218290;next.cbg=9999;saveInventory(doc,next);assert.equal(doc.state.level,1);assert.equal(doc.state.totalXp,0);assert.equal(doc.state.cbg,0);
 const forged=structuredClone(doc.state);forged.learned.push('stone_shard');forged.active[2]='stone_shard';assert.throws(()=>saveInventory(doc,forged),/skill choices/);
 const altered=structuredClone(doc.state);altered.name='Changed';assert.throws(()=>saveInventory(doc,altered),/locked/);
});
test('revision updates reject stale windows and keep the winning save',async()=>{
 const db=database(),doc=makeHero({heroId:'rogue',name:'Warrior',skill:'punch'});await insert(db,'a','rpg_profile','hero',doc);const other=await read(db,'a');await write(db,'a','rpg_profile','hero',doc);await assert.rejects(write(db,'a','rpg_profile','hero',other),/another window/);
});
test('map encounters remain road-based, require proximity, award XP once, and ignore forged battle stats',async()=>{
 const db=database();await register(db);const call=(input,method='POST')=>gameRequest(db,'a',method,input,{roadPoints});
 const world=await call({action:'spawn',gps:gps()});assert.equal(world.encounters.length,16);assert.ok(world.encounters.every(e=>e.lng===125&&!e.id.startsWith('guest')));
 const enemy=world.encounters[0];await assert.rejects(call({action:'encounter',target:enemy.id,gps:{...gps(),lat:12},profile:{level:88,stats:[999,999,999,999,999,999]}}),/10 meters/);
 let result=await call({action:'encounter',target:enemy.id,gps:{...gps(),lat:enemy.lat,lng:enemy.lng},profile:{level:88,stats:[999,999,999,999,999,999]}});assert.equal(result.battle.actors[0].level,1);
 const row=[...db.rows.values()].find(r=>r.item_kind==='rpg_profile');row.metadata.battle.actors[1].hp=1;
 result=await call({action:'attack',skill:'basic',version:result.battle.version});assert.equal(result.battle.status,'finished');assert.ok(result.progression.totalXp>0);const xp=result.progression.totalXp;
 assert.equal((await call({},'GET')).progression.totalXp,xp);assert.equal((await read(db,'a')).awards.length,1);await assert.rejects(call({action:'encounter',target:enemy.id,gps:{...gps(),lat:enemy.lat}}),/already/);
});
test('GPS sharing uses the saved hero and nearby PvP requires acceptance and correct turns',async()=>{
 const db=database();await register(db,'a');await register(db,'b','mage');
 for(const user of ['a','b'])await gameRequest(db,user,'POST',{channel:'presence',...gps(),heroId:'queen',level:88,name:'Forged'});
 const peers=await gameRequest(db,'a','GET',{channel:'presence'});assert.equal(peers.players.length,1);assert.equal(peers.players[0].heroId,'mage');assert.equal(peers.players[0].level,1);
 let b=(await gameRequest(db,'a','POST',{action:'challenge',target:peers.players[0].peerId})).battle;assert.equal(b.status,'pending');
 const incoming=(await gameRequest(db,'b','GET',{})).battle;assert.equal(incoming.me,1);b=(await gameRequest(db,'b','POST',{action:'accept',version:incoming.version})).battle;assert.equal(b.status,'active');
 await assert.rejects(gameRequest(db,'b','POST',{action:'attack',skill:'basic',version:b.version}),/Wait for your turn/);
 const updated=(await gameRequest(db,'a','POST',{action:'attack',skill:'basic',version:b.version})).battle;assert.equal(updated.turn,1);
 await gameRequest(db,'a','DELETE',{channel:'presence'});assert.equal((await gameRequest(db,'b','GET',{channel:'presence'})).players.length,0);
});
