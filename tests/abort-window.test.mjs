import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { applyMatchAction } from '../app/match-actions.ts';

const opening = ['e4', 'e5', 'Nf3', 'Nc6'];
function matchAfter(plies) {
  const board = new Chess();
  for (const move of opening.slice(0, plies)) board.move(move);
  return { id: 'abort-window', white_id: 'white', black_id: 'black', status: 'active', result: null,
    pgn: board.pgn(), control: '10+0', white_ms: 600000, black_ms: 600000,
    last_tick: 1000, version: plies, game_meta: {} };
}

test('either player may abort before both have completed their second move', () => {
  for (let plies = 0; plies < 4; plies++) {
    for (const actor of ['white', 'black']) {
      const ended = applyMatchAction(matchAfter(plies), actor, 'abort', {}, 1100);
      assert.equal(ended.status, 'cancelled');
      assert.equal(ended.result, null);
    }
  }
});

test('fourth half move closes abort for both players, even after an accepted takeback', () => {
  let game = matchAfter(3);
  game = applyMatchAction(game, 'black', 'move', { version: game.version, move: { from: 'b8', to: 'c6' } }, 1100);
  assert.equal(game.game_meta.abort_closed, true);
  for (const actor of ['white', 'black'])
    assert.throws(() => applyMatchAction(game, actor, 'abort', {}, 1200), /Abort is available only before/);
  const offer = applyMatchAction(game, 'white', 'offer', { kind: 'takeback', request_id: 'takeback01' }, 1200);
  const rewound = applyMatchAction(offer, 'black', 'respond-offer', { request_id: 'takeback01', accept: true }, 1300);
  const board = new Chess(); board.loadPgn(rewound.pgn);
  assert.equal(board.history().length, 2);
  assert.equal(rewound.game_meta.abort_closed, true);
  assert.throws(() => applyMatchAction(rewound, 'white', 'abort', {}, 1400), /Abort is available only before/);
  const older = matchAfter(4); // Games started before this rule have no saved abort flag.
  const oldOffer = applyMatchAction(older, 'white', 'offer', { kind: 'takeback', request_id: 'takeback02' }, 1200);
  const oldRewound = applyMatchAction(oldOffer, 'black', 'respond-offer', { request_id: 'takeback02', accept: true }, 1300);
  assert.throws(() => applyMatchAction(oldRewound, 'white', 'abort', {}, 1400), /Abort is available only before/);
});
