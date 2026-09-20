import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const server=readFileSync(new URL('../api/arena.ts',import.meta.url),'utf8');
const shared=readFileSync(new URL('../app/match-actions.ts',import.meta.url),'utf8');

test('takeback persists through the opponent reply but cancels on the requester move',()=>{
  for(const source of [server,shared]){
    assert.match(source,/pending\?\.kind === 'takeback' && pending\.by !== actor/);
    assert.match(source,/clear\w*\(currentMeta, 'position-changed'\)/);
  }
});

test('takeback snapshots and restores board plus both clocks',()=>{
  for(const source of [server,shared]){
    assert.match(source,/rollback_pgn/);
    assert.match(source,/white_ms: c\.white_ms, black_ms: c\.black_ms/);
    assert.match(source,/pgn: pending\.rollback_pgn/);
    assert.match(source,/white_ms: pending\.white_ms, black_ms: pending\.black_ms/);
  }
});

test('takeback attempt is counted when the request is created',()=>{
  for(const source of [server,shared]) assert.match(source,/\[kind\]: used\[kind\] \+ 1/);
});
