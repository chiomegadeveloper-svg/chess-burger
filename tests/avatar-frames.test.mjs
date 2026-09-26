import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../app/avatar-frame-catalog.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { AVATAR_FRAMES, AVATAR_FRAME_PRICES } = await import(`data:text/javascript,${encodeURIComponent(compiled)}`);

test('shop offers twenty unique chess frames in two complete sprite sheets', () => {
  assert.equal(AVATAR_FRAMES.length, 20);
  assert.equal(new Set(AVATAR_FRAMES.map(frame => frame.id)).size, 20);
  for (const tier of ['basic', 'premium']) {
    const frames = AVATAR_FRAMES.filter(frame => frame.tier === tier);
    assert.equal(frames.length, 10);
    assert.deepEqual(frames.map(frame => frame.index), [0,1,2,3,4,5,6,7,8,9]);
    assert.equal(readFileSync(new URL(`../public/avatar-frames/${tier}.webp`, import.meta.url)).toString('ascii', 8, 12), 'WEBP');
  }
});

test('avatar rentals use the requested prices and terms', () => {
  assert.deepEqual(AVATAR_FRAME_PRICES, { 7: 58, 21: 108, 30: 158 });
});
