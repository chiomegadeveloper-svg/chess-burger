import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import sharp from 'sharp';
import C from '../api/_rpg/src/inventory-core.js';
import P from '../api/_rpg/src/progression.js';
import * as R from '../api/_rpg/core.mjs';
import {healthPotionDrops,loot} from '../api/_rpg/rewards.mjs';
import {merchantRequest,merchantDay,stock,buyPrice} from '../api/_rpg/merchant.mjs';
import {gameRequest} from '../api/_rpg/service.mjs';
import {read} from '../api/_rpg/store.mjs';
import {database} from './helpers/rpg-db.mjs';
const specs=[['health_potion',1,1,20,40,.8,'normal'],['cola_potion',1,2,30,80,.4,'cola'],['coconut_potion',2,2,60,120,.3,'coconut'],['tuba_wine_potion',2,2,80,160,.1,'tuba-wine']];
const item=id=>({uid:crypto.randomUUID(),defId:id,rotation:0,rotated:false,...C.rollItem(C.itemMap[id],10,()=>0,{rarity:'common'})});

test('four health consumables have the requested footprints, percentages, level prices and no gear bonuses',()=>{
 for(const [id,w,h,percent,basePrice,dropChance]of specs){
  const def=C.itemMap[id],potion=item(id);assert.deepEqual([def.w,def.h,def.restore.percent,def.basePrice,def.dropChance],[w,h,percent,basePrice,dropChance]);
  assert.equal(buyPrice(potion,6),basePrice+6);assert.equal(buyPrice(potion,88),basePrice+88);
  const state=C.newState('rogue','Tester');assert.ok(C.place(state,potion,'bag',0,0));assert.equal(C.validState(state,'rogue'),true);
  assert.deepEqual(C.itemBonus(potion),[0,0,0,0,0,0]);assert.deepEqual(C.passives(state),{});
  assert.deepEqual(C.size(def,1),{w:h,h:w});assert.equal(C.canPlace(state,item(id),'bag',0,0),false);
  const forged=structuredClone(state);forged.items[0].restore.percent=99;assert.equal(C.validState(forged,'rogue'),false);
 }
 assert.equal(buyPrice({defId:'mana_potion'},88),8);assert.equal(C.potions.amount('mana_potion',300),20);
});

test('each health drop chance has its exact boundary and rolls independently, including all four at once',()=>{
 const rolls=[.799999,.399999,.299999,.099999];let n=0;
 assert.deepEqual(healthPotionDrops(10,()=>rolls[n++]).map(i=>i.defId),specs.map(s=>s[0]));
 const edges=[.8,.4,.3,.1];n=0;assert.deepEqual(healthPotionDrops(10,()=>edges[n++]),[]);
 const multiple=loot(10,()=>0);for(const [id]of specs)assert.equal(multiple.filter(i=>i.defId===id).length,1,'no duplicate legacy health roll');
 assert.equal(multiple.filter(i=>!C.isConsumable(i)).length,1,'ordinary equipment still drops');
});

test('legacy health effects migrate once and JSONB key ordering cannot cause repeated inventory changes',()=>{
 const state=C.newState('rogue','Legacy'),potion=item('health_potion');potion.restore={resource:'hp',amount:20};potion.affix={id:'health',value:8};C.place(state,potion,'stash',0,0);
 assert.equal(C.normalizePotions(state),true);assert.deepEqual(state.items[0].restore,{resource:'hp',percent:20});assert.equal(state.items[0].affix,undefined);
 state.items[0].restore={percent:20,resource:'hp'};assert.equal(C.normalizePotions(state),false);assert.equal(C.validState(state,'rogue'),true);
});

test('Hero Room healing uses the equipped maximum, rounds once and never consumes a full-health potion',async()=>{
 for(const [id,,,percent]of specs){
  const db=database(),call=input=>gameRequest(db,'hero','POST',input);await call({action:'register',heroId:'rogue',name:'Potion Hero',skill:'punch'});
  const doc=[...db.rows.values()].find(r=>r.item_kind==='rpg_profile').metadata;C.gainXp(doc.state,P.threshold(10));doc.state.currentHp=1;
  const gear={uid:crypto.randomUUID(),defId:'armor_v1',rotation:0,rotated:false,...C.rollItem(C.itemMap.armor_v1,10,()=>0,{rarity:'common',requiredLevel:1})};assert.ok(C.place(doc.state,gear,'bag',0,0));
  const cap=C.totals(doc.state,P.baseStats(10))[0],potion=item(id),spot=C.findSpace(doc.state,potion,'stash');C.place(doc.state,potion,'stash',spot.x,spot.y,spot.rotation);
  const used=await call({action:'usePotion',uid:potion.uid});assert.equal(used.restored.amount,Math.round(cap*percent/100));assert.equal(used.game.currentHp,1+used.restored.amount);assert.ok(!used.game.items.some(i=>i.uid===potion.uid));
  const saved=[...db.rows.values()].find(r=>r.item_kind==='rpg_profile').metadata,next=item(id);saved.state.currentHp=cap;const nextSpot=C.findSpace(saved.state,next,'stash');C.place(saved.state,next,'stash',nextSpot.x,nextSpot.y,nextSpot.rotation);
  await assert.rejects(call({action:'usePotion',uid:next.uid}),/already full/);assert.ok((await read(db,'hero')).state.items.some(i=>i.uid===next.uid));
 }
});

test('each new bag potion replays offline as one turn, syncs its final health and debits its UID once',async()=>{
 for(const [id,,,percent]of specs){
  const db=database(),gps={lat:11.26,lng:125,accuracy:5,time:Date.now()},call=input=>gameRequest(db,'hero','POST',input,{roadPoints:async()=>[{lat:11.2602,lng:125}]});await call({action:'register',heroId:'rogue',name:'Local Potion',skill:'punch'});
  const doc=[...db.rows.values()].find(r=>r.item_kind==='rpg_profile').metadata;C.gainXp(doc.state,P.threshold(10));doc.state.currentHp=1;const potion=item(id);assert.ok(C.place(doc.state,potion,'bag',0,0));
  const spawned=await call({action:'spawn',gps});[...db.rows.values()].find(r=>r.item_kind==='rpg_profile').metadata.encounters[0].level=1;
  const started=await call({action:'encounter',target:spawned.encounters[0].id,gps,offline:true});assert.ok(started.offline.potions.some(p=>p.uid===potion.uid));
  const input={action:'offlineFinish',sessionId:started.offline.id,battleId:started.battle.id,commands:[{action:'usePotion',uid:potion.uid,t:1},{action:'leave',t:2}]};
  const result=await call(input),effect=result.battle.events.find(e=>e.kind==='potion');assert.equal(effect.amount,Math.round(56*percent/100));assert.equal(effect.hpAfter,1+effect.amount);assert.equal(result.battle.ply,2);
  assert.equal(result.game.currentHp,result.battle.actors[0].hp);assert.ok(!result.game.items.some(i=>i.uid===potion.uid));assert.equal((await call(input)).game.currentHp,result.game.currentHp);
 }
});

test('merchant charges current-level prices times quantity and rejects footprints that do not fit without charging',async()=>{
 for(const [id,,,percent,base]of specs){
  const now=Date.now(),day=merchantDay(now),doc={revision:0,state:C.newState('rogue','Buyer')};C.gainXp(doc.state,P.threshold(6));doc.merchant={day,level:1,sold:[],offers:stock('hero',day,1)};
  let balance=5000,trades=0;const client={from:()=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:{gold_points:balance}})}),rpc:async(name,args)=>{if(!args.p_document)return {data:doc};trades++;balance+=args.p_delta;return {data:{...args.p_document,revision:args.p_revision+1,state:{...args.p_document.state,cbg:balance}}};}};
  const services={merchantVisit:async()=>({id:'merchant',city:'Town'})},input={action:'merchantBuy',offerId:id,quantity:2,day,requestId:crypto.randomUUID(),price:0};
  const result=await merchantRequest(client,'hero',doc,input,now,services);assert.equal(balance,5000-2*(base+6));assert.equal(result.game.items.filter(i=>i.defId===id).length,2);assert.equal(result.merchant.potions.find(p=>p.id===id).price,base+6);
  await merchantRequest(client,'hero',doc,input,now,services);assert.equal(trades,1,'retry never charges twice');
  const previous=balance;await assert.rejects(merchantRequest(client,'hero',doc,{...input,quantity:99,requestId:crypto.randomUUID()},now,services),/cannot fit/);assert.equal(balance,previous);assert.equal(trades,1);
 }
});

test('all four isolated WebP sprites retain transparent margins and stay under 600KB',async()=>{
 for(const [,,,,,,name]of specs){
  const path=`public/rpg/assets/potions/${name}-v1.webp`,{data,info}=await sharp(path).ensureAlpha().raw().toBuffer({resolveWithObject:true});assert.ok(fs.statSync(path).size<600000);assert.equal(info.width,256);assert.equal(info.height,name==='cola'?512:256);
  for(let x=0;x<info.width;x++){assert.equal(data[x*4+3],0);assert.equal(data[((info.height-1)*info.width+x)*4+3],0);}
  for(let y=0;y<info.height;y++){assert.equal(data[y*info.width*4+3],0);assert.equal(data[(y*info.width+info.width-1)*4+3],0);}
 }
});
