import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';import sharp from 'sharp';
const window={};for(const file of ['character-idles','damage-data'])vm.runInNewContext(await readFile(new URL('../rpg/src/'+file+'.js',import.meta.url),'utf8'),{window});
test('all 24 characters have transparent padded idle silhouettes aligned with attack foot baselines',async()=>{
 assert.equal(Object.keys(window.RPG_CHARACTER_IDLES).length,24);
 for(const entry of window.DAMAGE_SPRITE_DATA){const idle=window.RPG_CHARACTER_IDLES[entry.id];assert.ok(idle,entry.id);assert.equal(idle.facing,entry.kind==='Hero'?'right':'left');
  const {data,info}=await sharp(new URL('../public/rpg/'+idle.src,import.meta.url).pathname).ensureAlpha().raw().toBuffer({resolveWithObject:true});assert.equal(info.width,512);assert.equal(info.height,512);
  let x0=512,y0=512,x1=-1,y1=-1;for(let y=0;y<512;y++)for(let x=0;x<512;x++)if(data[(y*512+x)*4+3]>32){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
  assert.ok(x0>=156&&x1<=356&&y0>=156&&y1===355,entry.id+' must fit the attack crop with feet planted');
 }
});
