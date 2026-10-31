import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import sharp from 'sharp';
import C from '../api/_rpg/src/inventory-core.js';
import P from '../api/_rpg/src/progression.js';
import * as R from '../api/_rpg/core.mjs';
import {potionDrops,loot} from '../api/_rpg/rewards.mjs';
import {merchantRequest,merchantDay,stock} from '../api/_rpg/merchant.mjs';
import {gameRequest} from '../api/_rpg/service.mjs';
import {read} from '../api/_rpg/store.mjs';
import {database} from './helpers/rpg-db.mjs';
const defs=[...C.potions.mana,...C.potions.attack];
const item=id=>({uid:crypto.randomUUID(),defId:id,rotation:0,rotated:false,...C.rollItem(C.itemMap[id],10,()=>0,{rarity:'common'})});
const gps=()=>({lat:11.26,lng:125,accuracy:5,time:Date.now()});

test('each mana and AP tier matches health percentages, footprint, price and independent drop chance without equipment attributes',()=>{
 assert.equal(defs.length,8);assert.equal(C.potions.items.length,12);
 for(const family of [C.potions.mana,C.potions.attack])for(const [i,def]of family.entries()){
  const health=C.potions.health[i],potion=item(def.id),state=C.newState('rogue','Tester');
  assert.deepEqual([def.w,def.h,def.basePrice,def.dropChance,def.restore.percent],[health.w,health.h,health.basePrice,health.dropChance,health.restore.percent]);
  assert.equal(C.potions.price(potion,6),health.basePrice+6);assert.equal(C.potions.price(potion,88),health.basePrice+88);
  assert.equal(C.potions.amount(potion,47),Math.round(47*def.restore.percent/100));
  assert.ok(C.place(state,potion,'bag',0,0));assert.ok(C.validState(state,'rogue'));assert.deepEqual(C.itemBonus(potion),[0,0,0,0,0,0]);assert.deepEqual(C.passives(state),{});
  for(const key of ['enhancement','attributes','baseBonus','requiredLevel','iLvl','affix'])assert.equal(key in potion,false);
 }
 const below=C.potions.items.map(d=>d.dropChance-.000001),edges=C.potions.items.map(d=>d.dropChance);let n=0;
 assert.deepEqual(potionDrops(10,()=>below[n++]).map(i=>i.defId),C.potions.items.map(d=>d.id));
 n=0;assert.deepEqual(potionDrops(10,()=>edges[n++]),[]);
 const drops=loot(10,()=>0);for(const def of C.potions.items)assert.equal(drops.filter(i=>i.defId===def.id).length,1,'no duplicated legacy potion slot');
});

test('saved flat mana potions migrate in place and stay valid across JSONB key ordering',()=>{
 const state=C.newState('rogue','Legacy'),potion=item('mana_potion');potion.restore={resource:'mp',amount:20};C.place(state,potion,'stash',0,0);
 const saved=state.items.find(i=>i.uid===potion.uid),position={uid:saved.uid,x:saved.x,y:saved.y,where:saved.where};assert.equal(C.normalizePotions(state),true);
 assert.deepEqual(state.items.find(i=>i.uid===potion.uid).restore,{resource:'mp',percent:20});
 assert.deepEqual(Object.fromEntries(Object.keys(position).map(k=>[k,state.items.find(i=>i.uid===potion.uid)[k]])),position);
 state.items.find(i=>i.uid===potion.uid).restore={percent:20,resource:'mp'};assert.equal(C.normalizePotions(state),false);assert.ok(C.validState(state,'rogue'));
});

test('Hero Room restores the correct mana or AP percentage, caps it and refuses full-resource consumption',async()=>{
 for(const def of defs){
  const db=database(),call=input=>gameRequest(db,'hero','POST',input,{roadPoints:async()=>[{lat:11.2602,lng:125}]});await call({action:'register',heroId:'rogue',name:'Potion Hero',skill:'punch'});
  const doc=[...db.rows.values()].find(r=>r.item_kind==='rpg_profile').metadata;C.gainXp(doc.state,P.threshold(10));
  const info=C.potions.resources[def.restore.resource],cap=def.restore.resource==='mp'?47:38;doc.state[info.state]=1;
  const potion=item(def.id),spot=C.findSpace(doc.state,potion,'stash');assert.ok(spot);C.place(doc.state,potion,'stash',spot.x,spot.y,spot.rotation);
  const used=await call({action:'usePotion',uid:potion.uid});assert.deepEqual(used.restored,{resource:def.restore.resource,amount:Math.round(cap*def.restore.percent/100)});assert.equal(used.game[info.state],1+used.restored.amount);
  assert.ok(!used.game.items.some(i=>i.uid===potion.uid));
  if(def.restore.resource==='ap'){const fix=gps(),spawned=await call({action:'spawn',gps:fix}),started=await call({action:'encounter',target:spawned.encounters[0].id,gps:fix});assert.equal(started.battle.actors[0].ap,used.game.currentAp,'restored AP carries into the next battle');await call({action:'leave',version:started.battle.version});}
  const saved=[...db.rows.values()].find(r=>r.item_kind==='rpg_profile').metadata;saved.state[info.state]=cap-1;const next=item(def.id),space=C.findSpace(saved.state,next,'stash');C.place(saved.state,next,'stash',space.x,space.y,space.rotation);
  const capped=await call({action:'usePotion',uid:next.uid});assert.equal(capped.game[info.state],cap);assert.equal(capped.restored.amount,1);
  const full=[...db.rows.values()].find(r=>r.item_kind==='rpg_profile').metadata,last=item(def.id),lastSpace=C.findSpace(full.state,last,'stash');C.place(full.state,last,'stash',lastSpace.x,lastSpace.y,lastSpace.rotation);
  await assert.rejects(call({action:'usePotion',uid:last.uid}),/already full/);assert.ok((await read(db,'hero')).state.items.some(i=>i.uid===last.uid));
 }
});

test('all eight battle potions restore the proper capped resource and use one turn; browser and server agree',()=>{
 const ctx={};vm.runInNewContext(fs.readFileSync('public/rpg/vendor/battle-core.js','utf8'),ctx);
 for(const def of defs){
  const make=()=>R.createBattle(R.profile({heroId:'rogue',name:'Hero',level:10,stats:P.baseStats(10),active:['basic',null,null,null]}),R.monster('chaanack',1));
  const b=make(),resource=def.restore.resource;b.actors[0][resource]=0;
  const expected=Math.round(b.actors[0][C.potions.resources[resource].cap]*def.restore.percent/100);
  assert.equal(R.potionFromItem(b,0,item(def.id)),expected);assert.equal(b.events[0].resource,resource);
  R.finishTurn(b);assert.equal(b.ply,2);assert.equal(b.turn,0);
  const browser=make();browser.actors[0][resource]=0;assert.equal(ctx.RPGBattleRules.potionFromItem(browser,0,item(def.id)),expected);
  const full=make();assert.throws(()=>R.potionFromItem(full,0,item(def.id)),/already full/);assert.equal(full.ply,0);
  full.turn=1;assert.throws(()=>R.potionFromItem(full,0,item(def.id)),/only on your turn/);
 }
});

test('local battle replay accepts each potion once, records one turn and persists AP and mana balances',async()=>{
 for(const def of defs){
  const db=database(),call=input=>gameRequest(db,'hero','POST',input,{roadPoints:async()=>[{lat:11.2602,lng:125}]});await call({action:'register',heroId:'rogue',name:'Local Potion',skill:'punch'});
  const doc=[...db.rows.values()].find(r=>r.item_kind==='rpg_profile').metadata;C.gainXp(doc.state,P.threshold(10));doc.state.currentHp=56;doc.state.currentMp=47;doc.state.currentAp=38;
  const potion=item(def.id);C.place(doc.state,potion,'bag',0,0);const fix=gps(),spawned=await call({action:'spawn',gps:fix});[...db.rows.values()].find(r=>r.item_kind==='rpg_profile').metadata.encounters[0].level=1;
  const started=await call({action:'encounter',target:spawned.encounters[0].id,gps:fix,offline:true});
  const input={action:'offlineFinish',sessionId:started.offline.id,battleId:started.battle.id,commands:[{action:'attack',skill:'basic',t:1},{action:'usePotion',uid:potion.uid,t:2},{action:'leave',t:3}]};
  const result=await call(input),event=result.battle.events.find(e=>e.kind==='potion');assert.equal(event.resource,def.restore.resource);assert.equal(event.amount,def.restore.resource==='ap'?4:2);assert.equal(result.battle.ply,4);
  assert.ok(!result.game.items.some(i=>i.uid===potion.uid));assert.equal(result.game.currentAp,result.battle.actors[0].ap);assert.equal(result.game.currentMp,result.battle.actors[0].mp);
  const retry=await call(input);assert.equal(retry.game.items.length,result.game.items.length);assert.equal(retry.game.currentAp,result.game.currentAp);
 }
});

test('merchant sells all twelve potions and charges tier price times quantity atomically',async()=>{
 for(const def of defs){
  const now=Date.now(),day=merchantDay(now),doc={revision:0,state:C.newState('rogue','Buyer')};C.gainXp(doc.state,P.threshold(6));doc.merchant={day,level:1,sold:[],offers:stock('hero',day,1)};
  let balance=5000,trades=0;const client={from:()=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:{gold_points:balance}})}),rpc:async(name,args)=>{if(!args.p_document)return {data:doc};trades++;balance+=args.p_delta;return {data:{...args.p_document,revision:args.p_revision+1,state:{...args.p_document.state,cbg:balance}}};}};
  const services={merchantVisit:async()=>({id:'merchant',city:'Town'})},input={action:'merchantBuy',offerId:def.id,quantity:2,day,requestId:crypto.randomUUID(),price:0};
  const result=await merchantRequest(client,'hero',doc,input,now,services);assert.equal(result.merchant.potions.length,12);assert.equal(balance,5000-2*(def.basePrice+6));assert.equal(result.game.items.filter(i=>i.defId===def.id).reduce((n,i)=>n+C.quantity(i),0),2);
  await merchantRequest(client,'hero',doc,input,now,services);assert.equal(trades,1);
  for(const i of doc.state.items)i.quantity=999;for(let n=0;n<36;n++){const filler={uid:crypto.randomUUID(),defId:'health_potion',rotation:0,rotated:false,quantity:999,...C.rollItem(C.itemMap.health_potion,1,()=>0,{rarity:'common'})},spot=C.findSpace(doc.state,filler,'stash');if(!spot)break;C.place(doc.state,filler,'stash',spot.x,spot.y,spot.rotation);} const before=balance;await assert.rejects(merchantRequest(client,'hero',doc,{...input,quantity:99,requestId:crypto.randomUUID()},now,services),/cannot fit/);assert.equal(balance,before);
 }
});

test('PvP AP potions require ownership, consume one turn and reconcile the bag UID once',async()=>{
 const db=database(),call=(user,input,method='POST')=>gameRequest(db,user,method,input);
 for(const user of ['a','b']){await call(user,{action:'register',heroId:'rogue',name:'Fighter '+user,skill:'punch'});await call(user,{channel:'presence',...gps()});}
 const doc=[...db.rows.values()].find(r=>r.user_id==='a'&&r.item_kind==='rpg_profile').metadata,potion=item('cyan_spark');assert.ok(C.place(doc.state,potion,'bag',0,0));
 const peers=await call('a',{channel:'presence'},'GET');let response=await call('a',{action:'challenge',target:peers.players[0].peerId});response=await call('b',{action:'accept',version:response.battle.version});
 response=await call('a',{action:'attack',skill:'basic',version:response.battle.version});assert.equal(response.battle.actors[0].ap,16);
 await assert.rejects(call('b',{action:'usePotion',battlePotion:true,uid:potion.uid,version:response.battle.version}),/owned potion/);
 response=await call('b',{action:'defend',version:response.battle.version});response=await call('a',{action:'usePotion',battlePotion:true,uid:potion.uid,version:response.battle.version});
 assert.equal(response.battle.actors[0].ap,20);assert.equal(response.battle.turn,1);assert.equal(response.battle.events.at(-1).resource,'ap');assert.ok(!response.game.items.some(i=>i.uid===potion.uid));
 const count=response.game.items.length;await call('a',{},'GET');const saved=await read(db,'a');assert.equal(saved.state.items.length,count);assert.equal(saved.battlePotionReceipts.length,1);
});

test('eight potion WebPs have isolated alpha margins, matching tall footprints and sub-600KB sizes',async()=>{
 const manifest=JSON.parse(fs.readFileSync('docs/rpg-potion-sprites-v1032.json','utf8'));assert.equal(manifest.sprites.length,8);
 for(const asset of manifest.sprites){
  const {data,info}=await sharp(asset.output).ensureAlpha().raw().toBuffer({resolveWithObject:true});assert.ok(fs.statSync(asset.output).size<600000);assert.equal(info.width,256);assert.equal(info.height,asset.footprint[0]===1&&asset.footprint[1]===2?512:256);
  for(let x=0;x<info.width;x++){assert.equal(data[x*4+3],0);assert.equal(data[((info.height-1)*info.width+x)*4+3],0);}
  for(let y=0;y<info.height;y++){assert.equal(data[y*info.width*4+3],0);assert.equal(data[(y*info.width+info.width-1)*4+3],0);}
 }
});
