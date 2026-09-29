import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {levelFor} from '../app/cbr.ts';

test('database audit level boundaries agree with the displayed Chess Burger levels', () => {
  const migration=readFileSync(new URL('../supabase/0084_owner_level_progression.sql',import.meta.url),'utf8');
  const boundaries=[...migration.matchAll(/when p_cbr <= (\d+) then (\d+)/g)].map(([,max,level])=>({max:Number(max),level:Number(level)}));
  assert.equal(boundaries.length,19);
  for(const {max,level} of boundaries){
    assert.equal(levelFor(max).level,level,`CBR ${max}`);
    assert.equal(levelFor(max+1).level,level+1,`CBR ${max+1}`);
  }
});
