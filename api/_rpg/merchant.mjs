import {createHash} from 'node:crypto';
import C from './src/inventory-core.js';
import {fail,write} from './store.mjs';
export const merchantDay=now=>new Date(now+8*3600000).toISOString().slice(0,10);
function seeded(seed){let n=createHash('sha256').update(seed).digest().readUInt32LE();return ()=>{n=(n+0x6D2B79F5)|0;let t=Math.imul(n^n>>>15,1|n);t^=t+Math.imul(t^t>>>7,61|t);return ((t^t>>>14)>>>0)/4294967296;};}
export function buyPrice(item){if(C.isConsumable(item))return 8;const def=C.itemMap[item.defId],extra=item.attributes.reduce((s,a)=>s+a.value,0),power=item.baseBonus.reduce((s,n)=>s+n,0);return Math.ceil((10+item.iLvl*3+power/3+item.attributes.length*6+extra*2+item.enhancement.value*2)*({common:1,uncommon:1.3,rare:1.8,epic:2.5,mythic:3.5,divine:5}[item.rarity]||1)*(1+(def.tier-1)*.1)*(def.category==='Armor'?1.1:1));}
export const sellPrice=item=>Math.max(1,Math.floor(buyPrice(item)*.25));
export function stock(user,day,level,generation=''){
 const rng=seeded(user+':'+day+':'+generation),pool=C.items.filter(i=>['Weapons','Armor'].includes(i.category)).slice();
 for(let i=pool.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}
 return pool.slice(0,28).map((def,index)=>{const rarity=index<15?'common':index<24?'uncommon':'rare',requiredLevel=level+Math.floor(rng()*(Math.min(88,level+8)-level+1));const item={uid:`merchant-${day}-${index}`,defId:def.id,rotation:0,rotated:false,...C.rollItem(def,requiredLevel,rng,{rarity,iLvl:requiredLevel,requiredLevel})};return {id:String(index),item,price:buyPrice(item)};});
}
export async function merchantRequest(client,user,doc,input,now){
 const wallet=await client.from('cb_profiles').select('gold_points').eq('user_id',user).maybeSingle();if(wallet.error||!wallet.data)fail('Your CBG balance is unavailable.',503);doc.state.cbg=Number(wallet.data.gold_points||0);
 const day=merchantDay(now);if(doc.merchant?.day!==day){doc.merchant={day,level:doc.state.level,sold:[],offers:stock(user,day,doc.state.level,doc.generation||'')};await write(client,user,'rpg_profile','hero',doc);}
 let tradingReady=true;const response=()=>({game:doc.state,merchant:{tradingReady,day,refreshAt:new Date(day+'T00:00:00+08:00').getTime()+86400000,level:doc.merchant.level,offers:doc.merchant.offers.map(o=>({...o,sold:doc.merchant.sold.includes(o.id)})),potions:['health_potion','mana_potion'].map(id=>({id,item:{defId:id,rarity:'common'},price:8})),sellPrices:Object.fromEntries(doc.state.items.map(i=>[i.uid,sellPrice(i)]))}});
 if(input.action==='merchant'){const probe=await client.rpc('cb_rpg_merchant_trade',{p_user_id:user,p_request_id:null,p_revision:doc.revision,p_delta:0,p_document:null});tradingReady=!probe.error;return response();}
 if(!/^[0-9a-f-]{36}$/i.test(input.requestId||''))fail('Please retry this trade.',400);
 if((doc.merchantReceipts||[]).includes(input.requestId))return response();
 const next=structuredClone(doc);let delta;
 if(input.action==='merchantBuy'){
  if(input.day!==day)fail('The merchant has new stock. Reopen the shop.');let item;
  if(['health_potion','mana_potion'].includes(input.offerId)){const def=C.itemMap[input.offerId];item={uid:crypto.randomUUID(),defId:def.id,rotation:0,rotated:false,...C.rollItem(def,1,Math.random,{rarity:'common'})};delta=-8;}
  else{const offer=next.merchant.offers.find(o=>o.id===input.offerId);if(!offer||next.merchant.sold.includes(offer.id))fail('This item is sold out.');item={...structuredClone(offer.item),uid:crypto.randomUUID()};delta=-offer.price;next.merchant.sold.push(offer.id);}
  const spot=C.findSpace(next.state,item,'stash');if(!spot)fail('Your stash is full. Sell or move an item first.');C.place(next.state,item,'stash',spot.x,spot.y,spot.rotation);
 }else if(input.action==='merchantSell'){
  const index=next.state.items.findIndex(i=>i.uid===input.uid);if(index<0)fail('This item is no longer in your inventory.');delta=sellPrice(next.state.items[index]);next.state.items.splice(index,1);
 }else fail('Unknown merchant action.',400);
 next.state.inventoryRevision=(next.state.inventoryRevision||0)+1;next.merchantReceipts=[...(next.merchantReceipts||[]),input.requestId].slice(-200);
 const result=await client.rpc('cb_rpg_merchant_trade',{p_user_id:user,p_request_id:input.requestId,p_revision:doc.revision,p_delta:delta,p_document:next});
 if(result.error){if(/PGRST202|42883/.test(result.error.code||''))fail('The merchant is preparing to trade. Please try again shortly.',503);fail(result.error.message||'Trade failed. Your items and CBG were not changed.');}
 Object.assign(doc,result.data);return {...response(),traded:true};
}
