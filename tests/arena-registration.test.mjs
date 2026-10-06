import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migration = readFileSync(new URL('../supabase/0101_arena_owner_created_battles.sql', import.meta.url), 'utf8');
const initial = readFileSync(new URL('../supabase/0027_grand_arena.sql', import.meta.url), 'utf8');
const controls = readFileSync(new URL('../supabase/0031_arena_owner_controls_fair_pairing.sql', import.meta.url), 'utf8');
const user = '10000000-0000-0000-0000-000000000001';
const opponent = '10000000-0000-0000-0000-000000000002';
const session = '20000000-0000-0000-0000-000000000001';
async function database(t) {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table cb_profiles(user_id uuid primary key, display_name text default 'Player', role text default 'player', cbr integer default 88, gold_points integer default 0, wins integer default 0, losses integer default 0, win_streak integer default 0);
    create table cb_matches(id uuid primary key, play_mode text, status text, rating_applied boolean default false, arena_session_id uuid, result text, white_id uuid, black_id uuid, host_id uuid, game_meta jsonb default '{}');
    create table cb_gold_ledger(id text primary key,user_id uuid,delta integer,kind text,reference_id uuid);

  `);
  const settingsSQL=controls.slice(controls.indexOf('create table if not exists public.cb_arena_settings('),controls.indexOf('insert into public.cb_arena_settings'));
  await db.exec(settingsSQL);
  await db.exec("alter table cb_arena_settings add column match_control text default '5+0'; insert into cb_arena_settings(id) values(true);");
  for (const name of ['cb_arena_tickets', 'cb_arena_sessions', 'cb_arena_entries']) {
    const sql = initial.split('\n').find(line => line.startsWith(`create table if not exists public.${name}(`));
    await db.exec(sql);
  }
  for (const line of controls.split('\n').filter(line => /^alter table public.cb_arena_(sessions|entries) add column/.test(line))) await db.exec(line);
  await db.exec("alter table cb_arena_sessions drop constraint cb_arena_sessions_slot_check;alter table cb_arena_sessions add constraint cb_arena_sessions_slot_check check(slot between 1 and 12);alter table cb_arena_sessions add column match_control text default '5+0';");
  await db.exec(migration);
  await db.exec(`insert into cb_profiles(user_id) values('${user}'),('${opponent}');
    insert into cb_arena_tickets(user_id,quantity) values('${user}',3),('${opponent}',1);
    insert into cb_arena_sessions(id,session_date,slot,starts_at,ends_at,owner_scheduled) values('${session}',current_date,1,now()+interval '1 hour',now()+interval '3 hours',true);`);
  return db;
}
const call = (db,fn,u=user) => db.query(`select ${fn}($1,$2) as result`,[u,session]);
const row = async (db,sql) => (await db.query(sql)).rows[0];

test('registration consumes exactly one ticket, stays out of pairing and check-in is free', async t => {
  const db = await database(t);
  await call(db,'cb_register_grand_arena');
  await call(db,'cb_register_grand_arena');
  assert.equal((await row(db,`select quantity from cb_arena_tickets where user_id='${user}'`)).quantity,2);
  assert.equal((await row(db,'select ticket_gold_total from cb_arena_sessions')).ticket_gold_total,28);
  assert.equal((await row(db,'select status from cb_arena_entries')).status,'registered');
  await assert.rejects(call(db,'cb_enter_grand_arena'), /entry is closed/);
  await db.exec(`update cb_arena_sessions set starts_at=now()-interval '1 minute'; update cb_arena_tickets set quantity=0 where user_id='${user}';`);
  await call(db,'cb_enter_grand_arena');
  await call(db,'cb_enter_grand_arena');
  assert.equal((await row(db,'select status from cb_arena_entries')).status,'waiting');
  assert.equal((await row(db,'select ticket_gold_total from cb_arena_sessions')).ticket_gold_total,28);
});

test('no-ticket and late registrations reject without creating entries', async t => {
  const db = await database(t);
  await db.exec('update cb_arena_tickets set quantity=0');
  await assert.rejects(call(db,'cb_register_grand_arena'), /need an Arena Ticket/);
  assert.equal((await row(db,'select count(*)::integer as count from cb_arena_entries')).count,0);
  await db.exec(`update cb_arena_sessions set starts_at=now()-interval '1 minute';`);
  await assert.rejects(call(db,'cb_register_grand_arena'), /registration is closed/);
});

test('finished matches eliminate on third loss, repeat settlement is harmless, re-entry costs a ticket', async t => {
  const db = await database(t);
  await db.exec(`update cb_arena_sessions set starts_at=now()-interval '1 minute';`);
  await call(db,'cb_enter_grand_arena');
  await call(db,'cb_enter_grand_arena',opponent);
  for (let loss=1;loss<=3;loss++) {
    const id=`30000000-0000-0000-0000-00000000000${loss}`;
    await db.query(`insert into cb_matches(id,play_mode,status,arena_session_id,result,white_id,black_id) values($1,'arena','finished',$2,'black',$3,$4)`,[id,session,user,opponent]);
    await db.query('select cb_settle_arena_match($1)',[id]);
    await db.query('select cb_settle_arena_match($1)',[id]);
    const e=await row(db,`select status,losses from cb_arena_entries where user_id='${user}'`);
    assert.equal(e.losses,loss);
    assert.equal(e.status,loss===3?'eliminated':'waiting');
  }
  await call(db,'cb_enter_grand_arena');
  assert.equal((await row(db,`select quantity from cb_arena_tickets where user_id='${user}'`)).quantity,1);
  assert.equal((await row(db,`select losses from cb_arena_entries where user_id='${user}'`)).losses,0);
});

test('cancelled matches also eliminate only on third loss and do not settle twice', async t => {
  const db = await database(t);
  await db.exec(`update cb_arena_sessions set starts_at=now()-interval '1 minute';`);
  await call(db,'cb_enter_grand_arena'); await call(db,'cb_enter_grand_arena',opponent);
  for(let loss=1;loss<=3;loss++) {
    const id=`40000000-0000-0000-0000-00000000000${loss}`;
    await db.query(`insert into cb_matches(id,play_mode,status,arena_session_id,host_id,white_id,black_id) values($1,'arena','cancelled',$2,$3,$3,$4)`,[id,session,user,opponent]);
    await db.query('select cb_resolve_arena_cancelled_match($1)',[id]);
    await db.query('select cb_resolve_arena_cancelled_match($1)',[id]);
    const e=await row(db,`select status,losses from cb_arena_entries where user_id='${user}'`);
    assert.equal(e.losses,loss); assert.equal(e.status,loss===3?'eliminated':'waiting');
  }
});

test('a player can reserve separate upcoming sessions with one ticket each', async t => {
 const db = await database(t);
 const second = '20000000-0000-0000-0000-000000000002';
 await db.query("insert into cb_arena_sessions(id,session_date,slot,starts_at,ends_at,owner_scheduled) values($1,current_date+1,1,now()+interval '25 hours',now()+interval '27 hours',true)", [second]);
 await call(db,'cb_register_grand_arena');
 await db.query('select cb_register_grand_arena($1,$2)',[user,second]);
 assert.equal((await row(db,`select quantity from cb_arena_tickets where user_id='${user}'`)).quantity,1);
 assert.equal((await row(db,"select count(*)::integer as count from cb_arena_entries where status='registered'")).count,2);
});

async function ownerSetup(db) {
 await db.exec(`update cb_profiles set role='owner' where user_id='${user}';update cb_arena_sessions set owner_scheduled=false;`);
 const result=await row(db,"select (date_trunc('week',now() at time zone 'Asia/Manila')+interval '7 days 10 hours') at time zone 'Asia/Manila' as starts");
 return Date.parse(result.starts);
}
async function publish(db,at,id=null,title='Owner battle',lossLimit=3,actor=user) {
 const result=await db.query('select cb_save_arena_session($1,$2,$3,$4,$5,$6) as battle',[actor,id,title,new Date(at).toISOString(),new Date(at+3600000).toISOString(),lossLimit]);
 return result.rows[0].battle;
}
const saveControls=(db,lossLimit=3,weeklyLimit=4,actor=user)=>db.query("select cb_save_arena_controls($1,$2,$3,'fixed',100,'3+2')",[actor,lossLimit,weeklyLimit]);

test('owner can publish only four battles per Manila week until increasing the editable limit',async t=>{
 const db=await database(t),start=await ownerSetup(db);
 for(let i=0;i<4;i++) await publish(db,start+i*86400000);
 await assert.rejects(publish(db,start+4*86400000), /week has reached the battle limit/);
 await saveControls(db,5,6);
 const extra=await publish(db,start+4*86400000,null,'Fifth battle',5);
 assert.equal(extra.loss_limit,5);assert.equal(extra.match_control,'3+2');
 await assert.rejects(saveControls(db,5,4), /below the number of published battles/);
});

test('future battle edits preserve roster, ticket charges and ID, reject overlaps and non-owners',async t=>{
 const db=await database(t),start=await ownerSetup(db);
 await assert.rejects(publish(db,start,null,'Not owner',3,opponent), /Owner access/);
 await assert.rejects(saveControls(db,3,4,opponent), /Owner access/);
 const original=await publish(db,start);
 await db.query('select cb_register_grand_arena($1,$2)',[opponent,original.id]);
 await assert.rejects(publish(db,start+30*60000), /cannot overlap/);
 const edited=await publish(db,start+2*3600000,original.id,'Edited battle',5);
 assert.equal(edited.id,original.id);assert.equal(edited.title,'Edited battle');assert.equal(edited.loss_limit,5);
 assert.equal((await row(db,`select quantity from cb_arena_tickets where user_id='${opponent}'`)).quantity,0);
 assert.equal((await db.query('select status from cb_arena_entries where session_id=$1 and user_id=$2',[original.id,opponent])).rows[0].status,'registered');
 assert.equal(edited.ticket_gold_total,28);
 await db.query("update cb_arena_sessions set starts_at=now()-interval '1 minute',ends_at=now()+interval '1 hour' where id=$1",[original.id]);
 await assert.rejects(publish(db,start+3*3600000,original.id), /Only future/);
});

test('session loss limit governs both normal and cancelled matches despite later default changes',async t=>{
 const db=await database(t);await ownerSetup(db);
 await db.exec(`update cb_arena_sessions set owner_scheduled=true,starts_at=now()-interval '1 minute',loss_limit=2;`);
 await saveControls(db,5,4);
 await call(db,'cb_enter_grand_arena');await call(db,'cb_enter_grand_arena',opponent);
 const first='60000000-0000-0000-0000-000000000001',second='60000000-0000-0000-0000-000000000002';
 await db.query("insert into cb_matches(id,play_mode,status,arena_session_id,result,white_id,black_id,host_id) values($1,'arena','finished',$2,'black',$3,$4,$3)",[first,session,user,opponent]);
 await db.query('select cb_settle_arena_match($1)',[first]);
 assert.equal((await row(db,`select status from cb_arena_entries where user_id='${user}'`)).status,'waiting');
 await db.query("insert into cb_matches(id,play_mode,status,arena_session_id,white_id,black_id,host_id) values($1,'arena','cancelled',$2,$3,$4,$3)",[second,session,user,opponent]);
 await db.query('select cb_resolve_arena_cancelled_match($1)',[second]);
 assert.equal((await row(db,`select status from cb_arena_entries where user_id='${user}'`)).status,'eliminated');
 assert.equal((await row(db,'select losses_to_eliminate from cb_arena_settings')).losses_to_eliminate,5);
});
