import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import C from '../api/_rpg/src/inventory-core.js';
import {makeHero,saveInventory} from '../api/_rpg/store.mjs';
import {normalize,recovery} from '../api/_rpg/rewards.mjs';

test('Postgres JSONB round trips do not normalize valid potions again or invalidate equipped inventory saves',async()=>{
 const db=new PGlite();try{
  let doc=makeHero({heroId:'assassin',name:'Equipped Hero',skill:'punch'});recovery(doc);
  const def=C.items.find(i=>i.category==='Weapons'),gear={uid:'weapon',defId:def.id,rotation:0,rotated:false,...C.rollItem(def,1,()=>0,{rarity:'rare',requiredLevel:1})};
  const spot=C.findSpace(doc.state,gear,'stash');C.place(doc.state,gear,'stash',spot.x,spot.y,spot.rotation);
  const roundtrip=async value=>(await db.query('select $1::jsonb as doc',[JSON.stringify(value)])).rows[0].doc;
  doc=await roundtrip(doc);const revision=doc.state.inventoryRevision;
  assert.equal(normalize(doc),false);assert.equal(doc.state.inventoryRevision,revision);
  const next=structuredClone(doc.state);const item=next.items.find(i=>i.uid==='weapon');
  assert.ok(C.place(next,item,'bag',0,0));
  // Object field order is not an equipment attribute.
  item.enhancement=Object.fromEntries(Object.entries(item.enhancement).reverse());
  saveInventory(doc,next);doc=await roundtrip(doc);
  assert.equal(normalize(doc),false);assert.equal(doc.state.inventoryRevision,revision);
  assert.equal(doc.state.items.find(i=>i.uid==='weapon').where,'bag');
  const forged=structuredClone(doc.state);forged.items.find(i=>i.uid==='weapon').enhancement.value++;
  assert.throws(()=>saveInventory(doc,forged),/attributes cannot be changed/);
 }finally{await db.close();}
});
