import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('rankings expose live presence and an actionable player card',async()=>{
 const [api,rankings,page]=await Promise.all([read('api/arena.ts'),read('app/rankings.tsx'),read('app/page.tsx')]);
 assert.match(api,/online:online\.has\(player\.user_id\)/);
 assert.match(rankings,/rank-online-dot/);
 assert.match(rankings,/rank-player-card/);
 assert.match(rankings,/Challenge player/);
 assert.match(page,/tab === "rank".*onChallenge/);
});

test('30-day analytics columns do not stretch into dead space',async()=>{
 const css=await read('app/gold-pagination.css');
 assert.match(css,/\.gold-cms-columns\s*\{[^}]*align-items:\s*start/s);
 assert.match(css,/\.gold-cms-columns\s*>\s*section\s*\{[^}]*align-self:\s*start/s);
});
