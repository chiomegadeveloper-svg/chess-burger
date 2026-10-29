(function(){
 'use strict';
 const entries=window.BABAYLAN_MONSTERS,images=window.BABAYLAN_IMAGES,el=id=>document.getElementById(id),modal=el('hr-book-modal');
 const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let page=-1,lastRead=null,activeTurn=null;const stage=el('bb-stage'),spread=el('bb-spread'),TURN_MS=1300;
 try{const raw=localStorage.getItem('chessburger_babaylan_book_page'),saved=Number(raw);if(raw!==null&&Number.isInteger(saved)&&saved>=0&&saved<entries.length)lastRead=saved;}catch{}
 function navigation(locked=false){
  for(const id of ['bb-prev','bb-corner-prev'])el(id).disabled=locked||page===-1;
  for(const id of ['bb-next','bb-corner-next'])el(id).disabled=locked||page===entries.length-1;
  el('bb-contents').disabled=locked;stage.setAttribute('aria-busy',String(locked));
 }
 function geometry(){const box=spread.getBoundingClientRect(),frame=stage.getBoundingClientRect(),left=box.left-frame.left+spread.clientLeft;stage.style.setProperty('--bb-spine',`${left+spread.clientWidth/2}px`);return {left,top:box.top-frame.top+spread.clientTop,width:spread.clientWidth,height:spread.clientHeight};}
 el('bb-contents').innerHTML='<option value="-1">Introduction</option>'+entries.map((entry,index)=>`<option value="${index}">${String(index+1).padStart(2,'0')} · ${escape(entry.name)}${entry.kind==='Boss'?' · Boss':''}</option>`).join('');
 function render(next=page){
  page=Math.max(-1,Math.min(entries.length-1,next));
  const introduction=page===-1;
  el('bb-introduction').hidden=!introduction;el('bb-monster-portrait').hidden=introduction;el('bb-monster-story').hidden=introduction;
  el('bb-contents').value=String(page);el('bb-spread').scrollTop=0;
  el('bb-prev').disabled=introduction;el('bb-next').disabled=page===entries.length-1;el('bb-next').textContent=introduction?'Begin →':'Next →';
  navigation(Boolean(activeTurn));
  requestAnimationFrame(geometry);
  if(introduction){
   el('bb-kind').textContent='Preface';el('bb-kind').dataset.kind='Preface';el('bb-page').textContent='Introduction';
   el('bb-resume').hidden=lastRead===null;if(lastRead!==null)el('bb-resume').textContent=`Continue with ${entries[lastRead].name} →`;
   return;
  }
  const entry=entries[page];lastRead=page;
  el('bb-name').textContent=entry.name;el('bb-epithet').textContent=entry.title;el('bb-number').textContent=`CHRONICLE ${String(page+1).padStart(2,'0')}`;
  el('bb-kind').textContent=entry.kind;el('bb-kind').dataset.kind=entry.kind;el('bb-contents').value=String(page);
  el('bb-image').src=images[entry.id];el('bb-image').alt=`${entry.name}, ${entry.title}, isometric monster portrait`;
  el('bb-caption').textContent=entry.realm==='Other'?'From the outer islands':`From the hidden realm of ${entry.realm}`;
  el('bb-facts').innerHTML=[['Place',entry.place],['Height',entry.height],['Strength',entry.strength],['Weakness',entry.weakness]].map(([name,value])=>`<div><dt>${name}</dt><dd>${escape(value)}</dd></div>`).join('');
  el('bb-before').textContent=entry.before;el('bb-turning').textContent=entry.turning;el('bb-echo').textContent=entry.echo;
  el('bb-page').textContent=`${page+1} / ${entries.length}`;el('bb-prev').disabled=false;el('bb-next').disabled=page===entries.length-1;
  el('bb-spread').scrollTop=0;
  try{localStorage.setItem('chessburger_babaylan_book_page',String(page));}catch{}
 }
 function leaves(){return page===-1?[...el('bb-introduction').children]:[el('bb-monster-portrait'),el('bb-monster-story')];}
 function snapshot(node,scrollTop=0,whole=false){
  const clone=node.cloneNode(true),height=node.getBoundingClientRect().height;
  for(const item of [clone,...clone.querySelectorAll('*')])for(const attr of ['id','aria-labelledby','aria-describedby','for','autofocus'])item.removeAttribute(attr);
  clone.style.width='100%';clone.style.boxSizing='border-box';clone.style.height=whole?'auto':`${height}px`;clone.style.transform=`translateY(${-scrollTop}px)`;
  if(whole){clone.style.margin='0';clone.style.border='0';clone.style.boxShadow='none';clone.style.overflow='visible';}
  return clone;
 }
 function stopTurn(){activeTurn?.finish();}
 function turn(next){
  next=Math.max(-1,Math.min(entries.length-1,Number(next)));if(!Number.isInteger(next)||next===page||activeTurn)return;
  if(modal.hidden||typeof stage.animate!=='function'||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches||stage.getBoundingClientRect().width===0){render(next);return;}
  const backwards=next<page,single=getComputedStyle(spread).display==='block',old=leaves(),scroll=spread.scrollTop;
  const front=snapshot(single?spread:old[backwards?0:1],scroll,single),fixed=single?null:snapshot(old[backwards?1:0],scroll);
  render(next);const back=snapshot(single?spread:leaves()[backwards?1:0],0,single);
  const layer=document.createElement('div');layer.className=`bb-flip-layer${backwards?' bb-flip-backwards':''}${single?' bb-flip-single':''}`;layer.setAttribute('aria-hidden','true');layer.setAttribute('inert','');
  if(fixed){const under=document.createElement('div');under.className='bb-underleaf';under.append(fixed);layer.append(under);}
  const sheet=document.createElement('div');sheet.className='bb-turner';
  for(const [name,content]of[['front',front],['back',back]]){const face=document.createElement('div');face.className=`bb-turn-face bb-turn-${name}`;face.append(content);sheet.append(face);}
  layer.append(sheet);stage.append(layer);stage.classList.add('bb-is-turning');navigation(true);
  const box=geometry();Object.assign(layer.style,{left:`${box.left}px`,top:`${box.top}px`,width:`${box.width}px`,height:`${box.height}px`,right:'auto',bottom:'auto'});
  const record={animation:null,timer:null,finish(){if(activeTurn!==record)return;activeTurn=null;clearTimeout(record.timer);record.animation?.cancel();layer.remove();stage.classList.remove('bb-is-turning');navigation();}};
  activeTurn=record;
  try{record.animation=sheet.animate([{transform:'rotateY(0deg)'},{transform:`rotateY(${backwards?180:-180}deg)`}],{duration:TURN_MS,easing:'cubic-bezier(.4,0,.2,1)',fill:'forwards'});record.animation.finished.then(record.finish,record.finish);record.timer=setTimeout(record.finish,TURN_MS+250);}catch{record.finish();}
 }
 for(const id of ['bb-prev','bb-corner-prev'])el(id).addEventListener('click',()=>turn(page-1));
 for(const id of ['bb-next','bb-corner-next'])el(id).addEventListener('click',()=>turn(page+1));
 el('bb-contents').addEventListener('change',event=>turn(Number(event.target.value)));
 document.addEventListener('keydown',event=>{if(modal.hidden||event.ctrlKey||event.metaKey||event.altKey||event.target.closest?.('input,select,textarea'))return;if(event.key==='ArrowLeft'){event.preventDefault();turn(page-1);}if(event.key==='ArrowRight'){event.preventDefault();turn(page+1);}});
 el('bb-resume').addEventListener('click',()=>{if(lastRead!==null)turn(lastRead);});
 let swipe=null;
 el('bb-spread').addEventListener('pointerdown',event=>{if(event.pointerType==='touch'&&event.isPrimary&&!event.target.closest('button,select,a'))swipe={x:event.clientX,y:event.clientY,id:event.pointerId,time:Date.now()};});
 el('bb-spread').addEventListener('pointerup',event=>{const start=swipe;swipe=null;if(!start||start.id!==event.pointerId)return;const dx=event.clientX-start.x,dy=event.clientY-start.y;if(Date.now()-start.time<900&&Math.abs(dx)>65&&Math.abs(dx)>Math.abs(dy)*1.7)turn(page+(dx<0?1:-1));});
 el('bb-spread').addEventListener('pointercancel',()=>{swipe=null;});
 new MutationObserver(()=>{if(modal.hidden)stopTurn();else requestAnimationFrame(geometry);}).observe(modal,{attributes:true,attributeFilter:['hidden']});window.addEventListener('resize',()=>{stopTurn();geometry();});
 if(typeof ResizeObserver==='function')new ResizeObserver(geometry).observe(spread);
 window.BabaylanBook={render:turn,open:()=>{stopTurn();render(-1);}};
})();
