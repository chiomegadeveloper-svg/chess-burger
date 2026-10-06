import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../api/grand-arena.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const module = { exports: {} };
new Function("require", "module", "exports", compiled)(() => ({ createClient: () => null }), module, module.exports);
const { arenaWindow } = module.exports;

const config = {
  session_slots: [
    { start: "07:00", end: "08:00" },
    { start: "11:00", end: "12:00" },
    { start: "16:00", end: "17:00" },
    { start: "22:00", end: "00:00" },
  ],
  entry_closes_minutes: 10,
};

test("owner schedule exposes every daily session in Philippine time", () => {
  const first = arenaWindow(Date.parse("2026-09-26T23:30:00Z"), config);
  assert.equal(first.current?.slot, 1);
  assert.equal(first.next?.slot, 2);
  assert.equal(first.entry_open, true);
  const evening = arenaWindow(Date.parse("2026-09-27T14:30:00Z"), config);
  assert.equal(evening.current?.slot, 4);
  assert.equal(evening.current?.date, "2026-09-27");
});

test("overnight session remains open after midnight; entry closes ten minutes before end", () => {
  const late = arenaWindow(Date.parse("2026-09-27T15:51:00Z"), config);
  assert.equal(late.current?.slot, 4);
  assert.equal(late.entry_open, false);
  const tomorrow = arenaWindow(Date.parse("2026-09-27T16:01:00Z"), config);
  assert.equal(tomorrow.current, null);
  assert.equal(tomorrow.next?.date, "2026-09-28");
});

 test("upcoming sessions are future-only, chronological and include the next seven days", () => {
  const now = Date.parse("2026-09-27T14:30:00Z");
  const window = arenaWindow(now, config);
  assert.deepEqual(window.upcoming.slice(0,2).map(slot => [slot.date, slot.slot]), [["2026-09-28",1],["2026-09-28",2]]);
  assert.equal(window.upcoming.at(-1).date, "2026-10-04");
  window.upcoming.forEach((slot,i) => {
    assert.ok(Date.parse(slot.starts_at)>now);
    if(i) assert.ok(Date.parse(slot.starts_at)>Date.parse(window.upcoming[i-1].starts_at));
  });
});
