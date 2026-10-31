import {randomInt,randomUUID} from 'node:crypto';
import * as R from './core.mjs';
import Potions from './src/potion-catalog.js';
import Offline from './src/offline-rules.js';
import {Chess} from 'chess.js';
const engine=Offline.create({Rules:R,Chess});
export function issueOffline(battle,doc,puzzles,now){
 const seen=new Set(doc.history),pool=battle.actors[1].boss?'hard':'regular',eligible=puzzles.filter(p=>p.pool===pool&&!seen.has(p.id));
 for(let i=eligible.length-1;i>0;i--){const j=randomInt(i+1);[eligible[i],eligible[j]]=[eligible[j],eligible[i]];}
 return {id:randomUUID(),battleId:battle.id,baseVersion:battle.version,initial:structuredClone(battle),puzzleIds:eligible.slice(0,128).map(p=>p.id),elos:Array.from({length:64},()=>battle.actors[1].boss?1480+randomInt(621):750+randomInt(731)),potions:doc.state.items.filter(i=>i.where==='bag'&&Potions.get(i)).map(({uid,defId,quantity,forged})=>({uid,defId,...(quantity?{quantity}:{}),...(forged?{forged}:{} )})),issuedAt:now,expiresAt:now+86400000};
}
export function publicOffline(session,puzzles){if(!session)return null;return {id:session.id,battleId:session.battleId,baseVersion:session.baseVersion,puzzles:session.puzzleIds.map(id=>puzzles.find(p=>p.id===id)),elos:session.elos,potions:session.potions,ownerRecoveries:session.ownerRecoveries||[],issuedAt:session.issuedAt};}
export function replayOffline(session,commands,puzzles,now){
 if(now>session.expiresAt||!Array.isArray(commands)||!commands.length||commands.length>1500)throw Error('Local battle journal is unavailable or expired.');
 const battle=structuredClone(session.initial),ctx={...publicOffline(session,puzzles),usedPotions:[],solved:[],elapsed:0};
 for(const command of commands)engine.apply(battle,command,ctx,command.t);
 if(battle.status!=='finished')throw Error('Finish the battle before syncing its result.');
 // A command issued after the device finished still restores the saved hero after settlement.
 for(const grant of session.ownerRecoveries||[])if(!(ctx.usedOwnerRecoveries||[]).includes(grant.id)){
  const actor=battle.actors[0];actor.hp=actor.maxHp;if(grant.mode==='recover'){actor.mp=actor.maxMp;actor.ap=actor.maxAp;}
 }
 return {battle,usedPotions:ctx.usedPotions,solved:ctx.solved};
}
