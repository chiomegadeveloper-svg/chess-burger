import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const api=fs.readFileSync(new URL('../api/arena.ts',import.meta.url),'utf8');
const map=fs.readFileSync(new URL('../app/nearby-map.tsx',import.meta.url),'utf8');

test('map kingdom challenge has a matching API action',()=>{
  assert.match(map,/arena<\{match:ArenaMatch\}>\('invasion-challenge'/);
  assert.match(api,/action === 'invasion-challenge'/);
  assert.match(api,/match_kind:'invasion'/);
  assert.match(api,/territory_id:territoryId/);
  assert.match(api,/invasion_challenger_id:account\.id/);
});

test('kingdom challenge verifies king presence and charges only on acceptance',()=>{
  assert.match(api,/The KING is no longer inside the kingdom range/);
  assert.match(api,/invasion_fee_paid:false/);
  assert.match(api,/cb_accept_invasion/);
});

test('finished invasion settles kingdom defense',()=>{
  assert.match(api,/match\.match_kind === 'invasion'/);
  assert.match(api,/cb_settle_territory_invasion/);
});
