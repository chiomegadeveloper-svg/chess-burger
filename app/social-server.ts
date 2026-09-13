import {ArenaError} from './arena-server.ts';
const stmt=(db:D1Database,sql:string,...values:unknown[])=>db.prepare(sql).bind(...values);
// All social actions are called only after Supabase authentication and profile loading.
export async function blocked(db:D1Database,a:string,b:string){return !!await stmt(db,"SELECT 1 FROM social_links WHERE kind='block' AND ((user_id=? AND target_id=?) OR(user_id=? AND target_id=?)) LIMIT 1",a,b,b,a).first();}
const visible=`NOT EXISTS(SELECT 1 FROM social_links b WHERE b.kind='block' AND ((b.user_id=? AND b.target_id=p.user_id) OR(b.target_id=? AND b.user_id=p.user_id)))`;
export async function socialAction(db:D1Database,id:string,action:string,input:Record<string,unknown>){
 const target=String(input.target??''),t=Date.now();
 if(action==='social-presence'){await stmt(db,'INSERT INTO social_presence(user_id,seen_at) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET seen_at=excluded.seen_at',id,t).run();return {ok:true};}
 if(action==='social-list'){
  const mode=String(input.mode??'friends'),q=String(input.q??'').trim().replace(/^@/,'').slice(0,60),page=Math.max(1,Math.floor(Number(input.page)||1));
  let filter='',values:unknown[]=[];
  if(mode==='search'){filter="p.user_id<>? AND (instr(lower(p.username),lower(?))>0 OR instr(lower(p.display_name),lower(?))>0)";values=[id,q,q];}
  else if(mode==='friends'){filter="EXISTS(SELECT 1 FROM social_links l WHERE l.kind='friend' AND l.status='accepted' AND ((l.user_id=? AND l.target_id=p.user_id) OR(l.target_id=? AND l.user_id=p.user_id)))";values=[id,id];}
  else if(mode==='requests'){filter="EXISTS(SELECT 1 FROM social_links l WHERE l.kind='friend' AND l.status='pending' AND l.target_id=? AND l.user_id=p.user_id)";values=[id];}
  else if(mode==='followers'){filter="EXISTS(SELECT 1 FROM social_links l WHERE l.kind='follow' AND l.target_id=? AND l.user_id=p.user_id)";values=[id];}
  else if(mode==='following'){filter="EXISTS(SELECT 1 FROM social_links l WHERE l.kind='follow' AND l.user_id=? AND l.target_id=p.user_id)";values=[id];}
  else if(mode==='blocked'){filter="EXISTS(SELECT 1 FROM social_links l WHERE l.kind='block' AND l.user_id=? AND l.target_id=p.user_id)";values=[id];}
  else if(mode==='conversations'){filter="EXISTS(SELECT 1 FROM social_messages m WHERE(m.sender_id=? AND m.recipient_id=p.user_id) OR(m.recipient_id=? AND m.sender_id=p.user_id))";values=[id,id];}
  else throw new ArenaError('Unknown list.');
  if(mode!=='blocked'){filter+=' AND '+visible;values.push(id,id);}
  const count=await stmt(db,`SELECT COUNT(*) AS total FROM arena_players p WHERE ${filter}`,...values).first<{total:number}>();
  const total=count?.total??0,pages=Math.max(1,Math.ceil(total/10)),current=Math.min(page,pages);
  const rows=await stmt(db,`SELECT p.user_id,p.username,p.display_name,p.avatar_url,p.cbr,COALESCE(s.seen_at,0) AS seen_at,
   EXISTS(SELECT 1 FROM social_links l WHERE l.kind='follow' AND l.user_id=? AND l.target_id=p.user_id) AS following,
   (SELECT CASE WHEN l.status='accepted' THEN 'accepted' WHEN l.user_id=? THEN 'sent' ELSE 'received' END FROM social_links l WHERE l.kind='friend' AND ((l.user_id=? AND l.target_id=p.user_id) OR(l.target_id=? AND l.user_id=p.user_id)) LIMIT 1) AS friendship
   FROM arena_players p LEFT JOIN social_presence s ON s.user_id=p.user_id WHERE ${filter} ORDER BY (COALESCE(s.seen_at,0)>?) DESC,p.display_name,p.user_id LIMIT 10 OFFSET ?`,id,id,id,id,...values,t-60000,(current-1)*10).all();
  return {users:rows.results,total,page:current,pages};
 }
 if(action==='social-status'){
  const rows=await stmt(db,'SELECT user_id,kind,status FROM social_links WHERE(user_id=? AND target_id=?) OR(user_id=? AND target_id=?)',id,target,target,id).all<{user_id:string;kind:string;status:string}>();
  return {blocked:rows.results.some(r=>r.kind==='block'),blockedByMe:rows.results.some(r=>r.kind==='block'&&r.user_id===id),following:rows.results.some(r=>r.kind==='follow'&&r.user_id===id),friendship:rows.results.filter(r=>r.kind==='friend').map(r=>r.status==='accepted'?'accepted':r.user_id===id?'sent':'received')[0]??null};
 }
 if(action==='social-update'){
  const op=String(input.op);if(!target||target===id||!await stmt(db,'SELECT user_id FROM arena_players WHERE user_id=?',target).first())throw new ArenaError('Choose another registered player.');
  if(op==='unblock'){await stmt(db,"DELETE FROM social_links WHERE user_id=? AND target_id=? AND kind='block'",id,target).run();return {ok:true};}
  if(op==='block'){
   await db.batch([stmt(db,"INSERT OR IGNORE INTO social_links(id,user_id,target_id,kind,status,created_at) VALUES(?,?,?,'block','active',?)",crypto.randomUUID(),id,target,t),stmt(db,"DELETE FROM social_links WHERE kind IN('friend','follow') AND ((user_id=? AND target_id=?) OR(user_id=? AND target_id=?))",id,target,target,id)]);return {ok:true};
  }
  if(await blocked(db,id,target))throw new ArenaError('This player is unavailable.',403);
  if(op==='follow')await stmt(db,"INSERT OR IGNORE INTO social_links(id,user_id,target_id,kind,status,created_at) VALUES(?,?,?,'follow','active',?)",crypto.randomUUID(),id,target,t).run();
  else if(op==='unfollow')await stmt(db,"DELETE FROM social_links WHERE user_id=? AND target_id=? AND kind='follow'",id,target).run();
  else if(op==='friend')await stmt(db,"INSERT OR IGNORE INTO social_links(id,user_id,target_id,kind,status,created_at) SELECT ?,?,?,'friend','pending',? WHERE NOT EXISTS(SELECT 1 FROM social_links WHERE kind='friend' AND ((user_id=? AND target_id=?) OR(user_id=? AND target_id=?)))",crypto.randomUUID(),id,target,t,id,target,target,id).run();
  else if(op==='accept')await stmt(db,"UPDATE social_links SET status='accepted' WHERE kind='friend' AND status='pending' AND user_id=? AND target_id=?",target,id).run();
  else if(op==='remove-friend')await stmt(db,"DELETE FROM social_links WHERE kind='friend' AND ((user_id=? AND target_id=?) OR(user_id=? AND target_id=?))",id,target,target,id).run();
  else throw new ArenaError('Unknown social action.');return {ok:true};
 }
 if(action==='chat-read'||action==='chat-send'){
  if(target&&(target===id||!await stmt(db,'SELECT user_id FROM arena_players WHERE user_id=?',target).first()))throw new ArenaError('Choose another registered player.');
  if(target&&await blocked(db,id,target))throw new ArenaError('Chat with this player is blocked.',403);
  if(action==='chat-send'){
   const body=String(input.body??'').trim(),messageId=String(input.id??'');if(!body||body.length>1000||!/^[a-f0-9-]{36}$/.test(messageId))throw new ArenaError('Write a message of up to 1,000 characters.');
   // A guarded insert makes duplicate retries and concurrent rate-limit checks safe.
   await stmt(db,`INSERT OR IGNORE INTO social_messages(id,sender_id,recipient_id,body,created_at) SELECT ?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM social_messages WHERE sender_id=? AND created_at>?) AND NOT EXISTS(SELECT 1 FROM social_links WHERE kind='block' AND ((user_id=? AND target_id=?) OR(user_id=? AND target_id=?)))`,messageId,id,target||null,body,t,id,t-1000,id,target,target,id).run();
   if(!await stmt(db,'SELECT id FROM social_messages WHERE id=? AND sender_id=?',messageId,id).first())throw new ArenaError('Please wait a moment before sending again.',429);
   return {ok:true};
  }
  const before=Math.max(0,Number(input.before)||t+1);
  const where=target?'((m.sender_id=? AND m.recipient_id=?) OR(m.sender_id=? AND m.recipient_id=?))':'m.recipient_id IS NULL';
  const args=target?[id,target,target,id]:[];
  const rows=await stmt(db,`SELECT m.*,p.display_name,p.username,p.avatar_url FROM social_messages m JOIN arena_players p ON p.user_id=m.sender_id WHERE ${where} AND m.created_at<? AND ${visible} ORDER BY m.created_at DESC,m.id DESC LIMIT 51`,...args,before,id,id).all();
  return {messages:rows.results.slice(0,50).reverse(),hasMore:rows.results.length>50};
 }
 throw new ArenaError('Unknown social action.',404);
}
