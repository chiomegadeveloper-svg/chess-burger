import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const api = fs.readFileSync(new URL('../api/arena.ts', import.meta.url), 'utf8');
const types = fs.readFileSync(new URL('../app/game-rules.ts', import.meta.url), 'utf8');
const rankings = fs.readFileSync(new URL('../app/rankings.tsx', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('../app/arena.css', import.meta.url), 'utf8');

test('rank API merges recent live presence into every ranked player', () => {
  assert.match(api, /client\.from\('cb_live_presence'\)\.select\('\*'\)\.limit\(500\)/);
  assert.match(api, /const cutoff = now\(\) - 60_000/);
  assert.match(api, /online: onlineIds\.has\(player\.user_id\)/);
  assert.match(types, /online\?: boolean/);
});

test('rank avatars render a readable green online indicator', () => {
  assert.match(rankings, /p\.online&&<i className="rank-online-dot"/);
  assert.match(rankings, /aria-label="Online now"/);
  assert.match(styles, /\.rank-online-dot\{/);
  assert.match(styles, /background:#24d76d/);
  assert.match(styles, /@keyframes rank-online-pulse/);
});
