import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';

const page=readFileSync('app/page.tsx','utf8'),feed=readFileSync('app/community-feed.tsx','utf8'),ui=readFileSync('app/daily-rewards.tsx','utf8'),css=readFileSync('app/daily-rewards.css','utf8'),sql=readFileSync('supabase/0025_daily_login_rewards.sql','utf8'),api=readFileSync('api/arena.ts','utf8');
test('daily rewards are a Community Feed tab and never a startup popup',()=>{
  assert.match(feed,/type FeedTab\s*=[^;]+"rewards"/);assert.match(feed,/>\s*Rewards\s*<\/button>/);assert.match(feed,/tab\s*===\s*["']rewards["'][\s\S]{0,80}<DailyRewards/);
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
  assert.equal(existsSync('public/daily-rewards/bag-slot.webp'),true);assert.ok(statSync('public/daily-rewards/bag-slot.webp').size<600_000);
  assert.match(ui,/rewardIcon\(reward\)/);
});
test('reward details are available by hover, keyboard focus, and tap',()=>{
  assert.match(ui,/role="tooltip"/);assert.match(ui,/tabIndex=\{0\}/);assert.match(ui,/onClick=\{\(\)=>setDetailsDay/);assert.match(ui,/alt=\{details\}/);
  assert.match(css,/\.daily-reward-card:hover \.daily-reward-tooltip/);assert.match(css,/\.daily-reward-card\.details-open \.daily-reward-tooltip/);
});
test('Rewards tab avoids Vinext image crashes and tolerates incomplete API data',()=>{
  assert.doesNotMatch(ui,/from "next\/image"/);assert.match(ui,/Array\.isArray\(status\?\.rewards\)/);assert.match(ui,/status\.rewards\.length===7\?status\.rewards:PREVIEW/);
});

test('Owner CMS can configure all supported Daily Login reward categories',()=>{
  const cms=readFileSync('app/cms.tsx','utf8'),migration=readFileSync('supabase/0035_editable_daily_login_rewards.sql','utf8');
  for(const kind of ['gold','arena_ticket','banner','bag_slot']){assert.match(cms,new RegExp(`value="${kind}"`));assert.match(migration,new RegExp(`'${kind}'`));}
  assert.match(cms,/save-cms-daily-rewards/);assert.match(api,/Only an Owner can edit Daily Login rewards/);
  assert.match(migration,/cb_daily_reward_config/);assert.match(migration,/cb_save_daily_reward_config/);
  assert.match(migration,/cb_arena_tickets/);assert.match(migration,/set bag_slots=least\(10000,bag_slots\+v_amount\)/);
});
