import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {finishClockTurn,formatClock,remainingClock,TIME_CONTROLS} from '../app/game-rules.ts';

const cpu=readFileSync(new URL('../app/cpu-game.tsx',import.meta.url),'utf8');
const board=readFileSync(new URL('../app/match-board.tsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../app/gameplay.css',import.meta.url),'utf8');
const api=readFileSync(new URL('../api/arena.ts',import.meta.url),'utf8');
const page=readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');

test('CPU clock preserves elapsed time after both players move for every time control',()=>{
  for(const control of TIME_CONTROLS){
    const start=control.seconds*1000,increment=control.increment*1000;
    const whiteAfterFirst=finishClockTurn(start,0,17_250,increment);
    const blackAfterFirst=finishClockTurn(start,17_250,18_630,increment);
    const whiteAfterSecond=finishClockTurn(whiteAfterFirst,18_630,22_880,increment);
    assert.equal(whiteAfterFirst,start-17_250+increment,control.id);
    assert.equal(blackAfterFirst,start-1_380+increment,control.id);
    assert.equal(whiteAfterSecond,whiteAfterFirst-4_250+increment,control.id);
  }
  assert.match(cpu,/remainingClock\(current\.black_ms,current\.last_tick,movedAt\)/);
  assert.match(cpu,/finishClockTurn\(current\.black_ms,current\.last_tick,movedAt,increment\)/);
});

test('CPU match ends when the active clock reaches zero',()=>{
  assert.equal(remainingClock(1_000,5_000,5_999),1);
  assert.equal(remainingClock(1_000,5_000,6_000),0);
  assert.match(cpu,/setEndReason\("timeout"\)/);
  assert.match(cpu,/white_ms:whiteTurn\?0:current\.white_ms/);
  assert.match(cpu,/black_ms:whiteTurn\?current\.black_ms:0/);
});

test('clock visibly decreases immediately and shows tenths below ten seconds',()=>{
  assert.equal(formatClock(300_000),'5:00');
  assert.equal(formatClock(299_999),'4:59');
  assert.equal(formatClock(9_950),'0:09.9');
  assert.equal(formatClock(250),'0:00.2');
  assert.equal(formatClock(0),'0:00');
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
