import {blocked,socialAction} from './social-server.ts';
import {boardResult,gameFromPgn,timeControl,distanceMeters,type ArenaMatch,type ArenaPlayer} from './game-rules.ts';
import type {PlayerProfile} from './supabase';

export class ArenaError extends Error {status:number;constructor(message:string,status=400){super(message);this.status=status;}}
const stmt=(db:D1Database,sql:string,...values:unknown[])=>db.prepare(sql).bind(...values);
const now=()=>Date.now();
const uid=()=>crypto.randomUUID();
const shortCode=()=>{const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',bytes=crypto.getRandomValues(new Uint8Array(8));return Array.from(bytes,n=>alphabet[n%alphabet.length]).join('');};
const playerColumns='user_id,username,display_name,avatar_url,country_code,cbr,ocbr,gold_points,wins,losses,win_streak';
const inPlay=`status='active'`;
export async function syncPlayer(db:D1Database,p:PlayerProfile){
 await stmt(db,`INSERT INTO arena_players (${playerColumns},updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
 ON CONFLICT(user_id) DO UPDATE SET username=excluded.username,display_name=excluded.display_name,avatar_url=excluded.avatar_url,country_code=excluded.country_code,updated_at=excluded.updated_at`,
 p.user_id,p.username,p.display_name,p.avatar_url||'',p.country_code||'PH',Math.max(0,p.cbr??88),Math.max(0,p.ocbr??88),Math.max(0,p.gold_points??0),p.wins??0,p.losses??0,p.win_streak??0,now()).run();
 return (await stmt(db,`SELECT ${playerColumns} FROM arena_players WHERE user_id=?`,p.user_id).first<ArenaPlayer>())!;
}
async function current(db:D1Database,id:string){return stmt(db,`SELECT * FROM arena_matches WHERE (white_id=? OR black_id=?) AND ${inPlay} ORDER BY created_at DESC LIMIT 1`,id,id).first<ArenaMatch>();}
export async function settle(db:D1Database,id:string){
 const m=await stmt(db,'SELECT * FROM arena_matches WHERE id=?',id).first<ArenaMatch>();if(!m||m.status!=='finished'||m.rating_applied)return;
 const guard=`EXISTS(SELECT 1 FROM arena_matches WHERE id=? AND status='finished' AND rating_applied=0)`;
 const statements:D1PreparedStatement[]=[];
 for(const [side,pid,opponentCbr,ownCbr] of [['white',m.white_id,m.black_cbr,m.white_cbr],['black',m.black_id,m.white_cbr,m.black_cbr]] as const){
  if(!pid)continue;
  const won=m.result===side,lost=m.result!=='draw'&&!won;
  const bonus=won&&Math.abs(ownCbr-opponentCbr)>10?Math.floor(opponentCbr*.1):0;
  const delta=won?`8+CASE WHEN win_streak+1>=4 THEN 2 ELSE 0 END+${bonus}`:lost?'-MIN(10,cbr)':'0';
  statements.push(stmt(db,`INSERT OR IGNORE INTO arena_ledger(id,user_id,delta,kind,created_at) SELECT ?,user_id,${delta},'match',? FROM arena_players WHERE user_id=? AND ${guard}`,id+':'+pid,now(),pid,id));
  if(won){
   statements.push(stmt(db,`INSERT OR IGNORE INTO arena_feed(id,user_id,kind,display_name,content,cbr_delta,created_at)
    SELECT ?,user_id,'win',display_name,?,${delta},? FROM arena_players WHERE user_id=? AND ${guard}`,id+':win',`won a ${timeControl(m.control).group.toLowerCase()} match.`,now(),pid,id));
   const firstId='first:'+pid+':'+m.id,firstAt=now();
   statements.push(stmt(db,`INSERT OR IGNORE INTO arena_ledger(id,user_id,delta,kind,created_at) SELECT ?,?,0,'first_blood',? WHERE ${guard} AND NOT EXISTS(SELECT 1 FROM arena_ledger WHERE user_id=? AND kind='first_blood' AND created_at>?)`,firstId,pid,firstAt,id,pid,firstAt-86340000));
   statements.push(stmt(db,`INSERT OR IGNORE INTO arena_feed(id,user_id,kind,display_name,content,created_at) SELECT ?,user_id,'first_blood',display_name,'earned their first win of the day.',? FROM arena_players WHERE user_id=? AND EXISTS(SELECT 1 FROM arena_ledger WHERE id=?)`,firstId,firstAt,pid,firstId));
  }
  statements.push(stmt(db,`UPDATE arena_players SET cbr=MAX(0,cbr+(${delta})),wins=wins+?,losses=losses+?,win_streak=${won?'win_streak+1':'0'} WHERE user_id=? AND ${guard}`,won?1:0,lost?1:0,pid,id));
 }
 statements.push(stmt(db,"UPDATE arena_matches SET rating_applied=1 WHERE id=? AND status='finished'",id));
 statements.push(stmt(db,'DELETE FROM arena_queue WHERE match_id=?',id));
 statements.push(stmt(db,'DELETE FROM arena_feed WHERE id NOT IN(SELECT id FROM arena_feed ORDER BY created_at DESC LIMIT 50)'));
 statements.push(stmt(db,'DELETE FROM arena_hearts WHERE feed_id NOT IN(SELECT id FROM arena_feed)'));
 await db.batch(statements);
}
export async function matchView(db:D1Database,id:string){
 let m=await stmt(db,'SELECT * FROM arena_matches WHERE id=?',id).first<ArenaMatch>();if(!m)throw new ArenaError('Match not found.',404);
 if(m.status==='active'){
  const chess=gameFromPgn(m.pgn),side=chess.turn()==='w'?'white':'black',left=(side==='white'?m.white_ms:m.black_ms)-(now()-m.last_tick);
  if(left<=0){await stmt(db,`UPDATE arena_matches SET status='finished',result=?,version=version+1 WHERE id=? AND version=? AND status='active'`,chess.isInsufficientMaterial()?'draw':side==='white'?'black':'white',id,m.version).run();m=(await stmt(db,'SELECT * FROM arena_matches WHERE id=?',id).first<ArenaMatch>())!;}
 }
 if(m.status==='finished'){await settle(db,id);m=(await stmt(db,'SELECT * FROM arena_matches WHERE id=?',id).first<ArenaMatch>())!;}
 const [white,black]=await Promise.all([stmt(db,`SELECT ${playerColumns} FROM arena_players WHERE user_id=?`,m.white_id).first<ArenaPlayer>(),m.black_id?stmt(db,`SELECT ${playerColumns} FROM arena_players WHERE user_id=?`,m.black_id).first<ArenaPlayer>():null]);
 const ratings=await stmt(db,"SELECT user_id,delta FROM arena_ledger WHERE id IN(?,?)",id+':'+m.white_id,id+':'+m.black_id).all<{user_id:string;delta:number}>();
 return {...m,white:white??undefined,black:black??undefined,rating_changes:Object.fromEntries(ratings.results.map(r=>[r.user_id,r.delta])),server_now:now()};
}
export async function queueMatch(db:D1Database,p:ArenaPlayer,control:string){
 const tc=timeControl(control),t=now(),id=uid();
 const active=await current(db,p.user_id);if(active)return {match:await matchView(db,active.id)};
 await db.batch([
  stmt(db,"DELETE FROM arena_queue WHERE user_id=? AND match_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM arena_matches WHERE id=match_id AND status='active')",p.user_id),
  stmt(db,`INSERT INTO arena_queue(user_id,control,seen_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET seen_at=excluded.seen_at,control=CASE WHEN match_id IS NULL THEN excluded.control ELSE control END`,p.user_id,control,t),
  stmt(db,`INSERT INTO arena_matches(id,host_id,white_id,black_id,code,control,status,white_ms,black_ms,last_tick,white_cbr,black_cbr,created_at)
    SELECT ?,q.user_id,q.user_id,?,?,?,'active',?,?,?,?,?,? FROM arena_queue q JOIN arena_players p ON p.user_id=q.user_id
    WHERE q.user_id<>? AND q.control=? AND q.match_id IS NULL AND q.seen_at>? AND ABS(p.cbr-?)<=20
    AND NOT EXISTS(SELECT 1 FROM arena_matches WHERE status='active' AND (white_id IN(q.user_id,?) OR black_id IN(q.user_id,?)))
    ORDER BY RANDOM() LIMIT 1`,id,p.user_id,id.slice(0,8).toUpperCase(),control,tc.seconds*1000,tc.seconds*1000,t, // white CBR set from matched player's row below
    p.cbr,p.cbr,t,p.user_id,control,t-15000,p.cbr,p.user_id,p.user_id),
  stmt(db,`UPDATE arena_matches SET white_cbr=(SELECT cbr FROM arena_players WHERE user_id=white_id) WHERE id=?`,id),
  stmt(db,`UPDATE arena_queue SET match_id=? WHERE user_id IN (SELECT white_id FROM arena_matches WHERE id=? UNION SELECT black_id FROM arena_matches WHERE id=?)`,id,id,id),
 ]);
 const match=await current(db,p.user_id);return {match:match?await matchView(db,match.id):null,searching:!match};
}
export async function createRoom(db:D1Database,p:ArenaPlayer,control:string,target?:string){
 const tc=timeControl(control);if(target===p.user_id)throw new ArenaError('Choose another player.');
 if(target){const available=await stmt(db,'SELECT * FROM arena_presence WHERE user_id=? AND gps=1 AND seen_at>?',target,now()-45000).first();if(!available)throw new ArenaError('This player is no longer available on the map.');}
 if(await current(db,p.user_id))throw new ArenaError('Finish your current match first.');
 const id=uid(),t=now();await db.batch([
  stmt(db,"UPDATE arena_matches SET status='cancelled' WHERE host_id=? AND status='waiting'",p.user_id),
  stmt(db,'DELETE FROM arena_queue WHERE user_id=? AND match_id IS NULL',p.user_id),
  stmt(db,`INSERT INTO arena_matches(id,host_id,white_id,invite_to,code,control,status,white_ms,black_ms,last_tick,white_cbr,created_at) SELECT ?,?,?,?,?,?,'waiting',?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM arena_matches WHERE status='active' AND (white_id=? OR black_id=?))`,id,p.user_id,p.user_id,target??null,shortCode(),control,tc.seconds*1000,tc.seconds*1000,t,p.cbr,t,p.user_id,p.user_id),
 ]);return {match:await matchView(db,id)};
}
export async function joinRoom(db:D1Database,p:ArenaPlayer,code:string){
 const m=await stmt(db,"SELECT * FROM arena_matches WHERE code=? AND status='waiting' AND created_at>?",code.trim().toUpperCase(),now()-120000).first<ArenaMatch>();
 if(!m)throw new ArenaError('That invitation expired or the room is full.');if(m.white_id===p.user_id)return {match:await matchView(db,m.id)};
 if(m.invite_to&&m.invite_to!==p.user_id)throw new ArenaError('This invitation is for another player.',403);
 const change=await stmt(db,`UPDATE arena_matches SET black_id=?,black_cbr=?,status='active',last_tick=?,version=version+1 WHERE id=? AND status='waiting'
 AND NOT EXISTS(SELECT 1 FROM arena_matches WHERE status='active' AND (white_id IN(?,?) OR black_id IN(?,?)))`,p.user_id,p.cbr,now(),m.id,p.user_id,m.white_id,p.user_id,m.white_id).run();
 if(!change.meta.changes)throw new ArenaError('One of these players has already joined another match.');
 await stmt(db,'DELETE FROM arena_queue WHERE user_id IN(?,?)',p.user_id,m.white_id).run();
 return {match:await matchView(db,m.id)};
}
export async function playMove(db:D1Database,p:ArenaPlayer,id:string,version:number,move?:{from:string;to:string;promotion?:string},resign=false){
 const m=await matchView(db,id);if(![m.white_id,m.black_id].includes(p.user_id))throw new ArenaError('Only the two players can move.',403);
 if(m.status!=='active')return {match:m};if(m.version!==version)throw new ArenaError('The board changed. Please try your move again.',409);
 const chess=gameFromPgn(m.pgn),side=chess.turn()==='w'?'white':'black',pid=side==='white'?m.white_id:m.black_id,t=now();
 let result=m.result,w=m.white_ms,b=m.black_ms;
 if((side==='white'?w:b)<=Math.max(0,t-m.last_tick))result=chess.isInsufficientMaterial()?'draw':side==='white'?'black':'white';
 else if(resign)result=p.user_id===m.white_id?'black':'white';
 else {if(pid!==p.user_id)throw new ArenaError('Wait for your turn.',403);if(!move)throw new ArenaError('Choose a move.');
  try{chess.move({from:move.from,to:move.to,promotion:move.promotion??'q'});}catch{throw new ArenaError('That move is not legal.');}
  const elapsed=Math.max(0,t-m.last_tick),inc=timeControl(m.control).increment*1000;
  if(side==='white')w=Math.max(0,w-elapsed)+inc;else b=Math.max(0,b-elapsed)+inc;
  result=boardResult(chess);
 }
 const changed=await stmt(db,`UPDATE arena_matches SET pgn=?,white_ms=?,black_ms=?,last_tick=?,status=?,result=?,version=version+1 WHERE id=? AND version=? AND status='active'`,chess.pgn(),w,b,t,result?'finished':'active',result,id,version).run();
 if(!changed.meta.changes)throw new ArenaError('The board changed. Please try again.',409);
 return {match:await matchView(db,id)};
}
export async function publicAction(db:D1Database,action:string,params:URLSearchParams){
 if(action==='app-feature'){return await stmt(db,"SELECT image_url,updated_at FROM app_feature WHERE id='global'").first()??{image_url:'',updated_at:null};}
 if(action==='ranks'){const rows=await stmt(db,`SELECT ${playerColumns},ROW_NUMBER() OVER(ORDER BY cbr DESC,wins DESC,user_id) AS rank FROM arena_players ORDER BY cbr DESC,wins DESC,user_id LIMIT 10`).all();return {players:rows.results};}
 if(action==='live'){const rows=await stmt(db,"SELECT id FROM arena_matches WHERE status='active' ORDER BY created_at DESC LIMIT 12").all<{id:string}>();return {matches:await Promise.all(rows.results.map(m=>matchView(db,m.id)))};}
 if(action==='watch'){const match=await matchView(db,params.get('id')??'');if(match.status==='waiting')throw new ArenaError('This match has not started.',404);return {match};}
 if(action==='feed'){
  await db.batch([stmt(db,'DELETE FROM arena_feed WHERE expires_at IS NOT NULL AND expires_at<=?',now()),stmt(db,'DELETE FROM arena_feed WHERE id NOT IN(SELECT id FROM arena_feed ORDER BY created_at DESC LIMIT 50)'),stmt(db,'DELETE FROM arena_hearts WHERE feed_id NOT IN(SELECT id FROM arena_feed)')]);
  const result=await stmt(db,"SELECT f.*,CASE WHEN f.kind='announcement' THEN 'Chess Burger' ELSE f.display_name END AS display_name,CASE WHEN f.kind='announcement' THEN '/cburger_logo.png' ELSE COALESCE(p.avatar_url,'') END AS avatar_url,COALESCE(p.cbr,88) AS cbr,(SELECT COUNT(*) FROM arena_hearts h WHERE h.feed_id=f.id) AS heart_count FROM arena_feed f LEFT JOIN arena_players p ON p.user_id=f.user_id ORDER BY f.created_at DESC LIMIT 50").all();
  return {events:result.results.map(f=>({...f,origin:'arena',created_at:new Date(f.created_at as number).toISOString(),expires_at:f.expires_at?new Date(f.expires_at as number).toISOString():null}))};
 }
 if(action==='profile-data'){
  const userId=params.get('user_id')??'';if(!userId)throw new ArenaError('Player not found.',404);
  const profile=await stmt(db,`SELECT p.*,COALESCE(a.cbr,88) AS cbr,COALESCE(a.ocbr,88) AS ocbr,COALESCE(a.gold_points,0) AS gold_points,COALESCE(a.win_streak,0) AS win_streak,COALESCE(a.wins,0) AS wins,COALESCE(a.losses,0) AS losses FROM app_profiles p LEFT JOIN arena_players a ON a.user_id=p.user_id WHERE p.user_id=?`,userId).first<any>();if(!profile)throw new ArenaError('Player not found.',404);
  const rank=await stmt(db,'SELECT COUNT(*)+1 AS rank FROM arena_players WHERE cbr>? OR (cbr=? AND wins>?) OR(cbr=? AND wins=? AND user_id<?)',profile.cbr,profile.cbr,profile.wins,profile.cbr,profile.wins,userId).first<{rank:number}>();
  return {profile:{...profile,featured_photos:JSON.parse(profile.featured_photos||'[]'),featured_badges:JSON.parse(profile.featured_badges||'[]'),created_at:new Date(profile.created_at).toISOString()},rank:rank?.rank??0};
 }
 throw new ArenaError('Unknown action.',404);
}
export async function privateAction(db:D1Database,profile:PlayerProfile,action:string,input:Record<string,any>){
 const p=await syncPlayer(db,profile),id=p.user_id,t=now();
 if(action.startsWith('social-')||action.startsWith('chat-'))return socialAction(db,id,action,input);
 if(action==='public-profile'){if(await blocked(db,id,String(input.user_id)))throw new ArenaError('This profile is unavailable.',403);return publicAction(db,'profile-data',new URLSearchParams({user_id:String(input.user_id)}));}
 if(action==='me'){const rank=await stmt(db,'SELECT COUNT(*)+1 AS rank FROM arena_players WHERE cbr>? OR (cbr=? AND wins>?) OR(cbr=? AND wins=? AND user_id<?)',p.cbr,p.cbr,p.wins,p.cbr,p.wins,id).first();return {profile:{...profile,...p},rank:rank?.rank};}
 if(action==='state'){
  const active=await current(db,id),invites=await stmt(db,"SELECT m.*,p.display_name AS host_name,p.avatar_url AS host_avatar FROM arena_matches m JOIN arena_players p ON p.user_id=m.host_id WHERE invite_to=? AND status='waiting' AND created_at>? ORDER BY created_at DESC LIMIT 5",id,t-120000).all();
  const completed=await stmt(db,"SELECT id FROM arena_matches WHERE (white_id=? OR black_id=?) AND status='finished' AND last_tick>? ORDER BY last_tick DESC,id DESC LIMIT 1",id,id,t-86400000).first<{id:string}>();
  return {match:active?await matchView(db,active.id):null,completed:completed?await matchView(db,completed.id):null,invites:invites.results};
 }
 if(action==='queue')return queueMatch(db,p,String(input.control));
 if(action==='cancel-queue'){await stmt(db,'DELETE FROM arena_queue WHERE user_id=? AND match_id IS NULL',id).run();return {ok:true};}
 if(action==='room')return createRoom(db,p,String(input.control),input.target);
 if(action==='join')return joinRoom(db,p,String(input.code));
 if(action==='cancel-room'){await stmt(db,"UPDATE arena_matches SET status='cancelled' WHERE id=? AND status='waiting' AND (host_id=? OR invite_to=?)",input.id,id,id).run();return {ok:true};}
 if(action==='match'){const match=await matchView(db,String(input.id));if(![match.white_id,match.black_id,match.invite_to].includes(id))throw new ArenaError('This room is private.',403);return {match};}
 if(action==='move'||action==='resign')return playMove(db,p,String(input.id),Number(input.version),input.move,action==='resign');
 if(action==='presence'){
  const gps=input.gps===true;if(gps&&(!Number.isFinite(input.lat)||!Number.isFinite(input.lng)||Math.abs(input.lat)>90||Math.abs(input.lng)>180||!Number.isFinite(input.accuracy)||input.accuracy<0))throw new ArenaError('A valid GPS reading is needed.');
  await stmt(db,'INSERT INTO arena_presence(user_id,lat,lng,accuracy,gps,seen_at) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET lat=excluded.lat,lng=excluded.lng,accuracy=excluded.accuracy,gps=excluded.gps,seen_at=excluded.seen_at',id,gps?input.lat:null,gps?input.lng:null,gps?input.accuracy:null,gps?1:0,t).run();return {ok:true};
 }
 if(action==='leave'){await db.batch([stmt(db,'DELETE FROM arena_presence WHERE user_id=?',id),stmt(db,'DELETE FROM arena_queue WHERE user_id=? AND match_id IS NULL',id),stmt(db,"UPDATE arena_matches SET status='cancelled' WHERE host_id=? AND status='waiting'",id)]);return {ok:true};}
 if(action==='nearby'){
  const pos=await stmt(db,'SELECT lat,lng FROM arena_presence WHERE user_id=? AND gps=1 AND seen_at>?',id,t-45000).first<{lat:number;lng:number}>();if(!pos)return {players:[],territories:[]};
  const rows=await stmt(db,`SELECT p.*,s.lat,s.lng FROM arena_presence s JOIN arena_players p ON p.user_id=s.user_id WHERE s.gps=1 AND s.seen_at>? AND s.user_id<>? AND ABS(s.lat-?)<.1 AND ABS(s.lng-?)<.2 AND NOT EXISTS(SELECT 1 FROM arena_matches m WHERE m.status='active' AND (m.white_id=p.user_id OR m.black_id=p.user_id)) LIMIT 100`,t-45000,id,pos.lat,pos.lng).all<ArenaPlayer&{lat:number;lng:number}>();
  const zones=await stmt(db,'SELECT t.*,p.display_name,p.avatar_url FROM arena_territory t JOIN arena_players p ON p.user_id=t.user_id WHERE ABS(t.lat-?)<.1 AND ABS(t.lng-?)<.2 LIMIT 100',pos.lat,pos.lng).all();
  return {players:rows.results.map(r=>({...r,distance:Math.round(distanceMeters(pos,r))})).filter(r=>r.distance<=10000).sort((a,b)=>a.distance-b.distance),territories:zones.results};
 }
 if(action==='claim'){
  const pos=await stmt(db,'SELECT lat,lng,accuracy FROM arena_presence WHERE user_id=? AND gps=1 AND seen_at>?',id,t-30000).first<{lat:number;lng:number;accuracy:number}>();if(!pos||pos.accuracy>100)throw new ArenaError('Enable GPS and wait for accuracy within 100 m.');
  const zone=uid(),day=new Date().toISOString().slice(0,10),claimKey='territory:'+id+':'+day,dx=.0018/Math.max(.05,Math.cos(pos.lat*Math.PI/180));
  await db.batch([
   stmt(db,`INSERT INTO arena_territory(id,user_id,lat,lng,created_at) SELECT ?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM arena_ledger WHERE id=?) AND NOT EXISTS(SELECT 1 FROM arena_territory WHERE ((lat-?)/.0018)*((lat-?)/.0018)+((lng-?)/?)*((lng-?)/?)<4)`,zone,id,pos.lat,pos.lng,t,claimKey,pos.lat,pos.lat,pos.lng,dx,pos.lng,dx),
   stmt(db,'INSERT OR IGNORE INTO arena_ledger(id,user_id,delta,kind,created_at) SELECT ?,?,10,\'territory\',? WHERE EXISTS(SELECT 1 FROM arena_territory WHERE id=?)',claimKey,id,t,zone),
   stmt(db,'UPDATE arena_players SET cbr=cbr+10 WHERE user_id=? AND EXISTS(SELECT 1 FROM arena_territory WHERE id=?)',id,zone),
  ]);const created=await stmt(db,'SELECT id FROM arena_territory WHERE id=?',zone).first();if(!created)throw new ArenaError('This 200 m zone is occupied, or you already claimed today.');return {ok:true,delta:10};
 }
 if(action==='heart'){const feed=await stmt(db,'SELECT id FROM arena_feed WHERE id=?',input.id).first();if(!feed)throw new ArenaError('This feed item has expired.');if(input.liked)await stmt(db,'INSERT OR IGNORE INTO arena_hearts(id,feed_id,user_id) VALUES(?,?,?)',input.id+':'+id,input.id,id).run();else await stmt(db,'DELETE FROM arena_hearts WHERE feed_id=? AND user_id=?',input.id,id).run();return {ok:true};}
 if(action==='hearts'){const r=await stmt(db,'SELECT feed_id FROM arena_hearts WHERE user_id=?',id).all();return {ids:r.results.map(h=>h.feed_id)};}
 if(action==='offline-result'){
  const r=input.record,matchId=String(r?.id??'');if(!/^[a-f0-9-]{36}$/.test(matchId)||![r?.white_id,r?.black_id].includes(id)||typeof r.pgn!=='string'||r.pgn.length>15000||!['white','black','draw'].includes(r.result))throw new ArenaError('Invalid offline result.');
  timeControl(r.control);let chess;try{chess=gameFromPgn(r.pgn);}catch{throw new ArenaError('The saved replay contains an illegal move.');}
  const actual=boardResult(chess);if(actual&&actual!==r.result)throw new ArenaError('The result does not match the final board.');
  if(!Number.isFinite(r.created_at)||!Number.isFinite(r.finished_at)||r.created_at<1577836800000||r.created_at>r.finished_at||r.finished_at>t+300000)throw new ArenaError('The offline game dates are invalid.');
  if(await stmt(db,'SELECT id FROM arena_matches WHERE id=?',matchId).first())throw new ArenaError('This is an online match.');
  const key='offline:'+matchId+':'+id,won=r.result===(r.white_id===id?'white':'black'),lost=r.result!=='draw'&&!won;
  const delta=won?'6':lost?'-MIN(9,ocbr)':'0';
  const guard='NOT EXISTS(SELECT 1 FROM arena_ledger WHERE id=?)';
  const record={id:matchId,white:String(r.white_name??'White').slice(0,60),black:String(r.black_name??'Black').slice(0,60),pgn:r.pgn,score:r.result==='draw'?'½–½':r.result==='white'?'1–0':'0–1',startedAt:new Date(r.created_at).toISOString(),updatedAt:new Date(r.finished_at).toISOString()};
  const writes=[stmt(db,`INSERT OR IGNORE INTO arena_offline_results(id,user_id,record,created_at) VALUES(?,?,?,?)`,key,id,JSON.stringify(record),r.created_at)];
  if(won){writes.push(stmt(db,`INSERT OR IGNORE INTO arena_feed(id,user_id,kind,display_name,content,cbr_delta,created_at) SELECT ?,user_id,'win',display_name,'won an offline match (+6 OCBR).',0,? FROM arena_players WHERE user_id=? AND ${guard}`,key+':win',r.finished_at,id,key));}
  writes.push(stmt(db,`INSERT OR IGNORE INTO arena_ledger(id,user_id,delta,kind,created_at) SELECT ?,user_id,${delta},'offline',? FROM arena_players WHERE user_id=? AND ${guard}`,key,r.finished_at,id,key));
  writes.push(stmt(db,`UPDATE arena_players SET ocbr=MAX(0,ocbr+(${delta})) WHERE user_id=? AND NOT EXISTS(SELECT 1 FROM arena_logs WHERE id=?)`,id,key));
  writes.push(stmt(db,'INSERT OR IGNORE INTO arena_logs(id,actor_user_id,action,details,created_at) VALUES(?,?,?,?,?)',key,id,'offline_result',JSON.stringify({matchId,result:r.result,selfReported:true}),t));
  writes.push(stmt(db,'DELETE FROM arena_feed WHERE id NOT IN(SELECT id FROM arena_feed ORDER BY created_at DESC LIMIT 50)'));
  await db.batch(writes);return {ok:true};
 }
 if(action==='offline-history'){const r=await stmt(db,'SELECT record FROM arena_offline_results WHERE user_id=? ORDER BY created_at DESC LIMIT 50',id).all();return {games:r.results.map(x=>JSON.parse(String(x.record)))};}
 if(action==='history'){const rows=await stmt(db,"SELECT id FROM arena_matches WHERE (white_id=? OR black_id=?) AND status='finished' ORDER BY created_at DESC LIMIT 50",id,id).all<{id:string}>();return {matches:await Promise.all(rows.results.map(m=>matchView(db,m.id)))};}
 if(!['owner','admin'].includes(profile.role))throw new ArenaError('Owner or GM access is required.',403);
 if(action==='grant-gold'){
  const amount=Number(input.amount);if(!Number.isInteger(amount)||amount<1||amount>10000)throw new ArenaError('Enter 1–10,000 Gold.');
  const target=await stmt(db,'SELECT user_id FROM arena_players WHERE username=?',String(input.username).replace(/^@+/,'' ).toLowerCase()).first<{user_id:string}>();if(!target)throw new ArenaError('Player not found. They need to sign in to the updated app first.');
  const key=String(input.request_id??'');if(!/^[a-f0-9-]{36}$/.test(key))throw new ArenaError('A request ID is required.');
  await db.batch([
   stmt(db,"UPDATE arena_players SET gold_points=gold_points+? WHERE user_id=? AND NOT EXISTS(SELECT 1 FROM arena_logs WHERE id=?)",amount,target.user_id,key),
   stmt(db,'INSERT OR IGNORE INTO arena_logs(id,actor_user_id,action,details,created_at) VALUES(?,?,?,?,?)',key,id,'grant_gold',JSON.stringify({username:input.username,amount}),t),
  ]);return {ok:true};
 }
 if(action==='cms-announcements'){
  const r=await stmt(db,"SELECT id,content,image_url,expires_at FROM arena_feed WHERE kind='announcement' AND (expires_at IS NULL OR expires_at>?) ORDER BY created_at DESC",t).all();return {posts:r.results.map(x=>({...x,expires_at:x.expires_at?new Date(x.expires_at as number).toISOString():''}))};
 }
 if(action==='save-announcement'){
  const content=String(input.content??'').trim().slice(0,500),image=String(input.image_url??'').trim().slice(0,2048),expires=Date.parse(String(input.expires_at??''));if(!content&&!image)throw new ArenaError('Add text or an image.');if(!Number.isFinite(expires)||expires<=t)throw new ArenaError('Choose a future end date.');if(image&&!/^https:\/\//.test(image))throw new ArenaError('Use an HTTPS image link.');
  const edit=String(input.id??''),feedId=edit||uid(),logId=uid();await db.batch([edit?stmt(db,"UPDATE arena_feed SET display_name='Chess Burger',content=?,image_url=?,expires_at=? WHERE id=? AND kind='announcement'",content,image,expires,edit):stmt(db,"INSERT INTO arena_feed(id,user_id,kind,display_name,content,image_url,expires_at,created_at) VALUES(?,?,'announcement','Chess Burger',?,?,?,?)",feedId,id,content,image,expires,t),stmt(db,'INSERT INTO arena_logs(id,actor_user_id,action,details,created_at) VALUES(?,?,?,?,?)',logId,id,edit?'announcement_update':'announcement_create',JSON.stringify({id:feedId,expires_at:new Date(expires).toISOString()}),t),stmt(db,'DELETE FROM arena_feed WHERE id NOT IN(SELECT id FROM arena_feed ORDER BY created_at DESC LIMIT 50)')]);return {ok:true};
 }
 if(action==='delete-announcement'){const feedId=String(input.id??'');await db.batch([stmt(db,"DELETE FROM arena_feed WHERE id=? AND kind='announcement'",feedId),stmt(db,'INSERT INTO arena_logs(id,actor_user_id,action,details,created_at) VALUES(?,?,?,?,?)',uid(),id,'announcement_delete',JSON.stringify({id:feedId}),t)]);return {ok:true};}
 if(action==='set-app-feature'){
  const url=String(input.url??'').trim();if(url&&(url.length>2048||!/^https:\/\//.test(url)))throw new ArenaError('Use an HTTPS image link.');
  await db.batch([stmt(db,"INSERT INTO app_feature(id,image_url,updated_at) VALUES('global',?,?) ON CONFLICT(id) DO UPDATE SET image_url=excluded.image_url,updated_at=excluded.updated_at",url,t),stmt(db,'INSERT INTO arena_logs(id,actor_user_id,action,details,created_at) VALUES(?,?,?,?,?)',uid(),id,'set_app_feature',JSON.stringify({image_url:url}),t)]);return {ok:true};
 }
 if(action==='set-card-photo'){
  const username=String(input.username??'').replace(/^@+/,'' ).toLowerCase(),url=String(input.url??'').trim();if(url&&!/^https:\/\//.test(url))throw new ArenaError('Use an HTTPS image link.');const target=await stmt(db,'SELECT user_id FROM app_profiles WHERE username=?',username).first<{user_id:string}>();if(!target)throw new ArenaError('Player not found.');await db.batch([stmt(db,'UPDATE app_profiles SET card_photo_url=?,updated_at=? WHERE user_id=?',url,t,target.user_id),stmt(db,'INSERT INTO arena_logs(id,actor_user_id,action,details,created_at) VALUES(?,?,?,?,?)',uid(),id,'set_card_photo',JSON.stringify({username}),t)]);return {ok:true};
 }
 if(action==='set-role'){
  if(profile.role!=='owner')throw new ArenaError('Owner access is required.',403);const username=String(input.username??'').replace(/^@+/,'' ).toLowerCase(),role=String(input.role??'');if(!['player','admin'].includes(role))throw new ArenaError('Choose Player or GM / Admin.');const target=await stmt(db,"SELECT user_id FROM app_profiles WHERE username=? AND role<>'owner'",username).first<{user_id:string}>();if(!target)throw new ArenaError('Player not found or Owner role is protected.');await db.batch([stmt(db,'UPDATE app_profiles SET role=?,updated_at=? WHERE user_id=?',role,t,target.user_id),stmt(db,'INSERT INTO arena_logs(id,actor_user_id,action,details,created_at) VALUES(?,?,?,?,?)',uid(),id,'set_role',JSON.stringify({username,role}),t)]);return {ok:true};
 }
 if(action==='logs'){const page=Math.max(0,Math.min(100,Number(input.page)||0));const r=await stmt(db,'SELECT l.*,p.display_name AS actor_name FROM arena_logs l LEFT JOIN arena_players p ON p.user_id=l.actor_user_id ORDER BY l.created_at DESC LIMIT 20 OFFSET ?',page*20).all();return {logs:r.results.map(log=>({...log,details:JSON.parse(log.details as string),created_at:new Date(log.created_at as number).toISOString()}))};}
 throw new ArenaError('Unknown action.',404);
}
