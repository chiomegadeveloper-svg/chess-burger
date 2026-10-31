(function () {
  'use strict';
  const C=window.RPGInventory, images=window.RPG_ITEM_IMAGES;
  const el=id=>document.getElementById(id), room=el('hr-room');
  const abbreviations=['HP','ATK','MAG','ARM','MP','WIS'];
  const bonusColors={common:'#c1cbd1',uncommon:'#7ee49a',rare:'#8cbdff',epic:'#ffbd82',mythic:'#d4a5ff',divine:'#f8d879'};
  let hero,state,selectedItem=null,selectedSpell=null,drag=null,ghost=null,preview=null;
  const mergeSelection=new Set();
  let suppressClickUntil=0,suppressedSource=null,modal=null,returnFocus=null;
  let lastTap=null,tooltipAnchor=null,consumeBusy=false;
  const transferId=()=>{if(crypto.randomUUID)return crypto.randomUUID();const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=bytes[6]&15|64;bytes[8]=bytes[8]&63|128;const h=[...bytes].map(n=>n.toString(16).padStart(2,'0')).join('');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;};
  const key=()=>window.RPGLive.key(hero.id);
  const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const bonuses=list=>list.map((value,i)=>value?`+${value} ${C.stats[i]}`:'').filter(Boolean).join(' · ')||'No attribute bonus';
  let guildData={guild:null,revision:0,items:[],cbg:0,cbgReady:false,cols:12,rows:12},guildLoaded=false,guildLoading=false,guildBusy=false,guildConnected=false,guildEpoch=0,guildPreview=null;
  const itemById=uid=>state.items.find(item=>item.uid===uid)||guildData.items.find(item=>item.uid===uid);
  const roomGrid=where=>where==='guild'?{cols:12,rows:12}:C.gridFor(state,where);
  const guildLayout=()=>({...state,grids:{...state.grids,stash:{cols:12,rows:12}},items:guildData.items.map(item=>({...item,where:'stash'}))});
  const canPlace=(item,where,x,y,rotation)=>where==='guild'?!!guildData.guild&&!guildBusy&&C.canPlace(guildLayout(),item,'stash',x,y,rotation):(C.canPlace(state,item,where,x,y,rotation)||state.items.some(i=>i.uid!==item.uid&&i.where===where&&i.x===x&&i.y===y&&C.sameStack(i,item)&&C.quantity(i)+C.quantity(item)<=999));
  function fitGrids(){if(!state)return;for(const where of ['bag','stash','guild']){const node=el('hr-'+where),wrap=node.parentElement,grid=roomGrid(where),w=wrap.clientWidth-14,h=wrap.clientHeight-14;if(w<=0||h<=0)continue;const cell=Math.min((w-2)/grid.cols,(h-2)/grid.rows),width=Math.floor(cell*grid.cols)+2;node.style.width=width+'px';node.style.height=((width-2)*grid.rows/grid.cols+2)+'px';}}
  function showView(view){hideTooltip();clearDrag();mergeSelection.clear();for(const node of room.querySelectorAll('.hr-item.selected')){node.classList.remove('selected');node.setAttribute('aria-pressed','false');}selectedItem=null;selectedSpell=null;room.dataset.view=view;feedback('');el('hr-character-page').hidden=view!=='hero';el('hr-inventory-page').hidden=view!=='inventory';el('hr-view-title').textContent=view==='hero'?'Hero Room':'Hero Inventory';room.setAttribute('aria-label',el('hr-view-title').textContent);renderInspector();fitGrids();requestAnimationFrame(fitGrids);if(view==='inventory')void loadGuild();}
  async function guildApi(body){const response=await fetch('/api/battle',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),data=await response.json();if(!response.ok)throw Object.assign(Error(data.error||'Guild stash is unavailable.'),{status:response.status,code:data.code});if(data.guildStash)C.normalizePotions(data.guildStash);return data;}
  function guildStatus(text,retry=false){el('hi-guild-state').hidden=!text;el('hi-guild-message').textContent=text;el('hi-guild-retry').hidden=!retry;el('hr-guild').setAttribute('aria-disabled',String(!!text));}
  async function loadGuild(){
    if(guildLoading||guildBusy||!state)return;
    const epoch=guildEpoch;guildLoading=true;if(!guildLoaded)guildStatus('Loading your guild…');
    try{
      const data=await guildApi({action:'guildStash'});if(guildBusy||epoch!==guildEpoch)return;
      const next=data.guildStash,changed=!guildLoaded||guildData.revision!==next.revision||guildData.guild?.id!==next.guild?.id||guildData.guild?.name!==next.guild?.name;
      guildData=next;guildConnected=true;walletCbg=data.walletCbg??walletCbg;guildLoaded=true;renderGuildCbg();
      if(changed){renderGrid('guild');renderInspector();}guildStatus(guildData.guild?'':'Join a Chess Burger guild to use shared storage.');
    }catch(error){if(epoch!==guildEpoch||guildBusy)return;guildConnected=false;renderGuildCbg();guildStatus(error.message,error.code!=='guild_setup_required');}
    finally{guildLoading=false;requestAnimationFrame(fitGrids);}
  }
  function previewGuildMove(item,to,x,y,rotation){
    const next=structuredClone(state),items=structuredClone(guildData.items),copy=structuredClone(item);
    if(to==='guild'){
      const layout={...next,grids:{...next.grids,stash:{cols:12,rows:12}},items:items.map(i=>({...i,where:'stash'}))};
      if(!C.canPlace(layout,copy,'stash',x,y,rotation))return null;
      const placed={...copy,where:'guild',x,y,rotation,rotated:Boolean(rotation%2)},index=items.findIndex(i=>i.uid===copy.uid);
      if(index<0)items.push(placed);else items[index]=placed;
      if(item.where!=='guild')next.items=next.items.filter(i=>i.uid!==item.uid);
    }else{
      if(!C.place(next,copy,to,x,y,rotation))return null;
      const index=items.findIndex(i=>i.uid===copy.uid);if(index<0)return null;items.splice(index,1);
    }
    return {state:next,items,uid:item.uid};
  }
  function setGuildMoving(moving){
    guildBusy=moving;room.classList.toggle('hr-guild-moving',moving);
    el('hr-inventory-page').setAttribute('aria-busy',String(moving));
    for(const node of room.querySelectorAll('.hi-main,.hi-inspector,.hr-attributes-panel,.hr-active-section,.hr-storage-top,.hr-storage-slots'))node.inert=moving;
    for(const id of ['hr-explore','hi-explore','hr-back'])el(id).disabled=moving;
    renderGuildCbg();
  }
  async function refreshTransferState(){
    const [fresh,shared]=await Promise.all([guildApi({action:'init'}),guildApi({action:'guildStash'})]);
    if(!fresh.game)throw Error('Reopen RPG to load your hero.');
    Object.assign(state,fresh.game);localStorage.setItem(key(),JSON.stringify(state));
    guildData=shared.guildStash;walletCbg=shared.walletCbg??walletCbg;
  }
  async function guildTransfer(item,to,x,y,rotation=item.rotation){
    if(guildBusy||consumeBusy)return;if(!guildData.guild){feedback('Join a Chess Burger guild to use shared storage.');return;}
    if(to==='bag'&&!C.canEquip(state,item)){feedback(`Reach level ${item.requiredLevel} to equip this item. You can withdraw it to Hero Stash instead.`);return;}
    const preview=previewGuildMove(item,to,x,y,rotation);if(!preview){feedback('The item does not fit there. Choose an empty area.');return;}
    const body={action:'guildTransfer',guildId:guildData.guild.id,requestId:transferId(),uid:item.uid,from:item.where,to,x,y,rotation,stashRevision:guildData.revision,inventoryRevision:state.inventoryRevision||0};
    guildEpoch++;guildPreview=preview;hideTooltip();selectedItem=null;setGuildMoving(true);
    for(const where of ['bag','stash','guild'])renderGrid(where);renderInspector();feedback('Moving item…');
    try{
      if(await window.RPGLive.flush?.()===false)throw Error('Your inventory is still saving. Reconnect and retry.');
      let data;
      for(let attempt=0;attempt<2;attempt++){
        try{data=await guildApi(body);break;}
        catch(error){
          if(attempt||error.status!==409||!/(?:This inventory changed|Your inventory changed|Your game changed in another window)/i.test(error.message))throw error;
          await refreshTransferState();
          if(guildData.guild?.id!==body.guildId)throw Error('Your guild changed. Reopen Inventory before transferring.');
          const source=body.from==='guild'?guildData.items:state.items,current=source.find(i=>i.uid===body.uid&&i.where===body.from);
          if(!current)throw Error('This item has already moved. Choose another item.');
          if(to==='bag'&&!C.canEquip(state,current))throw Error(`Reach level ${current.requiredLevel} to equip this item. You can withdraw it to Hero Stash instead.`);
          guildPreview=previewGuildMove(current,to,x,y,rotation);
          if(!guildPreview)throw Error('That space is no longer available. Choose an empty area and retry.');
          body.stashRevision=guildData.revision;body.inventoryRevision=state.inventoryRevision||0;
          for(const where of ['bag','stash','guild'])renderGrid(where);renderInspector();feedback('Guild inventory updated. Retrying your transfer…');
        }
      }
      guildPreview=null;guildData=data.guildStash;Object.assign(state,data.game);
      localStorage.setItem(key(),JSON.stringify(state));render();feedback(to==='guild'?'Item placed in the shared guild stash.':'Item moved to your '+(to==='bag'?'Hero Bag.':'Hero Stash.'));
    }catch(error){
      guildPreview=null;render();feedback(error.message);
      try{
        await refreshTransferState();render();
      }catch{}
    }finally{guildPreview=null;setGuildMoving(false);}
  }
  async function arrangeGuild(){
    if(guildBusy||consumeBusy||!guildConnected||!guildData.guild||!guildData.items.length)return;
    const guildId=guildData.guild.id,requestId=transferId();guildEpoch++;hideTooltip();setGuildMoving(true);feedback('Arranging guild stash…');
    try{
      if(await window.RPGLive.flush?.()===false)throw Error('Your inventory is still saving. Reconnect and retry.');
      let data;
      for(let attempt=0;attempt<2;attempt++){
        try{data=await guildApi({action:'guildArrange',guildId,requestId,stashRevision:guildData.revision,inventoryRevision:state.inventoryRevision||0});break;}
        catch(error){
          if(attempt||error.status!==409||!/(?:This inventory changed|Your inventory changed|Your game changed in another window)/i.test(error.message))throw error;
          await refreshTransferState();if(guildData.guild?.id!==guildId)throw Error('Your guild changed. Reopen Inventory before arranging.');
        }
      }
      guildData=data.guildStash;Object.assign(state,data.game);localStorage.setItem(key(),JSON.stringify(state));render();feedback('Guild stash arranged.');
    }catch(error){
      try{await refreshTransferState();render();}catch{}
      feedback(error.message);
    }finally{setGuildMoving(false);}
  }
  function guildDestination(to){const item=itemById(selectedItem);if(!item)return;if(to==='bag'&&!C.canEquip(state,item)){feedback(`Reach level ${item.requiredLevel} to equip this item. You can withdraw it to Hero Stash instead.`);return;}const layout=to==='guild'?guildLayout():state,spot=C.findSpace(layout,item,to==='guild'?'stash':to);if(!spot){feedback('There is no room for this item in '+(to==='guild'?'the Guild Stash.':to==='bag'?'your Hero Bag.':'your Hero Stash.'));return;}void guildTransfer(item,to,spot.x,spot.y,spot.rotation);}
  setInterval(()=>{if(!room.hidden&&room.dataset.view==='inventory'&&!document.hidden&&!drag)void loadGuild();},8000);
  el('hr-inventory-open').onclick=()=>showView('inventory');el('hi-hero-room').onclick=()=>showView('hero');el('hi-explore').onclick=()=>el('hr-explore').click();el('hi-guild-retry').onclick=()=>void loadGuild();
  window.addEventListener('resize',fitGrids);if(typeof ResizeObserver!=='undefined'){const observer=new ResizeObserver(fitGrids);for(const node of document.querySelectorAll('.hi-main .hr-grid-wrap'))observer.observe(node);}

  let walletCbg=0,cbgDirection='deposit',cbgSending=false,cbgPending=null;
  const cbgKey=()=>key()+':guild-cbg-pending';
  function readPendingCbg(){try{const value=JSON.parse(localStorage.getItem(cbgKey())||'null');if(value?.guildId===guildData.guild?.id&&['deposit','withdraw'].includes(value.direction)&&Number.isSafeInteger(value.amount)&&value.amount>0&&value.amount<=1000000&&typeof value.requestId==='string')return value;localStorage.removeItem(cbgKey());}catch{}return null;}
  function renderGuildCbg(){el('hr-arrange-guild').disabled=!guildLoaded||!guildConnected||!guildData.guild||guildBusy||!guildData.items.length;const enabled=!!guildData.guild&&guildData.cbgReady!==false&&guildConnected;const balance=Number(guildData.cbg||0),pending=hero?readPendingCbg():null;el('hi-cbg-balance').textContent=enabled?(balance>=1000000?new Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:2}).format(balance):balance.toLocaleString()):'—';el('hi-cbg-balance').title=enabled?balance.toLocaleString()+' CBG':'Shared CBG is not enabled yet';el('hi-cbg-balance').setAttribute('aria-label',enabled?'Shared CBG: '+balance:'Shared CBG unavailable');el('hi-cbg-deposit').disabled=!enabled||guildBusy||walletCbg<1&&pending?.direction!=='deposit';el('hi-cbg-withdraw').disabled=!enabled||guildBusy||balance<1&&pending?.direction!=='withdraw';if(el('hi-cbg-modal').open)updateCbgForm();}
  function updateCbgForm(){const input=el('hi-cbg-amount'),amount=Number(input.value),available=cbgDirection==='deposit'?walletCbg:Number(guildData.cbg||0),retry=!!cbgPending;el('hi-cbg-wallet').textContent=walletCbg.toLocaleString()+' CBG';el('hi-cbg-shared').textContent=Number(guildData.cbg||0).toLocaleString()+' CBG';input.max=String(retry?1000000:Math.min(1000000,available));input.readOnly=retry;input.disabled=cbgSending;const valid=Number.isSafeInteger(amount)&&amount>=1&&amount<=1000000&&(retry||amount<=available);el('hi-cbg-confirm').disabled=cbgSending||!valid||!guildData.guild||guildData.cbgReady===false||!guildConnected&&!retry;el('hi-cbg-confirm').textContent=cbgSending?'Transferring…':retry?'Retry transfer':(cbgDirection==='deposit'?'Deposit ':'Withdraw ')+(valid?amount.toLocaleString()+' CBG':'CBG');el('hi-cbg-cancel').disabled=cbgSending;el('hi-cbg-close').disabled=cbgSending;}
  async function openCbg(direction){if(guildBusy||!guildData.guild)return;await loadGuild();if(!guildData.guild||guildData.cbgReady===false||!guildConnected)return;cbgPending=readPendingCbg();cbgDirection=cbgPending?.direction||direction;el('hi-cbg-title').textContent=(cbgDirection==='deposit'?'Deposit':'Withdraw')+' CBG';el('hi-cbg-amount').value=String(cbgPending?.amount||1);el('hi-cbg-status').textContent=cbgPending?'The previous transfer was not confirmed. Retry it to check the result.':'';updateCbgForm();el('hi-cbg-modal').showModal();el('hi-cbg-amount').focus();}
  function closeCbg(){if(!cbgSending)el('hi-cbg-modal').close();}
  el('hi-cbg-deposit').onclick=()=>void openCbg('deposit');el('hi-cbg-withdraw').onclick=()=>void openCbg('withdraw');el('hi-cbg-amount').oninput=updateCbgForm;el('hi-cbg-cancel').onclick=closeCbg;el('hi-cbg-close').onclick=closeCbg;el('hi-cbg-modal').addEventListener('cancel',event=>{if(cbgSending)event.preventDefault();});
  el('hi-cbg-form').onsubmit=async event=>{event.preventDefault();if(cbgSending||guildBusy||el('hi-cbg-confirm').disabled)return;const amount=Number(el('hi-cbg-amount').value);if(!Number.isSafeInteger(amount)||amount<1||amount>1000000)return;const attempt=cbgPending||{requestId:transferId(),guildId:guildData.guild.id,direction:cbgDirection,amount};try{localStorage.setItem(cbgKey(),JSON.stringify(attempt));}catch{el('hi-cbg-status').textContent='Storage is unavailable. Reopen RPG before transferring CBG.';return;}cbgPending=attempt;cbgSending=true;guildBusy=true;guildEpoch++;updateCbgForm();el('hi-cbg-status').textContent='Transferring CBG…';try{if(await window.RPGLive.flush?.()===false)throw Error('Your inventory is still saving. Reconnect and retry.');const data=await guildApi({action:'guildCbg',...attempt});guildData=data.guildStash;walletCbg=data.walletCbg;Object.assign(state,data.game);localStorage.setItem(key(),JSON.stringify(state));localStorage.removeItem(cbgKey());cbgPending=null;render();renderGuildCbg();window.parent.postMessage({type:'CB_RPG_WALLET_CHANGED'},location.origin);el('hi-cbg-modal').close();feedback((cbgDirection==='deposit'?'Deposited ':'Withdrew ')+amount.toLocaleString()+' CBG.');}catch(error){if(error.status>=400&&error.status<500){localStorage.removeItem(cbgKey());cbgPending=null;}el('hi-cbg-status').textContent=error.message;feedback(error.message);}finally{cbgSending=false;guildBusy=false;updateCbgForm();renderGuildCbg();void loadGuild();}};
  const itemName=item=>`${C.itemMap[item.defId].name}${C.isConsumable(item)?'':' of '+item.enhancement.name}${item.sandboxTest?' (Test)':''}`;
  const compactBonuses=list=>list.map((v,i)=>v?`+${v} ${abbreviations[i]}`:'').filter(Boolean).join(' · ');
  function feedback(message){el('hr-feedback').textContent=message;el('hr-feedback').title=message;}
  function save(notify=false){
    if(guildBusy)return true;
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
    state.name=name;selectedItem=null;selectedSpell=null;lastTap=null;mergeSelection.clear();
    document.querySelector('.app').hidden=true;room.hidden=false;
    el('toast').classList.remove('show');
    el('hr-portrait').src=`assets/heroes/${hero.id}-right.webp`;el('hr-portrait').alt=`${hero.name}, ${hero.heroClass}, full-body hero facing right`;
    render();showView('hero');save();el('hr-back').focus();
    feedback('');
  }
  function renderStats(){
    el('hr-name').textContent=state.name;el('hr-class').textContent=`${hero.name} · ${hero.heroClass} · ${window.RPGElements.label(window.RPGElements.affinity(hero.id))}`;
    el('hr-level').textContent=`LV ${state.level}`;
    el('hr-wallet').textContent=`${state.cbg.toLocaleString()} CBG`;
    const progress=window.RPGProgression.progress(state.totalXp??window.RPGProgression.threshold(state.level)),xpMax=progress.nextXp||1,xpValue=state.level===88?1:progress.xp,xpPercent=Math.round(xpValue/xpMax*100);el('hr-xp-label').textContent=state.level===88?'LEVEL 88 · MAX':`${progress.xp} / ${progress.nextXp} XP · Level ${state.level+1}`;el('hr-xp').max=xpMax;el('hr-xp').value=xpValue;el('hr-xp').setAttribute('aria-valuetext',state.level===88?'Level 88, maximum level':`${progress.xp} of ${progress.nextXp} XP, ${xpPercent}% to level ${state.level+1}`);el('hr-xp').parentElement.style.setProperty('--fill',`${xpValue/xpMax*100}%`);el('hr-xp-percent').textContent=`${xpPercent}%`;el('hr-levelup').disabled=state.level>=88;
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
      return `<div class="hr-stat" role="group" aria-label="${name}: ${totals[i]}" title="${window.RPGProgression.baseStats(state.level)[i]} level base + ${bag[i]} bag + ${spells[i]} active spells"><span>${name}</span><b data-stat="${i}"><span class="hr-stat-total">${totals[i]}</span>${parts.length?`<span class="hr-stat-bonuses" tabindex="0" aria-label="${name} bonuses grouped by color; scroll to see every group">${parts.join('')}</span>`:''}</b><button type="button" data-upgrade="${i}" aria-label="Increase ${name} by one" ${state.points?'':'hidden'}>+</button></div>`;
    }).join('');
    el('hr-points').textContent=state.points?`${state.points} upgrade point${state.points===1?'':'s'}`:'Automatic stat gains every level';
    const remaining=C.spells.length-state.learned.length;
    el('hr-learn').innerHTML='<img src="assets/navigation/attack-book.svg" alt="" draggable="false">';el('hr-learn').title=`Attack Skill Book · ${Math.min(state.learnCredits,remaining)} skill choices available`;el('hr-learn').setAttribute('aria-label',el('hr-learn').title);
    el('hr-learn').disabled=false;el('hr-learn').classList.toggle('skill-ready',state.learnCredits>0&&remaining>0);
  }
  function renderGrid(where){
    const grid=roomGrid(where),node=el(`hr-${where}`),scroll=node.parentElement.scrollTop;
    node.setAttribute('aria-label',`${where}, ${grid.cols} columns by ${grid.rows} rows`);
    if(where==='guild')el('hi-guild-name').textContent=guildData.guild?guildData.guild.name+' · 12 × 12':'12 × 12 · Shared storage';else el(`hr-${where}-size`).textContent=`${grid.cols} × ${grid.rows}`;
    node.style.setProperty('--grid-cols',grid.cols);node.style.setProperty('--grid-rows',grid.rows);
    node.style.gridTemplateColumns=`repeat(${grid.cols},minmax(0,1fr))`;
    node.style.gridTemplateRows=`repeat(${grid.rows},minmax(0,1fr))`;
    let html='';
    for(let y=0;y<grid.rows;y++)for(let x=0;x<grid.cols;x++)html+=`<button type="button" class="hr-cell" data-where="${where}" data-x="${x}" data-y="${y}" aria-label="${where} row ${y+1}, column ${x+1}"></button>`;
    let occupied=0;
    for(const item of (where==='guild'?(guildPreview?.items||guildData.items):(guildPreview?.state||state).items.filter(i=>i.where===where))){
      const def=C.itemMap[item.defId],size=C.size(def,item.rotation),rarity=C.rarityMap[item.rarity],locked=!C.canEquip(state,item);occupied+=size.w*size.h;
      html+=`<button type="button" class="hr-item rarity-${item.rarity}${item.rotated?' rotated':''}${locked?' level-locked':''}${(selectedItem===item.uid||mergeSelection.has(item.uid))?' selected':''}" data-uid="${item.uid}" aria-pressed="${(selectedItem===item.uid||mergeSelection.has(item.uid))}" aria-label="${escape(itemName(item))}, ${C.quantity(item)>1?C.quantity(item)+' potions in stack, ':''}${rarity.name}, ${C.isConsumable(item)?'consumable, '+C.potions.describe(item):'item level '+item.iLvl+', requires level '+item.requiredLevel}, ${size.w} by ${size.h} cells, in ${where}" style="--rarity:${rarity.color};--angle:${item.rotation*90}deg;--cols:${size.w};--rows:${size.h};left:${item.x/grid.cols*100}%;top:${item.y/grid.rows*100}%;width:${size.w/grid.cols*100}%;height:${size.h/grid.rows*100}%"><img class="hr-item-img" src="${images[def.sprite]}" alt="" draggable="false">${C.quantity(item)>1?`<span class="hr-stack-count">${C.quantity(item)}</span>`:''}${C.isConsumable(item)?'':'<span class="hr-tier">'+item.iLvl+'</span>'}${locked?`<span class="hr-item-lock">L${item.requiredLevel}</span>`:''}</button>`;
    }
    node.innerHTML=html;node.querySelector(`[data-uid="${guildPreview?.uid||''}"]`)?.classList.add('hr-transfer-pending');node.parentElement.scrollTop=scroll;el(`hr-${where}-count`).textContent=`${occupied}/${grid.cols*grid.rows}`;
  }
  let libraryPage=0,previewSkill='basic',pendingSkill=null,activationSlot=-1,skillTrigger=null,previewAnchor=null,previewHideTimer=null,touchSkillTap=false;
  const skillImage=spell=>`assets/skills/runes/${spell.id}.webp`;
  function renderSpells(){
    el('hr-library-page').textContent=`${libraryPage+1} / 4`;
    el('hr-library-prev').disabled=libraryPage===0;el('hr-library-next').disabled=libraryPage===3;
    el('hr-skill-progress').textContent=`${state.learned.length} / 30 learned · ${state.learned.length===30?'Complete':state.learnCredits?state.learnCredits+' choice(s) ready':'Next choice: level '+(Math.floor(state.level/2)*2+2)}`;
    for(const [zone,ids,node] of [['active',state.active,el('hr-active')],['storage',state.spellStorage,el('hr-spell-storage')]]){
      const start=zone==='storage'?libraryPage*8:0;
      node.innerHTML=ids.slice(start,zone==='storage'?start+8:4).map((id,offset)=>{
        const index=start+offset;
        const spell=C.spellMap[id],chosen=selectedSpell?.zone===zone&&selectedSpell.index===index;
        const icon=spell?`<img src="${skillImage(spell)}" alt="" draggable="false">${window.RPGElements.badge(window.RPGElements.skillElement(spell))}`:'';
        return `<button type="button" class="hr-spell-slot${spell?' filled':''}${chosen?' selected':''}" data-slot-zone="${zone}" data-slot-index="${index}" aria-pressed="${chosen}" aria-label="${zone==='active'?'Active attack':'Spell storage'} slot ${index+1}: ${spell?spell.name:'empty'}" title="${spell?`${spell.name} · ${window.RPGElements.label(window.RPGElements.skillElement(spell))} · ${spell.ap} AP / ${spell.mp} MP · cooldown ${spell.cooldown} · ${bonuses(spell.bonus)}`:'Empty slot'}">${icon}<span>${index+1}</span></button>`;
      }).join('');
    }
  }
  function renderInspectorContent(){
    const item=itemById(selectedItem),node=el('hr-inspector');
    if(!item){node.innerHTML='';return;}
    const def=C.itemMap[item.defId],rarity=C.rarityMap[item.rarity],locked=!C.canEquip(state,item);
    if(item.where==='guild'){node.innerHTML=description(item)+`<div class="hr-actions"><button type="button" class="hr-btn" data-item-action="to-bag">To Hero Bag</button><button type="button" class="hr-btn" data-item-action="to-stash">To Hero Stash</button><button type="button" class="hr-btn" data-item-action="rotate">↻ Rotate</button></div>`;return;}
    if(C.isConsumable(item)){node.innerHTML=description(item)+`<div class="hr-actions"><button class="hr-btn primary" type="button" data-item-action="consume" ${consumeBusy?'disabled':''}>Use potion</button><button class="hr-btn" type="button" data-item-action="transfer">To ${item.where==='bag'?'stash':'bag'}</button><button class="hr-btn ghost" type="button" data-item-action="discard">Throw away</button></div>`;return;}
    node.innerHTML=`<h3 style="color:${rarity.color}">${def.name}</h3><p>${rarity.name} · iLvl ${item.iLvl} · <span class="${locked?'hr-requirement-locked':''}">Req. L${item.requiredLevel}</span> · T${item.gearTier}</p><p class="hr-bonus-summary">${compactBonuses(C.itemBonus(item))}</p><p>${escape(window.RPGElements.itemText(item))}</p><p>${escape(C.affixText(item))}<br>✧ ${escape(item.enhancement.name)} +${item.enhancement.value} ${abbreviations[item.enhancement.stat]} · ${item.where==='bag'?'Active':'Stored'}</p><div class="hr-actions"><button class="hr-btn" type="button" data-item-action="rotate" title="Rotate 90 degrees clockwise">↻ Rotate</button><button class="hr-btn" type="button" data-item-action="transfer" ${item.where==='stash'&&locked?'disabled':''}>To ${item.where==='bag'?'stash':'bag'}</button><button class="hr-btn" type="button" data-item-action="details">Details</button><button class="hr-btn ghost" type="button" data-item-action="discard">Throw away</button></div>`;
  }
  function renderInspector(){renderInspectorContent();const node=el('hr-inspector');const item=itemById(selectedItem);if(item&&!C.isConsumable(item))node.insertAdjacentHTML('beforeend',forgedDetails(item));if(node.innerHTML){node.insertAdjacentHTML('afterbegin','<button class="hr-btn hi-inspector-close" type="button" data-item-action="close" aria-label="Close item details">×</button>');if(itemById(selectedItem)?.where!=='guild')node.insertAdjacentHTML('beforeend',`<div class="hr-actions"><button type="button" class="hr-btn" data-item-action="forge">Merge / Forge</button><button type="button" class="hr-btn" data-item-action="to-guild" ${!guildData.guild||guildBusy?'disabled':''}>To Guild Stash</button></div>`);}}
  function render(){renderVitals();const recovery=state.items.find(i=>C.potions.get(i)?.restore.resource==='hp');el('hr-drink-potion').textContent=recovery?'Heal +'+C.potions.get(recovery).restore.percent+'%':'Health Potion';el('hr-drink-potion').title=recovery?C.potions.describe(recovery):'No health potion in inventory';const cap=C.totals(state,hero.stats)[0];el('hr-drink-potion').disabled=consumeBusy||state.currentHp===undefined||state.currentHp>=cap||!state.items.some(i=>C.potions.get(i)?.restore.resource==='hp');hideTooltip();renderStats();renderGrid('bag');renderGrid('stash');renderGrid('guild');renderSpells();renderInspector();requestAnimationFrame(fitGrids);}
  function renderVitals(){const totals=C.totals(state,hero.stats),ap=C.maxAp(state);el('hr-current-hp').innerHTML=[['Health','currentHp',totals[0],'#20f697'],['Mana','currentMp',totals[4],'#39dbff'],['Attack Points','currentAp',ap,'#ff9a42']].map(([name,key,max,color])=>{const value=Math.max(0,Math.min(max,state[key]??max)),fill=value/max*100,percent=Math.round(fill);return `<div class="hr-resource" style="--meter-color:${color}"><span>${name}<b>${value} / ${max}</b></span><div class="hr-neon-meter" style="--fill:${fill}%" role="meter" aria-label="${name}" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${value}" aria-valuetext="${value} of ${max}, ${percent}%"><i style="width:${fill}%"></i><span class="hr-meter-percent" aria-hidden="true">${percent}%</span></div></div>`;}).join('');}
  function selectItem(uid){
    hideTooltip();selectedItem=uid;selectedSpell=null;
    if(itemById(uid)?.where==='guild')mergeSelection.clear();else mergeSelection.add(uid);
    // Keep the touched element connected throughout the pointer gesture.
    for(const node of room.querySelectorAll('.hr-item')){
      const active=mergeSelection.has(node.dataset.uid)||node.dataset.uid===uid;node.classList.toggle('selected',active);node.setAttribute('aria-pressed',String(active));
    }
    renderSpells();renderInspector();
  }
  function rotate(){
    const item=itemById(selectedItem);if(!item)return;
    if(drag?.kind==='item'){
      drag.rotation=(drag.rotation+1)%4;drag.anchorX=0;drag.anchorY=0;
      updateDrag(drag.lastX,drag.lastY);return;
    }
    if(item.where==='guild'){void guildTransfer(item,'guild',item.x,item.y,(item.rotation+1)%4);return;}
    if(C.rotateItem(state,item))changed('Rotated 90° clockwise. Its bonuses stay the same.');
    else feedback('There is not enough space to rotate here. Move the item into a clear area first.');
  }
  function transfer(){
    const item=itemById(selectedItem);if(!item)return;
    if(item.where==='guild'){guildDestination('stash');return;}
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
  function closeModal(){hideSkillPreview();if(el('hr-skill-confirm').open)el('hr-skill-confirm').close();pendingSkill=null;if(!modal)return;modal.hidden=true;modal=null;room.inert=false;el('rpg-world').inert=false;if(!el('rpg-world').hidden)window.RPGWorld.refresh(hero,state);returnFocus?.focus();returnFocus=null;}
  function renderCatalog(){
    const query=el('hr-search').value.trim().toLowerCase(),category=el('hr-category').value,tier=Number(el('hr-tier-filter').value);
    const defs=C.items.filter(d=>(!query||d.name.toLowerCase().includes(query))&&(!category||d.category===category)&&(!tier||d.tier===tier));
    el('hr-catalog').innerHTML=defs.length?defs.map(def=>`<article class="hr-catalog-card"><img src="${images[def.sprite]}" alt="${def.name}" loading="lazy"><h3>${def.name}</h3><p>${def.w} × ${def.h} tiles · ${def.category}</p><p>${def.category==='Potions'?'Consumable · '+C.potions.describe(def):'Random rarity, item level & enhancement'}</p><button class="hr-btn" type="button" data-collect="${def.id}">Find → Stash</button></article>`).join(''):'<p class="hr-empty-note">No equipment matches these filters.</p>';
  }
  function playSkillPreview(){
    const spell=C.spellMap[previewSkill];if(!spell)return;
    el('hr-skill-preview-name').textContent=spell.name;
    el('hr-skill-preview-description').textContent=spell.description;
    el('hr-skill-preview-detail').textContent=`${window.RPGElements.label(window.RPGElements.skillElement(spell))} · ${spell.ap} AP / ${spell.mp} MP · ${spell.cooldown} turn cooldown · ${Math.round(spell.scale*100)}% ${spell.magic?'Magic':'Attack'} + 2 − 15% Armor`;
    el('hr-skill-preview-bonus').textContent=bonuses(spell.bonus);
    window.RPGSkillFX?.play(el('hr-skill-fx'),spell.id,{status:el('hr-skill-fx-status')});
  }
  function hideSkillPreview(){clearTimeout(previewHideTimer);previewAnchor?.removeAttribute('aria-describedby');previewAnchor=null;el('hr-skill-popover').hidden=true;window.RPGSkillFX?.stop(el('hr-skill-fx'));}
  function positionSkillPreview(){
    if(!previewAnchor)return;const box=el('hr-skill-popover'),anchor=previewAnchor.getBoundingClientRect(),rect=box.getBoundingClientRect(),width=rect.width||300,height=rect.height||300,gap=10;
    let left=anchor.right+gap;if(left+width>innerWidth-gap)left=anchor.left-width-gap;if(left<gap)left=Math.max(gap,(innerWidth-width)/2);
    const top=Math.max(gap,Math.min(innerHeight-height-gap,anchor.top));box.style.left=`${left}px`;box.style.top=`${top}px`;
  }
  function showSkillPreview(button){
    clearTimeout(previewHideTimer);if(!button||el('hr-learn-modal').hidden||el('hr-skill-confirm').open)return;
    if(previewAnchor===button&&!el('hr-skill-popover').hidden)return;
    hideSkillPreview();previewAnchor=button;previewSkill=button.dataset.learn;button.setAttribute('aria-describedby','hr-skill-preview-description hr-skill-preview-detail hr-skill-preview-bonus');
    const choose=el('hr-skill-preview-choose');choose.disabled=button.dataset.canLearn!=='true';choose.textContent=state.learned.includes(previewSkill)?'Learned':choose.disabled?'No skill choice':'Select skill';
    el('hr-skill-popover').hidden=false;playSkillPreview();positionSkillPreview();
  }
  function deferSkillPreviewHide(){clearTimeout(previewHideTimer);previewHideTimer=setTimeout(hideSkillPreview,180);}
  function renderLearn(){
    hideSkillPreview();
    const remaining=C.spells.length-state.learned.length;
    el('hr-learn-note').textContent=remaining===0?'All 30 skills learned · Equip attacks from your Power Library.':state.learnCredits?`${Math.min(state.learnCredits,remaining)} skill choice(s) available · New choice every 2 levels.`:`Next skill choice: level ${Math.floor(state.level/2)*2+2} · Equip up to 4 attacks.`;
    const category=el('hr-skill-category').value;
    el('hr-learn-list').innerHTML=C.spells.filter(s=>!category||s.category===category).map(spell=>{
      const known=state.learned.includes(spell.id);
      const detail=`${spell.name} · ${window.RPGElements.label(window.RPGElements.skillElement(spell))} · ${spell.ap} AP · ${spell.mp} MP · ${Math.round(spell.scale*100)}% ${spell.magic?'Magic':'Attack'} damage · cooldown ${spell.cooldown} · ${bonuses(spell.bonus)}${known?' · Learned':''}`;
      return `<button type="button" class="hr-catalog-rune" data-family="${spell.category}" data-learn="${spell.id}" data-can-learn="${!known&&state.level>=2&&!!state.learnCredits}" aria-label="${escape(detail)}"><img src="${skillImage(spell)}" alt="">${window.RPGElements.badge(window.RPGElements.skillElement(spell))}${known?'<span aria-hidden="true">✓</span>':''}</button>`;
    }).join('');
  }
  function confirmSkill(id,button){
    const spell=C.spellMap[id];if(!spell||state.learned.includes(id)||state.level<2||!state.learnCredits)return;
    hideSkillPreview();pendingSkill=id;skillTrigger=button;activationSlot=state.active.indexOf(null);
    el('hr-skill-confirm-icon').src=skillImage(spell);el('hr-skill-confirm-name').textContent=spell.name;
    el('hr-skill-confirm-detail').textContent=`${spell.ap} AP · ${spell.mp} MP · ${Math.round(spell.scale*100)}% ${spell.magic?'Magic':'Attack'} + 2 − 15% Armor · ${spell.cooldown} turn cooldown · ${bonuses(spell.bonus)}`;
    el('hr-skill-confirm-note').textContent=activationSlot>=0?'Use one skill choice and activate this attack in an empty slot?':'Choose an attack to replace. Your previous attack will move to the Power Library.';
    const slots=el('hr-skill-confirm-slots');slots.hidden=activationSlot>=0;slots.innerHTML=state.active.map((current,index)=>`<button type="button" class="hr-btn" data-activate-slot="${index}" aria-pressed="false" aria-label="Replace slot ${index+1}: ${escape(C.spellMap[current]?.name||'Empty')}" title="${escape(C.spellMap[current]?.name||'Empty')}">${current?`<img src="${skillImage(C.spellMap[current])}" alt="">`:'+'}</button>`).join('');
    el('hr-skill-activate').disabled=activationSlot<0;el('hr-skill-confirm').showModal();el('hr-skill-cancel').focus();
  }
  el('hr-skill-confirm-slots').addEventListener('click',event=>{const button=event.target.closest('[data-activate-slot]');if(!button)return;activationSlot=Number(button.dataset.activateSlot);for(const slot of el('hr-skill-confirm-slots').children)slot.setAttribute('aria-pressed',String(slot===button));el('hr-skill-activate').disabled=false;});
  el('hr-skill-cancel').onclick=()=>el('hr-skill-confirm').close();
  el('hr-skill-confirm').addEventListener('close',()=>{pendingSkill=null;skillTrigger?.focus();skillTrigger=null;});
  el('hr-skill-activate').onclick=()=>{
    const id=pendingSkill,slot=activationSlot;if(!id||slot<0||slot>3)return;
    if(!C.learn(state,id))return;
    C.moveSpell(state,'storage',state.spellStorage.indexOf(id),'active',slot);closeModal();changed(`${C.spellMap[id].name} activated! Its bonus is now active.`);
  };
  function baseDescription(item){
    const def=C.itemMap[item.defId],rarity=C.rarityMap[item.rarity],size=C.size(def,item.rotation),allowed=C.canEquip(state,item);
    if(C.isConsumable(item))return `<div class="hr-description-head"><img src="${images[def.sprite]}" alt=""><div><h3>${def.name}</h3><p>Consumable · ${size.w} × ${size.h} tiles</p></div></div><p class="hr-description-total">${C.potions.describe(item)}, up to your maximum.</p><p>${item.where==='guild'?'Withdraw this potion to your inventory before use.':'Choose Use potion to restore your hero. Consumed after activation.'}</p>`;
    const start=item.gearTier===1?1:(item.gearTier-1)*10,end=item.gearTier*10-1;
    const list=values=>values.map((v,i)=>v?`<li>+${v} ${C.stats[i]}</li>`:'').join('');
    return `<div class="hr-description-head"><img src="${images[def.sprite]}" alt=""><div><span class="hr-rarity-tag" style="--rarity:${rarity.color}">${rarity.name}${item.rarity==='mythic'?' / Legendary':item.rarity==='divine'?' / Artifact':''}</span><h3>${escape(itemName(item))}</h3><p>${def.category} · ${size.w} × ${size.h} tiles</p></div></div><dl class="hr-item-metrics"><div><dt>Item level</dt><dd>${item.iLvl}</dd></div><div><dt>Requires level</dt><dd class="${allowed?'':'hr-requirement-locked'}">${item.requiredLevel}${allowed?'':' · Locked'}</dd></div><div><dt>Gear tier</dt><dd>T${item.gearTier} · L${start}–${end}</dd></div></dl><p>${escape(window.RPGElements.itemText(item))}</p><section><h4>Base attributes · ${item.iLvl+3} power</h4><ul>${list(item.baseBonus)}</ul></section><section class="hr-additional-attributes"><h4>Additional attributes · ${item.attributes.length}</h4>${item.attributes.length?`<ul>${item.attributes.map(a=>`<li>+${a.value} ${C.stats[a.stat]}</li>`).join('')}</ul>`:'<p>Common gear has no rarity bonus attributes.</p>'}</section><section class="hr-enhancement"><h4>One enhancement</h4><p>${escape(window.RPGElements.itemText(item))}</p><p>${escape(C.affixText(item))}<br>✧ ${escape(item.enhancement.name)} · +${item.enhancement.value} ${C.stats[item.enhancement.stat]}</p></section><p class="hr-description-total">Total: ${compactBonuses(C.itemBonus(item))}</p><p class="hr-description-status">${item.where==='bag'?'Equipped in bag · All bonuses active.':allowed?'Stored in stash · No bonuses active.':`Stored in stash · Reach level ${item.requiredLevel} to equip.`}</p>`;
  }
  function forgedDetails(item){const f=item.forged;if(!f)return '';return `<section class="hr-forged"><h4>Forged level ${f.level}</h4>${(f.attributes||[]).map(a=>`<p>+${a.value} ${C.stats[a.stat]}</p>`).join('')}${(f.restores||[]).map(a=>`<p>+${a.percent}% ${C.potions.resources[a.resource].name} restore</p>`).join('')}${(f.curses||[]).map(c=>`<p class="hr-curse">Curse: ${C.curseNames[c.id]} ${c.value}%</p>`).join('')}</section>`;}
  function description(item){return baseDescription(item)+forgedDetails(item)+(C.quantity(item)>1?`<p>Stack: ${C.quantity(item)} potions</p>`:'');}
  function hideTooltip(){
    if(tooltipAnchor)tooltipAnchor.removeAttribute('aria-describedby');tooltipAnchor=null;
    el('hr-item-tooltip').hidden=true;
  }
  function showTooltip(node){
    if(drag||modal||selectedItem===node.dataset.uid||tooltipAnchor===node)return;
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
  function clearDrag(){el('hr-portrait').closest('.hr-hero-scene').classList.remove('hr-potion-ready');for(const node of room.querySelectorAll('.hr-merge-target'))node.classList.remove('hr-merge-target');ghost?.remove();preview?.remove();ghost=null;preview=null;drag=null;}
  function mergeUids(target){return [...new Set([...(drag?.uids||[]).filter(id=>id!==target),target])];}
  function mergePlan(target){return target?C.mergePlan(...mergeUids(target).map(itemById)):null;}
  function candidate(x,y){
    if(room.dataset.view==='hero'&&drag?.kind==='item'&&C.isConsumable(itemById(drag.uid)||{})){const rect=el('hr-portrait').closest('.hr-hero-scene').getBoundingClientRect();if(x>=rect.left&&x<=rect.right&&y>=rect.top&&y<=rect.bottom)return {hero:true};}
    for(const where of ['bag','stash','guild']){
      const node=el(`hr-${where}`),r=node.getBoundingClientRect(),visible=node.parentElement.getBoundingClientRect(),grid=roomGrid(where);
      if(x>=Math.max(r.left,visible.left)&&x<Math.min(r.right,visible.right)&&y>=Math.max(r.top,visible.top)&&y<Math.min(r.bottom,visible.bottom)){
        const size=C.size(C.itemMap[itemById(drag.uid).defId],drag.rotation);
        // Keep the full footprint in the target grid even when the item was
        // grabbed by a lower corner or moves between differently sized cells.
        const cellX=Math.floor((x-r.left)/r.width*grid.cols),cellY=Math.floor((y-r.top)/r.height*grid.rows);
        const over=state.items.find(i=>{if(i.uid===drag.uid||i.where!==where)return false;const s=C.size(C.itemMap[i.defId],i.rotation);return cellX>=i.x&&cellX<i.x+s.w&&cellY>=i.y&&cellY<i.y+s.h;});
        return {where,over:over?.uid,x:Math.max(0,Math.min(grid.cols-size.w,cellX-drag.anchorX)),y:Math.max(0,Math.min(grid.rows-size.h,cellY-drag.anchorY))};
      }
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
      const cell=Math.min(45,el(`hr-${item.where}`).getBoundingClientRect().width/roomGrid(item.where).cols);
      ghost.style.width=`${size.w*cell}px`;ghost.style.height=`${size.h*cell}px`;
      const image=ghost.querySelector('img');
      image.style.width=drag.rotation%2?`${90*size.h/size.w}%`:'90%';image.style.height=drag.rotation%2?`${90*size.w/size.h}%`:'90%';
      image.style.transform=`rotate(${drag.rotation*90}deg)`;
      drag.target=candidate(x,y);preview?.remove();preview=null;
      for(const node of room.querySelectorAll('.hr-merge-target'))node.classList.remove('hr-merge-target');
      el('hr-portrait').closest('.hr-hero-scene').classList.toggle('hr-potion-ready',!!drag.target?.hero);
      if(drag.target&&!drag.target.hero){
        if(mergePlan(drag.target.over)){for(const node of room.querySelectorAll('.hr-item'))if(node.dataset.uid===drag.target.over)node.classList.add('hr-merge-target');}
        else{
        const target=drag.target,grid=roomGrid(target.where),valid=canPlace(item,target.where,target.x,target.y,drag.rotation);
        preview=document.createElement('div');preview.className=`hr-placement${valid?'':' invalid'}`;
        Object.assign(preview.style,{left:`${target.x/grid.cols*100}%`,top:`${target.y/grid.rows*100}%`,width:`${size.w/grid.cols*100}%`,height:`${size.h/grid.rows*100}%`});
        el(`hr-${target.where}`).appendChild(preview);
        }
      }
    }else{ghost.style.width='54px';ghost.style.height='54px';}
    ghost.style.left=`${x+10}px`;ghost.style.top=`${y+10}px`;
  }
  room.addEventListener('pointerdown',event=>{
    if(event.button!==0||consumeBusy||guildBusy||window.RPGForge?.busy())return;
    hideTooltip();
    const itemNode=event.target.closest('.hr-item'),spellNode=event.target.closest('.hr-spell-slot.filled');
    if(!itemNode&&!spellNode)return;
    const r=(itemNode||spellNode).getBoundingClientRect();
    if(itemNode){
      const item=itemById(itemNode.dataset.uid),def=C.itemMap[item.defId],size=C.size(def,item.rotation);
      const wasSelected=mergeSelection.has(item.uid);selectItem(item.uid);
      drag={kind:'item',uid:item.uid,uids:[...mergeSelection].filter(id=>['bag','stash'].includes(itemById(id)?.where)),wasSelected,rotation:item.rotation,image:images[def.sprite],anchorX:Math.min(size.w-1,Math.floor((event.clientX-r.left)/r.width*size.w)),anchorY:Math.min(size.h-1,Math.floor((event.clientY-r.top)/r.height*size.h))};
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
    const current=drag;if(current.kind==='item'&&current.moved)current.target=candidate(event.clientX,event.clientY);
    const finish=action=>event.pointerType==='touch'?requestAnimationFrame(action):action();
    suppressedSource=current;
    if(current.moved){
      suppressClickUntil=Date.now()+300;
      if(current.kind==='item'){
        const target=current.target,item=itemById(current.uid);
        if(target?.hero){clearDrag();void consumePotion(item.uid);}else{
        if(target&&(item.where==='guild'||target.where==='guild')){clearDrag();void guildTransfer(item,target.where,target.x,target.y,current.rotation);return;}
        if(mergePlan(target?.over)){const uids=mergeUids(target.over),over=target.over;clearDrag();mergeSelection.clear();feedback('');void window.RPGForge.drop(uids,over);return;}
        if(target?.over&&current.uids.length>1){clearDrag();feedback('');return;}
        const success=target&&C.place(state,item,target.where,target.x,target.y,current.rotation);
        clearDrag();if(success)finish(()=>changed(`Item moved to ${target.where}.`));else feedback(target?.where==='bag'&&!C.canEquip(state,item)?`Reach level ${item.requiredLevel} to equip this item.`:'That space is blocked or outside the grid. Your item stays in its original position.');}
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
        else{if(current.wasSelected){mergeSelection.delete(current.uid);selectedItem=[...mergeSelection].at(-1)||null;renderInspector();for(const node of room.querySelectorAll('.hr-item')){const active=mergeSelection.has(node.dataset.uid);node.classList.toggle('selected',active);node.setAttribute('aria-pressed',String(active));}}lastTap={uid:current.uid,time:now};}
      });
    }
    if(room.hasPointerCapture(event.pointerId))room.releasePointerCapture(event.pointerId);
  });
  room.addEventListener('pointercancel',clearDrag);
  room.addEventListener('dragstart',event=>event.preventDefault());
  room.addEventListener('click',event=>{
    if(guildBusy||window.RPGForge?.busy())return;
    const arrange=event.target.closest('[data-arrange]');
    if(arrange){
      const where=arrange.dataset.arrange;clearDrag();lastTap=null;
      if(where==='guild'){void arrangeGuild();return;}
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
      if(selected.where==='guild'||where==='guild'){void guildTransfer(selected,where,Number(cell.dataset.x),Number(cell.dataset.y),selected.rotation);return;}
      if(C.place(state,selected,where,Number(cell.dataset.x),Number(cell.dataset.y),selected.rotation))changed(`Item placed in ${where}.`);
      else feedback(where==='bag'&&!C.canEquip(state,selected)?`Reach level ${selected.requiredLevel} to equip this item.`:'The item does not fit there. Choose an empty area or rotate it.');
    }
    if(spell)clickSpell(spell.dataset.slotZone,Number(spell.dataset.slotIndex));
    const upgrade=event.target.closest('[data-upgrade]');
    if(upgrade){const stat=Number(upgrade.dataset.upgrade);upgrade.disabled=true;fetch('/api/battle',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'upgrade',stat})}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error);Object.assign(state,d.game);localStorage.setItem(key(),JSON.stringify(state));render();feedback(`${C.stats[stat]} increased by 1.`);}).catch(e=>{feedback(e.message);render();});}
    const action=event.target.closest('[data-item-action]')?.dataset.itemAction;
    if(action==='forge'){window.RPGForge.open(selectedItem);return;}
    if(action==='close'){selectedItem=null;renderInspector();return;}
    if(action==='to-guild')guildDestination('guild');
    if(action==='to-bag')guildDestination('bag');
    if(action==='to-stash')guildDestination('stash');
    if(action==='consume')void consumePotion(selectedItem);
    if(action==='rotate')rotate();
    if(action==='transfer')transfer();
    if(action==='details')showDetails();
    if(action==='discard'&&itemById(selectedItem)?.where!=='guild'){state.items=state.items.filter(i=>i.uid!==selectedItem);selectedItem=null;changed('Item thrown away. You can now accept drops that fit in the freed space.');}
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
  el('hr-explore').addEventListener('click',async()=>{if(room.classList.contains('hr-popup')){closePopup();return;}clearDrag();room.inert=true;try{if(!save())return;if(await window.RPGLive.flush?.()===false){feedback('Your inventory is still saving. Reconnect and try again.');return;}window.RPGWorld.open(hero,state);}finally{room.inert=false;}});
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
  el('hr-shop-destination').addEventListener('change',renderShop);
  el('hr-buy-bag').addEventListener('click',()=>{
    const where=el('hr-shop-destination').value;
    if(C.buyBag(state,where)){changed(`Purchased 6 new ${where} tiles for ${C.BAG_PRICE} CBG.`);renderShop();el('hr-shop-status').textContent=`${where==='bag'?'Hero bag':'Item stash'} expanded by 6 tiles. Purchase saved.`;}
  });
  el('hr-test-cbg').addEventListener('click',()=>{if(C.addTestCBG(state)){changed('Added 100 sandbox CBG.');renderShop();el('hr-shop-status').textContent='100 test CBG added to this local hero.';}});
  el('hr-levelup').addEventListener('click',()=>{if(!C.levelUp(state))return;changed(`Practice level ${state.level}! Base attributes increased automatically. Online XP stays separate.`);if(state.level%2===0&&state.learnCredits&&state.learned.length<C.spells.length){renderLearn();showModal('hr-learn-modal');}});
  el('hr-learn').addEventListener('click',()=>{renderLearn();showModal('hr-learn-modal');});
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
  el('hr-skill-preview-close').onclick=()=>{hideSkillPreview();el('hr-skill-category').focus();};
  el('hr-skill-preview-choose').onclick=()=>{if(previewAnchor)confirmSkill(previewSkill,previewAnchor);};
  el('hr-learn-list').addEventListener('pointerdown',event=>{touchSkillTap=event.pointerType==='touch';});
  el('hr-learn-list').addEventListener('pointerover',event=>{if(event.pointerType!=='touch')showSkillPreview(event.target.closest('[data-learn]'));});
  el('hr-learn-list').addEventListener('pointerout',event=>{if(!event.target.closest('[data-learn]')?.contains(event.relatedTarget)&&!el('hr-skill-popover').contains(event.relatedTarget))deferSkillPreviewHide();});
  el('hr-learn-list').addEventListener('focusin',event=>showSkillPreview(event.target.closest('[data-learn]')));
  el('hr-learn-list').addEventListener('focusout',event=>{if(!el('hr-skill-popover').contains(event.relatedTarget))deferSkillPreviewHide();});
  el('hr-skill-popover').addEventListener('pointerenter',()=>clearTimeout(previewHideTimer));
  el('hr-skill-popover').addEventListener('pointerleave',deferSkillPreviewHide);
  el('hr-skill-popover').addEventListener('focusin',()=>clearTimeout(previewHideTimer));
  el('hr-skill-popover').addEventListener('focusout',event=>{if(!el('hr-skill-popover').contains(event.relatedTarget))deferSkillPreviewHide();});
  el('hr-learn-list').addEventListener('scroll',()=>{const r=previewAnchor?.getBoundingClientRect(),list=el('hr-learn-list').getBoundingClientRect();if(previewAnchor===document.activeElement&&r&&r.bottom>list.top&&r.top<list.bottom)positionSkillPreview();else hideSkillPreview();});
  window.addEventListener('resize',hideSkillPreview);
  el('hr-learn-list').addEventListener('click',event=>{
    const button=event.target.closest('[data-learn]');if(!button)return;
    const touch=touchSkillTap||event.pointerType==='touch';touchSkillTap=false;
    if(touch||button.dataset.canLearn!=='true'){showSkillPreview(button);return;}confirmSkill(button.dataset.learn,button);
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
    if(window.RPGForge?.busy())return;
    if(room.hidden&&el('rpg-world').hidden)return;
    if(el('hr-skill-confirm').open)return;
    if(event.key==='Escape'){if(!el('hr-skill-popover').hidden){event.preventDefault();hideSkillPreview();el('hr-skill-category').focus();return;}if(modal)closeModal();else if(room.classList.contains('hr-popup')&&!selectedItem&&!selectedSpell&&!drag)closePopup();else{clearDrag();mergeSelection.clear();selectedItem=null;selectedSpell=null;render();}return;}
    if(!modal&&room.classList.contains('hr-popup')&&event.key==='Tab'){
      const nodes=[...room.querySelectorAll('button:not([disabled]),input,select,[tabindex="0"]')].filter(n=>n.offsetParent!==null),first=nodes[0],last=nodes.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    }
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
  async function consumePotion(uid){if(guildBusy||consumeBusy||!C.isConsumable(itemById(uid)||{}))return;consumeBusy=true;hideTooltip();render();try{const response=await fetch('/api/battle',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'usePotion',uid})}),data=await response.json();if(!response.ok)throw Error(data.error);Object.assign(state,data.game);selectedItem=null;localStorage.setItem(key(),JSON.stringify(state));window.RPGWorld.refresh?.();feedback(`Potion used · +${data.restored.amount} ${C.potions.resources[data.restored.resource].name}.`);}catch(error){feedback(error.message);}finally{consumeBusy=false;render();}}
  el('hr-drink-potion').onclick=()=>{const item=state.items.find(i=>C.potions.get(i)?.restore.resource==='hp');if(item)void consumePotion(item.uid);};
  el('hr-claim-loot').onclick=async()=>{el('hr-claim-loot').disabled=true;try{const response=await fetch('/api/battle',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'claimLoot'})}),data=await response.json();if(!response.ok)throw Error(data.error);Object.assign(state,data.game);localStorage.setItem(key(),JSON.stringify(state));feedback(data.pendingLoot?.length?'Stash full. Throw away unwanted items, then collect the remaining drops.':'Saved drops collected.');}catch(error){feedback(error.message);}finally{el('hr-claim-loot').disabled=false;render();}};

 const popupBackdrop=document.createElement('div');popupBackdrop.className='hr-popup-backdrop';popupBackdrop.hidden=true;popupBackdrop.addEventListener('click',()=>closePopup());room.before(popupBackdrop);
  const popupClose=document.createElement('button');popupClose.type='button';popupClose.className='hr-popup-close';popupClose.setAttribute('aria-label','Close and return to the map');popupClose.title='Close';popupClose.textContent='✕';popupClose.addEventListener('click',()=>closePopup());room.querySelector('.hr-topbar').append(popupClose);
  let popupReturn=null,popupEpoch=0;
  // Opens the Hero Room or Hero Inventory as a window centered over the GPS map.
  function openPopup(view){if(el('rpg-world').hidden||!hero||!state)return;closeModal();hideTooltip();clearDrag();popupReturn=document.activeElement;popupEpoch++;el('rpg-world').inert=true;room.classList.add('hr-popup');room.setAttribute('role','dialog');room.setAttribute('aria-modal','true');room.setAttribute('aria-labelledby','hr-view-title');popupBackdrop.hidden=false;room.hidden=false;render();showView(view==='inventory'?'inventory':'hero');popupClose.focus({preventScroll:true});}
  function closePopup(){if(!room.classList.contains('hr-popup'))return;if(modal)closeModal();hideTooltip();clearDrag();save();void window.RPGLive.flush?.();popupEpoch++;room.hidden=true;room.classList.remove('hr-popup');room.removeAttribute('role');room.removeAttribute('aria-modal');room.removeAttribute('aria-labelledby');popupBackdrop.hidden=true;el('rpg-world').inert=false;if(!el('rpg-world').hidden)window.RPGWorld.refresh(hero,state);const target=popupReturn?.closest?.('.world-sidebar')?el('world-panel-tab'):popupReturn;target?.focus?.({preventScroll:true});popupReturn=null;}
  window.RPGRoom={popup:openPopup,closePopup,popupOpen:()=>room.classList.contains('hr-popup'),popupVersion:()=>popupEpoch,snapshot:()=>structuredClone(state),selected:()=>selectedItem,inventory:()=>showView('inventory'),heroRoom:()=>showView('hero'),view:()=>room.dataset.view,accept(game){mergeSelection.clear();if(!game.potionCurses)delete state.potionCurses;Object.assign(state,game);localStorage.setItem(key(),JSON.stringify(state));render();window.RPGWorld.refresh?.();},persist:save,open,refresh:render,utility(kind){if(kind==='book'){window.BabaylanBook.open();showModal('hr-book-modal');}if(kind==='shop'){window.RPGWorld.merchantArea?.();}}};
  el('saveBtn').addEventListener('click',()=>{const name=el('heroName').value.trim();if(name.length>=2)open(selected,name);});
})();
