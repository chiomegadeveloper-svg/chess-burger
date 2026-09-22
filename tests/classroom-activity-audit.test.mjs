import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const api=fs.readFileSync("api/classroom.ts","utf8");

test("Classroom Economy writes semantic activity to Owner CMS logs",()=>{
  assert.match(api,/cb_admin_logs/);
  assert.match(api,/economy:"classroom"/);
  for(const action of [
    "classroom_cbc_purchased","classroom_cbc_gifted","classroom_access_started",
    "classroom_access_extended","classroom_room_created","classroom_room_renamed",
    "classroom_settings_updated"
  ]) assert.match(api,new RegExp(action));
});

test("Classroom owner pricing changes include before and after values",()=>{
  assert.match(api,/classroom_settings_updated/);
  assert.match(api,/previous:previous\.data,current:saved\.data/);
  assert.match(api,/actor_name/);
  assert.match(api,/actor_username/);
  assert.match(api,/actor_role/);
});

test("CBC icon is an optimized WebP",()=>{
  const stat=fs.statSync("public/classroom/cbc-token.webp");
  assert.ok(stat.size>1000&&stat.size<600000);
});
