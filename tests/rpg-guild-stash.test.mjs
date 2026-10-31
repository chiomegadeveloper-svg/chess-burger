import test from 'node:test';
import assert from 'node:assert/strict';
import C from '../api/_rpg/src/inventory-core.js';
import {makeHero,saveInventory} from '../api/_rpg/store.mjs';
import {normalize} from '../api/_rpg/rewards.mjs';
import {guildRequest} from '../api/_rpg/guild-stash.mjs';
import {gameRequest} from '../api/_rpg/service.mjs';

import {fixture} from './helpers/rpg-guild-sql.mjs';

test('read-only guild snapshots skip hero reads and writes',async()=>{
 const f=await fixture();try{
  const from=f.client.from;f.client.from=table=>{assert.notEqual(table,'cb_inventory_items','a stash refresh must not load or normalize the hero');return from(table);};
  const result=await gameRequest(f.client,f.users[0],'POST',{action:'guildStash'});assert.equal(result.guildStash.guild.id,f.guild);assert.equal(result.guildStash.cbg,0);assert.equal(result.walletCbg,0);
 }finally{await f.close();}
});

test('legacy guild potions withdraw atomically into either personal zone using the current consumable format',async()=>{
 const f=await fixture();try{
  for(const [index,to]of ['stash','bag'].entries()){
   const old={uid:'legacy-potion-'+index,defId:'health_potion',where:'guild',x:0,y:0,rotation:0,rotated:false,rarity:'common',consumable:true,restore:{hp:20},enhancement:{stat:0,name:'Vitality',value:1}};
   await f.db.query('insert into cb_rpg_guild_stashes(guild_id,revision,items) values($1,$2,$3) on conflict(guild_id) do update set revision=excluded.revision,items=excluded.items',[f.guild,index*2,JSON.stringify([old])]);
   const doc=await f.load(1),result=await guildRequest(f.client,f.users[1],doc,{...f.request(doc,'guild',to,index*2),uid:old.uid});
   const owned=result.game.items.find(i=>i.uid===old.uid);assert.equal(owned.where,to);assert.deepEqual(owned.restore,C.potions.get(owned).restore);assert.equal('enhancement' in owned,false);
   assert.equal(result.guildStash.items.length,0);assert.equal(C.validState(result.game,doc.heroId),true);
   assert.equal((await f.load(1)).state.items.filter(i=>i.uid===old.uid).length,1);
  }
 }finally{await f.close();}
});

test('members share a 12×12 stash; transfers retain exact item rolls and remove bag bonuses',async()=>{
 const f=await fixture();try{
  const before=C.totals(f.docs[0].state),deposit=f.request(f.docs[0],'bag','guild');
  let result=await guildRequest(f.client,f.users[0],f.docs[0],deposit);
  assert.equal(result.game.items.length,0);assert.equal(result.guildStash.items.length,1);assert.equal(result.guildStash.cols,12);assert.ok(C.totals(result.game)[1]<before[1]);
  const member=await guildRequest(f.client,f.users[1],f.docs[1],{action:'guildStash'});assert.equal(member.guildStash.items[0].uid,f.item.uid);
  result=await guildRequest(f.client,f.users[1],f.docs[1],f.request(f.docs[1],'guild','stash',1));
  assert.equal(result.guildStash.items.length,0);assert.equal(result.game.items[0].uid,f.item.uid);assert.deepEqual(result.game.items[0].attributes,f.item.attributes);assert.deepEqual(result.game.items[0].enhancement,f.item.enhancement);
  const stale=structuredClone(f.docs[0].state);stale.items=[{...f.item,where:'bag',x:0,y:0}];assert.throws(()=>saveInventory(f.docs[0],stale),/Unknown equipment/);
 }finally{await f.close();}
});

test('retries are idempotent; stale withdrawals, non-members and removed members cannot duplicate equipment',async()=>{
 const f=await fixture();try{
  const deposit=f.request(f.docs[0],'bag','guild');await guildRequest(f.client,f.users[0],f.docs[0],deposit);await guildRequest(f.client,f.users[0],await f.load(0),deposit);
  assert.equal((await f.db.query('select count(*)::int as n from cb_rpg_guild_transfers')).rows[0].n,1);
  await assert.rejects(guildRequest(f.client,f.users[2],f.docs[2],f.request(f.docs[2],'guild','stash',1)),e=>e.status===403);
  const snapshot=structuredClone(f.docs[1]),withdraw=f.request(snapshot,'guild','stash',1);await guildRequest(f.client,f.users[1],f.docs[1],withdraw);
  await assert.rejects(guildRequest(f.client,f.users[0],f.docs[0],f.request(f.docs[0],'guild','stash',1)),/inventory changed|already moved/);
  await f.db.query('delete from cb_guild_members where user_id=$1',[f.users[1]]);
  const result=await f.client.rpc('cb_rpg_guild_transfer',{p_user_id:f.users[1],p_guild_id:f.guild,p_request_id:withdraw.requestId,p_revision:0,p_stash_revision:1,p_document:snapshot,p_items:[],p_item_uid:f.item.uid,p_from:'guild',p_to:'stash'});
  assert.match(result.error.message,/still belong/);assert.equal((await f.load(1)).state.items.length,1);
 }finally{await f.close();}
});

test('failed SQL commits roll back both inventories and reject stale profile/stash revisions and active battles',async()=>{
 const f=await fixture();try{
  const base={p_user_id:f.users[0],p_guild_id:f.guild,p_request_id:crypto.randomUUID(),p_revision:0,p_stash_revision:1,p_document:{...f.docs[0],state:{...f.docs[0].state,items:[],inventoryRevision:1}},p_items:[{...f.item,where:'guild',x:0,y:0}],p_item_uid:f.item.uid,p_from:'bag',p_to:'guild'};
  let result=await f.client.rpc('cb_rpg_guild_transfer',base);assert.match(result.error.message,/inventory changed/);assert.equal((await f.load(0)).state.items.length,1);assert.equal((await f.db.query('select count(*)::int as n from cb_rpg_guild_stashes')).rows[0].n,0);
  result=await f.client.rpc('cb_rpg_guild_transfer',{...base,p_stash_revision:0,p_revision:1});assert.match(result.error.message,/inventory changed/);
  await f.db.query("update cb_inventory_items set metadata=jsonb_set(metadata,'{battle}','{\"status\":\"active\"}'::jsonb) where user_id=$1",[f.users[0]]);
  result=await f.client.rpc('cb_rpg_guild_transfer',{...base,p_stash_revision:0});assert.match(result.error.message,/Finish your battle/);
  await f.db.query("update cb_inventory_items set metadata=metadata-'battle' where user_id=$1",[f.users[0]]);
  await f.db.query("insert into cb_inventory_items values($1,'rpg_battle','pending',$2,now())",[f.users[1],JSON.stringify({participants:f.users.slice(0,2),status:'pending'})]);
  result=await f.client.rpc('cb_rpg_guild_transfer',{...base,p_stash_revision:0});assert.match(result.error.message,/Finish your battle/);
  const privilege=await f.db.query("select has_function_privilege('authenticated','cb_rpg_guild_transfer(uuid,uuid,uuid,integer,integer,jsonb,jsonb,text,text,text)','EXECUTE') as allowed,relrowsecurity from pg_class where oid='cb_rpg_guild_stashes'::regclass");assert.equal(privilege.rows[0].allowed,false);assert.equal(privilege.rows[0].relrowsecurity,true);
 }finally{await f.close();}
});

test('Hero Stash returns to 6×6 while distinct forged potion overflow retains exact item identities',()=>{
 const doc=makeHero({heroId:'rogue',name:'Hero',skill:'punch'});doc.state.grids.stash.rows=7;
 for(let i=0;i<40;i++)doc.state.items.push({uid:'potion-'+i,forged:{level:i+1,attributes:[],restores:[],curses:[]},defId:'health_potion',where:'stash',x:i%6,y:Math.floor(i/6),rotation:0,rotated:false,...C.rollItem(C.itemMap.health_potion,1)});
 assert.equal(normalize(doc),true);assert.deepEqual(doc.state.grids.stash,{cols:6,rows:6});assert.equal(doc.state.items.length,36);assert.equal(doc.pendingLoot.length,4);assert.equal(new Set([...doc.state.items,...doc.pendingLoot].map(i=>i.uid)).size,40);assert.equal(normalize(doc),false);
});

test('changing guilds with matching stash revisions cannot silently transfer into the new guild',async()=>{
 const f=await fixture();try{
  const nextGuild=crypto.randomUUID();await f.db.query('insert into cb_guilds values($1,$2)',[nextGuild,'New Guild']);
  await f.db.query('update cb_guild_members set guild_id=$1 where user_id=$2',[nextGuild,f.users[0]]);
  await assert.rejects(guildRequest(f.client,f.users[0],f.docs[0],f.request(f.docs[0],'bag','guild')),/guild changed/);
  assert.equal((await f.load(0)).state.items[0].uid,f.item.uid);assert.equal((await f.db.query('select count(*)::int as n from cb_rpg_guild_transfers')).rows[0].n,0);
 }finally{await f.close();}
});
