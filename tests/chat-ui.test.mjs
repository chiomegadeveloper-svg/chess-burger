import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const social = readFileSync(new URL("../app/social.tsx", import.meta.url), "utf8");
const client = readFileSync(
  new URL("../app/arena-client.ts", import.meta.url),
  "utf8",
);
const css = readFileSync(new URL("../app/social.css", import.meta.url), "utf8");

test("chat buttons use the mounted popup bridge and a normal click", () => {
  assert.match(social, /socialOpenHandler\(detail\)/);
  assert.match(social, /onClick=\{\(\) => \{[\s\S]*openSocial\("chat"\)/);
  assert.match(social, /return createPortal\(/);
  assert.match(social, /className="social-dialog-overlay"/);
});

test("chat popup stays visible, polls gently, and retries one expired session", () => {
  assert.match(css, /\.social-dialog-overlay\{position:fixed;inset:0;/);
  assert.match(social, /setInterval\(\(\) => void refresh\(\), 15000\)/);
  assert.match(client, /response\.status === 401/);
  assert.match(client, /client\.auth\.refreshSession\(\)/);
});
