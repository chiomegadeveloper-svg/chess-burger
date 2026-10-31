import test from 'node:test';
import assert from 'node:assert/strict';
import C from '../api/_rpg/src/inventory-core.js';
import {forge} from '../api/_rpg/forge.mjs';
import {gameRequest} from '../api/_rpg/service.mjs';
import {database} from './helpers/rpg-db.mjs';
const document=()=>({state:C.newState('rogue','Smith')});
function put(doc,id,uid,x,quantity=1){const item={uid,defId:id,quantity,rotation:0,rotated:false,...C.rollItem(C.itemMap[id],5,()=>.9,{rarity:'common',iLvl:5,requiredLevel:1})};assert.ok(C.place(doc.state,item,'stash',x,0));return uid;}
test('dropping three compatible potion stacks preserves their combined quantity and target position',()=>{
 const doc=document(),uids=[put(doc,'coconut_potion','a',0,2),put(doc,'coconut_potion','b',2,3),put(doc,'coconut_potion','c',4,4)];
 const result=forge(doc,{recipe:'auto',uids},{rng:()=>{throw Error('Stacking must not roll');}});
 assert.equal(result.stacked,true);assert.equal(doc.state.items.length,1);assert.equal(result.item.uid,'c');assert.equal(result.item.quantity,9);assert.equal(result.item.x,4);assert.ok(C.validState(doc.state,'rogue'));
});
test('automatic multi-potion recipes use quantities and retain every unconsumed unit',()=>{
 for(const [amounts,expected,left]of[[[1,1],'cola_potion',0],[[2,1,1],'coconut_potion',0],[[6,3,2],'tuba_wine_potion',1]]){
  const doc=document(),uids=amounts.map((n,i)=>put(doc,'health_potion','n'+i,i,n)),result=forge(doc,{recipe:'auto',uids},{rng:()=>.9});
  assert.equal(result.item.defId,expected);assert.equal(doc.state.items.filter(i=>i.defId==='health_potion').reduce((n,i)=>n+C.quantity(i),0),left);assert.ok(C.validState(doc.state,'rogue'));
 }
 const doc=document(),uids=[put(doc,'health_potion','normal',0,3),put(doc,'cola_potion','cola',2,2)];
 assert.equal(forge(doc,{recipe:'auto',uids},{rng:()=>.9}).item.defId,'coconut_potion');
 assert.equal(doc.state.items.find(i=>i.uid==='normal').quantity,1);assert.equal(doc.state.items.find(i=>i.uid==='cola').quantity,1);
});
test('multi-equipment drops and retained forge tools accept three ingredients and failure keeps all of them',()=>{
 for(const recipe of ['auto','gear'])for(const success of [true,false]){
  const doc=document(),uids=['iron_sword_v1','wood_sword_v1','iron_dagger_v1'].map((id,i)=>put(doc,id,'gear'+i,i*2)),before=structuredClone(doc);let calls=0;
  const result=forge(doc,{recipe,uids},{rng:()=>calls++===0?(success?0:.9):.9});
  assert.equal(result.success,success);if(success){assert.ok(uids.every(id=>!doc.state.items.some(i=>i.uid===id)));assert.equal(doc.state.items.length,1);assert.ok(C.validState(doc.state,'rogue'));}else assert.deepEqual(doc,before);
 }
});
test('mixed resources, duplicate IDs and over-cap stacks reject without losing any ingredients',()=>{
 for(const mode of ['mixed','duplicate','cap']){
  const doc=document(),a=put(doc,'coconut_potion','a',0,600),b=put(doc,mode==='mixed'?'deepwell_elixir':'coconut_potion','b',2,600),before=structuredClone(doc);
  assert.throws(()=>forge(doc,{recipe:'auto',uids:mode==='duplicate'?[a,a]:[a,b]}));assert.deepEqual(doc,before);
 }
});
test('automatic multi-item API drops are saved once and replay safely after an uncertain response',async()=>{
 const db=database(),call=input=>gameRequest(db,'smith','POST',input,{rng:()=>.9});await call({action:'register',heroId:'rogue',name:'Smith',skill:'punch'});
 const doc=[...db.rows.values()].find(r=>r.item_kind==='rpg_profile').metadata;doc.state.items=[];
 const uids=[put(doc,'coconut_potion','a',0,2),put(doc,'coconut_potion','b',2,3),put(doc,'coconut_potion','c',4,4)],input={action:'forge',recipe:'auto',uids,requestId:'automatic-drop-once',inventoryRevision:doc.state.inventoryRevision||0};
 const first=await call(input),retry=await call(input);assert.deepEqual(retry,first);assert.equal(first.forge.item.quantity,9);assert.equal((await call({action:'init'})).game.items.length,1);
});
