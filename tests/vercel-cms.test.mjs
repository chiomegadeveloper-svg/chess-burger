import test from 'node:test';
import assert from 'node:assert/strict';
import {cmsGoldAmount,cmsUsername,kingdomNameInput} from '../api/arena.ts';

test('CMS usernames accept the displayed @ prefix and normalize case',()=>{
  assert.equal(cmsUsername('  @Chi_Omega  '),'chi_omega');
  assert.equal(cmsUsername('@@PLAYER'),'player');
});

test('CMS Gold grants allow only whole amounts from 1 to 10,000',()=>{
  assert.equal(cmsGoldAmount(1),1);
  assert.equal(cmsGoldAmount('999'),999);
  assert.equal(cmsGoldAmount(10_000),10_000);
  for(const value of [0,-1,10_001,1.5,'gold',null])assert.equal(cmsGoldAmount(value),null);
});


test('kingdom names are compact and capped for owner renames',()=>{
  assert.equal(kingdomNameInput('  Omega   Kingdom  '),'Omega Kingdom');
  assert.equal(kingdomNameInput('x'.repeat(60)).length,48);
});
