(function(root){
  'use strict';
  const P=root.RPGProgression||(typeof require==='function'?require('./progression.js'):null);
  const E=root.RPGElements||(typeof require==='function'?require('./elements.js'):null);
  const Potions=root.RPGPotions||(typeof require==='function'?require('./potion-catalog.js'):null);
  const stats=['Health','Attack','Magic','Armor','Mana','Wisdom'];
  const tiers=['Worn','Forged','Runed','Enchanted'];
  // id, display name, footprint, category, Health/Attack/Magic/Armor/Mana/Wisdom bonuses.
  const types=[
    ['iron_sword','Long Iron Sword',1,3,'Weapons',[0,3,0,0,0,0]],
    ['iron_dagger','Iron Dagger',1,2,'Weapons',[0,2,0,0,0,1]],
    ['iron_shield','Iron Shield',2,2,'Armor',[1,0,0,3,0,0]],
    ['wood_shield','Wooden Shield',2,2,'Armor',[1,0,0,2,0,0]],
    ['wood_dagger','Wood Dagger',1,2,'Weapons',[0,1,0,0,0,1]],
    ['wood_sword','Wood Long Sword',1,3,'Weapons',[0,2,0,0,0,0]],
    ['armor','Armor',2,3,'Armor',[2,0,0,3,0,0]],
    ['wizard_staff','Wizard Staff',1,4,'Weapons',[0,0,3,0,2,0]],
    ['warlock_staff','Warlock Staff',1,4,'Weapons',[0,0,4,0,0,1]],
    ['emerald_staff','Short Emerald Staff',1,2,'Weapons',[0,0,2,0,2,0]],
    ['wood_mace','Wooden Mace',1,3,'Weapons',[0,2,0,0,0,0]],
    ['iron_mace','Iron Mace',1,3,'Weapons',[0,3,0,1,0,0]],
    ['emerald_mace','Emerald Mace',1,3,'Weapons',[0,3,1,0,0,0]],
    ['emerald_sword','Emerald Sword',1,3,'Weapons',[0,3,2,0,0,0]],
    ['emerald_dagger','Emerald Dagger',1,2,'Weapons',[0,2,1,0,0,1]],
    ['gauntlets','Gauntlets',2,1,'Armor',[0,1,0,2,0,0]],
    ['helm','Helm',2,2,'Armor',[0,0,0,2,0,2]]
  ];
  const items=types.flatMap(([id,name,w,h,category,bonus])=>tiers.map((tier,i)=>({id:`${id}_v${i+1}`,type:id,name:`${tier} ${name}`,w,h,category,tier:i+1,sprite:`${id}_v${i+1}`,bonus:bonus.map(v=>v*(i+1))})));
  items.push(...[
    ['royal_longsword','Royal Longsword',[0,7,0,1,0,0]],['emerald_longsword','Emerald Longsword',[0,5,3,0,0,0]],
    ['ember_machete','Ember Machete',[0,6,2,0,0,0]],['toxic_machete','Toxic Machete',[0,6,0,0,0,2]],
    ['titan_greatsword','Titan Greatsword',[2,6,0,2,0,0]],['frost_greatsword','Frost Greatsword',[0,5,3,0,1,0]],
    ['bandit_cleaver','Bandit Cleaver',[1,7,0,0,0,0]],['thunder_bandit_sword','Thunder Bandit Sword',[0,6,2,0,0,1]]
  ].map(([id,name,bonus])=>({id,type:id,name,w:1,h:4,category:'Weapons',tier:4,sprite:id,bonus,mergeOnly:true})));
  items.push(...Potions.items);
  const spells=root.RPG_ATTACK_SKILLS||(typeof require==='function'?require('./skill-catalog.js'):[]);
  const itemMap=Object.fromEntries(items.map(i=>[i.id,i]));
  const spellMap=Object.fromEntries(spells.map(s=>[s.id,s]));
  const grids={bag:{cols:6,rows:6},stash:{cols:6,rows:6}};
  const rarities=[
    {id:'common',name:'Common',color:'#a9babf',range:[0,0],weight:500},
    {id:'uncommon',name:'Uncommon',color:'#69cf83',range:[1,1],weight:280},
    {id:'rare',name:'Rare',color:'#6caaff',range:[1,2],weight:140},
    {id:'epic',name:'Epic',color:'#c193ff',range:[2,4],weight:55},
    {id:'mythic',name:'Mythic',color:'#ffb758',range:[3,5],weight:20},
    {id:'divine',name:'Divine',color:'#a6f1ff',range:[5,6],weight:5}
  ];
  const rarityMap=Object.fromEntries(rarities.map(r=>[r.id,r]));
  const enhancements=['Vitality','Force','Sorcery','Guarding','Clarity','Insight'];
  const BAG_PRICE=100,STARTING_CBG=500;
  const uid=()=>root.crypto?.randomUUID?.()||`item-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const clone=value=>JSON.parse(JSON.stringify(value));
  const newState=(heroId,name)=>({version:3,heroId,name,level:1,totalXp:0,points:0,upgrades:[0,0,0,0,0,0],items:[],active:['basic',null,null,null],spellStorage:Array(30).fill(null),learned:['basic'],learnCredits:0,grids:clone(grids),cbg:STARTING_CBG});
  const orientation=value=>typeof value==='boolean'?(value?1:0):((value||0)%4+4)%4;
  const rotationOf=item=>orientation(item.rotation??item.rotated);
  const size=(definition,rotation=0)=>orientation(rotation)%2?{w:definition.h,h:definition.w}:{w:definition.w,h:definition.h};
  const gridFor=(state,where)=>Object.hasOwn(grids,where)?(state.grids?.[where]||(state.version===1?{bag:{cols:6,rows:8},stash:{cols:8,rows:8}}[where]:grids[where])):null;
  const integer=(low,high,rng=Math.random)=>low+Math.floor(Math.max(0,Math.min(1-Number.EPSILON,rng()))*(high-low+1));
  const gearTier=required=>Math.floor(required/10)+1;
  function rollRarity(rng){let ticket=integer(1,1000,rng);for(const rarity of rarities){ticket-=rarity.weight;if(ticket<=0)return rarity.id;}return 'divine';}
  const isConsumable=item=>!!Potions.get(item);
  const quantity=item=>item.quantity??1;
  const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])])):value;
  const stackKey=item=>JSON.stringify(stable({defId:item.defId,rarity:item.rarity,forged:item.forged||null}));
  const sameStack=(a,b)=>isConsumable(a)&&isConsumable(b)&&stackKey(a)===stackKey(b);
  const forgeCost=units=>18+8*Math.max(0,Math.floor(Number(units)||0)-2);
  function mergePlan(...items){
    if(items.length<2||items.some(i=>!i||!['bag','stash'].includes(i.where))||new Set(items.map(i=>i.uid)).size!==items.length)return null;
    const quote=(recipe,units)=>({kind:'forge',recipe,units,fee:forgeCost(units)});
    if(items.every(i=>['Weapons','Armor'].includes(itemMap[i.defId]?.category)))return quote('gear',items.length);
    if(!items.every(isConsumable))return null;
    const family=[Potions.health,Potions.mana,Potions.attack].find(rows=>rows.some(row=>row.id===items[0].defId));
    if(!family||!items.every(i=>family.some(row=>row.id===i.defId)))return null;
    const normal=family[0].id,cola=family[1].id;
    const count=id=>items.filter(i=>i.defId===id).reduce((n,i)=>n+quantity(i),0);
    if(items.every(i=>i.defId===normal)){const total=count(normal);return total>=10?quote('tuba',10):total>=4?quote('coconut',4):quote('cola',2);}
    if(items.every(i=>[normal,cola].includes(i.defId))&&count(normal)>=2&&count(cola)>=1)return quote('mixed-coconut',3);
    return items.every(i=>sameStack(items[0],i))&&items.reduce((n,i)=>n+quantity(i),0)<=999?{kind:'stack',fee:0,units:0}:null;
  }
  function consume(state,uid,count=1){const index=state.items.findIndex(i=>i.uid===uid);if(index<0||!Number.isSafeInteger(count)||count<1||quantity(state.items[index])<count)return false;const item=state.items[index],left=quantity(item)-count;if(left)item.quantity=left;else state.items.splice(index,1);return true;}
  const curseNames={lifeDrain:'Life drain per turn',poison:'Poison per turn',manaDrain:'Mana deduction per turn',skip:'Attack turn skip'};
  const curseKeys={lifeDrain:'curseLifeDrain',poison:'cursePoison',manaDrain:'curseManaDrain',skip:'curseSkip'};
  const forgeText=item=>{const f=item.forged;if(!f)return '';return [`Forged level ${f.level}`,...(f.attributes||[]).map(a=>`+${a.value} ${stats[a.stat]}`),...(f.restores||[]).map(a=>`+${a.percent}% ${Potions.resources[a.resource].name} restore`),...(f.curses||[]).map(c=>`Curse: ${curseNames[c.id]} ${c.value}%`)].join(' · ');};
  function validForge(item){const f=item.forged;if(!f)return true;const attrs=f.attributes||[],restores=f.restores||[],curses=f.curses||[];return Number.isInteger(f.level)&&f.level>=1&&f.level<=88&&Array.isArray(attrs)&&attrs.length<=3&&attrs.every(a=>Number.isInteger(a.stat)&&a.stat>=0&&a.stat<6&&Number.isSafeInteger(a.value)&&a.value>0&&a.value<=1000)&&new Set(attrs.map(a=>a.stat)).size===attrs.length&&Array.isArray(restores)&&restores.length<=3&&restores.every(a=>Potions.resources[a.resource]&&Number.isInteger(a.percent)&&a.percent>=2&&a.percent<=8)&&new Set(restores.map(a=>a.resource)).size===restores.length&&Array.isArray(curses)&&curses.length<=4&&curses.every(c=>curseNames[c.id]&&Number.isInteger(c.value)&&c.value>=2&&c.value<=8)&&new Set(curses.map(c=>c.id)).size===curses.length&&(!isConsumable(item)||!attrs.length);}
  const potionRoll=(def,rarity='common')=>({rarity,consumable:true,restore:{...Potions.get(def).restore}});
  const potionRestoreMatches=(item,effect)=>Object.keys(effect).every(k=>item.restore?.[k]===effect[k])&&Object.keys(item.restore||{}).length===Object.keys(effect).length;
  const potionGearKeys=['enhancement','attributes','baseBonus','iLvl','requiredLevel','gearTier','elemental','affix'];
  function normalizePotions(state){let changed=false;for(const item of state.items||[]){if(!isConsumable(item))continue;const roll=potionRoll(item,rarityMap[item.rarity]?item.rarity:'common');if(!potionRestoreMatches(item,roll.restore)||!item.consumable||potionGearKeys.some(k=>k in item)){for(const key of potionGearKeys)delete item[key];Object.assign(item,roll);changed=true;}}return changed;}
  const affixes=[['cbgChance','CBG luck',88,88],['cbgGain','CBG gain',28,68],['attack','Attack',8,48],['ap','Attack Points',2,10],['mana','Mana Points',8,28],['monsterDamage','Monster damage',2,8],['health','Health',2,8],['magic','Magic',2,8],['armor','Armor',2,8],['wisdom','Wisdom',2,8],['physicalDamage','Physical damage',2,8],['magicDamage','Magic damage',2,8],['damageReduction','Damage resistance',2,8],['potionPower','Potion effectiveness',2,8]].map(([id,name,min,max])=>({id,name,min,max}));
  const affixMap=Object.fromEntries(affixes.map(a=>[a.id,a]));
  const affixText=item=>item.affix?`${item.affix.id==='cbgChance'?'':'+'}${item.affix.value}% ${affixMap[item.affix.id]?.name||''}`:'';
  const passives=state=>{const out=Object.assign(E.gearBonuses(state,{itemMap,canEquip,isConsumable}),state.items.filter(i=>i.where==='bag'&&!isConsumable(i)&&canEquip(state,i)&&i.affix).reduce((out,item)=>{const a=item.affix;out[a.id]=a.id==='cbgChance'?Math.max(out[a.id]||0,a.value):Math.min(a.id==='damageReduction'?60:200,(out[a.id]||0)+a.value);return out;},{}));for(const item of state.items.filter(i=>i.where==='bag'&&!isConsumable(i)&&canEquip(state,i)))for(const c of item.forged?.curses||[])out[curseKeys[c.id]]=Math.min(20,(out[curseKeys[c.id]]||0)+c.value);for(const [key,value]of Object.entries(state.potionCurses||{}))if(Object.values(curseKeys).includes(key))out[key]=Math.min(20,(out[key]||0)+value);return out;};
  const maxAp=state=>Math.round(P.maxAp(state.level)*(1+(passives(state).ap||0)/100));
  function rollItem(def,level,rng=Math.random,options={}){
    if(isConsumable(def))return potionRoll(def,options.rarity??rollRarity(rng));
    const iLvl=options.iLvl??integer(Math.max(1,level-3),Math.max(5,level+4),rng);
    const requiredLevel=options.requiredLevel??integer(Math.max(1,iLvl-6),iLvl,rng);
    const rarity=options.rarity??rollRarity(rng),definition=rarityMap[rarity];
    const budget=iLvl+3,total=def.bonus.reduce((a,b)=>a+b,0);
    const baseBonus=def.bonus.map(v=>Math.floor(v/total*budget));
    let left=budget-baseBonus.reduce((a,b)=>a+b,0);
    const ordered=def.bonus.map((v,index)=>({index,fraction:v/total*budget-baseBonus[index]})).sort((a,b)=>b.fraction-a.fraction);
    for(let i=0;left>0;i++,left--)baseBonus[ordered[i%ordered.length].index]++;
    const count=integer(...definition.range,rng),indices=[0,1,2,3,4,5];
    for(let i=indices.length-1;i>0;i--){const j=integer(0,i,rng);[indices[i],indices[j]]=[indices[j],indices[i]];}
    const attributes=indices.slice(0,count).map(stat=>({stat,value:integer(1,Math.ceil(iLvl/4)+rarities.indexOf(definition),rng)}));
    const stat=integer(0,5,rng);
    const affix=affixes[integer(0,affixes.length-1,rng)];
    const elemental=rng()<.5?{element: E.ids[integer(0,E.ids.length-1,rng)],kind:def.category==='Armor'?'resistance':'damage',value:integer(2,8,rng)}:null;
    return {...(elemental?{elemental}:{}),affix:{id:affix.id,value:integer(affix.min,affix.max,rng)},iLvl,requiredLevel,gearTier:gearTier(requiredLevel),rarity,baseBonus,attributes,enhancement:{stat,name:enhancements[stat],value:integer(1,Math.ceil(iLvl/6)+1,rng)}};
  }
  const itemBonus=item=>{
    if(isConsumable(item))return [0,0,0,0,0,0];
    const result=[...item.baseBonus];
    for(const attribute of item.attributes)result[attribute.stat]+=attribute.value;
    result[item.enhancement.stat]+=item.enhancement.value;for(const a of item.forged?.attributes||[])result[a.stat]+=a.value;return result;
  };
  const canEquip=(state,item)=>state.level>=(item.requiredLevel||1);
  function canPlace(state,item,where,x,y,rotation=rotationOf(item)){
    const grid=gridFor(state,where),def=itemMap[item.defId];
    if(!grid||!def||!Number.isInteger(x)||!Number.isInteger(y)||(where==='bag'&&!canEquip(state,item)))return false;
    const {w,h}=size(def,rotation);
    if(x<0||y<0||x+w>grid.cols||y+h>grid.rows)return false;
    return !state.items.some(other=>{
      if(other.uid===item.uid||other.where!==where)return false;
      const box=size(itemMap[other.defId],rotationOf(other));
      return x<other.x+box.w&&x+w>other.x&&y<other.y+box.h&&y+h>other.y;
    });
  }
  function place(state,item,where,x,y,rotation=rotationOf(item)){
    const stack=state.items.find(other=>other.uid!==item.uid&&other.where===where&&other.x===x&&other.y===y&&sameStack(item,other)&&quantity(item)+quantity(other)<=999);
    if(stack){stack.quantity=quantity(stack)+quantity(item);state.items=state.items.filter(i=>i.uid!==item.uid);return true;}
    if(!canPlace(state,item,where,x,y,rotation))return false;
    rotation=orientation(rotation);const rotated=Boolean(rotation%2);
    const old=state.items.find(i=>i.uid===item.uid);
    if(old)Object.assign(old,{where,x,y,rotation,rotated});
    else state.items.push({...item,where,x,y,rotation,rotated});
    return true;
  }
  function findSpace(state,item,where,allowRotate=true){
    const grid=gridFor(state,where);if(!grid)return null;
    const stack=state.items.find(other=>other.uid!==item.uid&&other.where===where&&sameStack(item,other)&&quantity(item)+quantity(other)<=999);if(stack)return {x:stack.x,y:stack.y,rotation:rotationOf(stack),rotated:stack.rotated};
    const original=rotationOf(item);
    for(const rotation of allowRotate?[original,(original+1)%4]:[original]){
      for(let y=0;y<grid.rows;y++)for(let x=0;x<grid.cols;x++)if(canPlace(state,item,where,x,y,rotation))return {x,y,rotation,rotated:Boolean(rotation%2)};
    }
    return null;
  }
  function collect(state,defId,where='stash',rng=Math.random){
    if(!itemMap[defId])return null;
    const item={uid:uid(),defId,rotation:0,rotated:false,...rollItem(itemMap[defId],state.level,rng)},spot=findSpace(state,item,where);
    return spot&&place(state,item,where,spot.x,spot.y,spot.rotation)?state.items.at(-1):null;
  }
  function rotateItem(state,item){return place(state,item,item.where,item.x,item.y,(rotationOf(item)+1)%4);}
  function addTestGear(state,requested,rng=Math.random){
    if(!Array.isArray(requested)||!requested.length||requested.length>3||requested.some(rarity=>!['epic','mythic','divine'].includes(rarity)))return null;
    const trial={...state,items:[...state.items]},created=[],def=itemMap.armor_v4;
    for(const rarity of requested){
      const item={uid:uid(),defId:def.id,rotation:0,rotated:false,sandboxTest:true,...rollItem(def,state.level,rng,{rarity,iLvl:state.level,requiredLevel:state.level})};
      const spot=findSpace(trial,item,'bag');
      if(!spot||!place(trial,item,'bag',spot.x,spot.y,spot.rotation))return null;
      created.push(trial.items.at(-1));
    }
    state.items.push(...created);return created;
  }
  function autoArrange(state,where){
    const grid=gridFor(state,where);if(!grid)return false;
    const inventory=state.items.filter(item=>item.where===where);
    if(!inventory.length)return true;
    // Keep a known-valid arrangement as the fallback. Trials never touch live items.
    if(inventory.some(item=>!canPlace(state,item,where,item.x,item.y,rotationOf(item))))return false;
    const footprint=item=>size(itemMap[item.defId],rotationOf(item));
    const area=item=>{const box=footprint(item);return box.w*box.h;};
    const score=layout=>{
      let bottom=0,vertical=0,horizontal=0;
      for(const item of layout){const {w,h}=footprint(item);bottom=Math.max(bottom,item.y+h);vertical+=w*h*(2*item.y+h);horizontal+=w*h*(2*item.x+w);}
      return [bottom,vertical,horizontal];
    };
    const better=(next,current)=>{for(let i=0;i<next.length;i++){if(next[i]!==current[i])return next[i]<current[i];}return false;};
    let best=inventory.map(item=>({...item})),bestScore=score(best);
    const rowCount=bestScore[0]; // Existing capacity beyond the used rows need not be scanned.
    const modes=[
      (a,b)=>area(b)-area(a),
      (a,b)=>Math.max(...Object.values(footprint(b)))-Math.max(...Object.values(footprint(a)))||area(b)-area(a),
      (a,b)=>footprint(b).h-footprint(a).h||area(b)-area(a),
      (a,b)=>footprint(b).w-footprint(a).w||area(b)-area(a)
    ];
    for(const compare of modes)for(const horizontalFirst of [false,true]){
      const rows=new Uint8Array(rowCount),layout=[];
      const ordered=[...inventory].sort((a,b)=>compare(a,b)||a.defId.localeCompare(b.defId)||a.uid.localeCompare(b.uid));
      for(const item of ordered){
        const original=rotationOf(item),def=itemMap[item.defId];
        const rotations=def.w===def.h?[original]:[original,(original+1)%4].sort((a,b)=>{
          const aa=size(def,a),bb=size(def,b);return horizontalFirst?bb.w-aa.w:bb.h-aa.h;
        });
        let spot=null;
        search:for(let y=0;y<rowCount;y++)for(let x=0;x<grid.cols;x++)for(const rotation of rotations){
          const {w,h}=size(def,rotation);if(x+w>grid.cols||y+h>rowCount)continue;
          const mask=((1<<w)-1)<<x;
          let blocked=false;for(let offset=0;offset<h;offset++)if(rows[y+offset]&mask){blocked=true;break;}
          if(blocked)continue;
          for(let offset=0;offset<h;offset++)rows[y+offset]|=mask;
          spot={x,y,rotation};break search;
        }
        if(!spot)break;
        layout.push({...item,...spot,rotated:Boolean(spot.rotation%2)});
      }
      if(layout.length===inventory.length){const next=score(layout);if(better(next,bestScore)){best=layout;bestScore=next;}}
    }
    // Commit positions only; item identity, rolls, ownership, currency and bonuses stay intact.
    const positions=new Map(best.map(item=>[item.uid,item]));
    for(const item of inventory){const next=positions.get(item.uid);Object.assign(item,{x:next.x,y:next.y,rotation:next.rotation,rotated:next.rotated});}
    return true;
  }
  function buyBag(state,where){
    if(!Object.hasOwn(grids,where)||state.cbg<BAG_PRICE||!Number.isSafeInteger(state.cbg))return false;
    state.grids[where].rows++;state.cbg-=BAG_PRICE;return true;
  }
  function addTestCBG(state){if(!Number.isSafeInteger(state.cbg+100))return false;state.cbg+=100;return true;}
  const bagBonus=state=>state.items.filter(i=>i.where==='bag'&&canEquip(state,i)).reduce((sum,item)=>{const bonus=itemBonus(item);return sum.map((v,i)=>v+bonus[i]);},[0,0,0,0,0,0]);
  const spellBonus=state=>state.active.filter(Boolean).reduce((sum,id)=>sum.map((v,i)=>v+spellMap[id].bonus[i]),[0,0,0,0,0,0]);
  const totals=(state,base)=>{const p=passives(state),bag=bagBonus(state),spells=spellBonus(state);return P.baseStats(state.level).map((v,i)=>Math.round((v+(state.upgrades?.[i]||0)+bag[i]+spells[i])*(1+(p[['health','attack','magic','armor','mana','wisdom'][i]]||0)/100)));};
  function applyProgress(state,totalXp){const before=state.level,p=P.progress(totalXp);state.level=p.level;state.totalXp=p.totalXp;state.points+=Math.max(0,p.level-before);for(const item of state.items.filter(i=>i.where==='bag'&&!canEquip(state,i))){let spot=findSpace(state,item,'stash');while(!spot){state.grids.stash.rows++;spot=findSpace(state,item,'stash');}place(state,item,'stash',spot.x,spot.y,spot.rotation);}const credits=Math.floor(p.level/2)-Math.floor(before/2);state.learnCredits=Math.max(0,Math.min(spells.length-state.learned.length,state.learnCredits+credits));return p.level-before;}
  function gainXp(state,amount){return applyProgress(state,(state.totalXp??P.threshold(state.level))+Math.max(0,amount));}
  function levelUp(state){if(state.level>=88)return false;applyProgress(state,P.threshold(state.level+1));return true;}
  function upgrade(state,index){if(!Number.isInteger(index)||index<0||index>=6||state.points<1)return false;state.upgrades[index]++;state.points--;return true;}
  function learn(state,id){
    const slot=state.spellStorage.indexOf(null);
    if(!spellMap[id]||state.level<2||state.learnCredits<1||state.learned.includes(id)||slot<0)return false;
    state.spellStorage[slot]=id;state.learned.push(id);state.learnCredits--;return true;
  }
  function moveSpell(state,from,index,to,target){
    const source=from==='active'?state.active:from==='storage'?state.spellStorage:null;
    const dest=to==='active'?state.active:to==='storage'?state.spellStorage:null;
    if(!source||!dest||!Number.isInteger(index)||!Number.isInteger(target)||index<0||index>=source.length||target<0||target>=dest.length||!source[index])return false;
    [dest[target],source[index]]=[source[index],dest[target]];return true;
  }
  function validShape(state,heroId){
    if(!state||![1,2,3].includes(state.version)||state.heroId!==heroId||typeof state.name!=='string'||!Number.isSafeInteger(state.level)||state.level<1||!Number.isSafeInteger(state.points)||state.points<0||!Array.isArray(state.upgrades)||state.upgrades.length!==6||state.upgrades.some(v=>!Number.isSafeInteger(v)||v<0)||!Array.isArray(state.items)||!Array.isArray(state.active)||state.active.length!==4||!Array.isArray(state.spellStorage)||state.spellStorage.length!==(state.version===3?30:8)||!Array.isArray(state.learned)||!Number.isSafeInteger(state.learnCredits)||state.learnCredits<0)return false;
    const rawSlots=[...state.active,...state.spellStorage];
    if(rawSlots.some(id=>id!==null&&(typeof id!=='string'||!Object.hasOwn(spellMap,id))))return false;
    const slots=rawSlots.filter(Boolean);
    if(new Set(slots).size!==slots.length||slots.length!==state.learned.length||slots.some(id=>!state.learned.includes(id))||state.learned.some(id=>!Object.hasOwn(spellMap,id))||new Set(state.learned).size!==state.learned.length)return false;
    if(state.items.some(item=>!item||typeof item.defId!=='string'||!Object.hasOwn(itemMap,item.defId)||typeof item.rotated!=='boolean'))return false;
    return true;
  }
  function validRoll(item){
    if(!validForge(item)||!Number.isSafeInteger(quantity(item))||quantity(item)<1||quantity(item)>(isConsumable(item)?999:1))return false;
    if(isConsumable(item))return !!rarityMap[item.rarity]&&item.consumable===true&&potionRestoreMatches(item,Potions.get(item).restore)&&!potionGearKeys.some(k=>k in item)&&Number.isInteger(item.rotation)&&item.rotation>=0&&item.rotation<4&&item.rotated===Boolean(item.rotation%2);
    if(item.elemental&&(!E.property(item)||item.elemental.kind!==(itemMap[item.defId]?.category==='Armor'?'resistance':'damage')))return false;
    if(item.affix){const a=affixMap[item.affix.id];if(!a||!Number.isInteger(item.affix.value)||item.affix.value<a.min||item.affix.value>a.max)return false;}
    const rarity=rarityMap[item.rarity],positive=v=>Number.isSafeInteger(v)&&v>0;
    if(!rarity||!positive(item.iLvl)||!positive(item.requiredLevel)||item.requiredLevel>item.iLvl||item.gearTier!==gearTier(item.requiredLevel)||!Number.isInteger(item.rotation)||item.rotation<0||item.rotation>3||item.rotated!==Boolean(item.rotation%2)||!Array.isArray(item.baseBonus)||item.baseBonus.length!==6||item.baseBonus.some(v=>!Number.isSafeInteger(v)||v<0)||item.baseBonus.reduce((a,b)=>a+b,0)!==item.iLvl+3||!Array.isArray(item.attributes)||item.attributes.length<rarity.range[0]||item.attributes.length>rarity.range[1])return false;
    const validAttribute=a=>a&&Number.isInteger(a.stat)&&a.stat>=0&&a.stat<6&&positive(a.value);
    if(item.attributes.some(a=>!validAttribute(a))||new Set(item.attributes.map(a=>a.stat)).size!==item.attributes.length||!validAttribute(item.enhancement)||item.enhancement.name!==enhancements[item.enhancement.stat])return false;
    return true;
  }
  function validState(state,heroId){
    if(!validShape(state,heroId)||![2,3].includes(state.version)||!Number.isSafeInteger(state.cbg)||state.cbg<0||!state.grids)return false;
    for(const where of ['bag','stash'])if(state.grids[where]?.cols!==6||!Number.isSafeInteger(state.grids[where]?.rows)||state.grids[where].rows<6)return false;
    const seen=new Set();for(const item of state.items){if(!validRoll(item)||typeof item.uid!=='string'||seen.has(item.uid)||!canPlace(state,item,item.where,item.x,item.y,item.rotation))return false;seen.add(item.uid);}return true;
  }
  function migrate(old,heroId,rng=Math.random){
    if(old){old=clone(old);normalizePotions(old);}
    if(validState(old,heroId)){const state=clone(old);state.version=3;state.level=P.clampLevel(state.level);state.totalXp=P.progress(state.totalXp??P.threshold(state.level)).totalXp;state.points=Math.max(0,state.level-1-state.upgrades.reduce((a,b)=>a+b,0));state.spellStorage.push(...Array(30-state.spellStorage.length).fill(null));return state;}
    if(!validShape(old,heroId)||old.version!==1)return null;
    const seen=new Set();for(const item of old.items){if(typeof item.uid!=='string'||seen.has(item.uid)||!canPlace(old,item,item.where,item.x,item.y,item.rotated))return null;seen.add(item.uid);}
    const state={...clone(old),version:3,spellStorage:[...old.spellStorage,...Array(22).fill(null)],grids:{bag:{cols:6,rows:8},stash:{cols:6,rows:11}},cbg:STARTING_CBG,items:[]};
    for(const legacy of old.items){
      const item={...clone(legacy),rotation:legacy.rotated?1:0,...rollItem(itemMap[legacy.defId],state.level,rng,{iLvl:state.level,requiredLevel:state.level,rarity:rarities[Math.min(itemMap[legacy.defId].tier-1,3)].id})};
      let spot=canPlace(state,item,item.where,item.x,item.y,item.rotation)?{x:item.x,y:item.y,rotation:item.rotation}:findSpace(state,item,item.where);
      while(!spot){state.grids[item.where].rows++;spot=findSpace(state,item,item.where);}
      place(state,item,item.where,spot.x,spot.y,spot.rotation);
    }
    return validState(state,heroId)?state:null;
  }
  const api={forgeCost,mergePlan,quantity,consume,stackKey,sameStack,curseNames,curseKeys,forgeText,validForge,potions:Potions,affixes,affixMap,affixText,passives,maxAp,isConsumable,normalizePotions,stats,tiers,types,items,itemMap,spells,spellMap,grids,rarities,rarityMap,enhancements,BAG_PRICE,STARTING_CBG,newState,size,rotationOf,gridFor,gearTier,rollItem,itemBonus,canEquip,canPlace,place,findSpace,collect,rotateItem,addTestGear,autoArrange,buyBag,addTestCBG,bagBonus,spellBonus,totals,applyProgress,gainXp,levelUp,upgrade,learn,moveSpell,validState,migrate};
  root.RPGInventory=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
