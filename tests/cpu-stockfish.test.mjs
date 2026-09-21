import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";

const cpu = readFileSync(new URL("../app/cpu-game.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const api = readFileSync(new URL("../api/arena.ts", import.meta.url), "utf8");
const sql = readFileSync(new URL("../supabase/0026_cpu_match_rewards.sql", import.meta.url), "utf8");

test("Match Lobby exposes Stockfish CPU play", () => {
  assert.match(page, /Play with CPU/);
  assert.match(page, /Levels 1–10/);
  assert.match(page, /<CpuGame/);
});

test("CPU mode offers ten distinct strength levels", () => {
  assert.equal((cpu.match(/\{ level: \d+/g) ?? []).length, 10);
  assert.match(cpu, /setoption name Skill Level/);
  assert.match(cpu, /setoption name UCI_Elo/);
  assert.match(cpu, /Bullet: win \+2 Gold\/\+2 CBR · loss −3 CBR/);
  assert.match(cpu, /Blitz: win \+3 Gold\/\+3 CBR · loss −4 CBR/);
  assert.match(cpu, /Rapid: win \+5 Gold\/\+5 CBR · loss −6 CBR/);
  assert.match(cpu, /never change your live-match count/);
});

test("CPU results settle once without changing human match counts", () => {
  assert.match(cpu, /claim-cpu-reward/);
  assert.match(api, /action==='claim-cpu-reward'/);
  assert.match(api, /outcome==='win'\?reward:-loss/);
  assert.match(sql, /on conflict\(id\) do nothing/);
  assert.doesNotMatch(sql, /wins\s*=/);
  assert.doesNotMatch(sql, /losses\s*=/);
});

test("Stockfish worker and WASM are bundled locally", () => {
  const worker = new URL("../public/stockfish/stockfish-19-lite-single.js", import.meta.url);
  const wasm = new URL("../public/stockfish/stockfish-19-lite-single.wasm", import.meta.url);
  assert.ok(existsSync(worker));
  assert.ok(existsSync(wasm));
  assert.ok(statSync(wasm).size > 1_000_000);
  assert.match(cpu, /new Worker\("\/stockfish\/stockfish-19-lite-single\.js"\)/);
});
