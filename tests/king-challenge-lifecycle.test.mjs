import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const api = readFileSync(new URL("../api/arena.ts", import.meta.url), "utf8");
const online = readFileSync(new URL("../app/online-play.tsx", import.meta.url), "utf8");

test("targeted and KING invitations refresh without restarting the app", () => {
  assert.match(page, /setInterval\(\(\) => void refreshState\(\), 2000\)/);
  assert.match(page, /clearInterval\(stateTimer\)/);
});

test("online pairing clears unanswered challenge state", () => {
  assert.match(api, /await cancelWaitingForUser\(client, account\.id\)/);
  assert.match(api, /\.or\(`host_id\.eq\.\$\{userId\},invite_to\.eq\.\$\{userId\}`\)/);
  assert.match(api, /delete\(\)\.in\('match_id', ids\)/);
});

test("decline and cancel clean linked queues and waiting UI polls immediately", () => {
  assert.match(api, /delete\(\)\.eq\('match_id', id\)/);
  const roomEffect = online.slice(online.indexOf('if (!room) return'), online.indexOf('async function create'));
  assert.match(roomEffect, /void poll\(\);/);
  assert.match(online, /Cancelling…/);
});
