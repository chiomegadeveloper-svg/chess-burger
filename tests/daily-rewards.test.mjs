import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';

const page=readFileSync('app/page.tsx','utf8'),feed=readFileSync('app/community-feed.tsx','utf8'),ui=readFileSync('app/daily-rewards.tsx','utf8'),css=readFileSync('app/daily-rewards.css','utf8'),sql=readFileSync('supabase/0025_daily_login_rewards.sql','utf8'),api=readFileSync('api/arena.ts','utf8');
test('daily rewards are a Community Feed tab and never a startup popup',()=>{
  assert.match(feed,/type FeedTab=[^;]+"rewards"/);assert.match(feed,/>Rewards<\/button>/);assert.match(feed,/tab==='rewards'&&<DailyRewards\/>/);
  assert.doesNotMatch(page,/showDailyRewards|<DailyRewards/);
  assert.match(sql,/jsonb_build_object\('day',1,'kind','gold','amount',10\)/);assert.equal((sql.match(/'amount',18/g)||[]).length,3);assert.match(sql,/'day',7,'kind','banner','days',5/);
});
test('daily reward eligibility resets at 12:01 AM in Manila',()=>{
  assert.match(sql,/Asia\/Manila/);assert.match(sql,/interval '1 minute'/);assert.match(ui,/60_000/);
});
test('daily claim is server-idempotent and banner prizes are timed Bag rentals',()=>{
  assert.match(sql,/primary key\(user_id,claim_date\)/);assert.match(sql,/pg_advisory_xact_lock/);assert.match(sql,/cb_user_items/);assert.match(api,/claim-daily-reward/);assert.match(ui,/Claimed today/);
});
test('embedded rewards panel is responsive and accessible',()=>{
  assert.match(ui,/className="daily-reward-page"/);assert.match(ui,/aria-labelledby="daily-reward-title"/);assert.match(css,/\.daily-reward-page/);assert.match(css,/@media\(max-width:600px\)/);
});
test('all six Community Feed tabs stay on one row at every viewport',()=>{
  assert.match(css,/\.feed-page \.feed-tabs\.community-feed-tabs\{[^}]*grid-template-columns:repeat\(6,minmax\(0,1fr\)\)!important/);
  assert.doesNotMatch(css,/community-feed-tabs\{[^}]*grid-template-columns:repeat\(3/);
});
test('every reward day has an optimized professional WebP icon',()=>{
  for(let day=1;day<=7;day+=1){const file=`public/daily-rewards/day-${day}.webp`;assert.equal(existsSync(file),true);assert.ok(statSync(file).size<600_000);}
  assert.match(ui,/daily-rewards\/day-\$\{reward\.day\}\.webp/);
});
