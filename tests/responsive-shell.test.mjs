import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("production imports viewport-safe responsive styles", async () => {
  const entry = await readFile(new URL("../vercel/main.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/v47.css", import.meta.url), "utf8");

  assert.match(entry, /import ["']\.\.\/app\/v47\.css["'];/);
  assert.match(styles, /@media\(max-width:480px\)/);
  assert.match(styles, /grid-template-columns:34px 34px minmax\(0,1fr\) 24px/);
  assert.match(styles, /\.app-shell\{width:min\(100%,1160px\)/);
});
