import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { chooseCpuMove } from '../app/cpu-turn.ts';

test('CPU applies a valid engine move on its turn', () => {
  const game = new Chess(); game.move('e4');
  assert.equal(chooseCpuMove(game, 'e7e5', 10), true);
  assert.equal(game.history().at(-1), 'e5');
});

test('CPU still makes a legal move when engine reply is stale or invalid', () => {
  for (const reply of ['e2e4', '(none)', null]) {
    const game = new Chess(); game.move('e4');
    assert.equal(chooseCpuMove(game, reply, 1, () => 0), true);
    assert.equal(game.turn(), 'w');
    assert.equal(game.history().length, 2);
  }
});
