import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import C from '../api/_rpg/src/inventory-core.js';
import {forgeQuote} from '../api/_rpg/forge.mjs';
import {gameRequest} from '../api/_rpg/service.mjs';
import {database} from './helpers/rpg-db.mjs';
async function fixture(kind='gear',balance=100){
 const db=database(),user='fee-player',call=(input,rng=()=>.9)=>gameRequest(db,user,'POST',input,{rng});
 await call({action:'register',heroId:'rogue',name:'Smith',skill:'punch'});db.wallets.set(user,balance);
 const doc=[...db.rows.values()].find(r=>r.item_kind==='rpg_profile').metadata;doc.state.items=[];
 for(let i=0;i<(kind==='gear'?3:1);i++){const def=C.itemMap[kind==='gear'?'iron_sword_v1':'health_potion'],item={uid:'ingredient-'+i,defId:def.id,rotation:0,rotated:false,...C.rollItem(def,5,()=>.9,{rarity:'common',iLvl:5,requiredLevel:1}),...(kind==='gear'?{}:{quantity:12})};assert.ok(C.place(doc.state,item,'stash',i*2,0));}
 const input={action:'forge',recipe:kind==='gear'?'gear':'coconut',uids:doc.state.items.map(i=>i.uid),requestId:'forge-fee-once',inventoryRevision:doc.state.inventoryRevision||0};return {db,user,doc,call,input};
}
test('forge pricing starts at 18 for two and adds 8 per additional consumed item, including potion units inside stacks',async()=>{
 for(const [count,cost]of[[2,18],[3,26],[4,34],[10,82],[128,1026]])assert.equal(C.forgeCost(count),cost);
 const f=await fixture('potion');assert.deepEqual(forgeQuote(f.doc,f.input),{fee:34,units:4});
 const g=await fixture();assert.deepEqual(forgeQuote(g.doc,g.input),{fee:26,units:3});
});
test('successful and failed gear attempts charge the server price exactly once; client-supplied prices cannot override it',async()=>{
 for(const success of [true,false]){const f=await fixture();let n=0;const result=await f.call({...f.input,fee:0,price:0},()=>n++===0?(success?0:.9):.9);
  assert.equal(result.forge.success,success);assert.equal(result.forge.fee,26);assert.equal(result.game.cbg,74);assert.equal(f.db.wallets.get(f.user),74);assert.equal(result.game.items.length,success?1:3);
  const retry=await f.call(f.input,()=>{throw Error('Retry must not roll');});assert.deepEqual(retry,result);assert.equal(f.db.forgeLedger.size,1);assert.equal(f.db.wallets.get(f.user),74);
 }
});
test('insufficient balance rejects before rolling, consuming ingredients or creating a payment receipt',async()=>{
 const f=await fixture('gear',25),before=structuredClone(f.doc);await assert.rejects(f.call(f.input,()=>{throw Error('Must not roll');}),/26 CBG/);assert.deepEqual(f.doc,before);assert.equal(f.db.wallets.get(f.user),25);assert.equal(f.db.forgeLedger.size,0);
});
test('four-potion recipes cost 34 even from one stack and preserve leftover units',async()=>{
 const f=await fixture('potion'),result=await f.call(f.input);assert.equal(result.forge.fee,34);assert.equal(result.game.cbg,66);assert.equal(result.game.items.find(i=>i.uid==='ingredient-0').quantity,8);
});
test('ordinary stacking stays free even with an empty wallet',async()=>{
 const f=await fixture('potion',0);f.doc.state.items=[];for(let i=0;i<2;i++){const item={uid:'stack'+i,defId:'coconut_potion',quantity:2,rotation:0,rotated:false,...C.rollItem(C.itemMap.coconut_potion,1,()=>.9,{rarity:'common'})};assert.ok(C.place(f.doc.state,item,'stash',i*2,0));}
 const result=await f.call({...f.input,recipe:'auto',uids:['stack0','stack1']});assert.equal(result.forge.fee,0);assert.equal(result.game.items[0].quantity,4);assert.equal(f.db.forgeLedger.size,0);assert.equal(f.db.wallets.get(f.user),0);
});
test('invalid ingredients and unavailable atomic transactions keep both wallet and inventory unchanged',async()=>{
 const f=await fixture(),before=structuredClone(f.doc);await assert.rejects(f.call({...f.input,uids:['foreign','other']}));assert.deepEqual(f.doc,before);
 f.db.rpc=async()=>({error:{code:'PGRST202'}});await assert.rejects(f.call(f.input),e=>e.status===503);assert.deepEqual(f.doc,before);assert.equal(f.db.wallets.get(f.user),100);
});
test('existing production wallet SQL atomically commits forge receipts and fees, rejects stale/broke attempts, and denies public execution',async()=>{
 const db=new PGlite();try{
  await db.exec('create role anon;create role authenticated;create role service_role;create table cb_profiles(user_id uuid primary key,gold_points integer not null);create table cb_inventory_items(user_id uuid,item_kind text,item_id text,metadata jsonb,updated_at timestamptz,primary key(user_id,item_kind,item_id));create table cb_gold_ledger(id text primary key,user_id uuid,delta integer,kind text,reference_id uuid);');
  await db.exec(fs.readFileSync('supabase/rpg-merchant-store.sql','utf8'));
  const user=crypto.randomUUID(),request=crypto.randomUUID(),doc={revision:0,state:{cbg:100,items:[{uid:'old'}]}};
  await db.query('insert into cb_profiles values($1,100)',[user]);await db.query("insert into cb_inventory_items values($1,'rpg_profile','hero',$2,now())",[user,JSON.stringify(doc)]);
  const next={...doc,state:{cbg:100,items:[{uid:'forged'}]},forgeReceipts:[{id:'forge-request',result:{success:true,fee:26}}]};
  const call=(id,revision,fee)=>db.query('select cb_rpg_merchant_trade($1,$2,$3,$4,$5) as doc',[user,id,revision,-fee,JSON.stringify(next)]);
  assert.equal((await call(request,0,26)).rows[0].doc.state.cbg,74);assert.equal((await call(request,0,26)).rows[0].doc.state.cbg,74);
  await assert.rejects(call(crypto.randomUUID(),1,82),/Not enough CBG/);await assert.rejects(call(crypto.randomUUID(),0,18),/inventory changed/);
  assert.equal((await db.query('select gold_points from cb_profiles')).rows[0].gold_points,74);assert.equal((await db.query('select count(*)::int as n from cb_gold_ledger')).rows[0].n,1);
  const stored=(await db.query('select metadata from cb_inventory_items')).rows[0].metadata;assert.equal(stored.state.items[0].uid,'forged');assert.equal(stored.forgeReceipts[0].result.fee,26);
  assert.equal((await db.query("select has_function_privilege('authenticated','cb_rpg_merchant_trade(uuid,uuid,integer,integer,jsonb)','EXECUTE') as allowed")).rows[0].allowed,false);
 }finally{await db.close();}
});
