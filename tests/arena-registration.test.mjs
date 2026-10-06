import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migration = readFileSync(new URL('../supabase/0100_arena_registration_three_losses.sql', import.meta.url), 'utf8');
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
    create table cb_profiles(user_id uuid primary key, display_name text default 'Player', cbr integer default 88, gold_points integer default 0, wins integer default 0, losses integer default 0, win_streak integer default 0);
    create table cb_matches(id uuid primary key, play_mode text, status text, rating_applied boolean default false, arena_session_id uuid, result text, white_id uuid, black_id uuid, host_id uuid, game_meta jsonb default '{}');
    create table cb_gold_ledger(id text primary key,user_id uuid,delta integer,kind text,reference_id uuid);
    create table cb_arena_settings(id boolean primary key,ticket_value_gold integer);
    insert into cb_arena_settings values(true,28);
  `);
  for (const name of ['cb_arena_tickets', 'cb_arena_sessions', 'cb_arena_entries']) {
    const sql = initial.split('\n').find(line => line.startsWith(`create table if not exists public.${name}(`));
    await db.exec(sql);
  }
  for (const line of controls.split('\n').filter(line => /^alter table public.cb_arena_(sessions|entries) add column/.test(line))) await db.exec(line);
  await db.exec(migration);
  await db.exec(`insert into cb_profiles(user_id) values('${user}'),('${opponent}');
    insert into cb_arena_tickets(user_id,quantity) values('${user}',3),('${opponent}',1);
    insert into cb_arena_sessions(id,session_date,slot,starts_at,ends_at) values('${session}',current_date,1,now()+interval '1 hour',now()+interval '3 hours');`);
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
 await db.query("insert into cb_arena_sessions(id,session_date,slot,starts_at,ends_at) values($1,current_date+1,1,now()+interval '25 hours',now()+interval '27 hours')", [second]);
 await call(db,'cb_register_grand_arena');
 await db.query('select cb_register_grand_arena($1,$2)',[user,second]);
 assert.equal((await row(db,`select quantity from cb_arena_tickets where user_id='${user}'`)).quantity,1);
 assert.equal((await row(db,"select count(*)::integer as count from cb_arena_entries where status='registered'")).count,2);
});
