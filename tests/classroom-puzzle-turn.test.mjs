import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {Chess} from 'chess.js';
const require=createRequire(import.meta.url);
const source=ts.transpileModule(readFileSync('api/classroom.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function fixture({role='teacher',mode='teach'}={}){
 const state={workspace:{fen:'start',student_color:'w',board_mode:mode},boards:[],writes:[]};
 const client={auth:{getUser:async()=>({data:{user:{id:role}},error:null})},from(table){
  let operation='select',values,filters={},single=false;
  const query={select(){return query},eq(k,v){filters[k]=v;return query},gt(){return query},like(){return query},order(){return query},limit(){return query},single(){single=true;return query},maybeSingle(){single=true;return query},update(v){operation='update';values=v;return query},insert(v){operation='insert';values=v;return query},upsert(v){operation='upsert';values=v;return query},then(resolve,reject){
   let data;
   if(operation!=='select'){state.writes.push({table,operation,values});if(table==='cb_classroom_workspaces')Object.assign(state.workspace,values);if(table==='cb_classroom_student_boards')state.boards=values;data=table==='cb_classroom_workspaces'?{...state.workspace}:values}
   else if(table==='cb_profiles')data={avatar_url:`/storage/v1/object/public/cb-profile-media/${role}/avatar-test.webp`,agreement_version:1};
   else if(table==='cb_classroom_rooms')data={teacher_id:'teacher',status:'active',expires_at:'2099-01-01T00:00:00Z'};
   else if(table==='cb_classroom_settings')data={cbc_enabled:false};
   else if(table==='cb_classroom_workspaces')data={...state.workspace};
   else if(table==='cb_classroom_enrollments')data=single?{student_id:role,access_expires_at:'2099-01-01T00:00:00Z'}:[{student_id:'s1'},{student_id:'s2'}];
   else if(table==='cb_classroom_lesson_events')data={fen:state.assignedFen};
   return Promise.resolve({data,error:null}).then(resolve,reject);
  }};return query;
 }};
 const module={exports:{}};
 new Function('require','module','exports',source)(name=>name==='@supabase/supabase-js'?{createClient:()=>client}:name==='chess.js'?require(name):{},module,module.exports);
 return {state,async call(kind,fen){const oldUrl=process.env.NEXT_PUBLIC_SUPABASE_URL,oldKey=process.env.SUPABASE_SERVICE_ROLE_KEY;process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='test-only';const res={code:200,status(n){this.code=n;return this},json(body){this.body=body},setHeader(){}};try{await module.exports.default({method:'POST',headers:{authorization:'Bearer test'},body:{action:'workshop-update',room_id:'room',kind,...(fen?{fen}:{})}},res);return res}finally{for(const [k,v] of [['NEXT_PUBLIC_SUPABASE_URL',oldUrl],['SUPABASE_SERVICE_ROLE_KEY',oldKey]])if(v===undefined)delete process.env[k];else process.env[k]=v}}};
}
const black=new Chess();black.move('e4');const blackFen=black.fen();
test('black and white puzzle assignments persist the solver side and return synchronized workspace',async()=>{
 const {state,call}=fixture();
 for(const fen of [blackFen,new Chess().fen(),blackFen]){const res=await call('assign-puzzle',fen);assert.equal(res.code,200);const turn=new Chess(fen).turn();assert.equal(state.workspace.student_color,turn);assert.equal(res.body.workspace.student_color,turn);assert.equal(res.body.workspace.fen,fen);assert.equal(res.body.assigned,2);assert.ok(state.boards.every(b=>b.fen===fen));}
});
test('assigning a saved/custom board also uses its turn while retaining the teacher position',async()=>{
 const {state,call}=fixture();const res=await call('assign-board',blackFen);assert.equal(res.code,200);assert.equal(state.workspace.student_color,'b');assert.equal(state.workspace.fen,'start');assert.ok(state.boards.every(b=>b.fen===blackFen));
});
test('puzzle reset retains teacher-approved orientation',async()=>{
 const {state,call}=fixture();state.assignedFen=blackFen;const res=await call('reset-puzzle');assert.equal(res.code,200);assert.equal(state.workspace.student_color,'w');assert.equal(res.body.workspace,null);assert.ok(state.boards.every(b=>b.fen===blackFen));
});
test('invalid positions, students and Play Mode cannot change assignment color',async()=>{
 for(const [options,fen,code] of [[{},'invalid',400],[{role:'student'},blackFen,403],[{mode:'play'},blackFen,409]]){const {state,call}=fixture(options);const res=await call('assign-puzzle',fen);assert.equal(res.code,code);assert.equal(state.workspace.student_color,'w');assert.equal(state.writes.length,0)}
});
