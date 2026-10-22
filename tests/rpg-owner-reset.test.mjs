import test from 'node:test';
import assert from 'node:assert/strict';
import {database} from './helpers/rpg-db.mjs';
import {ownerRequest} from '../api/_rpg/owner.mjs';
import {gameRequest} from '../api/_rpg/service.mjs';
import {read} from '../api/_rpg/store.mjs';
const uid='11111111-1111-4111-8111-111111111111',actor='22222222-2222-4222-8222-222222222222';
function setup(){const db=database(),logs=[];const client={...db,from(table){if(table==='cb_admin_logs')return {insert:async value=>{logs.push(value);return {error:null};}};if(table==='cb_profiles'){let matched=true;return {select(){return this;},eq(k,v){matched=v===uid;return this;},ilike(k,v){matched=v.includes('tester');return this;},order(){return this;},limit:async()=>({data:matched?[{user_id:uid,username:'tester',display_name:'Test Player'}]:[],error:null}),maybeSingle:async()=>({data:matched?{user_id:uid,username:'tester',display_name:'Test Player'}:null,error:null})};}return db.from(table);}};return {client,logs};}
const register=(db,input={})=>gameRequest(db,uid,'POST',{action:'register',heroId:'rogue',name:'First Hero',skill:'punch',...input});
test('owner authorization, user search, confirmation and stale-review checks protect hero resets',async()=>{
 const {client}=setup();await register(client);
 for(const role of ['admin','player',undefined])await assert.rejects(ownerRequest(client,actor,role,{action:'owner_search',query:'tester'}),e=>e.status===403);
 assert.equal((await ownerRequest(client,actor,'owner',{action:'owner_search',query:'@tester'})).users.length,1);
 assert.equal((await ownerRequest(client,actor,'owner',{action:'owner_review',userId:uid})).hero.name,'First Hero');
 await assert.rejects(ownerRequest(client,actor,'owner',{action:'owner_reset',userId:uid,revision:0,confirmation:'wrong'}),/Type the selected username/);
 await assert.rejects(ownerRequest(client,actor,'owner',{action:'owner_reset',userId:uid,revision:99,confirmation:'tester'}),/hero changed/);
 assert.equal((await read(client,uid)).name,'First Hero');
});
test('reset preserves the old save, logs approval, blocks old clients and allows only one replacement hero',async()=>{
 const {client,logs}=setup();const before=(await register(client)).game,request={action:'owner_reset',userId:uid,revision:0,confirmation:'@tester'};
 const outcomes=await Promise.allSettled([ownerRequest(client,actor,'owner',request),ownerRequest(client,actor,'owner',request)]);assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);
 const init=await gameRequest(client,uid,'POST',{action:'init'});assert.equal(init.game,null);assert.ok(init.generation);assert.equal(logs.length,1);assert.equal(logs[0].action,'rpg_hero_reset');
 assert.ok([...client.rows.values()].some(r=>r.item_kind==='rpg_reset'&&r.metadata.previous.name==='First Hero'));
 await assert.rejects(gameRequest(client,uid,'POST',{action:'save',state:before}),e=>e.code==='hero_reset');
 await assert.rejects(register(client,{heroId:'mage'}),e=>e.code==='hero_reset');
 const results=await Promise.allSettled([register(client,{generation:init.generation,heroId:'mage',name:'Second Hero',skill:'fireball'}),register(client,{generation:init.generation,heroId:'archer',name:'Other Hero'})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const next=await read(client,uid);assert.equal(next.heroId,'mage');assert.equal(next.state.level,1);assert.equal(next.state.totalXp,0);assert.deepEqual(next.state.active,['basic','fireball',null,null]);
 assert.equal((await gameRequest(client,uid,'POST',{action:'save',state:next.state,generation:init.generation})).game.heroId,'mage');
 await assert.rejects(ownerRequest(client,actor,'owner',request),/hero changed/);
});
test('a reset closes old PvP without attaching it to the replacement hero',async()=>{
 const {client}=setup();await register(client);await gameRequest(client,actor,'POST',{action:'register',heroId:'mage',name:'Opponent',skill:'punch'});
 const gps={lat:11.26,lng:125,accuracy:5,time:Date.now()};for(const user of [uid,actor])await gameRequest(client,user,'POST',{channel:'presence',...gps});
 const target=(await gameRequest(client,actor,'GET',{channel:'presence'})).players[0];await gameRequest(client,actor,'POST',{action:'challenge',target:target.peerId});
 await ownerRequest(client,actor,'owner',{action:'owner_reset',userId:uid,revision:(await read(client,uid)).revision,confirmation:'tester'});
 assert.equal((await gameRequest(client,actor,'GET',{})).battle,null);assert.equal([...client.rows.values()].find(r=>r.item_kind==='rpg_battle').metadata.status,'cancelled');
});
