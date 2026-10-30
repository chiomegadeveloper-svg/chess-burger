// Shared, authoritative potion effects, footprints, prices and independent monster drop rolls.
(function(root){
 const health=[
  ['health_potion','Normal Potion',1,1,20,40,.8],
  ['cola_potion','Cola Potion',1,2,30,80,.4],
  ['coconut_potion','Coconut Potion',2,2,60,120,.3],
  ['tuba_wine_potion','Tuba Wine Potion',2,2,80,160,.1]
 ].map(([id,name,w,h,percent,basePrice,dropChance])=>({id,type:id,name,w,h,category:'Potions',tier:1,sprite:id,bonus:[0,0,0,0,0,0],restore:{resource:'hp',percent},basePrice,dropChance}));
 const family=(resource,rows)=>rows.map(([id,name],i)=>{const tier=health[i];return {...tier,id,type:id,name,sprite:id,bonus:[0,0,0,0,0,0],restore:{resource,percent:tier.restore.percent}};});
 const mana=family('mp',[['mana_potion','Azure Dew Potion'],['sapphire_tonic','Sapphire Tonic'],['deepwell_elixir','Deepwell Elixir'],['arcane_tide','Arcane Tide Potion']]);
 const attack=family('ap',[['cyan_spark','Cyan Spark Potion'],['volt_surge','Volt Surge Potion'],['ember_rush','Ember Rush Potion'],['violet_overdrive','Violet Overdrive Potion']]);
 const resources={hp:{name:'Health',cap:'maxHp',state:'currentHp'},mp:{name:'Mana',cap:'maxMp',state:'currentMp'},ap:{name:'Attack Points',cap:'maxAp',state:'currentAp'}};
 const items=[...health,...mana,...attack];
 const byId=Object.fromEntries(items.map(item=>[item.id,item]));
 const get=item=>byId[typeof item==='string'?item:item?.defId||item?.id]||null;
 const amount=(item,cap)=>{const effect=get(item)?.restore;if(!effect)throw Error('Unknown potion.');return effect.percent?Math.max(1,Math.round(cap*effect.percent/100)):effect.amount;};
 const price=(item,level=1)=>{const def=get(item);if(!def)throw Error('Unknown potion.');return def.basePrice+Math.max(1,Math.min(88,Math.floor(Number(level)||1)));};
 const describe=item=>{const effect=get(item)?.restore;return effect?`Restores ${effect.percent}% of maximum ${resources[effect.resource].name}`:'';};
 const api={items,health,mana,attack,resources,get,amount,price,describe};root.RPGPotions=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
