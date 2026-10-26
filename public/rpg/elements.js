// Shared elemental rules; no account state or client-controlled affinity.
(function(root){
 'use strict';
 const definitions={neutral:{name:'Neutral',color:'#c4d0d5',symbol:'◇'},fire:{name:'Fire',color:'#ff8959',symbol:'♨'},water:{name:'Water',color:'#66bcff',symbol:'≋'},earth:{name:'Earth',color:'#c8a274',symbol:'⬟'},thunder:{name:'Thunder',color:'#ffe06c',symbol:'ϟ'},air:{name:'Air',color:'#e3f3ff',symbol:'彡'},toxic:{name:'Toxic',color:'#d68aff',symbol:'☣'}};
 const ids=['fire','water','earth','thunder','air','toxic'];
 const strong={fire:['thunder','toxic'],water:['earth','fire'],earth:['thunder','toxic'],thunder:['water','air'],air:['earth','fire'],toxic:['water','air']};
 const affinities={rogue:'fire',queen:'fire',mage:'water',tank:'earth',crusader:'earth',assassin:'thunder',archer:'air',theft:'toxic',pektu:'fire',conchita:'fire',muraduk:'water',draguu:'water',erpack:'earth',windee:'earth',punsuck:'earth',kalaagg:'thunder',kassag:'thunder',donkuber:'air',odeksa:'air',jengot:'air',chaanack:'toxic',mhakiduk:'toxic',buhokba:'toxic',baluu:'toxic'};
 const affinity=id=>affinities[id]||'neutral';
 const skillElement=s=>({wind:'air',fire:'fire',lightning:'thunder'}[s.category]||({stone_shard:'earth',tidal_orb:'water',frost_lance:'water',thorn_burst:'toxic',crystal_crush:'earth',earthbreaker:'earth'}[s.id])||'neutral');
 const matchup=(attack,defense)=>strong[attack]?.includes(defense)?1.25:strong[defense]?.includes(attack)?0.8:1;
 const info=id=>definitions[id]||definitions.neutral;
 const label=id=>info(id).symbol+' '+info(id).name;
 const badge=id=>{const d=info(id);return '<span class="rpg-element" style="--element-color:'+d.color+'" title="'+d.name+'" aria-label="'+d.name+' element">'+d.symbol+'</span>';};
 const property=item=>item?.elemental&&ids.includes(item.elemental.element)&&Number.isInteger(item.elemental.value)&&item.elemental.value>=2&&item.elemental.value<=8?item.elemental:null;
 const itemText=item=>{const p=property(item);return p?label(p.element)+' · +'+p.value+'% '+(p.kind==='resistance'?'resistance':'skill damage'):'';};
 function gearBonuses(state,C){const out={};for(const item of state.items||[]){const p=property(item),def=C.itemMap[item.defId];if(!p||item.where!=='bag'||!C.canEquip(state,item)||C.isConsumable(item))continue;const kind=def?.category==='Armor'?'resistance':'damage';if(p.kind!==kind)continue;const key='element_'+p.element+'_'+kind;out[key]=Math.min(20,(out[key]||0)+p.value);}return out;}
 function attackInfo(a,d,s){const element=skillElement(s),factor=matchup(element,affinity(d.heroId)),p=a.passives||{},r=d.passives||{};return {element,matchup:factor,label:factor>1?'Strong':factor<1?'Resisted':'Normal',multiplier:factor*(element!=='neutral'&&element===affinity(a.heroId)?1.05:1)*(1+Math.max(0,Math.min(20,p['element_'+element+'_damage']||0))/100)*(1-Math.max(0,Math.min(20,r['element_'+element+'_resistance']||0))/100)};}
 const api={definitions,ids,strong,affinities,affinity,skillElement,matchup,info,label,badge,property,itemText,gearBonuses,attackInfo};
 root.RPGElements=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
