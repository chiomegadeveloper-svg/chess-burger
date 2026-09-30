import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const api=readFileSync(new URL('../api/guild.ts',import.meta.url),'utf8');
const page=readFileSync(new URL('../app/guild.tsx',import.meta.url),'utf8');

test('guild detail exposes a safe public member roster',()=>{
 assert.match(api,/if\(guild\)\{[\s\S]*cb_guild_members[\s\S]*user_id,username,display_name,avatar_url,cbr/);
 assert.match(api,/leader_id:guild\.leader_id,members/);
});

test('public roster does not expose leader votes or private guild reports',()=>{
 assert.match(api,/select\('guild_id,user_id,joined_at'\)/);
 assert.doesNotMatch(api,/select\('guild_id,user_id,joined_at,leader_vote'\)/);
 assert.match(api,/if\(guild&&isMember\)\{[\s\S]*cb_guild_activity[\s\S]*cb_guild_analytics/);
});

test('member roster renders outside the member-only panel',()=>{
 assert.match(page,/<\/\>}<h3>Members<\/h3><div className="guild-members">/);
 assert.match(page,/\{member&&<section className="guild-activity">/);
});
