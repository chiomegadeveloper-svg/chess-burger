import test from 'node:test';
import assert from 'node:assert/strict';
import C from '../api/_rpg/src/inventory-core.js';
import {guildLayout,guildRequest} from '../api/_rpg/guild-stash.mjs';
import {fixture} from './helpers/rpg-guild-sql.mjs';

const item=(uid,x,y)=>({uid,defId:'health_potion',where:'guild',x,y,rotation:0,rotated:false,...C.rollItem(C.itemMap.health_potion,1,()=>0,{rarity:'common',requiredLevel:1})});
const identity=items=>items.map(({x,y,rotation,rotated,...rest})=>rest).sort((a,b)=>a.uid.localeCompare(b.uid));
const valid=layout=>layout.items.every(i=>C.canPlace(layout,i,'stash',i.x,i.y,i.rotation));

test('arranging a 12-column stash keeps every column occupied correctly without overlaps or changing item rolls',()=>{
 const state=C.newState('rogue','Tester'),items=Array.from({length:120},(_,i)=>item('p-'+i,i%12,2+Math.floor(i/12)));
 const layout=guildLayout(state,items),before=identity(layout.items);
 assert.ok(valid(layout));assert.ok(C.autoArrange(layout,'stash'));assert.ok(valid(layout));
 assert.deepEqual(identity(layout.items),before);assert.equal(new Set(layout.items.map(i=>i.x+','+i.y)).size,120);
 assert.equal(Math.max(...layout.items.map(i=>i.y)),9);assert.ok(layout.items.some(i=>i.x===11));
});

test('guild arranging commits atomically, keeps ownership and currency, rejects stale revisions, and is idempotent',async()=>{
 const f=await fixture();try{
  const items=Array.from({length:30},(_,i)=>item('guild-'+i,i%12,7+Math.floor(i/12)));
  await f.db.query('insert into cb_rpg_guild_stashes(guild_id,revision,items,cbg_balance) values($1,7,$2,777)',[f.guild,JSON.stringify(items)]);
  const doc=await f.load(0),personal=structuredClone(doc.state.items),body={...f.request(doc,'guild','guild',7),action:'guildArrange',items:[]};
  await assert.rejects(guildRequest(f.client,f.users[2],f.docs[2],body),e=>e.status===403);
  await assert.rejects(guildRequest(f.client,f.users[0],doc,{...body,stashRevision:6}),/inventory changed/);
  const result=await guildRequest(f.client,f.users[0],doc,body);
  assert.equal(result.guildStash.revision,8);assert.equal(result.guildStash.cbg,777);
  assert.deepEqual(identity(result.guildStash.items),identity(items));assert.deepEqual(result.game.items,personal);
  assert.ok(valid(guildLayout(result.game,result.guildStash.items)));
  assert.ok(Math.max(...result.guildStash.items.map(i=>i.y))<7);
  const retried=await guildRequest(f.client,f.users[0],await f.load(0),body);
  assert.equal(retried.guildStash.revision,8);assert.deepEqual(retried.guildStash.items,result.guildStash.items);
  assert.equal((await f.db.query('select count(*)::int as n from cb_rpg_guild_transfers')).rows[0].n,1);
  assert.equal((await f.db.query('select gold_points from cb_profiles where user_id=$1',[f.users[0]])).rows[0].gold_points,0);
 }finally{await f.close();}
});

test('a shared stash change between arrange and commit rejects the old layout without losing the new item',async()=>{
 const f=await fixture();try{
  const items=[item('original',5,9)];await f.db.query('insert into cb_rpg_guild_stashes(guild_id,revision,items) values($1,1,$2)',[f.guild,JSON.stringify(items)]);
  const rpc=f.client.rpc;f.client.rpc=async(name,args)=>{
   await f.db.query('update cb_rpg_guild_stashes set revision=revision+1,items=$1 where guild_id=$2',[JSON.stringify([...items,item('new-member-item',8,9)]),f.guild]);
   return rpc(name,args);
  };
  await assert.rejects(guildRequest(f.client,f.users[0],await f.load(0),{...f.request(f.docs[0],'guild','guild',1),action:'guildArrange'}),/inventory changed/);
  const saved=(await f.db.query('select items,revision from cb_rpg_guild_stashes where guild_id=$1',[f.guild])).rows[0];
  assert.equal(saved.revision,2);assert.deepEqual(saved.items.map(i=>i.uid),['original','new-member-item']);
  assert.equal((await f.db.query('select count(*)::int as n from cb_rpg_guild_transfers')).rows[0].n,0);
 }finally{await f.close();}
});
