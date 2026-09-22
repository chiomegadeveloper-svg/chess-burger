import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const page=fs.readFileSync("app/page.tsx","utf8"),ui=fs.readFileSync("app/classroom.tsx","utf8"),sql=fs.readFileSync("supabase/0035_classroom_phase1.sql","utf8"),shop=fs.readFileSync("app/shop.tsx","utf8");
const api=fs.readFileSync("api/classroom.ts","utf8"),bagCss=fs.readFileSync("app/rpg-bag.css","utf8");
test("Classroom is active from welcome and the top app header",()=>{assert.match(page,/finishWelcome\("classroom"\)/);assert.match(page,/className="header-classroom-button"/);assert.match(page,/navigate\("classroom"\)/);assert.match(page,/<Classroom/);assert.doesNotMatch(page,/play-destination classroom/)});
test("all six owner-priced packages use corrected capacities and durations",()=>{for(const row of [["pawn",5,"12 hours"],["bishop",10,"1 day"],["knight",15,"3 days"],["rook",20,"5 days"],["queen",30,"7 days"],["king",40,"14 days"]]){assert.ok(sql.includes(`('${row[0]}',${row[1]},interval'${row[2]}'`))}});
test("room purchase charges owner-priced CBG and deposits the CBC bundle in teacher Bag",()=>{assert.match(sql,/gold_points=gold_points-cbg_cost/);assert.match(sql,/cbc=cbc\+cbc_bundle/);assert.match(sql,/cbc_included/)});
test("student enrollment consumes personal CBC once and enforces capacity",()=>{assert.match(sql,/balance<1/);assert.match(sql,/cbc=cbc-1/);assert.match(sql,/student_count>=r\.max_students/);assert.match(sql,/primary key\(room_id,student_id\)/)});
test("Classroom UI supports role choice, codes, sessions, and rename",()=>{for(const value of ["Teacher","Student","Create Room Session","Join Room Session · 1 CBC","Classroom Sessions","Rename"])assert.ok(ui.includes(value));assert.match(ui,/invite_code/)});
test("Shop and Bag show the unified CBC token with owner-set pricing and gifting",()=>{assert.match(shop,/cbc-token\.webp/);assert.match(shop,/cbc_gold_price/);assert.match(shop,/gift-cbc/)});
test("classroom artwork is optimized WebP",()=>{for(const file of ["teacher.webp","student.webp","cbc-token.webp"]){const stat=fs.statSync(`public/classroom/${file}`);assert.ok(stat.size>1000&&stat.size<600000)}});
test("Classroom server accepts the deployed Vite Supabase URL",()=>{assert.match(api,/VITE_SUPABASE_URL/);assert.match(api,/SUPABASE_SERVICE_ROLE_KEY/)});
test("Student Lobby is active with CBC checks, refresh, Shop, and code entry",()=>{assert.match(ui,/Student Lobby/);assert.match(ui,/Buy CBC/);assert.match(ui,/Refresh/);assert.match(ui,/Join Room Session · 1 CBC/)});
test("zero CBC stays hidden from My Bag and mobile item counters are readable",()=>{assert.match(shop,/\{cbc>0&&<article/);assert.match(bagCss,/font-size:16px!important/);assert.match(bagCss,/font-size:15px!important/)});
