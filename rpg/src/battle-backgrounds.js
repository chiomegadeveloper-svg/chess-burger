(function(root){
 'use strict';
 const scenes=Object.freeze(['mountain-sunset','moonlit-kaiju-beach','cloud-temple','san-juanico-islands']);
 const key='cb-rpg-battle-backgrounds-v1';
 function createSelector(storage,random=Math.random){
  let saved=[];try{const value=JSON.parse(storage?.getItem(key)||'[]');if(Array.isArray(value))saved=value.filter(pair=>Array.isArray(pair)&&typeof pair[0]==='string'&&scenes.includes(pair[1])).slice(-24);}catch{}
  const choices=new Map(saved);
  return function select(battleId){
   if(!battleId)return null;
   if(!choices.has(battleId)){
    choices.set(battleId,scenes[Math.min(scenes.length-1,Math.max(0,Math.floor(random()*scenes.length)))]);
    if(choices.size>24)choices.delete(choices.keys().next().value);
    try{storage?.setItem(key,JSON.stringify([...choices]));}catch{}
   }
   return choices.get(battleId);
  };
 }
 let storage;try{storage=root.sessionStorage;}catch{}
 const select=createSelector(storage);
 function apply(host,battleId){
  const scene=select(battleId);if(!host||!scene||host.dataset.battleBackground===scene)return;
  host.dataset.battleBackground=scene;
  host.style.setProperty('--battle-background',`url("assets/backgrounds/${scene}.webp")`);
 }
 const api={scenes,createSelector,apply};
 root.RPGBattleBackgrounds=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
