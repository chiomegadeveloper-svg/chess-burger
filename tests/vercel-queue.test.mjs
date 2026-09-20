import { test } from "node:test";
import assert from "node:assert/strict";
import { pickQueueCandidate } from "../api/arena.ts";

const profile = (cbr) => ({ cbr });

test("Supabase queue prefers the closest CBR among older compatible players", () => {
  const ownSeen = "2026-09-20T02:00:05.000Z";
  const rows = [
    { user_id: "far", seen_at: "2026-09-20T02:00:01.000Z" },
    { user_id: "near", seen_at: "2026-09-20T02:00:03.000Z" },
  ];
  const ratings = new Map([
    ["far", profile(140)],
    ["near", profile(94)],
  ]);
  assert.equal(pickQueueCandidate(rows, "self", ownSeen, 88, ratings).user_id, "near");
});

test("Supabase queue ignores newer players to prevent reciprocal double matches", () => {
  const rows = [
    { user_id: "older", seen_at: "2026-09-20T02:00:01.000Z" },
    { user_id: "newer", seen_at: "2026-09-20T02:00:06.000Z" },
  ];
  const ratings = new Map([
    ["older", profile(120)],
    ["newer", profile(88)],
  ]);
  assert.equal(
    pickQueueCandidate(rows, "self", "2026-09-20T02:00:05.000Z", 88, ratings).user_id,
    "older",
  );
});

test("Supabase queue uses user id as a deterministic tie breaker", () => {
  const seenAt = "2026-09-20T02:00:05.000Z";
  const ratings = new Map([
    ["aaa", profile(88)],
    ["zzz", profile(88)],
  ]);
  assert.equal(
    pickQueueCandidate(
      [
        { user_id: "aaa", seen_at: seenAt },
        { user_id: "zzz", seen_at: seenAt },
      ],
      "mmm",
      seenAt,
      88,
      ratings,
    ).user_id,
    "aaa",
  );
});
