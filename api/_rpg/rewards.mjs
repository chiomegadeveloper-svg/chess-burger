import C from './src/inventory-core.js';
import P from './src/progression.js';
export const healthCap=state=>C.totals(state,P.baseStats(state.level))[0];
export const health=state=>Math.max(0,Math.min(healthCap(state),state.currentHp??healthCap(state)));
export const manaCap=state=>C.totals(state,P.baseStats(state.level))[4];
export const mana=state=>Math.max(0,Math.min(manaCap(state),state.currentMp??manaCap(state)));
export function normalize(doc){let changed=C.normalizePotions(doc.state);const spent=(doc.state.upgrades||[]).reduce((a,b)=>a+b,0),available=Math.max(0,doc.state.level-1-spent);if(doc.state.points!==available){doc.state.points=available;changed=true;}for(const items of [doc.pendingLoot||[],...(doc.awards||[]).map(a=>a.drops||[])])changed=C.normalizePotions({items})||changed;
 const grid=doc.state.grids?.stash;if(grid&&(grid.cols!==6||grid.rows!==6)){
  const stored=doc.state.items.filter(i=>i.where==='stash');doc.state.items=doc.state.items.filter(i=>i.where!=='stash');doc.state.grids.stash={cols:6,rows:6};
  for(const item of stored){const spot=C.canPlace(doc.state,item,'stash',item.x,item.y,item.rotation)?{x:item.x,y:item.y,rotation:item.rotation}:C.findSpace(doc.state,item,'stash');if(spot)C.place(doc.state,item,'stash',spot.x,spot.y,spot.rotation);else doc.pendingLoot=[...(doc.pendingLoot||[]),item];}changed=true;
 }
 if(changed)doc.state.inventoryRevision=(doc.state.inventoryRevision||0)+1;return changed;}
export function stash(doc){doc.pendingLoot=doc.pendingLoot||[];const left=[];for(const item of doc.pendingLoot){const spot=C.findSpace(doc.state,item,'stash');if(spot)C.place(doc.state,item,'stash',spot.x,spot.y,spot.rotation);else left.push(item);}if(left.length!==doc.pendingLoot.length)doc.state.inventoryRevision=(doc.state.inventoryRevision||0)+1;doc.pendingLoot=left;}
export function potionItem(level=1,rarity='common',rng=Math.random){const def=C.itemMap.health_potion;return {uid:crypto.randomUUID(),defId:def.id,rotation:0,rotated:false,...C.rollItem(def,level,rng,{rarity,iLvl:level,requiredLevel:1})};}
export function healthPotionDrops(level,rng=Math.random){return C.potions.health.filter(def=>rng()<def.dropChance).map(def=>({uid:crypto.randomUUID(),defId:def.id,rotation:0,rotated:false,...C.rollItem(def,level,rng,{rarity:'common'})}));}
export function loot(level,rng=Math.random){
 const count=1+Math.floor(rng()*3),drops=[];
 for(let i=0;i<count;i++){
  const roll=rng(),rarity=roll<.85?'common':roll<.95?'uncommon':'rare';
  // Item type is independent from rarity: 85% equipment, 15% consumables.
  const category=rng()<.5?'Weapons':'Armor',pool=C.items.filter(d=>d.category===category);
  const def=rng()<.85?pool[Math.floor(rng()*pool.length)]:C.itemMap[rng()<.5?'health_potion':'mana_potion'];
  // Percentage health drops replace the old flat-health slots; gear and mana rolls are retained.
  if(def.id!=='health_potion')drops.push({uid:crypto.randomUUID(),defId:def.id,rotation:0,rotated:false,...C.rollItem(def,level,rng,{rarity,iLvl:level})});
 }
 drops.push(...healthPotionDrops(level,rng));
 return drops;
}
export function recovery(doc){if(doc.recoveryGranted)return false;doc.recoveryGranted=true;doc.pendingLoot=[...(doc.pendingLoot||[]),...Array.from({length:3},()=>potionItem())];stash(doc);return true;}

export function cbgDrop(state,rng=Math.random){const p=C.passives(state);return rng()<(p.cbgChance||48)/100?Math.max(1,Math.round((1+Math.floor(rng()*8))*(1+(p.cbgGain||0)/100))):0;}
