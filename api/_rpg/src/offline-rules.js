// Shared replay rules. The server supplies the encounter, puzzles, and owned potions.
(function(root){
 function create({Rules:R,Chess}){
  const uci=m=>{if(typeof m!=='string'||!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(m))throw Error('Invalid chess move.');return {from:m.slice(0,2),to:m.slice(2,4),promotion:m[4]||'q'};};
  function apply(b,input,ctx,elapsed){
   if(!Number.isInteger(elapsed)||elapsed<0||elapsed>300000||elapsed<(ctx.elapsed||0))throw Error('Invalid battle clock.');
   if(b.kind!=='monster'||b.status!=='active'||b.turn!==0)throw Error('This battle has ended.');
   const now=b.startedAt+elapsed;ctx.elapsed=elapsed;
   if(R.timeout(b,now)){b.version++;return b;}
   const a=b.actors[0],end=()=>R.finishTurn(b,now);
   if(input.action==='timeout')throw Error('Battle clock has not expired.');
   if(input.action==='leave'){R.endBattle(b,1,'forfeit',now);R.note(b,`${a.name} left the encounter.`);}
   else if(input.action==='harvest'){
    if(b.challenge||!['ap','mp'].includes(input.resource))throw Error('Finish the current harvest first.');
    if(a[input.resource]>=a[input.resource==='ap'?'maxAp':'maxMp'])throw Error('That resource is already full.');
    if(input.resource==='ap'){const index=ctx.chessCursor||0,elo=ctx.elos[index%ctx.elos.length];ctx.chessCursor=index+1;b.challenge={kind:'ap',side:0,elo,fen:new Chess().fen(),moves:[],clocks:[60000,60000],clockAt:now};}
    else{const index=ctx.puzzleCursor||0,p=ctx.puzzles[index];if(!p)throw Error('This encounter has no more puzzle challenges.');ctx.puzzleCursor=index+1;const game=new Chess(p.fen);game.move(uci(p.moves[0]));b.challenge={kind:'mp',side:0,puzzleId:p.id,pool:p.pool,rating:p.rating,fen:game.fen(),moves:[],step:1};}
    b.deadline=now+1800000;R.note(b,`${a.name} chose ${input.resource.toUpperCase()} harvest. No other action this turn.`);
   }else if(input.action==='puzzleMove'){
    const c=b.challenge;if(c?.kind!=='mp')throw Error('No puzzle is active.');const p=ctx.puzzles.find(p=>p.id===c.puzzleId),game=new Chess(c.fen);game.move(uci(input.move));
    if(input.move!==p.moves[c.step]&&!game.isCheckmate()){R.harvestResult(b,0,'mp',false,'Puzzle missed');R.note(b,'Puzzle missed. No mana gained.');end();}
    else{c.moves.push(input.move);c.step++;if(c.step>=p.moves.length||game.isCheckmate()){R.harvestResult(b,0,'mp',true,'Puzzle solved perfectly');ctx.solved.push(p.id);R.note(b,'Puzzle solved perfectly · +20% maximum MP (up to cap).');end();}else{const reply=p.moves[c.step++];game.move(uci(reply));c.moves.push(reply);c.fen=game.fen();}}
   }else if(['chessSave','chessFinish'].includes(input.action)){
    const c=b.challenge;if(c&&typeof input.move==='string')input={...input,moves:[...c.moves,input.move]};if(c?.kind!=='ap'||!Array.isArray(input.moves)||input.moves.length!==c.moves.length+1||input.moves.length>1000||c.moves.some((m,i)=>input.moves[i]!==m))throw Error('Invalid chess history.');
    const game=new Chess();for(const move of input.moves)game.move(uci(move));const turn=c.moves.length%2;c.clocks[turn]=Math.max(0,c.clocks[turn]-(now-c.clockAt));c.clockAt=now;
    if(input.action==='chessSave'){if(game.isGameOver())throw Error('Submit the completed game.');c.moves=input.moves.slice();}
    else{if(!game.isGameOver())throw Error('Finish the chess game first.');const won=game.isCheckmate()&&game.turn()==='b';R.harvestResult(b,0,'ap',won,won?'Chess victory':game.isCheckmate()?'Chess game lost':'Chess game drawn');R.note(b,won?'Chess victory · +20% maximum AP (up to cap).':'Chess lost or drawn. No AP gained.');end();}
   }else if(input.action==='abandon'){if(!b.challenge)throw Error('No harvest is active.');R.harvestResult(b,0,b.challenge.kind,false,'Harvest abandoned');R.note(b,'Challenge abandoned. No resource gained.');end();}
   else{
    if(b.challenge)throw Error('Finish or abandon your harvest first.');
    if(input.action==='attack')R.attack(b,0,input.skill,now);
    else if(input.action==='defend')R.defend(b,0);
    else if(input.action==='usePotion'){const p=ctx.potions.find(p=>p.uid===input.uid);if(!p||ctx.usedPotions.includes(p.uid))throw Error('This potion is not available.');R.potion(b,0,p.defId==='health_potion'?'hp':'mp');ctx.usedPotions.push(p.uid);}
    else throw Error('Unknown local battle action.');end();
   }
   b.version++;return b;
  }
  return {apply};
 }
 const api={create};root.RPGOfflineRules=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
