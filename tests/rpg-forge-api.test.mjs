import test from 'node:test';
import assert from 'node:assert/strict';
import C from '../api/_rpg/src/inventory-core.js';
import {gameRequest} from '../api/_rpg/service.mjs';
import {read,saveInventory} from '../api/_rpg/store.mjs';
import {database} from './helpers/rpg-db.mjs';
async function fixture(){const db=database();const call=(input,services={})=>gameRequest(db,'forge-player','POST',input,services);await call({action:'register',heroId:'rogue',name:'Smith',skill:'punch'});const doc=[...db.rows.values()].find(r=>r.item_kind==='rpg_profile').metadata;doc.state.items=[];const item={uid:'normal-stack',defId:'health_potion',quantity:12,rotation:0,rotated:false,...C.rollItem(C.itemMap.health_potion,1,()=>0,{rarity:'common'})};C.place(doc.state,item,'stash',0,0);return {db,call,doc};}
test('forge API consumes exact stack units, persists results and replays request IDs without duplicating output',async()=>{const f=await fixture(),input={action:'forge',recipe:'coconut',uids:['normal-stack'],requestId:'forge-once',inventoryRevision:f.doc.state.inventoryRevision||0};const first=await f.call(input,{rng:()=>.65});assert.equal(first.forge.success,true);assert.equal(first.game.items.find(i=>i.uid==='normal-stack').quantity,8);assert.equal(first.game.items.filter(i=>i.defId==='coconut_potion').length,1);assert.ok(first.forge.item.forged.curses.length);const retry=await f.call(input,{rng:()=>{throw Error('Must not reroll');}});assert.deepEqual(retry,first);const init=await f.call({action:'init'});assert.deepEqual(init.game.items,first.game.items);await assert.rejects(f.call({...input,requestId:'stale-forge'}),/inventory changed/);});
test('compatible stacks combine through saves without permitting forged quantities or forge metadata',async()=>{const f=await fixture(),second={...structuredClone(f.doc.state.items[0]),uid:'normal-stack-2',quantity:2,x:2};f.doc.state.items.push(second);const layout=structuredClone(f.doc.state);assert.ok(C.place(layout,layout.items[1],'stash',0,0));assert.equal(layout.items.length,1);assert.equal(layout.items[0].quantity,14);saveInventory(f.doc,layout);const invalid=structuredClone(f.doc.state);invalid.items[0].quantity++;assert.throws(()=>saveInventory(f.doc,invalid),/quantities cannot/);const forged=structuredClone(f.doc.state);forged.items[0].forged={level:1,attributes:[],restores:[],curses:[]};assert.throws(()=>saveInventory(f.doc,forged),/attributes cannot|quantities cannot/);assert.equal(f.doc.state.items[0].quantity,14);});
test('Hero Room stack consumption removes one potion and queues forged curses without equipping consumable bonuses',async()=>{const f=await fixture();f.doc.state.currentHp=0;const item=f.doc.state.items[0];item.forged={level:1,attributes:[],restores:[{resource:'mp',percent:8},{resource:'ap',percent:8}],curses:[{id:'poison',value:4}]};f.doc.state.currentMp=0;f.doc.state.currentAp=0;const used=await f.call({action:'usePotion',uid:item.uid});assert.equal(used.game.items[0].quantity,11);assert.equal(used.game.currentHp,4);assert.equal(used.game.currentMp,2);assert.equal(used.game.currentAp,2);assert.deepEqual(C.itemBonus(item),[0,0,0,0,0,0]);assert.equal(C.passives(used.game).cursePoison,4);});

test('merge-only weapons never appear in ordinary monster drops, chest drops or merchant stock',async()=>{
 const {loot}=await import('../api/_rpg/rewards.mjs'),{chestLoot}=await import('../api/_rpg/chests.mjs'),{stock}=await import('../api/_rpg/merchant.mjs');
 for(const roll of [0,.1,.5,.8,.999999])for(const item of [...loot(30,()=>roll),...chestLoot('enchanted',30,()=>roll),...stock('smith','2026-10-31',30).map(o=>o.item)])assert.ok(!C.itemMap[item.defId].mergeOnly);
 assert.equal(C.items.filter(i=>i.mergeOnly).length,8);for(const def of C.items.filter(i=>i.mergeOnly))assert.equal(def.w*def.h,4);
});

test('a PvP potion stack debits one per turn and receipts reconcile the same UID more than once',async()=>{
 const db=database(),gps={lat:11.26,lng:125,accuracy:5,time:Date.now()},call=(user,input,method='POST')=>gameRequest(db,user,method,input);
 for(const user of ['a','b'])await call(user,{action:'register',heroId:'rogue',name:'Smith '+user,skill:'punch'});
 const doc=[...db.rows.values()].find(r=>r.user_id==='a'&&r.item_kind==='rpg_profile').metadata;doc.state.items=[];doc.state.currentHp=1;C.place(doc.state,{uid:'pvp-stack',defId:'health_potion',quantity:2,rotation:0,rotated:false,...C.rollItem(C.itemMap.health_potion,1,()=>0,{rarity:'common'})},'bag',0,0);
 for(const user of ['a','b'])await call(user,{channel:'presence',...gps});const target=(await call('a',{channel:'presence'},'GET')).players[0];let b=(await call('a',{action:'challenge',target:target.peerId})).battle;b=(await call('b',{action:'accept',version:b.version})).battle;
 b=(await call('a',{action:'usePotion',battlePotion:true,uid:'pvp-stack',version:b.version})).battle;assert.equal((await read(db,'a')).state.items[0].quantity,1);
 b=(await call('b',{action:'defend',version:b.version})).battle;b=(await call('a',{action:'usePotion',battlePotion:true,uid:'pvp-stack',version:b.version})).battle;assert.equal((await read(db,'a')).state.items.length,0);await call('a',{},'GET');assert.equal((await read(db,'a')).state.items.length,0);
});

test('long PvP battles retain every active potion receipt beyond 200 uses',async()=>{
 const db=database(),gps={lat:11.26,lng:125,accuracy:5,time:Date.now()},call=(user,input,method='POST')=>gameRequest(db,user,method,input);
 for(const user of ['a','b']){await call(user,{action:'register',heroId:'rogue',name:'Smith '+user,skill:'punch'});await call(user,{channel:'presence',...gps});}
 const peer=(await call('a',{channel:'presence'},'GET')).players[0];let b=(await call('a',{action:'challenge',target:peer.peerId})).battle;b=(await call('b',{action:'accept',version:b.version})).battle;
 const doc=[...db.rows.values()].find(r=>r.user_id==='a'&&r.item_kind==='rpg_profile').metadata,shared=[...db.rows.values()].find(r=>r.item_kind==='rpg_battle').metadata;
 doc.state.items=[];C.place(doc.state,{uid:'long-stack',defId:'health_potion',quantity:799,rotation:0,rotated:false,...C.rollItem(C.itemMap.health_potion,1,()=>0,{rarity:'common'})},'bag',0,0);
 shared.state.potions=Array.from({length:201},(_,i)=>({side:0,uid:'long-stack',id:'potion-'+i}));doc.battlePotionReceipts=shared.state.potions.slice(0,200).map(p=>b.id+':'+p.id);
 await call('a',{},'GET');assert.equal((await read(db,'a')).state.items[0].quantity,798);await call('a',{},'GET');assert.equal((await read(db,'a')).state.items[0].quantity,798);assert.equal((await read(db,'a')).battlePotionReceipts.length,201);
});

test('all eight merge-only weapon sprites have complete padded transparent four-slot artwork',async()=>{
 const sharp=(await import('sharp')).default,fs=await import('node:fs/promises');
 for(const def of C.items.filter(i=>i.mergeOnly)){
  const path='public/rpg/assets/merge-weapons/'+def.id.replaceAll('_','-')+'.webp',file=await fs.readFile(path),{data,info}=await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject:true});assert.ok(file.length<600000);assert.deepEqual([info.width,info.height],[256,1024]);
  let left=info.width,right=0,top=info.height,bottom=0;for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*4+3]>0){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}assert.ok(left>=10&&right<=245&&top>=30&&bottom<=993,def.id+' transparent padding');assert.ok(bottom-top>500,def.id+' visible weapon');
 }
});
