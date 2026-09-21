import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const cpu=readFileSync(new URL('../app/cpu-game.tsx',import.meta.url),'utf8');
const board=readFileSync(new URL('../app/match-board.tsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../app/gameplay.css',import.meta.url),'utf8');
const api=readFileSync(new URL('../api/arena.ts',import.meta.url),'utf8');
const page=readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');

test('CPU clock preserves elapsed time after both players move',()=>{
  assert.match(cpu,/blackRemaining=Math\.max\(0,current\.black_ms-Math\.max\(0,movedAt-current\.last_tick\)\)/);
  assert.match(cpu,/remaining=Math\.max\(0,match\.white_ms-Math\.max\(0,movedAt-match\.last_tick\)\)/);
  assert.match(cpu,/white_ms:remaining\+increment/);
  assert.match(cpu,/black_ms:blackRemaining\+increment/);
});

test('CPU match ends when the active clock reaches zero',()=>{
  assert.match(cpu,/setEndReason\("timeout"\)/);
  assert.match(cpu,/white_ms:whiteTurn\?0:current\.white_ms/);
  assert.match(cpu,/black_ms:whiteTurn\?current\.black_ms:0/);
});

test('every CPU level has a legal-move watchdog if the engine stalls',()=>{
  assert.match(cpu,/aiWatchdogRef/);
  assert.match(cpu,/fallbackGame\.moves\(\{verbose:true\}\)/);
  assert.match(cpu,/Math\.max\(3200,thinkTime\+1800\)/);
});

test('chess glyphs stay monochrome and colorable on iOS',()=>{
  assert.match(board,/wp: "♟︎"/);
  assert.match(css,/font-variant-emoji:text/);
  assert.match(css,/-webkit-text-fill-color:#fff!important/);
});

test('CPU robot identity is preserved in new feed results and legacy Stockfish labels are hidden',()=>{
  assert.match(cpu,/ai_name: match\.black\?\.display_name/);
  assert.match(api,/const CPU_ROBOT_NAMES/);
  assert.match(api,/cpuRobotName\(body\.ai_name,level\)/);
  assert.match(api,/modernCpuFeedContent\(e\.content\)/);
  assert.doesNotMatch(api,/defeated':'lost to'\} Stockfish Level/);
  assert.doesNotMatch(page,/Practice against Stockfish/);
});
