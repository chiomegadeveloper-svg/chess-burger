import type { SupabaseClient } from '@supabase/supabase-js';
import { Chess } from 'chess.js';

export class MatchActionError extends Error {
  constructor(message: string, public status = 409) { super(message); this.name = 'MatchActionError'; }
}
export const FAST_MATCH_ACTIONS = new Set(['match','move','resign','abort','timeout','offer','respond-offer']);
type Req={headers:Record<string,string|string[]|undefined>};
type Row=Record<string,any>;
type Meta={requests?:Record<string,{takeback:number;draw:number}>;pending?:any;last?:any;request_ids?:string[];move_ids?:string[]};
const LIMIT=3, OFFER_MS=30_000;
const increments:Record<string,number>={'1+0':0,'1+1':1,'2+1':1,'3+0':0,'3+2':2,'5+0':0,'10+0':0,'10+5':5,'15+10':10};
const fail=(message:string,status=409):never=>{throw new MatchActionError(message,status);};
function check(error:{message:string}|null){if(error)fail(/game_meta/.test(error.message)?'Run supabase/0014_gameplay_v46.sql, then redeploy.':error.message,500);}
const stamp=(value:string|number)=>typeof value==='number'?value:Date.parse(value);
function view(row:Row){return {...row,version:Number(row.version),created_at:stamp(row.created_at),last_tick:stamp(row.last_tick),white_ms:Number(row.white_ms),black_ms:Number(row.black_ms),rating_applied:row.rating_applied?1:0,reactions:typeof row.reactions==='string'?row.reactions:JSON.stringify(row.reactions??{}),game_meta:row.game_meta??{},server_now:Date.now()};}
function game(row:Row){const value=new Chess();if(row.pgn)value.loadPgn(row.pgn);return value;}
function clear(meta:Meta,outcome:'expired'|'position-changed'):Meta{if(!meta.pending)return meta;const {id,kind,by}=meta.pending;return {...meta,pending:null,last:{id,kind,by,outcome}};}
function clock(row:Row,at:number){const chess=game(row),white=chess.turn()==='w',elapsed=Math.max(0,at-row.last_tick),white_ms=Math.max(0,row.white_ms-(white?elapsed:0)),black_ms=Math.max(0,row.black_ms-(white?0:elapsed));return {chess,white,white_ms,black_ms,expired:(white?white_ms:black_ms)<=0};}
function apply(row:Row,actor:string,action:string,input:Record<string,unknown>,at:number):Row{
 if(![row.white_id,row.black_id].includes(actor))fail('Only the two players may update this match.',403);
 const meta:Meta=row.game_meta??{};
 if(action==='move'&&typeof input.request_id==='string'&&meta.move_ids?.includes(input.request_id))return row;
 if(action==='offer'&&typeof input.request_id==='string'&&meta.request_ids?.includes(input.request_id))return row;
 if(row.status!=='active')fail('This match is no longer active.');
 const c=clock(row,at);
 if(c.expired)return {...row,white_ms:c.white_ms,black_ms:c.black_ms,last_tick:at,status:'finished',result:c.white?'black':'white',version:row.version+1,game_meta:clear(meta,'expired')};
 const next={...row,version:row.version+1,server_now:at};
 const pending=meta.pending&&meta.pending.expires_at>at?meta.pending:null,currentMeta=meta.pending&&!pending?clear(meta,'expired'):meta;
 if(action==='timeout')fail('The clock is still running.');
 if(action==='move'){
  if((c.white?row.white_id:row.black_id)!==actor)fail('Wait for your opponent.',403);
  if(typeof input.base_pgn==='string'?input.base_pgn!==row.pgn:Number(input.version)!==row.version)fail('The board changed. Please try your move again.');
  const move=input.move as {from?:string;to?:string;promotion?:string}|undefined;if(!move?.from||!move.to)fail('Choose a legal move.',400);
  try{c.chess.move({from:move.from,to:move.to,promotion:move.promotion??'q'});}catch{fail('That move is not legal.',400);}
  const increment=(increments[row.control]??0)*1000,ended=c.chess.isCheckmate()?(c.chess.turn()==='w'?'black':'white'):c.chess.isDraw()?'draw':null,ids=[...(meta.move_ids??[])];
  if(typeof input.request_id==='string')ids.push(input.request_id.slice(0,80));
  return {...next,pgn:c.chess.pgn(),white_ms:c.white_ms+(c.white?increment:0),black_ms:c.black_ms+(c.white?0:increment),last_tick:at,status:ended?'finished':'active',result:ended,game_meta:{...clear(currentMeta,'position-changed'),move_ids:ids}};
 }
 if(action==='resign'||action==='abort')return {...next,white_ms:c.white_ms,black_ms:c.black_ms,last_tick:at,status:action==='abort'?'cancelled':'finished',result:action==='abort'?null:actor===row.white_id?'black':'white',game_meta:clear(currentMeta,'position-changed')};
 if(action==='offer'){
  const kind=input.kind as 'takeback'|'draw',id=input.request_id;if(!['takeback','draw'].includes(kind)||typeof id!=='string'||!/^[\w-]{8,80}$/.test(id))fail('Invalid match request.',400);if(pending)fail('Answer the pending request first.');
  const used=currentMeta.requests?.[actor]??{takeback:0,draw:0};if(used[kind]>=LIMIT)fail(`You have used all 3 ${kind==='draw'?'draw offers':'takeback requests'} in this match.`);
  let plies=0;if(kind==='takeback'){const history=c.chess.history({verbose:true}),color=actor===row.white_id?'w':'b';let own=-1;for(let i=history.length-1;i>=0;i--)if(history[i]?.color===color){own=i;break;}if(own<0)fail('You have not made a move to take back.');plies=history.length-own;}
  return {...next,game_meta:{...currentMeta,requests:{...currentMeta.requests,[actor]:{...used,[kind]:used[kind]+1}},request_ids:[...(currentMeta.request_ids??[]),id],pending:{id,kind,by:actor,at,expires_at:at+OFFER_MS,pgn:row.pgn,plies}}};
 }
 if(action==='respond-offer'){
  if(!pending||pending.id!==input.request_id)fail('This request expired or was already answered.');if(pending.by===actor)fail('Only your opponent can approve or decline your request.',403);if(typeof input.accept!=='boolean')fail('Choose Accept or Decline.',400);if(pending.pgn!==row.pgn)fail('The position changed. This request is no longer valid.');
  const game_meta={...currentMeta,pending:null,last:{id:pending.id,kind:pending.kind,by:pending.by,outcome:input.accept?'accepted':'declined'}};if(!input.accept)return {...next,game_meta};
  if(pending.kind==='draw')return {...next,game_meta,status:'finished',result:'draw',white_ms:c.white_ms,black_ms:c.black_ms,last_tick:at};
  let white_ms=c.white_ms,black_ms=c.black_ms;const increment=(increments[row.control]??0)*1000;for(let i=0;i<pending.plies;i++){const undone=c.chess.undo();if(!undone)fail('There is no move to take back.');if(undone.color==='w')white_ms=Math.max(0,white_ms-increment);else black_ms=Math.max(0,black_ms-increment);}
  return {...next,game_meta,pgn:c.chess.pgn(),white_ms,black_ms,last_tick:at};
 }
 return fail('Unknown match action.',400);
}

export async function fastMatchAction(client:SupabaseClient,req:Req,action:string,body:Record<string,unknown>,settle:(client:any,row:Row)=>Promise<void>){
 const started=Date.now(),header=req.headers.authorization,token=(Array.isArray(header)?header[0]:header??'').replace(/^Bearer\s+/i,'');if(!token)fail('Please sign in again.',401);
 const id=String(body.id??'');if(!/^[\w-]{1,80}$/.test(id))fail('Invalid match.',400);
 const [auth,found]=await Promise.all([client.auth.getUser(token),client.from('cb_matches').select('*').eq('id',id).maybeSingle()]);if(auth.error||!auth.data.user)fail('Please sign in again.',401);check(found.error);if(!found.data)fail('This match is no longer available.',404);
 const actor=auth.data.user.id;if(![found.data.white_id,found.data.black_id].includes(actor))fail('Only the two players may access this match.',403);let row:Row=found.data;
 if(action==='match'){const match=view(row);if(!body.compact){const people=await client.from('cb_profiles').select('user_id,username,display_name,avatar_url,country_code,cbr,gold_points,wins,losses,win_streak').in('user_id',[row.white_id,row.black_id].filter(Boolean));check(people.error);match.white=people.data?.find((p:any)=>p.user_id===row.white_id);match.black=people.data?.find((p:any)=>p.user_id===row.black_id);}return {match};}
 for(let attempt=0;attempt<3;attempt++){
  const current=view(row),next=apply(current,actor,action,body,action==='move'?Math.max(started,current.last_tick):Date.now());if(next===current)return {match:current};
  const patch={pgn:next.pgn,white_ms:next.white_ms,black_ms:next.black_ms,last_tick:new Date(next.last_tick).toISOString(),status:next.status,result:next.result,version:next.version,game_meta:next.game_meta};
  const changed=await client.from('cb_matches').update(patch).eq('id',id).eq('version',row.version).eq('status','active').select('*').maybeSingle();check(changed.error);
  if(changed.data){row=changed.data;if(row.status==='finished'){await settle(client,row);const rated=await client.from('cb_matches').select('*').eq('id',id).single();check(rated.error);row=rated.data;}console.info('arena.match-action',{action,id,elapsed_ms:Date.now()-started});return {match:view(row)};}
  const latest=await client.from('cb_matches').select('*').eq('id',id).single();check(latest.error);row=latest.data;
 }
 return fail('The match changed. Please retry your action.');
}
