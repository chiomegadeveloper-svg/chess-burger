import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pairOffline,standings,exportTrf,validatePairs,parseTournament} from '../app/tournament-engine.ts';
const base=n=>({id:'00000000-0000-4000-8000-000000000000',code:'ABCDE123',title:'Test',hostId:'host',hostName:'Host',rounds:Math.min(4,n-1),players:Array.from({length:n},(_,i)=>({id:i+1,name:'Player '+(i+1),rating:1500-i*10})),history:[],mode:'offline',status:'registration',updatedAt:new Date().toISOString()});
for(const n of [4,5,8,9,16])test(`${n} players: score conservation, coverage, no rematches and no repeated byes`,()=>{const t=base(n);const met=new Set();for(let r=0;r<t.rounds;r++){const pairs=pairOffline(t);validatePairs(t,pairs);const ids=pairs.flatMap(g=>g.black?[g.white,g.black]:[g.white]);assert.equal(new Set(ids).size,n);for(const g of pairs){if(g.black){const key=[g.white,g.black].sort((a,b)=>a-b).join('-');assert(!met.has(key));met.add(key);}}t.history.push(pairs.map((g,i)=>({...g,result:g.black?(i%2?'1/2-1/2':'1-0'):'bye'})));}const rows=standings(t);assert.equal(rows.reduce((s,p)=>s+p.score,0),t.rounds*Math.ceil(n/2));assert(rows.every(p=>p.byes<=1));});
test('Unfinished rounds cannot be paired or exported',()=>{const t=base(4);t.history=[pairOffline(t)];assert.throws(()=>pairOffline(t),/every result/);assert.throws(()=>exportTrf(t),/all results/);});
test('Malformed provider responses cannot overwrite the event',()=>{assert.throws(()=>validatePairs(base(4),[{w:1,b:2},{w:1,b:3}]),/repeated/);assert.throws(()=>validatePairs(base(4),[{w:1,b:2}]),/every player/);assert.throws(()=>validatePairs(base(4),[{w:1,b:999}]),/invalid/);});
test('TRF fixed fields match the FIDE TRF16 exchange positions',()=>{const t=base(5);for(let i=0;i<2;i++)t.history.push(pairOffline(t).map(g=>({...g,result:g.black?'1/2-1/2':'bye'})));for(const l of exportTrf(t).split('\r\n').filter(l=>l.startsWith('001'))){assert(Number(l.slice(4,8))>0);assert(['w','b','-'].includes(l[96]));assert(['w','b','-'].includes(l[106]));assert(['1','0','=','U'].includes(l[98]));assert.equal(l.slice(80,84).trim(),standings(t).find(p=>p.id===Number(l.slice(4,8))).score.toFixed(1));}});
test('Duplicate identities in imported rosters are rejected',()=>{const t=base(4);t.players[1].id=1;assert.throws(()=>parseTournament(t),/Invalid player/);});
test('The final round cannot be exceeded',()=>{const t=base(2);t.history=[[{white:1,black:2,result:'1-0'}]];assert.throws(()=>pairOffline(t),/complete/);});
test('Tournament requires three players and waits for its scheduled start',()=>{
 const small=base(2);assert.throws(()=>pairOffline(small),/three players/);
 const early=base(3);early.startsAt=new Date(Date.now()+60_000).toISOString();assert.throws(()=>pairOffline(early),/scheduled start/);
 early.startsAt=new Date(Date.now()-60_000).toISOString();assert.equal(pairOffline(early).length,2);
});
