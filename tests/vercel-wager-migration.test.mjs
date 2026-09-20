import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../supabase/0015_match_wagers.sql',import.meta.url),'utf8');
const api=readFileSync(new URL('../api/arena.ts',import.meta.url),'utf8');
const page=readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');

test('wager migration escrows both stakes and makes settlement idempotent',()=>{
  assert.match(sql,/gold_points=gold_points-stake/);
  assert.match(sql,/gold_settled then return/);
  assert.match(sql,/when m\.play_mode='queue' then 11/);
  assert.match(sql,/else stake\*2/);
  assert.match(sql,/service_role/);
});

test('wager wins keep the normal game bonus and expose settlement details',()=>{
  assert.match(api,/kind: 'match_bonus'/);
  assert.match(api,/kind: 'match_reward'/);
  assert.match(api,/feedGold = \(ledger\.data \?\? \[\]\)\.reduce/);
  assert.match(api,/row\.status === 'finished' \? await matchView/);
  assert.match(page,/goldPayout: m\.gold_payouts\?\.\[ownId\]/);
  assert.match(page,/playMode: m\.play_mode/);
});
