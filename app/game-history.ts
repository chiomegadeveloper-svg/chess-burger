import { Chess } from 'chess.js';
export type SavedGame = { id:string; white:string; black:string; pgn:string; score:string; startedAt:string|null; updatedAt:string|null;ratedAt?:string|null;ratingDelta?:number };
const KEY='cb-games-v1';
export function scoreOf(g:Chess){return g.isCheckmate()?(g.turn()==='w'?'0–1':'1–0'):g.isDraw()?'½–½':'In progress';}
export function readGames():SavedGame[]{
  const raw=localStorage.getItem(KEY); if(!raw)return [];
  const list=JSON.parse(raw);if(!Array.isArray(list))throw new Error('Saved game history could not be read.');
  return list.filter((g:SavedGame)=>g&&typeof g.id==='string'&&typeof g.pgn==='string').slice(0,20);
}
export function saveGame(record:SavedGame){const games=readGames();const i=games.findIndex(g=>g.id===record.id);if(i<0)games.unshift(record);else games[i]=record;localStorage.setItem(KEY,JSON.stringify(games.slice(0,20)));localStorage.setItem('cb-current-game-id',record.id);localStorage.setItem('cb-local-game',record.pgn);window.dispatchEvent(new Event('cb-games-changed'));}
export function newRecord(name='White player'):SavedGame{return {id:crypto.randomUUID(),white:name,black:'Black player',pgn:'',score:'In progress',startedAt:null,updatedAt:null,ratedAt:null};}
export function loadCurrent(name?:string):SavedGame{
  const games=readGames(),id=localStorage.getItem('cb-current-game-id');const current=games.find(g=>g.id===id);if(current)return current;
  const legacy=localStorage.getItem('cb-local-game');if(legacy){const g=new Chess();g.loadPgn(legacy);const migrated={...newRecord(name),pgn:legacy,score:scoreOf(g)};saveGame(migrated);return migrated;}
  return newRecord(name);
}
