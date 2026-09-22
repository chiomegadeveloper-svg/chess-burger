import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const page=fs.readFileSync("app/page.tsx","utf8"),ui=fs.readFileSync("app/classroom.tsx","utf8"),sql=fs.readFileSync("supabase/0035_classroom_phase1.sql","utf8"),shop=fs.readFileSync("app/shop.tsx","utf8");
const api=fs.readFileSync("api/classroom.ts","utf8"),bagCss=fs.readFileSync("app/rpg-bag.css","utf8");
test("Classroom is active from welcome and the top app header",()=>{assert.match(page,/finishWelcome\("classroom"\)/);assert.match(page,/className="header-classroom-button"/);assert.match(page,/navigate\("classroom"\)/);assert.match(page,/<Classroom/);assert.doesNotMatch(page,/play-destination classroom/)});
test("all six owner-priced packages use corrected capacities and durations",()=>{for(const row of [["pawn",5,"12 hours"],["bishop",10,"1 day"],["knight",15,"3 days"],["rook",20,"5 days"],["queen",30,"7 days"],["king",40,"14 days"]]){assert.ok(sql.includes(`('${row[0]}',${row[1]},interval'${row[2]}'`))}});
test("room purchase charges owner-priced CBG and deposits the CBC bundle in teacher Bag",()=>{assert.match(sql,/gold_points=gold_points-cbg_cost/);assert.match(sql,/cbc=cbc\+cbc_bundle/);assert.match(sql,/cbc_included/)});
test("student enrollment consumes personal CBC once and enforces capacity",()=>{assert.match(sql,/balance<1/);assert.match(sql,/cbc=cbc-1/);assert.match(sql,/student_count>=r\.max_students/);assert.match(sql,/primary key\(room_id,student_id\)/)});
test("Classroom UI supports role choice, codes, sessions, and rename",()=>{for(const value of ["Teacher","Student","Create Room Session","Enter Room · 1 CBC / 30 min","Classroom Sessions","Rename"])assert.ok(ui.includes(value));assert.match(ui,/invite_code/)});
test("Shop and Bag show the unified CBC token with owner-set pricing and gifting",()=>{assert.match(shop,/cbc-token\.webp/);assert.match(shop,/cbc_gold_price/);assert.match(shop,/gift-cbc/)});
test("classroom artwork is optimized WebP",()=>{for(const file of ["teacher.webp","student.webp","cbc-token.webp"]){const stat=fs.statSync(`public/classroom/${file}`);assert.ok(stat.size>1000&&stat.size<600000)}});
test("Classroom server accepts the deployed Vite Supabase URL",()=>{assert.match(api,/VITE_SUPABASE_URL/);assert.match(api,/SUPABASE_SERVICE_ROLE_KEY/)});
test("Student Lobby is active with CBC checks, refresh, Shop, and code entry",()=>{assert.match(ui,/Student Lobby/);assert.match(ui,/Buy CBC/);assert.match(ui,/Refresh/);assert.match(ui,/Enter Room · 1 CBC \/ 30 min/)});
test("zero CBC stays hidden from My Bag and mobile item counters are readable",()=>{assert.match(shop,/\{cbc>0&&<article/);assert.match(bagCss,/font-size:\s*16px\s*!important/);assert.match(bagCss,/font-size:\s*15px\s*!important/)});
test("branded CBG coin replaces fallback circles in Bag and Shop",()=>{const asset=fs.statSync("public/inventory/cbg-coin.webp");assert.ok(asset.size>1000&&asset.size<600000);assert.match(shop,/\/inventory\/cbg-coin\.webp/);assert.doesNotMatch(shop,/className="gold-coin">●/);assert.doesNotMatch(shop,/rpg-gold-art"><span>●/)});
test("Classroom CMS pricing uses large responsive typography",()=>{const css=fs.readFileSync("app/classroom-cms-readable.css","utf8");assert.match(css,/font-size:\s*clamp\(18px/);assert.match(css,/min-height:\s*52px/);assert.match(css,/@media \(max-width: 480px\)/);assert.match(css,/grid-template-columns:\s*1fr/)});
test("student Classroom access costs 1 CBC per 30 minutes",()=>{const timed=fs.readFileSync("supabase/0036_classroom_timed_student_access.sql","utf8");assert.match(timed,/access_expires_at/);assert.match(timed,/interval '30 minutes'/);assert.match(timed,/cbc=cbc-1/);assert.match(timed,/cb_extend_classroom_access/);assert.match(timed,/cb_has_classroom_access/);assert.match(api,/extend-access/);assert.match(ui,/1 CBC \/ 30 min/);assert.match(ui,/Renew 30 min · 1 CBC/)});

test("teacher and student Classroom roles are mutually exclusive",()=>{
  const guard=fs.readFileSync("supabase/0037_exclusive_classroom_roles.sql","utf8");
  assert.match(ui,/teacherActive/);
  assert.match(ui,/studentActive/);
  assert.match(ui,/Locked while teaching/);
  assert.match(ui,/Locked while active as Student/);
  assert.match(api,/hasActiveTeacherSession/);
  assert.match(api,/hasActiveStudentAccess/);
  assert.match(api,/A teacher cannot enter a student classroom/);
  assert.match(guard,/cb_classroom_teacher_role_guard/);
  assert.match(guard,/cb_classroom_student_role_guard/);
  assert.match(guard,/before insert or update of teacher_id,status,expires_at/);
  assert.match(guard,/before insert or update of student_id,access_expires_at/);
});
