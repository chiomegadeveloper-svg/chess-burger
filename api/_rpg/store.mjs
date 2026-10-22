import C from './src/inventory-core.js';
import P from './src/progression.js';
import skills from './src/skill-catalog.js';
export const HEROES=['rogue','theft','assassin','mage','tank','archer','queen','crusader'];
export const fail=(message,status=409)=>{throw Object.assign(Error(message),{status});};
export async function read(client,user,kind='rpg_profile',id='hero'){
 const r=await client.from('cb_inventory_items').select('metadata').eq('user_id',user).eq('item_kind',kind).eq('item_id',id).maybeSingle();
 if(r.error)fail('RPG saves are temporarily unavailable.',503);return r.data?.metadata||null;
}
export async function insert(client,user,kind,id,data){
 const r=await client.from('cb_inventory_items').insert({user_id:user,item_kind:kind,item_id:id,quantity:0,metadata:data});
 if(r.error&&r.error.code!=='23505')fail('RPG save could not be created.',503);return !r.error;
}
export async function write(client,user,kind,id,data){
 const revision=data.revision||0,next={...data,revision:revision+1};
 const r=await client.from('cb_inventory_items').update({metadata:next,updated_at:new Date().toISOString()}).eq('user_id',user).eq('item_kind',kind).eq('item_id',id).eq('metadata->>revision',String(revision)).select('metadata').maybeSingle();
 if(r.error)fail('RPG save failed. Please retry.',503);if(!r.data)fail('Your game changed in another window. Refresh and try again.');Object.assign(data,next);return data;
}
export function makeHero(input){
 const name=String(input.name||'').trim();if(!HEROES.includes(input.heroId)||name.length<2||name.length>24||/[\x00-\x1f<>]/.test(name))fail('Choose a hero and a name of 2–24 characters.',400);
 if(input.skill==='basic'||!skills.some(s=>s.id===input.skill))fail('Choose one additional starting skill.',400);
 const state=C.newState(input.heroId,name);state.cbg=0;state.active=['basic',input.skill,null,null];state.learned=['basic',input.skill];
 return {revision:0,heroId:input.heroId,name,starterSkill:input.skill,state,history:[],awards:[],encounters:[],createdAt:Date.now()};
}
export function saveInventory(doc,input){
 const next=structuredClone(input),old=doc.state;
 if(doc.battle?.status==='active')fail('Equipment is locked during battle.');
 next.currentHp=old.currentHp;next.currentMp=old.currentMp;
 if((next.inventoryRevision||0)!==(old.inventoryRevision||0))fail('Your inventory changed. Reopen Hero Room before saving.');
 if(!C.validState(next,doc.heroId)||next.heroId!==doc.heroId||next.name!==doc.name)fail('Your chosen hero and name are locked.',400);
 if(JSON.stringify(next.items)!==JSON.stringify(old.items)||JSON.stringify(next.grids)!==JSON.stringify(old.grids)){
  // Only rearrangement, rotation, storage transfers, and discards of owned gear are accepted.
  if(JSON.stringify(next.grids)!==JSON.stringify(old.grids))fail('Inventory expansions are not available yet.');
  for(const item of next.items){const original=old.items.find(i=>i.uid===item.uid);if(!original)fail('Unknown equipment.');for(const key of Object.keys(original).filter(k=>!['where','x','y','rotation','rotated'].includes(k)))if(JSON.stringify(item[key])!==JSON.stringify(original[key]))fail('Equipment attributes cannot be changed.');}
 }
 const missing=old.learned.some(id=>!next.learned.includes(id));
 if(missing||next.learned.length>Math.min(30,2+Math.floor(old.level/2)))fail('No skill choices are available.');
 next.level=old.level;next.totalXp=old.totalXp;next.cbg=0;next.points=0;next.upgrades=[0,0,0,0,0,0];
 next.learnCredits=Math.max(0,Math.floor(old.level/2)-(next.learned.length-2));
 if(!C.validState(next,doc.heroId))fail('Invalid equipment layout.',400);doc.state=next;return doc;
}
export function progression(doc,b){const receipt=doc.awards.find(a=>a.id===b?.id);return {...P.progress(doc.state.totalXp),heroId:doc.heroId,battleId:b?.id,awarded:receipt?.xp||0};}
