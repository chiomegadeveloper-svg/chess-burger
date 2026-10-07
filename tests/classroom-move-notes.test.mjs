import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {Chess} from 'chess.js';
import {classroomNotation} from '../api/_classroom-notation.ts';
const teacher='11111111-1111-4111-8111-111111111111',student='22222222-2222-4222-8222-222222222222',room='33333333-3333-4333-8333-333333333333';
const migration=readFileSync(new URL('../supabase/0105_classroom_move_notes.sql',import.meta.url),'utf8');
async function fixture(){const db=new PGlite();await db.exec(`
create role anon;create role authenticated;create role service_role;
create schema auth;create table auth.users(id uuid primary key);insert into auth.users values('${teacher}'),('${student}');
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
create table cb_classroom_rooms(id uuid primary key,teacher_id uuid,status text,expires_at timestamptz);
insert into cb_classroom_rooms values('${room}','${teacher}','active',now()+interval '1 day');
grant usage on schema auth to authenticated;grant select on cb_classroom_rooms to authenticated;
create table cb_classroom_workspaces(room_id uuid primary key,fen text,annotations jsonb default '[]',updated_by uuid,updated_at timestamptz);
create table cb_classroom_student_boards(room_id uuid,student_id uuid,fen text,annotations jsonb default '[]',updated_by uuid,updated_at timestamptz,primary key(room_id,student_id));
insert into cb_classroom_workspaces values('${room}','start','[]','${teacher}',now());
insert into cb_classroom_student_boards values('${room}','${student}','start','[]','${teacher}',now());`);await db.exec(migration);return db;}
const rows=async db=>(await db.query('select * from cb_classroom_move_notes order by id')).rows;
const restore=(db,id,expected,before=false,user=teacher)=>db.query('select cb_restore_classroom_move_note($1,$2,$3,$4,$5)',[room,user,id,before,expected]);

test('SAN records alternating teacher/student moves, castling, capture, promotion and en passant',()=>{
 const board=new Chess();for(const san of ['e4','e5','Nf3','Nc6','Bc4','Nf6','O-O']){const before=board.fen();const move=board.move(san);const note=classroomNotation(before,board.fen());assert.equal(note.notation,move.san);assert.equal(note.color,move.color);assert.equal(note.move_number,Number(before.split(' ')[5]));}
 for(const [fen,san] of [['4k3/P7/8/8/8/8/8/4K3 w - - 0 1','a8=Q+'],['4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 8','exd6']]){const b=new Chess(fen);b.move(san);assert.equal(classroomNotation(fen,b.fen()).notation,san);}
});
test('teach edits are labelled and legal moves off turn retain SAN',()=>{
 const start=new Chess();const pieces=start.fen().split(' ');pieces[1]='b';const b=new Chess(pieces.join(' '));b.move('e5');assert.equal(classroomNotation('start',b.fen()).notation,'e5');
 const free=new Chess();free.remove('e2');free.put({type:'p',color:'w'},'e5');assert.equal(classroomNotation('start',free.fen()).notation,'Teach: e2–e5');
 assert.equal(classroomNotation('start','8/8/8/8/8/8/8/8 w - - 0 1').notation,'Position setup / restore');
});
test('teach move counters keep SAN numbered correctly when play continues',()=>{
 const board=new Chess();board.move('e4');const before=board.fen();board.move('e5');const note=classroomNotation(before,board.fen());assert.equal(note.move_number,1);const next=board.fen();board.move('Nf3');assert.equal(classroomNotation(next,board.fen()).move_number,2);
});
test('triggers atomically capture both actors on shared and student boards without annotation duplicates',async()=>{const db=await fixture();try{
 const b=new Chess();b.move('e4');await db.query('update cb_classroom_workspaces set fen=$1,updated_by=$2 where room_id=$3',[b.fen(),student,room]);const before=b.fen();b.move('e5');await db.query('update cb_classroom_workspaces set fen=$1,updated_by=$2 where room_id=$3',[b.fen(),teacher,room]);
 await db.query('update cb_classroom_student_boards set fen=$1,updated_by=$2 where room_id=$3',[before,student,room]);
 const notes=await rows(db);assert.equal(notes.length,5);assert.equal(notes[2].actor_id,student);assert.equal(notes[3].actor_id,teacher);assert.equal(notes[3].before_fen,before);assert.equal(notes[4].student_id,student);
 await db.exec("update cb_classroom_workspaces set annotations='[]'");assert.equal((await rows(db)).length,5);
 }finally{await db.close()}});
test('restore before/after positions retains original future and supports continuing another line',async()=>{const db=await fixture();try{
 const b=new Chess();b.move('e4');const e4=b.fen();await db.query('update cb_classroom_workspaces set fen=$1 where room_id=$2',[e4,room]);b.move('e5');const e5=b.fen();await db.query('update cb_classroom_workspaces set fen=$1 where room_id=$2',[e5,room]);const note=(await rows(db))[2];
 await restore(db,note.id,e5);const restored=(await db.query('select fen from cb_classroom_workspaces')).rows[0].fen;assert.equal(restored,e4);
 const line=new Chess(restored);line.move('c5');await db.query('update cb_classroom_workspaces set fen=$1 where room_id=$2',[line.fen(),room]);const history=await rows(db);assert.equal(history.length,6);assert.ok(history.some(n=>n.fen===e5));assert.equal(history.at(-1).before_fen,e4);
 await restore(db,note.id,line.fen(),true);assert.equal((await db.query('select fen from cb_classroom_workspaces')).rows[0].fen,'start');
 }finally{await db.close()}});
test('restore rejects students, foreign notes and stale boards without a mutation',async()=>{const db=await fixture();try{
 const id=(await rows(db))[0].id;await assert.rejects(restore(db,id,'start',false,student),/Only the active teacher/);await assert.rejects(restore(db,999,'start'),/not found/);await assert.rejects(restore(db,id,'outdated'),/board changed/);assert.equal((await rows(db)).length,2);
 await db.exec(`update cb_classroom_rooms set expires_at=now()-interval '1 minute'`);await assert.rejects(restore(db,id,'start'),/Only the active teacher/);
 }finally{await db.close()}});
test('RLS hides history from students and public restore function is not executable',async()=>{const db=await fixture();try{
 await db.exec(`set test.uid='${student}';set role authenticated`);assert.equal((await rows(db)).length,0);await assert.rejects(restore(db,1,'start'),/permission denied/);
 await db.exec(`reset role;set test.uid='${teacher}';set role authenticated`);assert.equal((await rows(db)).length,2);
 }finally{await db.close()}});
test('student restores affect only selected board and migration may be safely rerun',async()=>{const db=await fixture();try{
 const b=new Chess();b.move('d4');await db.query('update cb_classroom_student_boards set fen=$1 where room_id=$2',[b.fen(),room]);const id=(await rows(db))[1].id;await restore(db,id,b.fen());assert.equal((await db.query('select fen from cb_classroom_workspaces')).rows[0].fen,'start');assert.equal((await db.query('select fen from cb_classroom_student_boards')).rows[0].fen,'start');const count=(await rows(db)).length;await db.exec(migration);assert.equal((await rows(db)).length,count);
 }finally{await db.close()}});
