import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const feed = readFileSync(new URL("../app/community-feed.tsx", import.meta.url), "utf8");
const api = readFileSync(new URL("../api/arena.ts", import.meta.url), "utf8");

test("Home renders feed data before slower support requests finish", () => {
  const feedAwait = feed.indexOf("const localFeed=await feedRequest");
  const render = feed.indexOf("setEvents(rows.slice", feedAwait);
  const supportAwait = feed.indexOf("const [online,me]=await supportRequest", feedAwait);
  assert.ok(feedAwait >= 0 && render > feedAwait && supportAwait > render);
});

test("feed database lookups run in parallel and responses use edge revalidation", () => {
  assert.match(api, /const \[waiting, people\] = await Promise\.all/);
  assert.match(api, /public, s-maxage=5, stale-while-revalidate=30/);
});
