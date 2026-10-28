import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import C from '../api/_rpg/src/inventory-core.js';
import {makeHero,saveInventory} from '../api/_rpg/store.mjs';
import {normalize} from '../api/_rpg/rewards.mjs';
import {guildRequest} from '../api/_rpg/guild-stash.mjs';

async function fixture(){
 const db=new PGlite(),users=[crypto.randomUUID(),crypto.randomUUID(),crypto.randomUUID()],guild=crypto.randomUUID();
 await db.exec(`create role anon;create role authenticated;create role service_role;create table cb_profiles(user_id uuid primary key);create table cb_guilds(id uuid primary key,name text);create table cb_guild_members(user_id uuid primary key,guild_id uuid references cb_guilds);create table cb_inventory_items(user_id uuid,item_kind text,item_id text,metadata jsonb not null,updated_at timestamptz,primary key(user_id,item_kind,item_id));grant all on cb_profiles,cb_guilds,cb_guild_members,cb_inventory_items to service_role;`);
 await db.exec(fs.readFileSync('supabase/rpg-guild-stash.sql','utf8'));
 await db.query('insert into cb_guilds values($1,$2)',[guild,'Test Guild']);
 const docs=users.map((user,i)=>{const doc=makeHero({heroId:i===1?'mage':'rogue',name:'Player '+i,skill:'punch'});doc.recoveryGranted=true;doc.feedCursor={registered:true,level:1};return doc;});
 for(let i=0;i<users.length;i++){await db.query('insert into cb_profiles values($1)',[users[i]]);await db.query("insert into cb_inventory_items values($1,'rpg_profile','hero',$2,now())",[users[i],JSON.stringify(docs[i])]);if(i<2)await db.query('insert into cb_guild_members values($1,$2)',[users[i],guild]);}
 const client={from(table){const filters=[],args=[];let fields='*';return {select(value){fields=value;return this;},eq(key,value){args.push(value);filters.push('"'+key+'"=$'+args.length);return this;},async maybeSingle(){try{const result=await db.query('select '+fields+' from '+table+(filters.length?' where '+filters.join(' and '):'')+' limit 1',args);return {data:result.rows[0]||null,error:null};}catch(e){return {data:null,error:{message:e.message,code:e.code}};}}};},async rpc(name,args){try{const values=[args.p_user_id,args.p_guild_id,args.p_request_id,args.p_revision,args.p_stash_revision,JSON.stringify(args.p_document),JSON.stringify(args.p_items),args.p_item_uid,args.p_from,args.p_to];return {data:(await db.query('select cb_rpg_guild_transfer($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) as result',values)).rows[0].result,error:null};}catch(e){return {data:null,error:{message:e.message,code:e.code}};}}};
 const load=async i=>(await db.query("select metadata from cb_inventory_items where user_id=$1 and item_kind='rpg_profile'",[users[i]])).rows[0].metadata;
 const item={uid:crypto.randomUUID(),defId:'iron_dagger_v1',rotation:0,rotated:false,...C.rollItem(C.itemMap.iron_dagger_v1,1,()=>0,{rarity:'rare',requiredLevel:1})};C.place(docs[0].state,item,'bag',0,0);
 await db.query("update cb_inventory_items set metadata=$1 where user_id=$2",[JSON.stringify(docs[0]),users[0]]);
 const request=(doc,from,to,revision=0)=>({action:'guildTransfer',guildId:guild,uid:item.uid,from,to,x:0,y:0,rotation:0,requestId:crypto.randomUUID(),stashRevision:revision,inventoryRevision:doc.state.inventoryRevision||0});
 return {db,client,users,guild,docs,item,load,request,close:()=>db.close()};
}

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

test('Hero Stash returns to 6×6 while overflow remains recoverable with exact item identities',()=>{
 const doc=makeHero({heroId:'rogue',name:'Hero',skill:'punch'});doc.state.grids.stash.rows=7;
 for(let i=0;i<40;i++)doc.state.items.push({uid:'potion-'+i,defId:'health_potion',where:'stash',x:i%6,y:Math.floor(i/6),rotation:0,rotated:false,...C.rollItem(C.itemMap.health_potion,1)});
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
