import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const api = readFileSync(new URL("../api/arena.ts", import.meta.url), "utf8");
const cms = readFileSync(new URL("../app/cms.tsx", import.meta.url), "utf8");

test("every Owner CMS Arena action has a server handler", () => {
  const actions = [...cms.matchAll(/arena(?:<[^>]+>)?\("([^"]+)"/g)].map((match) => match[1]);
  for (const action of new Set(actions)) {
    assert.match(api, new RegExp(`action === ['"]${action}['"]|action===['"]${action}['"]`), `missing API handler for ${action}`);
  }
});

test("CMS mutations enforce staff or owner authorization", () => {
  assert.match(api, /const requireStaff/);
  assert.match(api, /if \(account\.profile\.role !== 'owner'\) fail\(403, 'Only an Owner can delete a user\.'\)/);
  assert.match(api, /auth\.admin\.deleteUser/);
  assert.match(api, /from\('cb_admin_logs'\)/);
});
