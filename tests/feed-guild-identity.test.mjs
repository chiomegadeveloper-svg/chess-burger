import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const api = readFileSync(new URL("../api/arena.ts", import.meta.url), "utf8");
const source = ts.createSourceFile("arena.ts", api, ts.ScriptTarget.Latest, true);
const feedFunction = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "publicFeed");
const compiled = ts.transpileModule(feedFunction.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const readFeed = new Function("playerMap", "modernCpuFeedContent", "fail", "now", `${compiled};return publicFeed;`)(
  async () => new Map([["member", { avatar_url: "/member.webp", cbr: 232 }]]),
  content => content,
  (status, message) => { throw Object.assign(new Error(message), { status }); },
  () => Date.parse("2026-09-23T12:00:00Z"),
);

function database({ guild = { name: "Kurama Den", logo_url: "/guild.webp" }, error = null } = {}) {
  const events = [
    { id: "win", user_id: "member", kind: "win", display_name: "Kurama", content: "won a match." },
    { id: "solo", user_id: "solo", kind: "win", display_name: "Solo", content: "won a match." },
    { id: "news", user_id: "member", kind: "announcement", display_name: "Kurama", content: "Welcome!" },
    { id: "expired", user_id: "member", kind: "win", expires_at: "2026-09-22T00:00:00Z" },
  ];
  return {
    from(table) {
      const response = table === "cb_feed"
        ? { data: events, error: null }
        : { data: guild ? [{ user_id: "member", guild }] : [], error };
      const query = { then: (resolve, reject) => Promise.resolve(response).then(resolve, reject) };
      for (const method of ["select", "order", "limit", "in"]) query[method] = () => query;
      return query;
    },
  };
}

test("feed includes current guild logo and name beside the member identity", async () => {
  const { events } = await readFeed(database());
  assert.equal(events.length, 3);
  assert.deepEqual(events.map(event => [event.guild_name, event.guild_logo_url]), [
    ["Kurama Den", "/guild.webp"], ["", ""], ["", ""],
  ]);
  assert.equal(events[0].avatar_url, "/member.webp");
  assert.equal(events[0].cbr, 232);
  assert.equal(events[2].display_name, "Chess Burger");
});

test("guild renames and leaving are reflected on existing feed activity", async () => {
  const renamed = await readFeed(database({ guild: { name: "New Name", logo_url: null } }));
  assert.equal(renamed.events[0].guild_name, "New Name");
  assert.equal(renamed.events[0].guild_logo_url, "");
  const quit = await readFeed(database({ guild: null }));
  assert.equal(quit.events[0].guild_name, "");
  assert.equal(quit.events[0].guild_logo_url, "");
});

test("an unapplied guild migration does not take the public feed down", async () => {
  const { events } = await readFeed(database({ guild: null, error: { code: "PGRST205", message: "Missing guild table" } }));
  assert.equal(events.length, 3);
  assert.equal(events[0].guild_name, "");
});

test("unexpected guild database errors are reported", async () => {
  await assert.rejects(readFeed(database({ guild: null, error: { code: "42501", message: "Permission denied" } })), { status: 500, message: "Permission denied" });
});
