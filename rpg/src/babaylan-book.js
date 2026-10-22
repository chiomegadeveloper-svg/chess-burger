(function(){
 'use strict';
 const entries=window.BABAYLAN_MONSTERS,images=window.BABAYLAN_IMAGES,el=id=>document.getElementById(id),modal=el('hr-book-modal');
 const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let page=-1,lastRead=null;try{const raw=localStorage.getItem('chessburger_babaylan_book_page'),saved=Number(raw);if(raw!==null&&Number.isInteger(saved)&&saved>=0&&saved<entries.length)lastRead=saved;}catch{}
 el('bb-contents').innerHTML='<option value="-1">Introduction</option>'+entries.map((entry,index)=>`<option value="${index}">${String(index+1).padStart(2,'0')} · ${escape(entry.name)}${entry.kind==='Boss'?' · Boss':''}</option>`).join('');
 function render(next=page){
  page=Math.max(-1,Math.min(entries.length-1,next));
  const introduction=page===-1;
  el('bb-introduction').hidden=!introduction;el('bb-monster-portrait').hidden=introduction;el('bb-monster-story').hidden=introduction;
  el('bb-contents').value=String(page);el('bb-spread').scrollTop=0;
  el('bb-prev').disabled=introduction;el('bb-next').disabled=page===entries.length-1;el('bb-next').textContent=introduction?'Begin →':'Next →';
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
 el('bb-prev').addEventListener('click',()=>render(page-1));el('bb-next').addEventListener('click',()=>render(page+1));
 el('bb-contents').addEventListener('change',event=>render(Number(event.target.value)));
 document.addEventListener('keydown',event=>{if(modal.hidden||event.ctrlKey||event.metaKey||event.altKey||event.target.closest('input,select,textarea'))return;if(event.key==='ArrowLeft'){event.preventDefault();render(page-1);}if(event.key==='ArrowRight'){event.preventDefault();render(page+1);}});
 el('bb-resume').addEventListener('click',()=>{if(lastRead!==null)render(lastRead);});
 let swipe=null;
 el('bb-spread').addEventListener('pointerdown',event=>{if(event.pointerType==='touch'&&event.isPrimary&&!event.target.closest('button,select,a'))swipe={x:event.clientX,y:event.clientY,id:event.pointerId,time:Date.now()};});
 el('bb-spread').addEventListener('pointerup',event=>{const start=swipe;swipe=null;if(!start||start.id!==event.pointerId)return;const dx=event.clientX-start.x,dy=event.clientY-start.y;if(Date.now()-start.time<900&&Math.abs(dx)>65&&Math.abs(dx)>Math.abs(dy)*1.7)render(page+(dx<0?1:-1));});
 el('bb-spread').addEventListener('pointercancel',()=>{swipe=null;});
 window.BabaylanBook={render,open:()=>{render(-1);}};
})();
