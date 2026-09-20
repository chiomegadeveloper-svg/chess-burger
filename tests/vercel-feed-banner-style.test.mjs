import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the Vercel client bundle imports feed banner card styles", async () => {
  const entry = await readFile(new URL("../vercel/main.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/v46.css", import.meta.url), "utf8");

  assert.match(entry, /import ["']\.\.\/app\/v46\.css["'];/);
  assert.match(styles, /\.feed-cloud\.has-feed-banner/);
  assert.match(styles, /background:var\(--feed-banner\)!important/);
});
