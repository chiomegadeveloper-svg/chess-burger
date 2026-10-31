import {randomUUID} from 'node:crypto';
import C from './src/inventory-core.js';
const fail=message=>{throw Object.assign(new Error(message),{status:409});};
const integer=(rng,min,max)=>min+Math.floor(Math.max(0,Math.min(1-Number.EPSILON,rng()))*(max-min+1));
function distinct(rng,values,count){const pool=[...values],result=[];while(result.length<count)result.push(pool.splice(integer(rng,0,pool.length-1),1)[0]);return result;}
function effects(rng,level,potion){
 const outcome=rng(),bonuses=outcome>=.1&&outcome<.8,cursed=outcome<.1||outcome>=.6&&outcome<.8;
 const forged={level,attributes:[],restores:[],curses:[]};
 if(bonuses){const count=integer(rng,2,3);if(potion)for(const resource of distinct(rng,['hp','mp','ap'],count))forged.restores.push({resource,percent:integer(rng,2,8)});else for(const stat of distinct(rng,[0,1,2,3,4,5],count))forged.attributes.push({stat,value:integer(rng,1,Math.max(2,Math.ceil(level/4)))});}
 if(cursed)forged.curses.push({id:['lifeDrain','poison','manaDrain','skip'][integer(rng,0,3)],value:integer(rng,2,8)});
 return forged;
}
const recipes={cola:{normal:2,cola:0,out:1},coconut:{normal:4,cola:0,out:2},'mixed-coconut':{normal:2,cola:1,out:2},tuba:{normal:10,cola:0,out:3}};
/** Mutates the document only after a complete, valid inventory transaction. */
export function forge(doc,input,{rng=Math.random,now=Date.now()}={}){
 const state=doc?.state,uids=input?.uids;
 if(!state||!Array.isArray(state.items)||!Array.isArray(uids)||!uids.length||uids.length>128||uids.some(uid=>typeof uid!=='string')||new Set(uids).size!==uids.length)fail('Choose distinct owned ingredients.');
 const selected=uids.map(uid=>state.items.find(item=>item.uid===uid));
 if(selected.some(item=>!item||!['bag','stash'].includes(item.where)||!C.itemMap[item.defId]))fail('An ingredient is no longer in your inventory.');
 const automatic=input.recipe==='auto';let recipeId=input.recipe;
 if(automatic){
  if(selected.length<2)fail('Drop items onto another item.');
  const plan=C.mergePlan(...selected);if(!plan)fail('These items cannot combine.');
  if(plan.kind==='stack'){
   const trial=structuredClone(state),target=trial.items.find(i=>i.uid===uids.at(-1));
   target.quantity=selected.reduce((n,i)=>n+C.quantity(i),0);trial.items=trial.items.filter(i=>!uids.includes(i.uid)||i.uid===target.uid);
   if(!C.validState(trial,state.heroId))fail('The inventory could not be validated.');
   doc.state=trial;return {success:true,stacked:true,item:target};
  }
  recipeId=plan.recipe;
 }
 const recipe=Object.hasOwn(recipes,recipeId)?recipes[recipeId]:null,potion=selected.every(C.isConsumable),costs=[];let def,level;
 if(recipe){
  if(!potion)fail('This recipe requires potions of one resource.');
  const family=[C.potions.health,C.potions.mana,C.potions.attack].find(rows=>rows.some(row=>row.id===selected[0].defId));
  if(!family||selected.some(item=>![family[0].id,...(recipe.cola?[family[1].id]:[])].includes(item.defId)))fail('Use the required potions from one resource family.');
  for(const [index,required] of [[0,recipe.normal],[1,recipe.cola]]){
   let remaining=required;const ingredients=selected.filter(item=>item.defId===family[index].id);for(const [i,item]of ingredients.entries()){if(automatic&&!remaining)break;const reserve=automatic?Math.min(Math.max(0,remaining-1),ingredients.length-i-1):0,amount=Math.min(remaining-reserve,C.quantity(item));if(amount<=0)fail('Remove extra ingredients from this recipe.');costs.push([item.uid,amount]);remaining-=amount;}if(remaining)fail('There are not enough potions for this recipe.');
  }
  def=family[recipe.out];level=Math.min(88,Math.max(1,state.level||1,...selected.map(item=>item.forged?.level||1))+integer(rng,1,4));
 }else{
  if(recipeId&&recipeId!=='gear'||potion||selected.length<2||selected.some(item=>!['Weapons','Armor'].includes(C.itemMap[item.defId].category)))fail('Choose two or more equipment items.');
  if(rng()>=.38)return {success:false,message:'The merge failed. All ingredients were kept.'};
  const same=selected.every(i=>i.defId===selected[0].defId),source=C.itemMap[selected[0].defId];
  const upgrades=C.items.filter(item=>item.mergeOnly&&item.category==='Weapons');
  const pool=C.items.filter(item=>['Weapons','Armor'].includes(item.category));
  if(same){
   const outcome=integer(rng,0,2),otherWeapons=pool.filter(item=>item.category==='Weapons'&&!item.mergeOnly&&item.id!==source.id);
   def=outcome===0?source:outcome===1?upgrades[integer(rng,0,upgrades.length-1)]:otherWeapons[integer(rng,0,otherWeapons.length-1)];
  }else def=pool[integer(rng,0,pool.length-1)];
  level=Math.max(...selected.map(item=>item.iLvl||1))+integer(rng,1,4);costs.push(...selected.map(item=>[item.uid,1]));
 }
 const trial=structuredClone(state);
 for(const [uid,amount] of costs)if(!C.consume(trial,uid,amount))fail('An ingredient changed. Reopen the forge.');
 const rarityFloor=Math.max(2,...selected.map(item=>C.rarities.findIndex(row=>row.id===item.rarity)));
 const rarity=potion?'common':C.rarities[Math.min(C.rarities.length-1,rarityFloor+integer(rng,0,2))].id;
 const item={uid:randomUUID(),defId:def.id,rotation:0,rotated:false,...C.rollItem(def,level,rng,{rarity,iLvl:level,requiredLevel:Math.min(88,level)}),forged:effects(rng,Math.min(88,level),potion)};
 let placed=false;
 if(automatic){const target=selected.at(-1);for(const rotation of [0,1])if(C.place(trial,item,target.where,target.x,target.y,rotation)){placed=true;break;}}
 if(!placed)for(const where of automatic?[selected.at(-1).where,selected[0].where,'stash','bag']:['stash','bag']){const spot=C.findSpace(trial,item,where);if(spot&&C.place(trial,item,where,spot.x,spot.y,spot.rotation)){placed=true;break;}}
 if(!placed)fail('Your inventory cannot fit the forged item. Free some space first.');
 if(!C.validState(trial,state.heroId))fail('The forged inventory could not be validated.');
 doc.state=trial;
 return {success:true,item:trial.items.find(entry=>entry.uid===item.uid)||item,message:`Forged ${def.name}.`};
}
