import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {Chess} from 'chess.js';
import {syncPlayer,queueMatch,createRoom,joinRoom,playMove,matchView,settle,privateAction,publicAction} from '../app/arena-server.ts';
import {winDelta} from '../app/game-rules.ts';

function database(){
 const sqlite=new DatabaseSync(':memory:');
 for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
 const db={sqlite,prepare(sql){const prepared=sqlite.prepare(sql);let values=[];const statement={bind(...args){values=args;return statement;},async first(){return prepared.get(...values)??null;},async all(){return {results:prepared.all(...values)};},execute(){const before=sqlite.prepare('SELECT total_changes() AS n').get().n;const results=prepared.all(...values);const changes=sqlite.prepare('SELECT total_changes() AS n').get().n-before;return {results,meta:{changes}};},async run(){return statement.execute();}};return statement;},async batch(statements){sqlite.exec('BEGIN');try{const values=statements.map(s=>s.execute());sqlite.exec('COMMIT');return values;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};return db;
}
function profile(name,cbr=88,role='player'){return {user_id:name,username:name,display_name:name,avatar_url:'',country_code:'PH',cbr,gold_points:0,wins:0,losses:0,win_streak:0,role};}
async function seed(db,...profiles){for(const p of profiles)await syncPlayer(db,p);}
async function room(db,a,b,control='3+2'){const r=await createRoom(db,a,control);return (await joinRoom(db,b,r.match.code)).match;}
const player=(db,id)=>db.sqlite.prepare('SELECT * FROM arena_players WHERE user_id=?').get(id);

test('CBR bonus: both rating directions, exact 10-point boundary, and fourth-win streak',()=>{
 assert.equal(winDelta(88,98,1),8);assert.equal(winDelta(88,99,1),17);assert.equal(winDelta(108,88,1),16);assert.equal(winDelta(88,88,4),10);assert.equal(winDelta(88,108,5),20);
});
test('Random queue enforces ±20, matching time control, and fresh availability',async()=>{
 const db=database(),a=profile('a'),outside=profile('outside',109),wrong=profile('wrong'),stale=profile('stale'),b=profile('b',108);await seed(db,a,outside,wrong,stale,b);
 assert.equal((await queueMatch(db,outside,'3+0')).match,null);assert.equal((await queueMatch(db,wrong,'1+0')).match,null);await queueMatch(db,stale,'3+0');db.sqlite.prepare('UPDATE arena_queue SET seen_at=0 WHERE user_id=?').run('stale');
 assert.equal((await queueMatch(db,a,'3+0')).match,null);await privateAction(db,outside,'cancel-queue',{});const paired=(await queueMatch(db,b,'3+0')).match;assert.deepEqual(new Set([paired.white_id,paired.black_id]),new Set(['a','b']));assert.equal(paired.white_cbr,88);assert.equal(paired.black_cbr,108);assert.equal(paired.control,'3+0');assert.equal((await queueMatch(db,a,'1+0')).match.id,paired.id);
});
test('Concurrent queue requests cannot place a player on two boards',async()=>{
 const db=database(),players=['a','b','c','d','e','f'].map(x=>profile(x));await seed(db,...players);await Promise.all(players.map(p=>queueMatch(db,p,'10+0')));
 const matches=db.sqlite.prepare("SELECT * FROM arena_matches WHERE status='active'").all(),ids=matches.flatMap(m=>[m.white_id,m.black_id]);assert.equal(matches.length,3);assert.equal(new Set(ids).size,6);
});
test('Host controls time; targeted invites exclude other users and expired rooms',async()=>{
 const db=database(),a=profile('a'),b=profile('b'),c=profile('c');await seed(db,a,b,c);await privateAction(db,b,'presence',{gps:true,lat:11,lng:125,accuracy:10});
 const r=await createRoom(db,a,'1+1','b');await assert.rejects(joinRoom(db,c,r.match.code),/another player/);const m=(await joinRoom(db,b,r.match.code)).match;assert.equal(m.host_id,'a');assert.equal(m.control,'1+1');assert.equal(m.white_ms,60000);assert.equal(m.black_id,'b');await assert.rejects(createRoom(db,a,'3+0'),/current match/);
 await playMove(db,b,m.id,m.version,undefined,true);const waiting=await createRoom(db,a,'10+0');db.sqlite.prepare('UPDATE arena_matches SET created_at=0 WHERE id=?').run(waiting.match.id);await assert.rejects(joinRoom(db,c,waiting.match.code),/expired/);
});
test('Server rejects illegal, out-of-turn, stale, and spectator moves',async()=>{
 const db=database(),a=profile('a'),b=profile('b'),c=profile('c');await seed(db,a,b,c);let m=await room(db,a,b);await assert.rejects(playMove(db,c,m.id,m.version,{from:'e2',to:'e4'}),/two players/);await assert.rejects(playMove(db,b,m.id,m.version,{from:'e7',to:'e5'}),/turn/);await assert.rejects(playMove(db,a,m.id,m.version,{from:'e2',to:'e5'}),/not legal/);const version=m.version;m=(await playMove(db,a,m.id,m.version,{from:'e2',to:'e4'})).match;assert(m.white_ms>180000);await assert.rejects(playMove(db,b,m.id,version,{from:'e7',to:'e5'}),/changed/);
});
test('Checkmate applies both ratings exactly once, with first blood once per 23h 59m window',async()=>{
 const db=database(),a=profile('a',108),b={...profile('b',88),win_streak:3};await seed(db,a,b);let m=await room(db,a,b);
 for(const [actor,from,to] of [[a,'f2','f3'],[b,'e7','e5'],[a,'g2','g4'],[b,'d8','h4']])m=(await playMove(db,actor,m.id,m.version,{from,to})).match;
 assert.equal(m.status,'finished');assert.equal(m.result,'black');assert.equal(player(db,'a').cbr,98);assert.equal(player(db,'b').cbr,108);assert.equal(player(db,'b').win_streak,4);
 await Promise.all([settle(db,m.id),settle(db,m.id)]);assert.equal(player(db,'b').cbr,108);assert.equal(db.sqlite.prepare("SELECT count(*) n FROM arena_feed WHERE kind='first_blood'").get().n,1);
 db.sqlite.exec("DELETE FROM arena_feed WHERE kind='first_blood'");m=await room(db,player(db,'a'),player(db,'b'));await playMove(db,a,m.id,m.version,undefined,true);assert.equal(db.sqlite.prepare("SELECT count(*) n FROM arena_feed WHERE kind='first_blood'").get().n,0);
});
test('Server clocks flag a lost game before accepting another move',async()=>{
 const db=database(),a=profile('a'),b=profile('b');await seed(db,a,b);let m=await room(db,a,b,'1+1');db.sqlite.prepare('UPDATE arena_matches SET last_tick=? WHERE id=?').run(Date.now()-61000,m.id);m=(await playMove(db,a,m.id,m.version,{from:'e2',to:'e4'})).match;assert.equal(m.result,'black');assert.equal(m.pgn,'');assert.equal(player(db,'a').cbr,78);
});
test('GPS off, stale fixes, and active matches hide players; state polling cannot revive stale GPS',async()=>{
 const db=database(),a=profile('a'),b=profile('b');await seed(db,a,b);for(const p of [a,b])await privateAction(db,p,'presence',{gps:true,lat:11,lng:125,accuracy:12});assert.equal((await privateAction(db,a,'nearby',{})).players.length,1);await privateAction(db,b,'presence',{gps:false});assert.equal((await privateAction(db,a,'nearby',{})).players.length,0);
 await privateAction(db,b,'presence',{gps:true,lat:11,lng:125,accuracy:12});db.sqlite.prepare('UPDATE arena_presence SET seen_at=0 WHERE user_id=?').run('b');await privateAction(db,b,'state',{});assert.equal((await privateAction(db,a,'nearby',{})).players.length,0);
 await assert.rejects(privateAction(db,b,'presence',{gps:true,lat:181,lng:125,accuracy:10}),/valid GPS/);
});
test('Territory rewards require GPS accuracy, unoccupied 200 m zone, and one claim daily',async()=>{
 const db=database(),a=profile('a'),b=profile('b');await seed(db,a,b);await privateAction(db,a,'presence',{gps:true,lat:11,lng:125,accuracy:250});await assert.rejects(privateAction(db,a,'claim',{}),/100 m/);
 await privateAction(db,a,'presence',{gps:true,lat:11,lng:125,accuracy:10});await privateAction(db,a,'claim',{});assert.equal(player(db,'a').cbr,98);await assert.rejects(privateAction(db,a,'claim',{}),/occupied/);
 await privateAction(db,b,'presence',{gps:true,lat:11.001,lng:125,accuracy:10});await assert.rejects(privateAction(db,b,'claim',{}),/occupied/);assert.equal(player(db,'b').cbr,88);
});
test('Owner and admin can grant Gold once; normal players cannot change balances or read staff logs',async()=>{
 const db=database(),owner=profile('owner',88,'owner'),admin=profile('admin',88,'admin'),a=profile('a');await seed(db,owner,admin,a);const request={username:'@a',amount:20,request_id:crypto.randomUUID()};await assert.rejects(privateAction(db,a,'grant-gold',request),/Owner or GM/);await privateAction(db,admin,'grant-gold',request);await privateAction(db,admin,'grant-gold',request);assert.equal(player(db,'a').gold_points,20);await privateAction(db,owner,'grant-gold',{...request,request_id:crypto.randomUUID()});assert.equal(player(db,'a').gold_points,40);await assert.rejects(privateAction(db,a,'logs',{}),/Owner or GM/);assert.equal((await privateAction(db,owner,'logs',{})).logs.length,2);
});
test('Feed pruning keeps latest 50; hearts are idempotent and removed with old items',async()=>{
 const db=database(),a=profile('a');await seed(db,a);for(let i=0;i<55;i++)db.sqlite.prepare('INSERT INTO arena_feed(id,user_id,kind,display_name,content,created_at) VALUES(?,?,?,?,?,?)').run('feed'+i,'a','win','A','won',Date.now()+i);
 await assert.rejects(privateAction(db,a,'heart',{id:'feed0',liked:true}));const events=(await publicAction(db,'feed',new URLSearchParams())).events;assert.equal(events.length,50);assert.equal(db.sqlite.prepare('SELECT count(*) n FROM arena_hearts').get().n,0);await privateAction(db,a,'heart',{id:'feed54',liked:true});await privateAction(db,a,'heart',{id:'feed54',liked:true});assert.equal((await publicAction(db,'feed',new URLSearchParams())).events.find(e=>e.id==='feed54').heart_count,1);await privateAction(db,a,'heart',{id:'feed54',liked:false});assert.equal((await privateAction(db,a,'hearts',{})).ids.length,0);
});
test('Offline replay and CBR sync are idempotent and only affect the submitting account',async()=>{
 const db=database(),a=profile('a'),b=profile('b');await seed(db,a,b);const chess=new Chess();['f3','e5','g4','Qh4#'].forEach(m=>chess.move(m));const record={id:crypto.randomUUID(),white_id:'a',black_id:'b',white_name:'A',black_name:'B',pgn:chess.pgn(),result:'black',control:'10+0',created_at:Date.now()-10000,finished_at:Date.now()};
 await privateAction(db,b,'offline-result',{record});await privateAction(db,b,'offline-result',{record});assert.equal(player(db,'b').cbr,96);assert.equal(player(db,'a').cbr,88);assert.equal((await privateAction(db,b,'offline-history',{})).games.length,1);await privateAction(db,a,'offline-result',{record});assert.equal(player(db,'a').cbr,78);
 await assert.rejects(privateAction(db,a,'offline-result',{record:{...record,id:crypto.randomUUID(),result:'white'}}),/final board/);
});
test('App advertisement is global, staff-controlled, replaceable and removable',async()=>{
 const db=database(),owner=profile('owner',88,'owner'),admin=profile('admin',88,'admin'),ordinary=profile('reader');
 assert.equal((await publicAction(db,'app-feature',new URLSearchParams())).image_url,'');
 await assert.rejects(privateAction(db,ordinary,'set-app-feature',{url:'https://example.com/ad.webp'}),/Owner or GM/);
 await privateAction(db,owner,'set-app-feature',{url:'https://example.com/ad.webp'});
 assert.equal((await publicAction(db,'app-feature',new URLSearchParams())).image_url,'https://example.com/ad.webp');
 await privateAction(db,admin,'set-app-feature',{url:'https://example.com/new.webp'});
 assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM app_feature').get().n,1);
 await assert.rejects(privateAction(db,owner,'set-app-feature',{url:'javascript:alert(1)'}),/HTTPS/);
 await privateAction(db,admin,'set-app-feature',{url:''});
 assert.equal((await publicAction(db,'app-feature',new URLSearchParams())).image_url,'');
 assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM arena_logs WHERE action='set_app_feature'").get().n,3);
});

test('Friends require acceptance, cannot be self-added, and paginate ten with active players first',async()=>{
 const db=database(),a=profile('social-a'),people=Array.from({length:12},(_,i)=>profile('friend-'+i));await seed(db,a,...people);
 await assert.rejects(privateAction(db,a,'social-update',{op:'friend',target:a.user_id}),/another/);
 for(const p of people){await privateAction(db,a,'social-update',{op:'friend',target:p.user_id});assert.equal((await privateAction(db,p,'social-list',{mode:'requests'})).total,1);await privateAction(db,p,'social-update',{op:'accept',target:a.user_id});}
 await privateAction(db,people[11],'social-presence',{});
 const first=await privateAction(db,a,'social-list',{mode:'friends'}),second=await privateAction(db,a,'social-list',{mode:'friends',page:2});assert.equal(first.users.length,10);assert.equal(second.users.length,2);assert.equal(first.users[0].user_id,people[11].user_id);assert.equal(new Set([...first.users,...second.users].map(p=>p.user_id)).size,12);
 await privateAction(db,a,'social-update',{op:'remove-friend',target:people[0].user_id});assert.equal((await privateAction(db,people[0],'social-list',{mode:'friends'})).total,0);
});
test('Follow back, blocking both directions, profile protection, and unblocking without restoring relationships',async()=>{
 const db=database(),a=profile('alice'),b=profile('bob');await seed(db,a,b);
 await privateAction(db,a,'social-update',{op:'follow',target:'bob'});let followers=await privateAction(db,b,'social-list',{mode:'followers'});assert.equal(followers.users[0].following,0);
 await privateAction(db,b,'social-update',{op:'follow',target:'alice'});followers=await privateAction(db,b,'social-list',{mode:'followers'});assert.equal(followers.users[0].following,1);
 await privateAction(db,a,'social-update',{op:'block',target:'bob'});await assert.rejects(privateAction(db,b,'social-update',{op:'friend',target:'alice'}),/unavailable/);await assert.rejects(privateAction(db,b,'public-profile',{user_id:'alice'}),/unavailable/);
 assert.equal((await privateAction(db,b,'social-list',{mode:'search',q:'alice'})).total,0);assert.equal((await privateAction(db,a,'social-list',{mode:'blocked'})).total,1);
 await privateAction(db,a,'social-update',{op:'unblock',target:'bob'});assert.equal((await privateAction(db,a,'social-list',{mode:'followers'})).total,0);assert.equal((await privateAction(db,b,'social-list',{mode:'search',q:'alice'})).total,1);
});
test('Personal messages are private, sends idempotent, blocked messages are inaccessible, community filters blocked authors',async()=>{
 const db=database(),a=profile('a'),b=profile('b'),c=profile('c');await seed(db,a,b,c);const input={target:'b',body:'Private message',id:crypto.randomUUID()};
 await privateAction(db,a,'chat-send',input);await privateAction(db,a,'chat-send',input);assert.equal((await privateAction(db,b,'chat-read',{target:'a'})).messages.length,1);assert.equal((await privateAction(db,c,'chat-read',{target:'a'})).messages.length,0);assert.equal((await privateAction(db,a,'chat-read',{})).messages.length,0);
 await privateAction(db,b,'chat-send',{body:'Community message',id:crypto.randomUUID()});assert.equal((await privateAction(db,a,'chat-read',{})).messages.length,1);
 await privateAction(db,a,'social-update',{op:'block',target:'b'});await assert.rejects(privateAction(db,b,'chat-read',{target:'a'}),/blocked/);await assert.rejects(privateAction(db,b,'chat-send',{target:'a',body:'Blocked',id:crypto.randomUUID()}),/blocked/);assert.equal((await privateAction(db,a,'chat-read',{})).messages.length,0);assert.equal((await privateAction(db,c,'chat-read',{})).messages.length,1);
});
test('Every feed insert caps storage at 50 and removes deleted item reactions without waiting for a feed read',async()=>{
 const db=database(),a=profile('a');await seed(db,a);db.sqlite.prepare('INSERT INTO arena_feed(id,user_id,kind,display_name,content,created_at) VALUES(?,?,?,?,?,?)').run('old','a','win','A','won',1);await privateAction(db,a,'heart',{id:'old',liked:true});
 for(let i=0;i<70;i++)db.sqlite.prepare('INSERT INTO arena_feed(id,user_id,kind,display_name,content,created_at) VALUES(?,?,?,?,?,?)').run('new'+i,'a','profile_created','A','joined',i+2);
 assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM arena_feed').get().n,50);assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM arena_hearts').get().n,0);
});
test('Finished match response includes actual clamped CBR changes and updated standings',async()=>{
 const db=database(),a=profile('a',4),b=profile('b',4);await seed(db,a,b);let m=await room(db,a,b);m=(await playMove(db,a,m.id,m.version,undefined,true)).match;
 assert.equal((await privateAction(db,a,'state',{})).completed.id,m.id);assert.equal(m.rating_changes.a,-4);assert.equal(m.rating_changes.b,8);assert.equal(m.white.cbr,0);assert.equal(m.black.cbr,12);assert.equal((await matchView(db,m.id)).rating_changes.a,-4);
});
