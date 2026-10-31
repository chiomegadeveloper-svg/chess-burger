// Durable local turn journal. Only a verified server replay can award progression or loot.
(function(root){
 const clone=value=>JSON.parse(JSON.stringify(value));
 const key=heroId=>root.RPGLive.key(heroId)+':battle-journal-v1';
 function load(heroId){try{const value=JSON.parse(localStorage.getItem(key(heroId))||'null');return value?.id&&value.battle?.kind==='monster'&&Array.isArray(value.commands)?value:null;}catch{return null;}}
 function open(bundle,battle,heroId){
  const storageKey=key(heroId),saved=load(heroId),engine=root.RPGOfflineRules.create({Rules:root.RPGBattleRules,Chess:root.Chess});
  let journal=saved&&saved.id===bundle.id?saved:null;
  if(!journal){const copy=clone(battle),offset=Date.now()-copy.startedAt;copy.startedAt+=offset;copy.battleEndsAt+=offset;copy.deadline+=offset;journal={id:bundle.id,battleId:battle.id,heroId,commands:[],startedAt:copy.startedAt,battle:copy,context:{puzzles:bundle.puzzles,elos:bundle.elos,potions:bundle.potions,usedPotions:[],solved:[],elapsed:0}};}
  if(bundle.ownerRecoveries)journal.context.ownerRecoveries=clone(bundle.ownerRecoveries);
  const store=next=>localStorage.setItem(storageKey,JSON.stringify(next));store(journal);
  const elapsed=()=>Math.min(300000,Math.max(journal.context.elapsed||0,Date.now()-journal.startedAt));
  function act(input){const next=clone(journal),command=['chessSave','chessFinish'].includes(input.action)?{action:input.action,move:input.moves.at(-1),t:elapsed()}:{...input,t:elapsed()};engine.apply(next.battle,command,next.context,command.t);next.commands.push(command);store(next);journal=next;return journal.battle;}
  return {get battle(){return journal.battle;},get id(){return journal.id;},get usedPotions(){return journal.context.usedPotions;},get potions(){return journal.context.potions;},recover(grants){journal.context.ownerRecoveries=clone(grants);for(const grant of grants)if(!(journal.context.usedOwnerRecoveries||[]).includes(grant.id))act({action:'ownerRecovery',grantId:grant.id});},act,tick(){if(journal.battle.status!=='active')return null;const copy=clone(journal.battle);if(root.RPGBattleRules.timeout(copy,journal.battle.startedAt+elapsed()))return act({action:'timeout'});return null;},payload:()=>({action:'offlineFinish',sessionId:journal.id,battleId:journal.battleId,commands:journal.commands}),clear(){localStorage.removeItem(storageKey);}};
 }
 function resume(heroId){const saved=load(heroId);return saved?open({id:saved.id},saved.battle,heroId):null;}
 root.RPGOfflineCombat={open,resume};
})(window);
