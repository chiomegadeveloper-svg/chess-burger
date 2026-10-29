import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../rpg/src/health-animation.js',import.meta.url),'utf8');
function setup(){
 const intervals=new Map(),listeners={},document={hidden:false,addEventListener:(name,fn)=>listeners[name]=fn};let next=0;
 const window={RPG_CHARACTER_HEALTH:{rogue:{src:'assets/health/rogue.webp'}}};
 vm.runInNewContext(source,{window,document,setInterval(fn,ms){assert.equal(ms,160);intervals.set(++next,fn);return next;},clearInterval(id){intervals.delete(id);}});
 const classes=new Set(),props={};let writes=0;
 const frame={isConnected:true,classList:{add:v=>classes.add(v),remove:v=>classes.delete(v)},dataset:{}};
 const image={getAttribute:()=>image.value,set src(v){image.value=v;writes++;},style:{setProperty:(key,value)=>props[key]=value}};
 return {api:window.RPGCharacterHealth,window,document,frame,image,props,classes,intervals,listeners,writes:()=>writes,tick(){for(const fn of [...intervals.values()])fn();}};
}
test('thresholds ceil positive percentages and never treat living actors as dead',()=>{
 const {api}=setup();for(const [hp,want] of [[100,100],[81,100],[80,80],[61,80],[60,60],[41,60],[40,40],[21,40],[20,20],[1,20],[.001,20],[0,0],[-1,0]])assert.equal(api.stage(hp,100),want);
 assert.equal(api.stage(80.01,100),100);assert.equal(api.stage(1,1000),20);
});
test('loop steps without replacing source or resetting on repeated apply',()=>{
 const s=setup(),actor={heroId:'rogue',hp:100,maxHp:100};
 assert.equal(s.api.apply(s.frame,s.image,actor,'right'),true);assert.equal(s.frame.dataset.health,'100');assert.ok(s.classes.has('is-health'));
 for(const column of [1,2,3,2,1,0]){s.tick();assert.equal(s.props['--health-x'],`${-(column*512+140)/232*100}%`);s.api.apply(s.frame,s.image,actor,'right');}
 assert.equal(s.writes(),1);assert.equal(s.intervals.size,1);
});
test('death plays once, damage changes row, visibility pauses and stop restarts cleanly',()=>{
 const s=setup(),actor={heroId:'rogue',hp:20,maxHp:100};s.api.apply(s.frame,s.image,actor,'right');
 assert.equal(s.props['--health-y'],`${-(4*512+140)/232*100}%`);
 actor.hp=0;s.api.apply(s.frame,s.image,actor,'right');for(let i=0;i<8;i++)s.tick();
 const held=s.props['--health-x'];assert.equal(held,`${-(3*512+140)/232*100}%`);
 s.api.apply(s.frame,s.image,actor,'right');s.tick();assert.equal(s.props['--health-x'],held);
 s.document.hidden=true;s.listeners.visibilitychange();assert.equal(s.intervals.size,0);
 s.document.hidden=false;s.listeners.visibilitychange();assert.equal(s.intervals.size,1);
 s.api.stop();assert.equal(s.intervals.size,0);s.api.apply(s.frame,s.image,actor,'right');assert.equal(s.intervals.size,1);
 s.frame.isConnected=false;s.tick();assert.equal(s.intervals.size,0);
});
test('missing atlas returns false and removes health class for fallback',()=>{
 const s=setup();s.api.apply(s.frame,s.image,{heroId:'rogue',hp:100,maxHp:100},'right');
 assert.equal(s.api.apply(s.frame,s.image,{heroId:'unknown',hp:100,maxHp:100},'left'),false);
 assert.equal(s.classes.has('is-health'),false);assert.equal(s.intervals.size,0);
});
