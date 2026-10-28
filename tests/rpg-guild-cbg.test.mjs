import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {guildRequest} from '../api/_rpg/guild-stash.mjs';
import {fixture} from './helpers/rpg-guild-sql.mjs';

const request=(f,direction,amount,id=crypto.randomUUID())=>({action:'guildCbg',guildId:f.guild,requestId:id,direction,amount});
const balances=async f=>({wallets:(await f.db.query('select gold_points from cb_profiles order by user_id')).rows.map(r=>r.gold_points),shared:Number((await f.db.query('select cbg_balance from cb_rpg_guild_stashes where guild_id=$1',[f.guild])).rows[0]?.cbg_balance||0)});
async function seed(f,a=300,b=50){await f.db.query('update cb_profiles set gold_points=$1 where user_id=$2',[a,f.users[0]]);await f.db.query('update cb_profiles set gold_points=$1 where user_id=$2',[b,f.users[1]]);}

test('member deposits and withdrawals conserve CBG, use real wallets and preserve equipment',async()=>{
 const f=await fixture();try{await seed(f);f.docs[0].state.cbg=999999;
  const initial=structuredClone(f.docs[0].state.items);let result=await guildRequest(f.client,f.users[0],f.docs[0],request(f,'deposit',100));
  assert.equal(result.walletCbg,200);assert.equal(result.guildStash.cbg,100);assert.equal(result.game.cbg,200);assert.deepEqual(result.game.items,initial);
  result=await guildRequest(f.client,f.users[1],f.docs[1],request(f,'withdraw',40));assert.equal(result.walletCbg,90);assert.equal(result.guildStash.cbg,60);
  const b=await balances(f);assert.equal(b.wallets.reduce((a,n)=>a+n,0)+b.shared,350);assert.equal((await f.db.query('select count(*)::int as n from cb_gold_ledger')).rows[0].n,2);
  const item=await guildRequest(f.client,f.users[0],await f.load(0),f.request(await f.load(0),'bag','guild',2));assert.equal(item.guildStash.cbg,60);
 }finally{await f.close();}
});

test('currency retries commit once and reject reuse for a different amount or member',async()=>{
 const f=await fixture();try{await seed(f);const input=request(f,'deposit',100);await guildRequest(f.client,f.users[0],f.docs[0],input);
  const replay=await guildRequest(f.client,f.users[0],await f.load(0),input);assert.equal(replay.walletCbg,200);assert.equal(replay.guildStash.cbg,100);
  await assert.rejects(guildRequest(f.client,f.users[0],await f.load(0),{...input,amount:101}),/reference was already used/);
  await assert.rejects(guildRequest(f.client,f.users[1],await f.load(1),input),/reference was already used/);
  assert.equal((await f.db.query('select count(*)::int as n from cb_gold_ledger')).rows[0].n,1);
  assert.equal((await f.db.query('select count(*)::int as n from cb_rpg_guild_cbg_transfers')).rows[0].n,1);
 }finally{await f.close();}
});

test('invalid amounts, insufficient balances and removed membership leave both balances untouched',async()=>{
 const f=await fixture();try{await seed(f);
  for(const amount of [0,-1,1.5,1000001,'10'])await assert.rejects(guildRequest(f.client,f.users[0],f.docs[0],request(f,'deposit',amount)),e=>e.status===400);
  await assert.rejects(guildRequest(f.client,f.users[0],f.docs[0],request(f,'deposit',301)),/Not enough CBG in your wallet/);
  await assert.rejects(guildRequest(f.client,f.users[0],f.docs[0],request(f,'withdraw',1)),/Not enough CBG in the guild stash/);
  await f.db.query('delete from cb_guild_members where user_id=$1',[f.users[1]]);
  await assert.rejects(guildRequest(f.client,f.users[1],f.docs[1],request(f,'deposit',10)),e=>e.status===403);
  const b=await balances(f);assert.equal(b.wallets.reduce((a,n)=>a+n,0),350);assert.equal(b.shared,0);assert.equal((await f.db.query('select count(*)::int as n from cb_gold_ledger')).rows[0].n,0);
 }finally{await f.close();}
});

test('competing withdrawals cannot overdraw the shared balance or credit the losing wallet',async()=>{
 const f=await fixture();try{await seed(f,100,0);await guildRequest(f.client,f.users[0],f.docs[0],request(f,'deposit',100));
  const results=await Promise.allSettled([0,1].map(async i=>guildRequest(f.client,f.users[i],await f.load(i),request(f,'withdraw',80))));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);
  const b=await balances(f);assert.equal(b.shared,20);assert.equal(b.wallets.reduce((a,n)=>a+n,0),80);assert.equal((await f.db.query('select count(*)::int as n from cb_gold_ledger')).rows[0].n,2);
 }finally{await f.close();}
});

test('battle locks, balance limits and SQL permissions protect CBG; setup can be safely rerun',async()=>{
 const f=await fixture();try{await seed(f,300,2147483647);await guildRequest(f.client,f.users[0],f.docs[0],request(f,'deposit',100));
  await assert.rejects(guildRequest(f.client,f.users[1],f.docs[1],request(f,'withdraw',1)),/balance limit/);
  await f.db.query("update cb_inventory_items set metadata=jsonb_set(metadata,'{battle}','{\"status\":\"active\"}'::jsonb) where user_id=$1",[f.users[0]]);
  await assert.rejects(guildRequest(f.client,f.users[0],await f.load(0),request(f,'withdraw',1)),/Finish your battle/);
  await f.db.exec(fs.readFileSync('supabase/rpg-guild-stash.sql','utf8'));
  assert.equal(Number((await f.db.query('select cbg_balance from cb_rpg_guild_stashes')).rows[0].cbg_balance),100);
  const access=(await f.db.query("select has_function_privilege('authenticated','cb_rpg_guild_cbg(uuid,uuid,uuid,text,integer,text)','EXECUTE') as executable,has_table_privilege('anon','cb_rpg_guild_cbg_transfers','SELECT') as readable,prosecdef from pg_proc where proname='cb_rpg_guild_cbg'")).rows[0];assert.deepEqual(access,{executable:false,readable:false,prosecdef:false});
 }finally{await f.close();}
});
