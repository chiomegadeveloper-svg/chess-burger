import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const account = readFileSync(new URL("../app/account.tsx", import.meta.url), "utf8");
const completion = readFileSync(new URL("../app/profile-completion.ts", import.meta.url), "utf8");
const profileApi = readFileSync(new URL("../app/api/profile/route.ts", import.meta.url), "utf8");
const arenaApi = readFileSync(new URL("../api/arena.ts", import.meta.url), "utf8");
const shop = readFileSync(new URL("../app/shop.tsx", import.meta.url), "utf8");

test("profile completion requires identity fields and a profile photo", () => {
  assert.match(account, /isProfileComplete\(loaded\)/);
  assert.match(account, /isProfileComplete\(cached\)/);
  assert.match(completion, /profile\.avatar_url\.trim\(\)\.length > 0/);
  assert.match(profileApi, /code:'avatar_required'/);
  assert.match(arenaApi, /Complete registration and save a profile picture to unlock Chess Burger/);
});

test("incomplete users remain inside registration without app navigation", () => {
  assert.match(page, /if \(\(member !== true \|\| !isProfileComplete\(profile\)\) && !showSplash\)/);
  assert.match(page, /if \(member && isProfileComplete\(profile\)\)/);
  assert.match(page, /registrationOnly/);
  assert.match(page, /registration-locked-shell/);
  assert.match(page, /Your name, username, country, and profile photo are required/);
});

test("Bag displays only one Active status", () => {
  assert.doesNotMatch(shop, /active-rental/);
  assert.match(shop, /disableWhenActive/);
  assert.match(shop, /active \? "Active" : "Use"/);
});
