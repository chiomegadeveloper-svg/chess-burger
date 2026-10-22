(function () {
  'use strict';
  const C=window.RPGInventory, images=window.RPG_ITEM_IMAGES;
  const el=id=>document.getElementById(id), room=el('hr-room');
  const abbreviations=['HP','ATK','MAG','ARM','MP','WIS'];
  const bonusColors={common:'#c1cbd1',uncommon:'#7ee49a',rare:'#8cbdff',epic:'#ffbd82',mythic:'#d4a5ff',divine:'#f8d879'};
  let hero,state,selectedItem=null,selectedSpell=null,drag=null,ghost=null,preview=null;
  let suppressClickUntil=0,suppressedSource=null,modal=null,returnFocus=null;
  let lastTap=null,tooltipAnchor=null;
  const key=()=>window.RPGLive.key(hero.id);
  const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const bonuses=list=>list.map((value,i)=>value?`+${value} ${C.stats[i]}`:'').filter(Boolean).join(' · ')||'No attribute bonus';
  const itemById=uid=>state.items.find(item=>item.uid===uid);
  const itemName=item=>`${C.itemMap[item.defId].name} of ${item.enhancement.name}${item.sandboxTest?' (Test)':''}`;
  const compactBonuses=list=>list.map((v,i)=>v?`+${v} ${abbreviations[i]}`:'').filter(Boolean).join(' · ');
  function feedback(message){el('hr-feedback').textContent=message;}
  function save(notify=false){
    try{localStorage.setItem(key(),JSON.stringify(state));window.RPGLive.save(state);if(notify)feedback('Saving your hero…');return true;}
    catch(error){feedback('Browser storage is unavailable. Keep this tab open to retain your current room.');return false;}
  }
  function changed(message){render();const saved=save();if(saved&&message)feedback(message);}
  function open(chosen,name){
    hero=chosen;
    try{
      const raw=localStorage.getItem(key()),old=JSON.parse(raw);
      state=C.migrate(old,hero.id)||C.newState(hero.id,name);
      if(raw&&old?.version!==2&&!localStorage.getItem(`${key()}:previous`))localStorage.setItem(`${key()}:previous`,raw);
    }
    catch(error){state=C.newState(hero.id,name);}
    state.name=name;selectedItem=null;selectedSpell=null;lastTap=null;
    document.querySelector('.app').hidden=true;room.hidden=false;
    el('toast').classList.remove('show');
    el('hr-portrait').src=hero.img;el('hr-portrait').alt=`${hero.name}, ${hero.heroClass}, facing right`;
    render();save();el('hr-back').focus();
    feedback('Double-tap items to rotate clockwise. Hover or open Details to inspect them.');
  }
  function renderStats(){
    el('hr-name').textContent=state.name;el('hr-class').textContent=`${hero.name} · ${hero.heroClass}`;
    el('hr-level').textContent=`LV ${state.level}`;
    el('hr-wallet').textContent=`${state.cbg.toLocaleString()} CBG`;
    const progress=window.RPGProgression.progress(state.totalXp??window.RPGProgression.threshold(state.level));el('hr-xp-label').textContent=state.level===88?'LEVEL 88 · MAX':`${progress.xp} / ${progress.nextXp} XP · Level ${state.level+1}`;el('hr-xp').max=progress.nextXp||1;el('hr-xp').value=state.level===88?1:progress.xp;el('hr-levelup').disabled=state.level>=88;
    const totals=C.totals(state,hero.stats),bag=C.bagBonus(state),spells=C.spellBonus(state);
    const equipped=state.items.filter(item=>item.where==='bag'&&C.canEquip(state,item)).map(item=>({item,values:C.itemBonus(item)}));
    el('hr-stats').innerHTML=C.stats.map((name,i)=>{
      const groups=new Map();
      const add=(key,value,source)=>{if(!groups.has(key))groups.set(key,{total:0,sources:[]});const group=groups.get(key);group.total+=value;group.sources.push(`${source}: +${value} ${name}`);};
      for(const {item,values} of equipped)if(values[i])add(item.rarity,values[i],itemName(item));
      for(const id of state.active)if(id&&C.spellMap[id].bonus[i])add('spells',C.spellMap[id].bonus[i],C.spellMap[id].name);
      const parts=[...C.rarities.map(rarity=>rarity.id),'spells'].filter(key=>groups.has(key)).map(key=>{
        const group=groups.get(key),isSpell=key==='spells',label=`${isSpell?'Active spells':C.rarityMap[key].name} · +${group.total} ${name}\n${group.sources.join('\n')}`;
        return `<small class="hr-stat-bonus${isSpell?' hr-stat-spell':''}" ${isSpell?'data-bonus-kind="spells"':`data-bonus-rarity="${key}"`} data-bonus-count="${group.sources.length}" style="--bonus-color:${isSpell?'#65e3eb':bonusColors[key]}" title="${escape(label)}" aria-label="${escape(label)}">+${group.total}</small>`;
      });
      return `<div class="hr-stat" title="${window.RPGProgression.baseStats(state.level)[i]} level base + ${bag[i]} bag + ${spells[i]} active spells"><span>${name}</span><b data-stat="${i}"><span class="hr-stat-total">${totals[i]}</span>${parts.length?`<span class="hr-stat-bonuses" tabindex="0" aria-label="${name} bonuses grouped by color; scroll to see every group">${parts.join('')}</span>`:''}</b><button type="button" data-upgrade="${i}" aria-label="Increase ${name} by one" ${state.points?'':'hidden'}>+</button></div>`;
    }).join('');
    el('hr-points').textContent=state.points?`${state.points} upgrade point${state.points===1?'':'s'}`:'Automatic stat gains every level';
    const remaining=C.spells.length-state.learned.length;
    el('hr-learn').textContent=`Skill Book${state.learnCredits?` (${Math.min(state.learnCredits,remaining)})`:''}`;
    el('hr-learn').disabled=false;
  }
  function renderGrid(where){
    const grid=C.gridFor(state,where),node=el(`hr-${where}`),scroll=node.parentElement.scrollTop;
    node.setAttribute('aria-label',`${where}, ${grid.cols} columns by ${grid.rows} rows`);
    el(`hr-${where}-size`).textContent=`${grid.cols} × ${grid.rows} · ${where==='bag'?'Equipped bonuses':'Storage only'}`;
    node.style.setProperty('--grid-cols',grid.cols);node.style.setProperty('--grid-rows',grid.rows);
    node.style.gridTemplateColumns=`repeat(${grid.cols},minmax(0,1fr))`;
    node.style.gridTemplateRows=`repeat(${grid.rows},minmax(0,1fr))`;
    let html='';
    for(let y=0;y<grid.rows;y++)for(let x=0;x<grid.cols;x++)html+=`<button type="button" class="hr-cell" data-where="${where}" data-x="${x}" data-y="${y}" aria-label="${where} row ${y+1}, column ${x+1}"></button>`;
    let occupied=0;
    for(const item of state.items.filter(i=>i.where===where)){
      const def=C.itemMap[item.defId],size=C.size(def,item.rotation),rarity=C.rarityMap[item.rarity],locked=!C.canEquip(state,item);occupied+=size.w*size.h;
      html+=`<button type="button" class="hr-item rarity-${item.rarity}${item.rotated?' rotated':''}${locked?' level-locked':''}${selectedItem===item.uid?' selected':''}" data-uid="${item.uid}" aria-pressed="${selectedItem===item.uid}" aria-label="${escape(itemName(item))}, ${rarity.name}, item level ${item.iLvl}, requires level ${item.requiredLevel}, ${size.w} by ${size.h} cells, in ${where}" style="--rarity:${rarity.color};--angle:${item.rotation*90}deg;--cols:${size.w};--rows:${size.h};left:${item.x/grid.cols*100}%;top:${item.y/grid.rows*100}%;width:${size.w/grid.cols*100}%;height:${size.h/grid.rows*100}%"><img class="hr-item-img" src="${images[def.sprite]}" alt="" draggable="false"><span class="hr-tier">${item.iLvl}</span>${locked?`<span class="hr-item-lock">L${item.requiredLevel}</span>`:''}</button>`;
    }
    node.innerHTML=html;node.parentElement.scrollTop=scroll;el(`hr-${where}-count`).textContent=`${occupied}/${grid.cols*grid.rows}`;
  }
  let libraryPage=0,previewSkill='basic';
  const skillImage=spell=>`assets/skills/icons/${spell.id}.webp`;
  function renderSpells(){
    el('hr-library-page').textContent=`${libraryPage+1} / 4`;
    el('hr-library-prev').disabled=libraryPage===0;el('hr-library-next').disabled=libraryPage===3;
    el('hr-skill-progress').textContent=`${state.learned.length} / 30 learned · ${state.learned.length===30?'Complete':state.learnCredits?state.learnCredits+' choice(s) ready':'Next choice: level '+(Math.floor(state.level/2)*2+2)}`;
    for(const [zone,ids,node] of [['active',state.active,el('hr-active')],['storage',state.spellStorage,el('hr-spell-storage')]]){
      const start=zone==='storage'?libraryPage*8:0;
      node.innerHTML=ids.slice(start,zone==='storage'?start+8:4).map((id,offset)=>{
        const index=start+offset;
        const spell=C.spellMap[id],chosen=selectedSpell?.zone===zone&&selectedSpell.index===index;
        const icon=spell?`<img src="${skillImage(spell)}" alt="" draggable="false">`:'';
        return `<button type="button" class="hr-spell-slot${spell?' filled':''}${chosen?' selected':''}" data-slot-zone="${zone}" data-slot-index="${index}" aria-pressed="${chosen}" aria-label="${zone==='active'?'Active attack':'Spell storage'} slot ${index+1}: ${spell?spell.name:'empty'}" title="${spell?`${spell.name} · ${spell.ap} AP / ${spell.mp} MP · cooldown ${spell.cooldown} · ${bonuses(spell.bonus)}`:'Empty slot'}">${icon}<span>${index+1}</span></button>`;
      }).join('');
    }
  }
  function renderInspector(){
    const item=itemById(selectedItem),node=el('hr-inspector');
    if(!item){node.innerHTML='<h3>Make room for adventure.</h3><p>Collect equipment, then move it from the stash into your bag.</p><p class="hr-bonus-summary">Select an item to rotate or move it.</p>';return;}
    const def=C.itemMap[item.defId],rarity=C.rarityMap[item.rarity],locked=!C.canEquip(state,item);
    node.innerHTML=`<h3 style="color:${rarity.color}">${def.name}</h3><p>${rarity.name} · iLvl ${item.iLvl} · <span class="${locked?'hr-requirement-locked':''}">Req. L${item.requiredLevel}</span> · T${item.gearTier}</p><p class="hr-bonus-summary">${compactBonuses(C.itemBonus(item))}</p><p>✧ ${escape(item.enhancement.name)} +${item.enhancement.value} ${abbreviations[item.enhancement.stat]} · ${item.where==='bag'?'Active':'Stored'}</p><div class="hr-actions"><button class="hr-btn" type="button" data-item-action="rotate" title="Rotate 90 degrees clockwise">↻ Rotate</button><button class="hr-btn" type="button" data-item-action="transfer" ${item.where==='stash'&&locked?'disabled':''}>To ${item.where==='bag'?'stash':'bag'}</button><button class="hr-btn" type="button" data-item-action="details">Details</button><button class="hr-btn ghost" type="button" data-item-action="discard">Remove</button></div>`;
  }
  function render(){hideTooltip();renderStats();renderGrid('bag');renderGrid('stash');renderSpells();renderInspector();}
  function selectItem(uid){
    selectedItem=uid;selectedSpell=null;
    // Keep the touched element connected throughout the pointer gesture.
    for(const node of room.querySelectorAll('.hr-item')){
      const active=node.dataset.uid===uid;node.classList.toggle('selected',active);node.setAttribute('aria-pressed',String(active));
    }
    renderSpells();renderInspector();
  }
  function rotate(){
    const item=itemById(selectedItem);if(!item)return;
    if(drag?.kind==='item'){
      drag.rotation=(drag.rotation+1)%4;drag.anchorX=0;drag.anchorY=0;
      updateDrag(drag.lastX,drag.lastY);return;
    }
    if(C.rotateItem(state,item))changed('Rotated 90° clockwise. Its bonuses stay the same.');
    else feedback('There is not enough space to rotate here. Move the item into a clear area first.');
  }
  function transfer(){
    const item=itemById(selectedItem);if(!item)return;
    if(item.where==='stash'&&!C.canEquip(state,item)){feedback(`Reach level ${item.requiredLevel} to equip this item.`);return;}
    const where=item.where==='bag'?'stash':'bag',spot=C.findSpace(state,item,where);
    if(!spot){feedback(`Your ${where} has no space for this item. Make room or move it manually.`);return;}
    C.place(state,item,where,spot.x,spot.y,spot.rotation);changed(`Moved to ${where}. ${where==='bag'?'Attribute bonus is now active.':'Attribute bonus removed.'}`);
  }
  function clickSpell(zone,index){
    if(selectedSpell){
      const source=selectedSpell;selectedSpell=null;
      if(source.zone===zone&&source.index===index){renderSpells();return;}
      if(C.moveSpell(state,source.zone,source.index,zone,index))changed('Spell moved. Only active attacks add attributes.');
    }else{
      const list=zone==='active'?state.active:state.spellStorage;
      if(list[index]){selectedSpell={zone,index};selectedItem=null;renderSpells();renderGrid('bag');renderGrid('stash');renderInspector();feedback('Tap another attack or storage slot to move this spell.');}
    }
  }
  function showModal(id){
    hideTooltip();closeModal();returnFocus=document.activeElement;modal=el(id);modal.hidden=false;room.inert=true;el('rpg-world').inert=!el('rpg-world').hidden;
    const first=modal.querySelector('input,button:not([disabled])');first?.focus();
  }
  function closeModal(){if(!modal)return;if(modal.id==='hr-learn-modal')window.RPGSkillFX?.stop(el('hr-skill-fx'));modal.hidden=true;modal=null;room.inert=false;el('rpg-world').inert=false;if(!el('rpg-world').hidden)window.RPGWorld.refresh(hero,state);returnFocus?.focus();returnFocus=null;}
  function renderCatalog(){
    const query=el('hr-search').value.trim().toLowerCase(),category=el('hr-category').value,tier=Number(el('hr-tier-filter').value);
    const defs=C.items.filter(d=>(!query||d.name.toLowerCase().includes(query))&&(!category||d.category===category)&&(!tier||d.tier===tier));
    el('hr-catalog').innerHTML=defs.length?defs.map(def=>`<article class="hr-catalog-card"><img src="${images[def.sprite]}" alt="${def.name}" loading="lazy"><h3>${def.name}</h3><p>${def.w} × ${def.h} tiles · ${def.category}</p><p>Random rarity, item level & enhancement</p><button class="hr-btn" type="button" data-collect="${def.id}">Find → Stash</button></article>`).join(''):'<p class="hr-empty-note">No equipment matches these filters.</p>';
  }
  function playSkillPreview(){
    const spell=C.spellMap[previewSkill];if(!spell)return;
    el('hr-skill-preview-name').textContent=spell.name;
    el('hr-skill-preview-detail').textContent=`${spell.category.toUpperCase()} · ${spell.ap} AP / ${spell.mp} MP · ${spell.cooldown} turn cooldown · ${Math.round(spell.scale*100)}% ${spell.magic?'Magic':'Attack'} + 2 − 15% Armor`;
    window.RPGSkillFX?.play(el('hr-skill-fx'),spell.id,{status:el('hr-skill-fx-status')});
  }
  function renderLearn(){
    const remaining=C.spells.length-state.learned.length;
    el('hr-learn-note').textContent=(state.learnCredits?`${Math.min(state.learnCredits,remaining)} skill choice(s) available. `:`Next skill choice: level ${Math.floor(state.level/2)*2+2}. `)+'Choose one new skill every 2 levels. Learn now or save the choice. Equip in one of 4 active slots; only equipped bonuses count.';
    const category=el('hr-skill-category').value;
    el('hr-learn-list').innerHTML=C.spells.filter(s=>!category||s.category===category).map(spell=>{
      const known=state.learned.includes(spell.id);
      return `<article class="hr-catalog-card hr-skill-card" data-family="${spell.category}"><button type="button" class="hr-skill-art" data-preview-skill="${spell.id}" aria-label="Preview ${spell.name}"><img src="${skillImage(spell)}" alt="" loading="lazy"></button><span class="hr-skill-family">${spell.category}</span><h3>${spell.name}</h3><p>${spell.description}</p><p class="hr-skill-cost">${spell.ap} AP · ${spell.mp} MP · CD ${spell.cooldown}</p><p>${Math.round(spell.scale*100)}% ${spell.magic?'Magic':'Attack'} + 2 − 15% Armor</p><p>${bonuses(spell.bonus)}</p><div class="hr-skill-card-actions"><button type="button" class="hr-btn" data-preview-skill="${spell.id}">Preview</button><button type="button" class="hr-btn primary" data-learn="${spell.id}" ${known||state.level<2||!state.learnCredits?'disabled':''}>${known?'Learned':'Learn '+spell.name}</button></div></article>`;
    }).join('');
    playSkillPreview();
  }
  function description(item){
    const def=C.itemMap[item.defId],rarity=C.rarityMap[item.rarity],size=C.size(def,item.rotation),allowed=C.canEquip(state,item);
    const start=item.gearTier===1?1:(item.gearTier-1)*10,end=item.gearTier*10-1;
    const list=values=>values.map((v,i)=>v?`<li>+${v} ${C.stats[i]}</li>`:'').join('');
    return `<div class="hr-description-head"><img src="${images[def.sprite]}" alt=""><div><span class="hr-rarity-tag" style="--rarity:${rarity.color}">${rarity.name}${item.rarity==='mythic'?' / Legendary':item.rarity==='divine'?' / Artifact':''}</span><h3>${escape(itemName(item))}</h3><p>${def.category} · ${size.w} × ${size.h} tiles</p></div></div><dl class="hr-item-metrics"><div><dt>Item level</dt><dd>${item.iLvl}</dd></div><div><dt>Requires level</dt><dd class="${allowed?'':'hr-requirement-locked'}">${item.requiredLevel}${allowed?'':' · Locked'}</dd></div><div><dt>Gear tier</dt><dd>T${item.gearTier} · L${start}–${end}</dd></div></dl><section><h4>Base attributes · ${item.iLvl+3} power</h4><ul>${list(item.baseBonus)}</ul></section><section class="hr-additional-attributes"><h4>Additional attributes · ${item.attributes.length}</h4>${item.attributes.length?`<ul>${item.attributes.map(a=>`<li>+${a.value} ${C.stats[a.stat]}</li>`).join('')}</ul>`:'<p>Common gear has no rarity bonus attributes.</p>'}</section><section class="hr-enhancement"><h4>One enhancement</h4><p>✧ ${escape(item.enhancement.name)} · +${item.enhancement.value} ${C.stats[item.enhancement.stat]}</p></section><p class="hr-description-total">Total: ${compactBonuses(C.itemBonus(item))}</p><p class="hr-description-status">${item.where==='bag'?'Equipped in bag · All bonuses active.':allowed?'Stored in stash · No bonuses active.':`Stored in stash · Reach level ${item.requiredLevel} to equip.`}</p>`;
  }
  function hideTooltip(){
    if(tooltipAnchor)tooltipAnchor.removeAttribute('aria-describedby');tooltipAnchor=null;
    el('hr-item-tooltip').hidden=true;
  }
  function showTooltip(node){
    if(drag||modal||tooltipAnchor===node)return;
    const item=itemById(node.dataset.uid);if(!item)return;
    hideTooltip();tooltipAnchor=node;node.setAttribute('aria-describedby','hr-item-tooltip');
    const box=el('hr-item-tooltip');box.innerHTML=description(item);box.hidden=false;
    const anchor=node.getBoundingClientRect(),rect=box.getBoundingClientRect();
    const left=anchor.right+12+rect.width<=innerWidth?anchor.right+12:anchor.left-rect.width-12;
    box.style.left=`${Math.max(8,Math.min(left,innerWidth-rect.width-8))}px`;
    box.style.top=`${Math.max(8,Math.min(anchor.top,innerHeight-rect.height-8))}px`;
  }
  function showDetails(){
    const item=itemById(selectedItem);if(!item)return;
    el('hr-details-content').innerHTML=description(item);showModal('hr-details-modal');
  }
  function renderShop(){
    const where=el('hr-shop-destination').value,grid=C.gridFor(state,where),balance=state.cbg;
    el('hr-shop-balance').textContent=`${balance.toLocaleString()} CBG`;
    el('hr-shop-price').textContent=`${C.BAG_PRICE} CBG`;
    el('hr-shop-capacities').innerHTML=['bag','stash'].map(zone=>{const g=C.gridFor(state,zone);return `<div><span>${zone==='bag'?'Hero bag':'Item stash'}</span><strong>${g.cols} × ${g.rows}</strong><small>${g.cols*g.rows} tiles</small></div>`;}).join('');
    el('hr-shop-preview').textContent=`${where==='bag'?'Hero bag':'Item stash'}: ${grid.cols*grid.rows} → ${grid.cols*(grid.rows+1)} tiles (${grid.cols} × ${grid.rows+1})`;
    el('hr-buy-bag').textContent=balance<C.BAG_PRICE?`Need ${C.BAG_PRICE-balance} more CBG`:`Buy +6 ${where} tiles · ${C.BAG_PRICE} CBG`;
    el('hr-buy-bag').disabled=balance<C.BAG_PRICE;
  }
  function clearDrag(){ghost?.remove();preview?.remove();ghost=null;preview=null;drag=null;}
  function candidate(x,y){
    for(const where of ['bag','stash']){
      const node=el(`hr-${where}`),r=node.getBoundingClientRect(),visible=node.parentElement.getBoundingClientRect(),grid=C.gridFor(state,where);
      if(x>=Math.max(r.left,visible.left)&&x<Math.min(r.right,visible.right)&&y>=Math.max(r.top,visible.top)&&y<Math.min(r.bottom,visible.bottom))return {where,x:Math.floor((x-r.left)/r.width*grid.cols)-drag.anchorX,y:Math.floor((y-r.top)/r.height*grid.rows)-drag.anchorY};
    }
    return null;
  }
  function updateDrag(x,y){
    if(!drag)return;drag.lastX=x;drag.lastY=y;
    if(!drag.moved&&Math.hypot(x-drag.startX,y-drag.startY)<6)return;
    drag.moved=true;lastTap=null;
    if(!ghost){ghost=document.createElement('div');ghost.className='hr-drag-ghost';ghost.innerHTML=`<img alt="" src="${drag.image}">`;document.body.appendChild(ghost);}
    if(drag.kind==='item'){
      const item=itemById(drag.uid),def=C.itemMap[item.defId],size=C.size(def,drag.rotation);
      const cell=Math.min(45,el(`hr-${item.where}`).getBoundingClientRect().width/C.gridFor(state,item.where).cols);
      ghost.style.width=`${size.w*cell}px`;ghost.style.height=`${size.h*cell}px`;
      const image=ghost.querySelector('img');
      image.style.width=drag.rotation%2?`${90*size.h/size.w}%`:'90%';image.style.height=drag.rotation%2?`${90*size.w/size.h}%`:'90%';
      image.style.transform=`rotate(${drag.rotation*90}deg)`;
      drag.target=candidate(x,y);preview?.remove();preview=null;
      if(drag.target){
        const target=drag.target,grid=C.gridFor(state,target.where),valid=C.canPlace(state,item,target.where,target.x,target.y,drag.rotation);
        preview=document.createElement('div');preview.className=`hr-placement${valid?'':' invalid'}`;
        Object.assign(preview.style,{left:`${target.x/grid.cols*100}%`,top:`${target.y/grid.rows*100}%`,width:`${size.w/grid.cols*100}%`,height:`${size.h/grid.rows*100}%`});
        el(`hr-${target.where}`).appendChild(preview);
      }
    }else{ghost.style.width='54px';ghost.style.height='54px';}
    ghost.style.left=`${x+10}px`;ghost.style.top=`${y+10}px`;
  }
  room.addEventListener('pointerdown',event=>{
    if(event.button!==0)return;
    hideTooltip();
    const itemNode=event.target.closest('.hr-item'),spellNode=event.target.closest('.hr-spell-slot.filled');
    if(!itemNode&&!spellNode)return;
    const r=(itemNode||spellNode).getBoundingClientRect();
    if(itemNode){
      const item=itemById(itemNode.dataset.uid),def=C.itemMap[item.defId],size=C.size(def,item.rotation);
      selectItem(item.uid);
      drag={kind:'item',uid:item.uid,rotation:item.rotation,image:images[def.sprite],anchorX:Math.min(size.w-1,Math.floor((event.clientX-r.left)/r.width*size.w)),anchorY:Math.min(size.h-1,Math.floor((event.clientY-r.top)/r.height*size.h))};
    }else{
      const zone=spellNode.dataset.slotZone,index=Number(spellNode.dataset.slotIndex),id=(zone==='active'?state.active:state.spellStorage)[index];
      drag={kind:'spell',zone,index,image:skillImage(C.spellMap[id])};
    }
    Object.assign(drag,{startX:event.clientX,startY:event.clientY,lastX:event.clientX,lastY:event.clientY,pointerId:event.pointerId,moved:false});
    room.setPointerCapture(event.pointerId);
    // touch-action:none on items/slots handles touch scrolling without suppressing
    // the browser's following tap after a drag.
    if(event.pointerType!=='touch')event.preventDefault();
  });
  room.addEventListener('pointermove',event=>{if(drag&&event.pointerId===drag.pointerId)updateDrag(event.clientX,event.clientY);});
  room.addEventListener('pointerup',event=>{
    if(!drag||event.pointerId!==drag.pointerId)return;
    const current=drag;
    const finish=action=>event.pointerType==='touch'?requestAnimationFrame(action):action();
    suppressedSource=current;
    if(current.moved){
      suppressClickUntil=Date.now()+300;
      if(current.kind==='item'){
        const target=current.target,item=itemById(current.uid);
        const success=target&&C.place(state,item,target.where,target.x,target.y,current.rotation);
        clearDrag();if(success)finish(()=>changed(`Item moved to ${target.where}.`));else feedback(target?.where==='bag'&&!C.canEquip(state,item)?`Reach level ${item.requiredLevel} to equip this item.`:'That space is blocked or outside the grid. Your item stays in its original position.');
      }else{
        const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('.hr-spell-slot');
        clearDrag();
        if(target&&C.moveSpell(state,current.zone,current.index,target.dataset.slotZone,Number(target.dataset.slotIndex))){selectedSpell=null;finish(()=>changed('Spell moved. Only active attacks add attributes.'));}
      }
    }else{
      clearDrag();suppressClickUntil=Date.now()+300;
      if(current.kind==='spell')finish(()=>clickSpell(current.zone,current.index));
      else finish(()=>{
        const now=Date.now();
        if(lastTap?.uid===current.uid&&now-lastTap.time<=340){lastTap=null;selectedItem=current.uid;rotate();}
        else lastTap={uid:current.uid,time:now};
      });
    }
    if(room.hasPointerCapture(event.pointerId))room.releasePointerCapture(event.pointerId);
  });
  room.addEventListener('pointercancel',clearDrag);
  room.addEventListener('dragstart',event=>event.preventDefault());
  room.addEventListener('click',event=>{
    const arrange=event.target.closest('[data-arrange]');
    if(arrange){
      const where=arrange.dataset.arrange;clearDrag();lastTap=null;
      if(C.autoArrange(state,where))changed(`${where==='bag'?'Hero bag':'Item stash'} ${state.items.some(item=>item.where===where)?'arranged':'is empty'}.`);
      else feedback('Unable to arrange these items. Your layout is unchanged.');
      return;
    }
    const item=event.target.closest('[data-uid]'),cell=event.target.closest('.hr-cell'),spell=event.target.closest('.hr-spell-slot');
    if(Date.now()<suppressClickUntil){
      suppressClickUntil=0;
      if((suppressedSource?.moved&&(item||cell||spell))||(item&&suppressedSource?.uid===item.dataset.uid)||(spell&&suppressedSource?.zone===spell.dataset.slotZone&&suppressedSource?.index===Number(spell.dataset.slotIndex)))return;
    }
    if(item){selectItem(item.dataset.uid);return;}
    if(cell&&selectedItem){
      const selected=itemById(selectedItem),where=cell.dataset.where;
      if(C.place(state,selected,where,Number(cell.dataset.x),Number(cell.dataset.y),selected.rotation))changed(`Item placed in ${where}.`);
      else feedback(where==='bag'&&!C.canEquip(state,selected)?`Reach level ${selected.requiredLevel} to equip this item.`:'The item does not fit there. Choose an empty area or rotate it.');
    }
    if(spell)clickSpell(spell.dataset.slotZone,Number(spell.dataset.slotIndex));
    const upgrade=event.target.closest('[data-upgrade]');
    if(upgrade&&C.upgrade(state,Number(upgrade.dataset.upgrade)))changed(`${C.stats[Number(upgrade.dataset.upgrade)]} increased by 1.`);
    const action=event.target.closest('[data-item-action]')?.dataset.itemAction;
    if(action==='rotate')rotate();
    if(action==='transfer')transfer();
    if(action==='details')showDetails();
    if(action==='discard'){state.items=state.items.filter(i=>i.uid!==selectedItem);selectedItem=null;changed('Item removed.');}
  });
  room.addEventListener('pointerover',event=>{if(event.pointerType==='mouse'){const node=event.target.closest('.hr-item');if(node)showTooltip(node);}});
  room.addEventListener('pointerout',event=>{if(tooltipAnchor&&!tooltipAnchor.contains(event.relatedTarget))hideTooltip();});
  room.addEventListener('focusin',event=>{const node=event.target.closest('.hr-item');if(node)showTooltip(node);});
  room.addEventListener('focusout',hideTooltip);
  room.addEventListener('dblclick',event=>{if(event.target.closest('.hr-item'))event.preventDefault();});
  window.addEventListener('resize',hideTooltip);document.addEventListener('scroll',hideTooltip,true);
  el('hr-back').addEventListener('click',()=>{save();hideTooltip();clearDrag();room.hidden=true;document.querySelector('.app').hidden=false;el('saveBtn').focus();});
  el('hr-save').addEventListener('click',()=>save(true));
  el('hr-collect').addEventListener('click',()=>{renderCatalog();showModal('hr-catalog-modal');});
  el('hr-explore').addEventListener('click',()=>{clearDrag();save();window.RPGWorld.open(hero,state);});
  el('hr-damage').addEventListener('click',()=>{clearDrag();lastTap=null;window.DamageSprites.open(hero.id);showModal('hr-damage-modal');});
  el('hr-book').addEventListener('click',()=>{clearDrag();lastTap=null;window.BabaylanBook.open();showModal('hr-book-modal');});
  el('hr-catalog-modal').addEventListener('click',event=>{
    const rarity=event.target.closest('[data-test-rarity]')?.dataset.testRarity;if(!rarity)return;
    const requested=rarity==='all'?['epic','mythic','divine']:[rarity],created=C.addTestGear(state,requested);
    if(!created){el('hr-frame-test-status').textContent='Not enough room in your bag. Auto-arrange, move items to the stash, or expand the bag, then try again.';return;}
    selectedItem=created[0].uid;selectedSpell=null;lastTap=null;closeModal();
    changed(`${requested.map(id=>C.rarityMap[id].name).join(', ')} test armor added to your bag. Select it and use Remove when finished.`);
    const item=el('hr-bag').querySelector(`[data-uid="${created[0].uid}"]`);item?.scrollIntoView?.({block:'nearest',inline:'nearest'});
  });
  el('hr-shop').addEventListener('click',()=>{renderShop();el('hr-shop-status').textContent='Each purchase adds 6 tiles to your chosen inventory.';showModal('hr-shop-modal');});
  el('hr-shop-destination').addEventListener('change',renderShop);
  el('hr-buy-bag').addEventListener('click',()=>{
    const where=el('hr-shop-destination').value;
    if(C.buyBag(state,where)){changed(`Purchased 6 new ${where} tiles for ${C.BAG_PRICE} CBG.`);renderShop();el('hr-shop-status').textContent=`${where==='bag'?'Hero bag':'Item stash'} expanded by 6 tiles. Purchase saved.`;}
  });
  el('hr-test-cbg').addEventListener('click',()=>{if(C.addTestCBG(state)){changed('Added 100 sandbox CBG.');renderShop();el('hr-shop-status').textContent='100 test CBG added to this local hero.';}});
  el('hr-levelup').addEventListener('click',()=>{if(!C.levelUp(state))return;changed(`Practice level ${state.level}! Base attributes increased automatically. Online XP stays separate.`);if(state.level%2===0&&state.learnCredits&&state.learned.length<C.spells.length){renderLearn();showModal('hr-learn-modal');playSkillPreview();}});
  el('hr-learn').addEventListener('click',()=>{renderLearn();showModal('hr-learn-modal');playSkillPreview();});
  for(const id of ['hr-search','hr-category','hr-tier-filter'])el(id).addEventListener(id==='hr-search'?'input':'change',renderCatalog);
  el('hr-catalog').addEventListener('click',event=>{
    const id=event.target.closest('[data-collect]')?.dataset.collect;if(!id)return;
    const item=C.collect(state,id);
    el('hr-catalog-status').textContent=item?`${C.rarityMap[item.rarity].name} · ${itemName(item)} · iLvl ${item.iLvl} · Requires L${item.requiredLevel}`:'Your stash is full. Expand it in RPG Shop or move items to make room.';
    if(item){selectedItem=item.uid;selectedSpell=null;changed(`Found ${C.rarityMap[item.rarity].name} gear. ${C.canEquip(state,item)?'Move it into your bag to use it.':`Reach level ${item.requiredLevel} to equip it.`}`);}
  });
  el('hr-library-prev').addEventListener('click',()=>{libraryPage=Math.max(0,libraryPage-1);renderSpells();});
  el('hr-library-next').addEventListener('click',()=>{libraryPage=Math.min(3,libraryPage+1);renderSpells();});
  el('hr-skill-category').addEventListener('change',renderLearn);
  el('hr-skill-replay').addEventListener('click',playSkillPreview);
  el('hr-learn-list').addEventListener('click',event=>{
    const preview=event.target.closest('[data-preview-skill]')?.dataset.previewSkill;if(preview){previewSkill=preview;playSkillPreview();return;}
    const id=event.target.closest('[data-learn]')?.dataset.learn;if(!id)return;
    if(C.learn(state,id)){closeModal();changed(`${C.spellMap[id].name} learned! It is in spell storage. Move it to an active slot to gain its bonus.`);}
  });
  for(const node of document.querySelectorAll('.hr-modal'))node.addEventListener('click',event=>{if(event.target===node||event.target.closest('[data-close-modal]'))closeModal();});
  // Activate touch controls on release and ignore the duplicate browser click.
  // This also keeps the first control tap after a drag reliable on mobile.
  let touchButton=null,blockedTouchClick=null;
  document.addEventListener('pointerdown',event=>{
    if(event.pointerType!=='touch'||!event.isPrimary)return;
    const button=event.target.closest('button');
    if(!button||button.disabled||!button.closest('.hero-room,.hr-modal')||button.matches('.hr-item,.hr-spell-slot.filled'))return;
    touchButton={button,id:event.pointerId,x:event.clientX,y:event.clientY};
  },true);
  document.addEventListener('pointercancel',()=>{touchButton=null;},true);
  document.addEventListener('pointerup',event=>{
    if(!touchButton||touchButton.id!==event.pointerId)return;
    const tap=touchButton;touchButton=null;
    if(event.target.closest('button')!==tap.button||Math.hypot(event.clientX-tap.x,event.clientY-tap.y)>10)return;
    blockedTouchClick={button:tap.button,until:Date.now()+500};
    requestAnimationFrame(()=>{if(tap.button.isConnected&&!tap.button.disabled){suppressClickUntil=0;tap.button.focus({preventScroll:true});tap.button.click();}});
  },true);
  document.addEventListener('click',event=>{
    if(event.isTrusted&&blockedTouchClick&&Date.now()<blockedTouchClick.until&&event.target.closest('button')===blockedTouchClick.button){event.preventDefault();event.stopImmediatePropagation();}
  },true);
  document.addEventListener('keydown',event=>{
    if(room.hidden&&el('rpg-world').hidden)return;
    if(event.key==='Escape'){if(modal)closeModal();else{clearDrag();selectedItem=null;selectedSpell=null;render();}return;}
    if(modal&&event.key==='Tab'){
      const nodes=[...modal.querySelectorAll('button:not([disabled]),input,select')].filter(n=>n.offsetParent!==null),first=nodes[0],last=nodes.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    }
    if(!modal&&room.hidden)return;
    if(!modal&&event.key.toLowerCase()==='r'&&!event.ctrlKey&&!event.metaKey&&event.target.tagName!=='INPUT'){event.preventDefault();rotate();}
  });
  for(const node of document.querySelectorAll('[data-room-icon]'))node.src=images[node.dataset.roomIcon];
  el('hr-rarity-legend').innerHTML=C.rarities.map(r=>`<span class="hr-rarity-tag" style="--rarity:${r.color}">${r.name} <small>${r.range[0]===r.range[1]?r.range[0]:r.range.join('–')} bonus</small></span>`).join('');
  window.RPGRoom={persist:save,open,refresh:render,utility(kind){if(kind==='book'){window.BabaylanBook.open();showModal('hr-book-modal');}if(kind==='shop'){renderShop();el('hr-shop-status').textContent='Each purchase adds 6 tiles to your chosen inventory.';showModal('hr-shop-modal');}}};
  el('saveBtn').addEventListener('click',()=>{const name=el('heroName').value.trim();if(name.length>=2)open(selected,name);});
})();
