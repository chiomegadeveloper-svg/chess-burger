import C from './src/inventory-core.js';
import P from './src/progression.js';
export const healthCap=state=>C.totals(state,P.baseStats(state.level))[0];
export const health=state=>Math.max(0,Math.min(healthCap(state),state.currentHp??healthCap(state)));
export function stash(doc){doc.pendingLoot=doc.pendingLoot||[];const left=[];for(const item of doc.pendingLoot){const spot=C.findSpace(doc.state,item,'stash');if(spot)C.place(doc.state,item,'stash',spot.x,spot.y,spot.rotation);else left.push(item);}if(left.length!==doc.pendingLoot.length)doc.state.inventoryRevision=(doc.state.inventoryRevision||0)+1;doc.pendingLoot=left;}
export function potionItem(level=1,rarity='common',rng=Math.random){const def=C.itemMap.health_potion;return {uid:crypto.randomUUID(),defId:def.id,rotation:0,rotated:false,...C.rollItem(def,level,rng,{rarity,iLvl:level,requiredLevel:1})};}
export function loot(level,rng=Math.random){
 const count=1+Math.floor(rng()*3),drops=[];
 for(let i=0;i<count;i++){
  const roll=rng(),rarity=roll<.85?'common':roll<.95?'uncommon':'rare';
  // One recovery potion is guaranteed; extra drops can be any gear or potion.
  const pool=C.items.filter(d=>d.category===(rng()<.5?'Weapons':'Armor'));
  const def=i===0?C.itemMap.health_potion:rng()<.25?C.itemMap[rng()<.5?'health_potion':'mana_potion']:pool[Math.floor(rng()*pool.length)];
  drops.push({uid:crypto.randomUUID(),defId:def.id,rotation:0,rotated:false,...C.rollItem(def,level,rng,{rarity,iLvl:level,requiredLevel:Math.max(1,level-2)})});
 }
 return drops;
}
export function recovery(doc){if(doc.recoveryGranted)return false;doc.recoveryGranted=true;doc.pendingLoot=[...(doc.pendingLoot||[]),...Array.from({length:3},()=>potionItem())];stash(doc);return true;}
