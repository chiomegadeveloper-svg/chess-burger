import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
function book({reduced=false,single=false}={}){
 const dom=new JSDOM('<style>[hidden]{display:none!important}.bb-spread{display:grid}</style>'+fs.readFileSync('rpg/src/babaylan-book.html','utf8'),{url:'https://chessburger.site',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,d=w.document,calls=[];
 w.matchMedia=()=>({matches:reduced});w.HTMLElement.prototype.getBoundingClientRect=()=>({width:1000,height:600,left:0,top:0,right:1000,bottom:600});
 Object.defineProperty(w.HTMLElement.prototype,'clientWidth',{get:()=>1000});Object.defineProperty(w.HTMLElement.prototype,'clientHeight',{get:()=>600});
 w.HTMLElement.prototype.animate=function(frames,options){let resolve;const finished=new Promise(r=>resolve=r),animation={finished,cancel(){resolve();}};calls.push({node:this,frames,options,complete:resolve});return animation;};
 w.BABAYLAN_MONSTERS=[{id:'a',name:'First',kind:'Monster',title:'The first',realm:'Other',place:'A',height:'1',strength:'A',weakness:'B',before:'Old story',turning:'Old turning',echo:'Old echo'},{id:'b',name:'Second',kind:'Boss',title:'The second',realm:'Agartha',place:'B',height:'2',strength:'C',weakness:'D',before:'New story',turning:'New turning',echo:'New echo'}];w.BABAYLAN_IMAGES={a:'a.webp',b:'b.webp'};
 w.eval(fs.readFileSync('rpg/src/babaylan-book.js','utf8'));w.BabaylanBook.open();d.getElementById('hr-book-modal').hidden=false;if(single)d.getElementById('bb-spread').style.display='block';
 return {w,d,calls,close:()=>dom.window.close(),tick:()=>new Promise(r=>setTimeout(r,0))};
}
test('a full-height two-sided sheet turns at the spine, with old front/new back and no duplicate IDs',async()=>{
 const b=book();try{
  b.d.getElementById('bb-next').click();assert.equal(b.calls.length,1);assert.equal(b.calls[0].options.duration,1300);
  assert.equal(b.calls[0].frames[1].transform,'rotateY(-180deg)');
  assert.equal(b.d.querySelector('.bb-flip-layer').style.height,'600px');assert.equal(b.d.querySelector('.bb-flip-layer').style.width,'1000px');
  assert.match(b.d.querySelector('.bb-turn-front').textContent,/Before you draw your blade/);assert.match(b.d.querySelector('.bb-turn-back').textContent,/First/);
  assert.equal(b.d.querySelector('.bb-flip-layer [id]'),null);assert.equal(b.d.getElementById('bb-stage').getAttribute('aria-busy'),'true');
  b.d.getElementById('bb-next').click();b.w.BabaylanBook.render(1);assert.equal(b.calls.length,1,'rapid navigation must not start overlapping flips');
  b.calls[0].complete();await b.tick();assert.equal(b.d.querySelector('.bb-flip-layer'),null);assert.equal(b.d.getElementById('bb-page').textContent,'1 / 2');
  b.d.getElementById('bb-prev').click();assert.equal(b.calls[1].frames[1].transform,'rotateY(180deg)');assert.match(b.d.querySelector('.bb-turn-front').textContent,/First/);
  b.calls[1].complete();await b.tick();assert.equal(b.d.getElementById('bb-page').textContent,'Introduction');assert.equal(b.d.getElementById('bb-corner-prev').disabled,true);
 }finally{b.close();}
});
test('contents, corners, closing mid-turn and resizing preserve navigation and clean temporary sheets',async()=>{
 const b=book();try{
  const select=b.d.getElementById('bb-contents');select.value='1';select.dispatchEvent(new b.w.Event('change'));b.calls[0].complete();await b.tick();
  assert.equal(b.d.getElementById('bb-name').textContent,'Second');assert.equal(b.d.getElementById('bb-next').disabled,true);assert.equal(b.w.localStorage.getItem('chessburger_babaylan_book_page'),'1');
  b.d.getElementById('bb-corner-prev').click();b.d.getElementById('hr-book-modal').hidden=true;await b.tick();assert.equal(b.d.querySelector('.bb-flip-layer'),null);
  b.w.BabaylanBook.open();b.d.getElementById('hr-book-modal').hidden=false;b.d.getElementById('bb-resume').click();assert.ok(b.d.querySelector('.bb-flip-layer'));
  b.w.dispatchEvent(new b.w.Event('resize'));assert.equal(b.d.querySelector('.bb-flip-layer'),null);assert.equal(b.d.getElementById('bb-stage').getAttribute('aria-busy'),'false');assert.equal(select.disabled,false);
 }finally{b.close();}
});
test('single-page layouts turn the whole viewport and reduced motion navigates without a flip',async()=>{
 const b=book({single:true});try{b.d.getElementById('bb-corner-next').click();assert.ok(b.d.querySelector('.bb-flip-single'));assert.ok(b.d.querySelector('.bb-turn-front>.bb-spread'));b.calls[0].complete();await b.tick();}finally{b.close();}
 const r=book({reduced:true});try{r.d.getElementById('bb-next').click();assert.equal(r.calls.length,0);assert.equal(r.d.getElementById('bb-name').textContent,'First');assert.equal(r.d.getElementById('bb-stage').getAttribute('aria-busy'),'false');}finally{r.close();}
});
test('keyboard and touch navigation share the turn lock, and a stalled animation cannot lock the book',async()=>{
 const b=book();try{
  b.d.dispatchEvent(new b.w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));assert.equal(b.calls.length,1);b.calls[0].complete();await b.tick();
  const spread=b.d.getElementById('bb-spread');
  for(const [type,x]of[['pointerdown',200],['pointerup',80]]){const event=new b.w.Event(type,{bubbles:true});Object.assign(event,{pointerType:'touch',isPrimary:true,pointerId:1,clientX:x,clientY:100});spread.dispatchEvent(event);}
  assert.equal(b.calls.length,2);assert.equal(b.d.getElementById('bb-name').textContent,'Second');
  await new Promise(r=>setTimeout(r,1650));assert.equal(b.d.querySelector('.bb-flip-layer'),null);assert.equal(b.d.getElementById('bb-contents').disabled,false);assert.equal(b.d.getElementById('bb-prev').disabled,false);
 }finally{b.close();}
});
