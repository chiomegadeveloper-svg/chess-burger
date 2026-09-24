import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = () => readFile(new URL('../supabase/0058_repair_bag_gifting.sql',import.meta.url),'utf8');

test('upgrades older gift tables before replacing the Bag transfer function',async()=>{
  const sql=await read();
  const upgrade=sql.indexOf('add column if not exists item_kind text');
  const functionDefinition=sql.indexOf('create or replace function public.cb_gift_bag_item');
  assert.ok(upgrade>0 && functionDefinition>upgrade);
  for(const column of ['item_kind','item_id','quantity','fee_gold'])assert.match(sql,new RegExp(`add column if not exists ${column} `));
  assert.match(sql,/on conflict\(request_id\) do nothing/);
});

test('gifted banner extensions preserve remaining time and collectibles retain metadata',async()=>{
  const sql=await read();
  assert.match(sql,/greatest\(now\(\),cb_user_items\.expires_at\)\+\(excluded\.expires_at-now\(\)\)/);
  assert.match(sql,/insert into public\.cb_inventory_items\(user_id,item_kind,item_id,quantity,metadata\)/);
  assert.match(sql,/if v_remaining is null then raise exception/);
});
