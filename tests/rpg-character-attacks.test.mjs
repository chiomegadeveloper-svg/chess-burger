import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import sharp from 'sharp';
const window={};vm.runInNewContext(await readFile(new URL('../rpg/src/character-attacks.js',import.meta.url),'utf8'),{window});
vm.runInNewContext(await readFile(new URL('../rpg/src/damage-data.js',import.meta.url),'utf8'),{window});
test('all existing heroes, monsters and bosses have four isolated transparent attack frames',async()=>{
 assert.equal(Object.keys(window.RPG_CHARACTER_ATTACKS).length,24);
 for(const entry of window.DAMAGE_SPRITE_DATA){
  const animation=window.RPG_CHARACTER_ATTACKS[entry.id];assert.ok(animation,entry.id);
  assert.equal(animation.facing,entry.kind==='Hero'?'right':'left');
  const {data,info}=await sharp(new URL('../public/rpg/'+animation.src,import.meta.url).pathname).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  assert.equal(info.width,2048);assert.equal(info.height,512);
  const counts=[0,0,0,0];
  for(let y=0;y<512;y++)for(let x=0;x<2048;x++)if(data[(y*2048+x)*4+3]){
   const local=x%512;assert.ok(local>=156&&local<356&&y>=156&&y<356,`${entry.id}: ink escaped padded tile at ${x},${y}`);counts[Math.floor(x/512)]++;
  }
  assert.ok(counts.every(n=>n>1000),entry.id+' has an empty pose');
 }
});
async function renderer(){
 const sprites=[],apps=[],resources=new Map();
 class Sprite{constructor(frames){this.frames=frames;this.anchor={set(){}};this.scale={set(x,y){this.x=x;this.y=y;}};this.position={set(x,y){this.x=x;this.y=y;}};sprites.push(this);}gotoAndStop(n){this.currentFrame=n;}gotoAndPlay(n){this.currentFrame=n;this.playing=true;}stop(){this.playing=false;}destroy(){this.destroyed=true;}}
 class Effect extends Sprite{constructor(spec){super(resources.get(spec.texture));}}
 const PIXI={AnimatedSprite:Sprite,SCALE_MODES:{NEAREST:0},BaseTexture:{from:()=>({})},Texture:class{constructor(base,rect){this.rect=rect;}static from(image){return {baseTexture:{resource:{source:image}},defaultAnchor:{set(){}},destroy(){}};}},Rectangle:class{constructor(x,y,width,height){Object.assign(this,{x,y,width,height});}},utils:{isWebGLSupported:()=>false},Application:class{constructor(options){this.screen={width:options.width,height:options.height};this.view={setAttribute(){}};this.stage={children:[],addChild(n){this.children.push(n);}};this.renderer={render(){},resize(){}};this.ticker={add(){},remove(){},stop(){}};apps.push(this);}destroy(){this.destroyed=true;}}};
 class Image{set src(value){queueMicrotask(()=>this.onload());}}
 const host={id:'bt-fx-bar',clientWidth:600,clientHeight:120,appendChild(){},querySelectorAll:()=>[]};
 const win={RPG_CHARACTER_ATTACKS:window.RPG_CHARACTER_ATTACKS,RPG_ATTACK_SKILLS:[{id:'basic',category:'physical',name:'Tackle',animation:{frames:6,fps:12,row:0}}],RPGSkillFrames:{frame:()=>({}),fitScale:()=>1},matchMedia:()=>({matches:false})};
 const source=(await readFile(new URL('../rpg/src/skill-fx/index.mjs',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'');
 vm.runInNewContext(source,{PIXI,CtAnimatedSprite:Effect,textures:resources,window:win,Image,document:{createElement:()=>({remove(){}})},performance:{now:()=>0},console,setTimeout,clearTimeout});
 return {win,host,sprites,apps};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('both characters render in the animation area and health impact waits for contact frame',async()=>{
 const {win,host,sprites,apps}=await renderer();let hits=0;
 const running=win.RPGSkillFX.sequence(host,[{skill:'basic',attackerId:'rogue',defenderId:'draguu'}],{onImpact:()=>hits++});await settle();
 const effect=sprites.find(s=>s instanceof Object&&s.playing),actors=apps[0].stage.children.filter(s=>s!==effect);
 assert.equal(actors.length,2);assert.ok(actors[0].position.x<actors[1].position.x);assert.equal(hits,0);
 effect.currentFrame=2;effect.onFrameChange();assert.equal(hits,0);
 effect.currentFrame=3;effect.onFrameChange();assert.equal(hits,1);assert.equal(actors[0].currentFrame,2);
 effect.onComplete();await running;assert.equal(hits,1);assert.ok(actors.every(a=>a.destroyed));
});
test('enemy and future PvP heroes face inward; cancelling never reveals pending damage',async()=>{
 const {win,host,apps}=await renderer();let hits=0;
 const running=win.RPGSkillFX.sequence(host,[{skill:'basic',attackerId:'mage',defenderId:'rogue',reverse:true}],{onImpact:()=>hits++});await settle();
 const [enemy,hero]=apps[0].stage.children;assert.ok(enemy.position.x>hero.position.x);assert.ok(enemy.scale.x<0);assert.ok(hero.scale.x>0);
 win.RPGSkillFX.stop(host);await running;assert.equal(hits,0);assert.equal(apps[0].destroyed,true);
});
