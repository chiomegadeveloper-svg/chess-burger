import {readFileSync,writeFileSync} from 'node:fs';
import {Chess} from 'chess.js';

const input=process.argv[2];
if(!input)throw new Error('Usage: node scripts/import-lichess-puzzles.mjs <lichess-puzzle.csv>');
const rows=readFileSync(input,'utf8').trim().split(/\r?\n/).slice(1).map(line=>{const cells=line.split(',');return{sourceId:cells[0],fen:cells[1],moves:cells[2].split(' '),rating:Number(cells[3]),popularity:Number(cells[5]),plays:Number(cells[6]),themes:cells[7].split(' '),sourceUrl:cells[8]};});
const candidates=[];
for(const row of rows){
  if(row.popularity<90||row.plays<500||row.moves.length<3||row.moves.length>9)continue;
  try{
    const game=new Chess(row.fen);game.move({from:row.moves[0].slice(0,2),to:row.moves[0].slice(2,4),promotion:row.moves[0].slice(4)||undefined});
    const presentedFen=game.fen();
    for(const uci of row.moves.slice(1))game.move({from:uci.slice(0,2),to:uci.slice(2,4),promotion:uci.slice(4)||undefined});
    candidates.push({...row,fen:presentedFen,moves:row.moves.slice(1)});
  }catch{}
}
const selected=[...new Map(candidates.sort((a,b)=>a.rating-b.rating).map(row=>[row.fen,row])).values()].slice(0,100);
if(selected.length!==100)throw new Error(`Expected 100 validated puzzles, found ${selected.length}`);
const chapterTitles=['First Tactics','Winning Material','Double Attacks','Pins and Skewers','Forcing Moves','Tactical Vision','Mating Nets','Sacrifices','Deep Calculation','Patty’s Final Trial'];
const descriptions=['Spot the clearest tactical move.','Convert an advantage with precision.','Attack more than one target.','Restrict defenders and win material.','Calculate checks, captures and threats.','Combine tactical ideas from real games.','Force the king into a mating net.','Give material to gain a decisive attack.','Follow longer forcing variations.','Solve the strongest mixed positions.'];
const titleFor=themes=>themes.includes('mate')?'Force the Checkmate':themes.includes('fork')?'Find the Fork':themes.includes('pin')?'Exploit the Pin':themes.includes('skewer')?'Line Up the Skewer':themes.includes('sacrifice')?'Calculate the Sacrifice':themes.includes('discoveredAttack')?'Unleash the Discovery':themes.includes('deflection')?'Deflect the Defender':themes.includes('attraction')?'Draw the Piece In':themes.includes('promotion')?'Race to Promotion':themes.includes('endgame')?'Endgame Precision':'Find the Best Move';
const themeFor=themes=>themes.filter(x=>!['short','long','veryLong','master','opening','middlegame','endgame'].includes(x)).slice(0,2).map(x=>x.replace(/([A-Z])/g,' $1').toLowerCase()).join(' · ')||'tactical advantage';
const hintFor=themes=>themes.includes('mate')?'Start with forcing checks and verify every king escape.':themes.includes('fork')?'Look for one move that attacks two valuable targets.':themes.includes('pin')||themes.includes('skewer')?'Trace every open rank, file and diagonal.':themes.includes('sacrifice')?'Calculate beyond the material you give up; the follow-up is the point.':'Calculate checks, captures and direct threats before choosing your move.';
const chapters=chapterTitles.map((title,index)=>({number:index+1,difficulty:index<3?'Easy':index<7?'Average':'Hard',title,description:descriptions[index]}));
const puzzles=selected.map((row,index)=>({id:`v2-chapter-${Math.floor(index/10)+1}-puzzle-${index%10+1}`,sourceId:row.sourceId,chapter:Math.floor(index/10)+1,number:index%10+1,difficulty:index<30?'Easy':index<70?'Average':'Hard',rating:row.rating,title:titleFor(row.themes),theme:themeFor(row.themes),fen:row.fen,moves:row.moves,hint:hintFor(row.themes),sourceUrl:row.sourceUrl}));
const output=`// Curated from the official Lichess CC0 puzzle database. Do not hand-edit generated positions.\nexport type PuzzleDifficulty="Easy"|"Average"|"Hard";\nexport type DailyPuzzle={id:string;sourceId:string;chapter:number;number:number;difficulty:PuzzleDifficulty;rating:number;title:string;theme:string;fen:string;moves:string[];hint:string;sourceUrl:string};\nexport type PuzzleChapter={number:number;difficulty:PuzzleDifficulty;title:string;description:string};\nexport const PUZZLE_CHAPTERS:PuzzleChapter[]=${JSON.stringify(chapters)};\nexport const DAILY_PUZZLES:DailyPuzzle[]=${JSON.stringify(puzzles)};\n`;
writeFileSync(new URL('../app/puzzle-data.ts',import.meta.url),output);
console.log(`Generated ${puzzles.length} unique validated puzzles from ${input}.`);
