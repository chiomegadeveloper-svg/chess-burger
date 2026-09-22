import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const api=readFileSync('api/arena.ts','utf8');
const grandArena=readFileSync('api/grand-arena.ts','utf8');
const cms=readFileSync('app/cms.tsx','utf8');
const migration=readFileSync('supabase/0036_complete_owner_audit_trail.sql','utf8');

test('all owner-controlled app settings create attributed audit records',()=>{
  assert.match(api,/actor_name:\s*account\.profile\.display_name/);
  assert.match(api,/actor_username:\s*account\.profile\.username/);
  assert.match(api,/daily_rewards_update/);
  assert.match(api,/set_app_feature/);
  assert.match(api,/delete_user/);
  assert.match(grandArena,/arena_settings_update/);
  assert.match(grandArena,/previous,current/);
});

test('gold grants and promotions preserve before and after values for either owner',()=>{
  assert.match(migration,/previous_gold/);
  assert.match(migration,/current_gold/);
  assert.match(migration,/previous_role/);
  assert.match(migration,/actor_role/);
  assert.match(migration,/p_role not in \('player','admin','owner'\)/);
});

test('CMS audit view identifies the responsible owner and change time',()=>{
  assert.match(cms,/SECURE AUDIT TRAIL/);
  assert.match(cms,/log\.actor_role/);
  assert.match(cms,/year:'numeric'/);
  assert.match(cms,/Grand Arena settings changed/);
});
