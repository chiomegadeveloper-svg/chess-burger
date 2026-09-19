'use client';
import {useEffect,useRef,useState} from 'react';
import MatchBoard from './match-board';
import {boardResult,gameFromPgn,timeControl,type ArenaMatch,type ArenaPlayer} from './game-rules';
import type {PlayerProfile} from './supabase';
import {saveGame} from './game-history';

export default function SharedBoard({profile,control,onResult}:{profile:PlayerProfile|null;control:string;onResult:(m:ArenaMatch,id:string)=>void}){
 const [match,setMatch]=useState<ArenaMatch|null>(null),[error,setError]=useState('');
 const current=useRef<ArenaMatch|null>(null),done=useRef(false),callback=useRef(onResult);callback.current=onResult;
 const ownId=profile?.user_id??'guest-device',key='cb-shared-board:'+ownId;
 function fresh(){
  const own:ArenaPlayer={user_id:ownId,display_name:profile?.display_name??'White player',username:profile?.username??'white',avatar_url:profile?.avatar_url??'',country_code:profile?.country_code??'',cbr:profile?.cbr??88,gold_points:0,wins:0,losses:0,win_streak:0};
  const tc=timeControl(control),t=Date.now();done.current=false;
  commit({id:crypto.randomUUID(),host_id:ownId,white_id:ownId,black_id:'shared-black',invite_to:null,code:'',control,status:'active',pgn:'',white_ms:tc.seconds*1000,black_ms:tc.seconds*1000,last_tick:t,version:0,result:null,white_cbr:own.cbr,black_cbr:88,rating_applied:0,created_at:t,white:own,black:{...own,user_id:'shared-black',display_name:'Black player',username:'black',avatar_url:'',cbr:88}});
 }
 function commit(next:ArenaMatch){
  current.current=next;setMatch({...next,server_now:Date.now()});
  try{localStorage.setItem(key,JSON.stringify(next));saveGame({id:next.id,white:next.white!.display_name,black:next.black!.display_name,pgn:next.pgn,score:next.result==='draw'?'½–½':next.result==='white'?'1–0':next.result==='black'?'0–1':'In progress',startedAt:new Date(next.created_at).toISOString(),updatedAt:new Date().toISOString()});}catch{setError('Device storage is full. Free some space to save this replay.');}
  if(next.status==='finished'&&!done.current){done.current=true;callback.current(next,ownId);}
 }
 function checkClock(){const m=current.current;if(!m||m.status!=='active')return false;const chess=gameFromPgn(m.pgn),white=chess.turn()==='w';if((white?m.white_ms:m.black_ms)<=Date.now()-m.last_tick){commit({...m,version:m.version+1,status:'finished',result:chess.isInsufficientMaterial()?'draw':white?'black':'white'});return true;}return false;}
 useEffect(()=>{try{const raw=localStorage.getItem(key),saved=raw?JSON.parse(raw) as ArenaMatch:null;if(saved?.status==='active'&&saved.white_id===ownId){timeControl(saved.control);gameFromPgn(saved.pgn);commit(saved);checkClock();}else fresh();}catch{fresh();}const timer=setInterval(checkClock,250);return()=>clearInterval(timer);},[]);
 function move(input:{from:string;to:string;promotion?:string}){if(checkClock())return;const m=current.current;if(!m||m.status!=='active')return;try{const chess=gameFromPgn(m.pgn),white=chess.turn()==='w',t=Date.now(),remaining=(white?m.white_ms:m.black_ms)-Math.max(0,t-m.last_tick);if(remaining<=0){commit({...m,version:m.version+1,status:'finished',result:white?'black':'white',white_ms:white?0:m.white_ms,black_ms:white?m.black_ms:0,last_tick:t});return;}chess.move(input);const inc=timeControl(m.control).increment*1000,result=boardResult(chess);commit({...m,pgn:chess.pgn(),version:m.version+1,white_ms:white?remaining+inc:m.white_ms,black_ms:white?m.black_ms:remaining+inc,last_tick:t,result,status:result?'finished':'active'});}catch{setError('Choose a legal move.');}}
 if(!match)return <p role="status">Preparing the board…</p>;
 return <><MatchBoard match={match} ownId={ownId} bothSides onMove={move} onResign={()=>{if(checkClock())return;const m=current.current!;commit({...m,status:'finished',result:gameFromPgn(m.pgn).turn()==='w'?'black':'white',version:m.version+1});}} connection="Shared device"/>{error&&<p role="alert">{error}</p>}{match.status==='finished'?<button className="gold-button new-shared-game" onClick={fresh}>New game</button>:<p className="rules-caption">{match.white?.display_name} plays White. Offline CBR is saved on this device.</p>}</>;
}
