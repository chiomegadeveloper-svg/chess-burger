"use client";
import {useEffect,useState} from 'react';
import {Chess, Square} from 'chess.js';
import {loadCurrent,newRecord,saveGame,scoreOf,SavedGame} from './game-history';
const symbols:Record<string,string>={wk:'♚',wq:'♛',wr:'♜',wb:'♝',wn:'♞',wp:'♟',bk:'♚',bq:'♛',br:'♜',bb:'♝',bn:'♞',bp:'♟'};
export default function Offline({replayGame,playerName,onClose,onRated}:{replayGame?:SavedGame|null;playerName?:string;onClose?:()=>void;onRated?:(result:"win"|"loss"|"draw",gameId:string)=>number}){
 const [game,setGame]=useState(()=>new Chess()),[record,setRecord]=useState<SavedGame|null>(null);
 const[selected,select]=useState<Square|null>(null),[replay,setReplay]=useState<number|null>(replayGame?0:null);
 const[note,setNote]=useState('Select a piece, then a highlighted square.'),[ready,setReady]=useState(false);
 const[promotion,setPromotion]=useState<{from:Square,to:Square}|null>(null);
 useEffect(()=>{const timer=setTimeout(()=>{try{const saved=replayGame??loadCurrent(playerName);const g=new Chess();if(saved.pgn)g.loadPgn(saved.pgn);setGame(g);setRecord(saved);setReplay(replayGame?0:null);setReady(true);}catch{setNote('Saved game could not be opened. Your existing data has not been changed.');}},0);return()=>clearTimeout(timer);},[replayGame,playerName]);
 const history=game.history(),display=new Chess();
 if(replay!==null)history.slice(0,replay).forEach(m=>display.move(m));else display.load(game.fen());
 const legal=selected&&replay===null?game.moves({square:selected,verbose:true}).map(m=>m.to):[];
 function move(from:Square,to:Square,p='q'){
  if(!record)return;const next=new Chess();if(game.pgn())next.loadPgn(game.pgn());
  try{next.move({from,to,promotion:p});}catch{setNote('That move is not legal.');return;}
  const now=new Date().toISOString();let saved={...record,pgn:next.pgn(),startedAt:record.startedAt??now,updatedAt:now,score:scoreOf(next)};
  if(next.isGameOver()&&!saved.ratedAt&&onRated){const playerIsWhite=record.white===playerName||record.black!==playerName,whiteWon=next.turn()==="b";const result=next.isDraw()?"draw":playerIsWhite===whiteWon?"win":"loss";const delta=onRated(result,saved.id);saved={...saved,ratedAt:now,ratingDelta:delta};}
  setGame(next);setRecord(saved);select(null);setPromotion(null);
  try{saveGame(saved);setNote(saved.ratedAt?'Game saved · CBR '+((saved.ratingDelta??0)>=0?'+':'')+(saved.ratingDelta??0):'Game saved on this device.');}catch{setNote('Storage is unavailable. This game is not saved; keep this page open.');}
 }
 function click(square:Square){
  if(!ready||replay!==null||game.isGameOver()||promotion)return;
  if(selected&&legal.includes(square)){if(game.get(selected)?.type==='p'&&(square[1]==='8'||square[1]==='1')){setPromotion({from:selected,to:square});return;}move(selected,square);}
  else if(game.get(square)?.color===game.turn())select(square);else select(null);
 }
 function rename(side:'white'|'black',value:string){if(record)setRecord({...record,[side]:value.slice(0,32)});}
 function startNew(){if(!ready||replayGame)return;try{
   if(record&&history.length)saveGame({...record,pgn:game.pgn()});
   const fresh=newRecord(playerName);saveGame(fresh);setRecord(fresh);setGame(new Chess());setReplay(null);select(null);setPromotion(null);setNote('Previous games remain in Recent plays.');
 }catch{setNote('Could not save the previous game. New game has not started.');}}
 const status=game.isCheckmate()?'Checkmate · '+(game.turn()==='w'?'Black':'White')+' wins':game.isDraw()?'Draw':(game.turn()==='w'?'White':'Black')+' to move'+(game.isCheck()?' · Check':'');
 return <section className="chess-scene"><div className="board-heading"><h1>{replayGame?'Game replay':'Offline chess'}</h1><span>{replay!==null?'Move '+replay+' / '+history.length:status}</span></div>
  <div className="game-layout">
   <div className="board-stage"><div className="interactive-board" aria-label="Chessboard">{display.board().flat().map((p,i)=>{const s=('abcdefgh'[i%8]+(8-Math.floor(i/8))) as Square;return <button disabled={!ready} aria-label={s+(p?' '+p.color+' '+p.type:' empty')} key={s} className={'sq '+((Math.floor(i/8)+i)%2?'dark':'light')+(selected===s?' selected':'')+(legal.includes(s)?' legal':'')+(p?.color==='w'?' white-piece':' black-piece')} onClick={()=>click(s)}><span className="piece">{p?symbols[p.color+p.type]:legal.includes(s)?'·':''}</span></button>})}</div></div>
   <aside className="game-info"><h2>{record?.white??'White player'} vs {record?.black??'Black player'}</h2>
    {!history.length&&!replayGame&&<div className="player-names"><label>White<input maxLength={32} value={record?.white??''} onChange={e=>rename('white',e.target.value)}/></label><label>Black<input maxLength={32} value={record?.black??''} onChange={e=>rename('black',e.target.value)}/></label></div>}
    <p role="status">{replayGame?'Manual replay · Use Previous and Next to review each move.':note}</p>
    {promotion&&<div><p>Promote your pawn:</p>{['q','r','b','n'].map(p=><button aria-label={'Promote to '+({q:'queen',r:'rook',b:'bishop',n:'knight'}[p])} key={p} onClick={()=>move(promotion.from,promotion.to,p)}>{symbols[game.turn()+p]}</button>)}</div>}
    <div className="replay-controls"><button disabled={!history.length||!!promotion} onClick={()=>{setReplay(0);select(null)}}>First</button><button disabled={replay===null||replay===0} onClick={()=>setReplay(Math.max(0,(replay??0)-1))}>Previous</button><button disabled={replay===null||replay===history.length} onClick={()=>setReplay(Math.min(history.length,(replay??0)+1))}>Next</button><button disabled={!history.length||!!promotion} onClick={()=>{setReplay(history.length);select(null)}}>Last</button></div>
    {!replayGame&&<div><button disabled={!ready||!!promotion} onClick={()=>{setReplay(null);select(null)}}>Resume play</button><button disabled={!ready||!!promotion} onClick={startNew}>New game</button></div>}
    {replayGame&&onClose&&<button onClick={onClose}>Back to recent plays</button>}
    <h2>Moves</h2><p className="move-log">{history.length?history.map((m,i)=><span className={replay===i+1?'current-move':''} key={i}>{i%2===0?Math.floor(i/2)+1+'. ':''}{m} </span>):'Your first move starts the game.'}</p>
   </aside>
  </div></section>;
}
