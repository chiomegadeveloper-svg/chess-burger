import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs/promises';import sharp from 'sharp';
const window={};for(const file of ['character-attacks','damage-data'])vm.runInNewContext(await fs.readFile('rpg/src/'+file+'.js','utf8'),{window});
test('every hero, monster and boss has padded transparent death art at attack scale and a larger portrait',async()=>{
 let count=0;for(const entry of window.DAMAGE_SPRITE_DATA)for(const direction of entry.kind==='Hero'?['left','right']:['left']){
  count++;const base='public/rpg/assets/death/',tile=base+entry.id+'-'+direction+'.webp';const {data,info}=await sharp(tile).ensureAlpha().raw().toBuffer({resolveWithObject:true});assert.equal(info.width,512);assert.equal(info.height,512);
  let x0=512,y0=512,x1=-1,y1=-1,ink=0;for(let y=0;y<512;y++)for(let x=0;x<512;x++)if(data[(y*512+x)*4+3]>24){ink++;x0=Math.min(x,x0);x1=Math.max(x,x1);y0=Math.min(y,y0);y1=Math.max(y,y1);}
  assert.ok(ink>1000,entry.id);assert.ok(x0>=155&&x1<=356&&y0>=155&&y1<=356,entry.id+' escaped attack crop');assert.ok(y1>=350,entry.id+' must touch the common baseline');assert.ok(Math.abs(Math.max(x1-x0+1,y1-y0+1)-window.RPG_CHARACTER_ATTACKS[entry.id].idleHeight)<=4,entry.id+' mismatched scale');
  const portrait=await sharp(base+'portraits/'+entry.id+'-'+direction+'.webp').metadata();assert.equal(portrait.width,400);assert.equal(portrait.height,400);assert.ok(portrait.hasAlpha);
 }assert.equal(count,32);
});
