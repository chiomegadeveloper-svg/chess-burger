import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync,statSync} from 'node:fs';

test('CBG uses the optimized Chess Burger coin asset',()=>{
 const path='public/currency/cbg-coin.webp';
 assert.equal(existsSync(path),true);
 assert.ok(statSync(path).size<600_000);
 assert.match(readFileSync('app/currency.tsx','utf8'),/CBG_ICON='\/currency\/cbg-coin\.webp'/);
});

test('CBG milestone names use the requested thresholds',()=>{
 const source=readFileSync('app/currency.tsx','utf8');
 assert.match(source,/amount>=20_000.*'LYDIAN'/);
 assert.match(source,/amount>=10_000.*'CROESEID'/);
 assert.match(source,/amount>=5_000.*'DARIC'/);
 assert.match(source,/return 'CBG'/);
});

test('primary balance, shop, feed, rewards, and puzzles use CBG branding',()=>{
 for(const file of ['app/account.tsx','app/shop.tsx','app/community-feed.tsx','app/daily-rewards.tsx','app/puzzles.tsx']){
  assert.match(readFileSync(file,'utf8'),/CBG|cbgTier|CbgIcon/);
 }
});
