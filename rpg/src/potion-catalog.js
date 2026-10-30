// Shared, authoritative potion effects, footprints, prices and independent monster drop rolls.
(function(root){
 const health=[
  ['health_potion','Normal Potion',1,1,20,40,.8],
  ['cola_potion','Cola Potion',1,2,30,80,.4],
  ['coconut_potion','Coconut Potion',2,2,60,120,.3],
  ['tuba_wine_potion','Tuba Wine Potion',2,2,80,160,.1]
 ].map(([id,name,w,h,percent,basePrice,dropChance])=>({id,type:id,name,w,h,category:'Potions',tier:1,sprite:id,bonus:[0,0,0,0,0,0],restore:{resource:'hp',percent},basePrice,dropChance}));
 const items=[...health,{id:'mana_potion',type:'mana_potion',name:'Mana Potion',w:1,h:1,category:'Potions',tier:1,sprite:'mana_potion',bonus:[0,0,0,0,0,0],restore:{resource:'mp',amount:20},basePrice:8}];
 const byId=Object.fromEntries(items.map(item=>[item.id,item]));
 const get=item=>byId[typeof item==='string'?item:item?.defId||item?.id]||null;
 const amount=(item,cap)=>{const effect=get(item)?.restore;if(!effect)throw Error('Unknown potion.');return effect.percent?Math.max(1,Math.round(cap*effect.percent/100)):effect.amount;};
 const price=(item,level=1)=>{const def=get(item);if(!def)throw Error('Unknown potion.');return def.basePrice+(def.restore.resource==='hp'?Math.max(1,Math.min(88,Math.floor(Number(level)||1))):0);};
 const describe=item=>{const effect=get(item)?.restore;return effect?(effect.percent?`Restores ${effect.percent}% of maximum Health`:`Restores ${effect.amount} mana`):'';};
 const api={items,health,get,amount,price,describe};root.RPGPotions=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
