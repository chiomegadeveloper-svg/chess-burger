import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

test("Vercel API entrypoints reject syntax errors and truncated tool output before deployment", () => {
  const check = spawnSync(process.execPath, ["scripts/check-serverless.mjs"], { encoding: "utf8" });
  assert.equal(check.status, 0, `${check.stdout}\n${check.stderr}`);
  const arena = readFileSync("api/arena.ts", "utf8");
  assert.doesNotMatch(arena, /Warning: truncated output|tokens truncated|original token count/i);
  assert.match(arena, /export default async function handler/);
  assert.match(arena, /action\s*===\s*['"]feed['"]/);
  assert.match(arena, /action\s*===\s*['"]daily-reward-status['"]/);
});
