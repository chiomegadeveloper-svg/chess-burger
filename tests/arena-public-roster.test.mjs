import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../api/grand-arena.ts',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;

test('public schedule returns owner battles and waiting rosters without authentication or private profile fields',async()=>{
 const now=Date.now(),start=new Date(now+3600000).toISOString(),end=new Date(now+7200000).toISOString();
 const tables={
  cb_arena_settings:[{id:true,upcoming_weekly_limit:4,entry_closes_minutes:10,losses_to_eliminate:5}],
  cb_arena_sessions:[{id:'battle-1',session_date:start.slice(0,10),slot:1,starts_at:start,ends_at:end,title:'Owner battle',owner_scheduled:true,loss_limit:5},{id:'hidden',starts_at:start,ends_at:end,owner_scheduled:false}],
  cb_arena_entries:[{session_id:'battle-1',user_id:'player-1',status:'registered',joined_at:start}],
  cb_profiles:[{user_id:'player-1',display_name:'Waiting player',username:'@player',avatar_url:'/avatar.webp',role:'owner',gold_points:999,cbr:200}],
 };
 const client={from(name){let rows=tables[name]||[];const q={select(){return q;},eq(k,v){rows=rows.filter(r=>r[k]===v);return q;},gt(k,v){rows=rows.filter(r=>r[k]>v);return q;},in(k,v){rows=rows.filter(r=>v.includes(r[k]));return q;},order(){return q;},maybeSingle(){return Promise.resolve({data:rows[0]||null,error:null});},then(resolve){return Promise.resolve({data:rows,error:null}).then(resolve);}};return q;},auth:{getUser(){throw Error('Public roster must not require authentication');}}};
 const module={exports:{}};new Function('require','module','exports',code)(()=>({createClient:()=>client}),module,module.exports);
 const originalUrl=process.env.NEXT_PUBLIC_SUPABASE_URL,originalKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='test-only';
 try {
  let status,payload;const response={setHeader(){},status(value){status=value;return response;},json(value){payload=value;}};
  await module.exports.default({method:'GET',query:{action:'window'},headers:{}},response);
  assert.equal(status,200);assert.equal(payload.upcoming.length,1);assert.equal(payload.upcoming[0].id,'battle-1');
  assert.equal(payload.upcoming[0].players[0].status,'registered');
  assert.deepEqual(payload.upcoming[0].players[0].player,{display_name:'Waiting player',username:'@player',avatar_url:'/avatar.webp'});
  assert.equal(payload.upcoming[0].loss_limit,5);
 } finally {
  if(originalUrl===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_URL;else process.env.NEXT_PUBLIC_SUPABASE_URL=originalUrl;
  if(originalKey===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=originalKey;
 }
});
