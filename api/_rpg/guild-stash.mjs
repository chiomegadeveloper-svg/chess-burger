import C from './src/inventory-core.js';
import {fail} from './store.mjs';

export const GUILD_GRID={cols:12,rows:12};
export const guildLayout=(state,items)=>({...state,grids:{...state.grids,stash:GUILD_GRID},items:items.map(item=>({...item,where:'stash'}))});
const setupError=error=>/PGRST20[25]|42P01|42703|42883|42501/.test(error?.code||'');
const unavailable=(setup=false)=>{throw Object.assign(Error(setup?'Shared guild storage is not enabled yet.':'Guild stash is temporarily unavailable. Please retry.'),{status:503,code:setup?'guild_setup_required':'guild_unavailable'});};
async function wallet(client,user){const result=await client.from('cb_profiles').select('gold_points').eq('user_id',user).maybeSingle();if(result.error||!result.data)fail('Your CBG balance is unavailable.',503);return Number(result.data.gold_points||0);}

async function membership(client,user){
 const member=await client.from('cb_guild_members').select('guild_id').eq('user_id',user).maybeSingle();
 if(member.error)unavailable();return member.data?.guild_id||null;
}

export async function guildSnapshot(client,user){
 const guildId=await membership(client,user);
 if(!guildId)return {guild:null,revision:0,items:[],cbg:0,cbgReady:false,...GUILD_GRID};
 let [details,result]=await Promise.all([
  client.from('cb_guilds').select('id,name').eq('id',guildId).maybeSingle(),
  client.from('cb_rpg_guild_stashes').select('revision,items,cbg_balance').eq('guild_id',guildId).maybeSingle(),
 ]),cbgReady=true;
 if(details.error)unavailable();const guild=details.data;
 if(!guild)return {guild:null,revision:0,items:[],cbg:0,cbgReady:false,...GUILD_GRID};
 if(result.error&&/42703|PGRST204/.test(result.error.code||'')){cbgReady=false;result=await client.from('cb_rpg_guild_stashes').select('revision,items').eq('guild_id',guild.id).maybeSingle();}
 if(result.error)unavailable(setupError(result.error));
 return {guild,revision:result.data?.revision||0,items:result.data?.items||[],cbg:Number(result.data?.cbg_balance||0),cbgReady,...GUILD_GRID};
}

export async function guildRequest(client,user,doc,input){
 if(input.action!=='guildStash'&&!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(input.requestId||''))fail('Please retry this transfer.',400);
 const [stash,receipt]=await Promise.all([
  guildSnapshot(client,user),
  input.action==='guildTransfer'?client.from('cb_rpg_guild_transfers').select('user_id,guild_id').eq('request_id',input.requestId).maybeSingle():null,
 ]);
 if(input.action==='guildStash')return {guildStash:stash,walletCbg:stash.guild?await wallet(client,user):0};
 if(!stash.guild)fail('Join a Chess Burger guild to use its stash.',403);
 if(input.guildId!==stash.guild.id)fail('Your guild changed. Refresh the inventory before transferring.');
 if(input.action==='guildCbg'){
  if(!['deposit','withdraw'].includes(input.direction)||!Number.isSafeInteger(input.amount)||input.amount<1||input.amount>1000000)fail('Enter a whole CBG amount from 1 to 1,000,000.',400);
  if(!stash.cbgReady)unavailable(true);
  const result=await client.rpc('cb_rpg_guild_cbg',{p_user_id:user,p_guild_id:stash.guild.id,p_request_id:input.requestId,p_direction:input.direction,p_amount:input.amount,p_generation:doc.generation||null});
  if(result.error){if(setupError(result.error))unavailable(true);if(result.error.code==='40P01')fail('The guild stash is busy. Retry this transfer.');if(result.error.code==='P0001')fail(result.error.message);fail('Transfer status could not be confirmed. Retry the same transfer.',503);}
  Object.assign(doc,result.data.document);
  return {game:doc.state,walletCbg:result.data.walletCbg,guildStash:{...result.data.guildStash,guild:stash.guild,cbgReady:true,...GUILD_GRID},transferred:true};
 }
 if(receipt.error)unavailable(setupError(receipt.error));
 if(receipt.data){if(receipt.data.user_id!==user||receipt.data.guild_id!==stash.guild.id)fail('Transfer reference is unavailable.');return {game:doc.state,guildStash:stash,transferred:true};}
 if(input.stashRevision!==stash.revision||(input.inventoryRevision||0)!==(doc.state.inventoryRevision||0))fail('This inventory changed. Refresh and retry.');
 if(doc.battle?.status==='active')fail('Finish your battle before using the guild stash.');
 const from=input.from,to=input.to;
 if(!['bag','stash','guild'].includes(from)||!['bag','stash','guild'].includes(to)||from!=='guild'&&to!=='guild')fail('Choose a guild stash transfer.',400);
 if(!Number.isInteger(input.rotation)||input.rotation<0||input.rotation>3)fail('Invalid item rotation.',400);
 const next=structuredClone(doc),items=structuredClone(stash.items),source=from==='guild'?items:next.state.items;
 const item=source.find(i=>i.uid===input.uid&&i.where===from);if(!item)fail('This item has already moved. Refresh the stash.');
 // Shared potions can predate the current consumable catalog. Normalize only
 // the transferred copy, then commit its migration with the ownership change.
 C.normalizePotions({items:[item]});
 const rotation=input.rotation;
 if(to==='guild'){
  const layout=guildLayout(next.state,items);
  if(!C.canPlace(layout,item,'stash',input.x,input.y,rotation))fail('This item does not fit in the guild stash.');
  const placed={...item,where:'guild',x:input.x,y:input.y,rotation,rotated:Boolean(rotation%2)};
  const index=items.findIndex(i=>i.uid===item.uid);if(index<0)items.push(placed);else items[index]=placed;
  if(from!=='guild')next.state.items=next.state.items.filter(i=>i.uid!==item.uid);
 }else{
  if(next.state.items.some(i=>i.uid===item.uid))fail('This item is already in your inventory.');
  if(!C.place(next.state,item,to,input.x,input.y,rotation))fail(to==='bag'&&!C.canEquip(next.state,item)?`Reach level ${item.requiredLevel} to equip this item.`:'This item does not fit in your inventory.');
  items.splice(items.findIndex(i=>i.uid===item.uid),1);
 }
 if(!C.validState(next.state,doc.heroId))fail('Invalid inventory layout.',400);
 next.state.inventoryRevision=(doc.state.inventoryRevision||0)+1;
 const result=await client.rpc('cb_rpg_guild_transfer',{
  p_user_id:user,p_guild_id:stash.guild.id,p_request_id:input.requestId,p_revision:doc.revision||0,
  p_stash_revision:stash.revision,p_document:next,p_items:items,p_item_uid:item.uid,p_from:from,p_to:to,
 });
 if(result.error){if(setupError(result.error))unavailable(true);fail(result.error.message||'Transfer failed. Your items were not changed.');}
 Object.assign(doc,result.data.document);
 return {game:doc.state,guildStash:{cbg:stash.cbg,cbgReady:stash.cbgReady,...result.data.guildStash,guild:stash.guild,...GUILD_GRID},transferred:true};
}
