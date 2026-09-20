import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../supabase/0015_match_wagers.sql',import.meta.url),'utf8');

test('wager migration escrows both stakes and makes settlement idempotent',()=>{
  assert.match(sql,/gold_points=gold_points-stake/);
  assert.match(sql,/gold_settled then return/);
  assert.match(sql,/when m\.play_mode='queue' then 11/);
  assert.match(sql,/else stake\*2/);
  assert.match(sql,/service_role/);
});
