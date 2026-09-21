import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page=readFileSync('app/page.tsx','utf8'),ui=readFileSync('app/daily-rewards.tsx','utf8'),css=readFileSync('app/daily-rewards.css','utf8'),sql=readFileSync('supabase/0025_daily_login_rewards.sql','utf8'),api=readFileSync('api/arena.ts','utf8');
test('daily rewards follow the shortcut menu and use the seven requested rewards',()=>{
  assert.match(page,/finishWelcome\("map"\)/);assert.match(page,/finishWelcome\("play"\)/);assert.match(page,/<DailyRewards/);
  assert.match(page,/setTimeout\(\(\) => setShowDailyRewards\(true\), 220\)/);
  assert.match(sql,/jsonb_build_object\('day',1,'kind','gold','amount',10\)/);assert.equal((sql.match(/'amount',18/g)||[]).length,3);assert.match(sql,/'day',7,'kind','banner','days',5/);
});
test('daily claim is server-idempotent and banner prizes are timed Bag rentals',()=>{
  assert.match(sql,/primary key\(user_id,claim_date\)/);assert.match(sql,/pg_advisory_xact_lock/);assert.match(sql,/cb_user_items/);assert.match(api,/claim-daily-reward/);
});
test('daily reward modal is responsive and accessible',()=>{
  assert.match(ui,/role="dialog"/);assert.match(ui,/aria-modal="true"/);assert.match(css,/@media\(max-width:600px\)/);assert.match(css,/100dvh/);
});
