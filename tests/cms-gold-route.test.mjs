import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const api=fs.readFileSync(new URL('../api/arena.ts',import.meta.url),'utf8');
const cms=fs.readFileSync(new URL('../app/cms.tsx',import.meta.url),'utf8');

test('CMS Gold button has a matching server action',()=>{
  assert.match(cms,/arena\("grant-gold"/);
  assert.match(api,/action==='grant-gold'/);
});

test('Gold grants remain owner-only and use the audited Supabase transaction',()=>{
  assert.match(api,/account\.profile\.role!=='owner'/);
  assert.match(api,/\.rpc\('cb_grant_gold'/);
  assert.match(api,/p_username:username,p_amount:amount/);
});

test('Gold grant inputs are validated before the database call',()=>{
  assert.match(api,/cmsUsername\(body\.username\)/);
  assert.match(api,/cmsGoldAmount\(body\.amount\)/);
  assert.match(api,/A valid request ID is required/);
});
