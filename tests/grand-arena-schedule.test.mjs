import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import ts from "typescript";
const source=readFileSync(new URL("../api/grand-arena.ts",import.meta.url),"utf8");
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const module={exports:{}};
new Function("require","module","exports",compiled)(()=>({createClient:()=>null}),module,module.exports);
const {arenaWindow}=module.exports;
const config={entry_closes_minutes:10,upcoming_weekly_limit:4,session_slots:[{start:"19:00",end:"21:00"}]};
const battle=(id,start,end,owner_scheduled=true)=>({id,session_date:start.slice(0,10),slot:1,starts_at:start,ends_at:end,owner_scheduled,title:"Owner battle",loss_limit:5});
test("no owner-created sessions means no automatically repeated battles",()=>{
 const window=arenaWindow(Date.parse("2026-10-06T01:00:00Z"),config);
 assert.equal(window.open,false);assert.equal(window.current,null);assert.equal(window.next,null);assert.deepEqual(window.upcoming,[]);
});
test("only published dated battles appear, in time order, capped at four",()=>{
 const rows=Array.from({length:6},(_,i)=>battle(String(i),`2026-10-${String(7+i).padStart(2,'0')}T11:00:00Z`,`2026-10-${String(7+i).padStart(2,'0')}T13:00:00Z`)).reverse();
 rows.push(battle('hidden','2026-10-06T11:00:00Z','2026-10-06T13:00:00Z',false));
 const window=arenaWindow(Date.parse("2026-10-06T01:00:00Z"),config,rows);
 assert.deepEqual(window.upcoming.map(row=>row.id),['0','1','2','3']);assert.equal(window.next.loss_limit,5);
 assert.equal(arenaWindow(Date.parse("2026-10-06T01:00:00Z"),{...config,upcoming_weekly_limit:2},rows).upcoming.length,2);
});
test("overnight owner battle stays live and entry closes ten minutes before its actual end",()=>{
 const rows=[battle('overnight','2026-10-06T15:35:00Z','2026-10-06T16:30:00Z')];
 const live=arenaWindow(Date.parse('2026-10-06T16:01:00Z'),config,rows);
 assert.equal(live.current.id,'overnight');assert.equal(live.entry_open,true);
 assert.equal(arenaWindow(Date.parse('2026-10-06T16:21:00Z'),config,rows).entry_open,false);
 assert.equal(arenaWindow(Date.parse('2026-10-06T16:31:00Z'),config,rows).current,null);
});
