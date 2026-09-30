import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const api=readFileSync(new URL('../api/guild.ts',import.meta.url),'utf8');
const migration=readFileSync(new URL('../supabase/0089_repair_guild_analytics.sql',import.meta.url),'utf8');

test('opening a guild never deletes analytics history',()=>{
 assert.doesNotMatch(api,/from\(['"]cb_guild_activity['"]\)\.delete\(\)/);
 assert.match(api,/activity=\(history\.data\?\?\[\]\)\.slice\(0,20\)/);
});

test('guild analytics counts all 30-day guild activity',()=>{
 assert.match(migration,/created_at>=now\(\)-interval '30 days'/);
 assert.match(migration,/'actions',\(select count\(\*\) from events\)/);
 assert.doesNotMatch(migration,/kind in \('join','leave','request'/);
});

test('chest analytics use the durable chest ledger',()=>{
 assert.match(migration,/from public\.cb_guild_chest_ledger/);
 assert.match(migration,/'chest_earned'/);
 assert.match(migration,/'daily'/);
});
