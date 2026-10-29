// Run after the complete generated health manifest has been packed.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
const root=new URL('../',import.meta.url),window={};
for(const name of ['character-attacks','character-health','damage-data'])vm.runInNewContext(await fs.readFile(new URL(`rpg/src/${name}.js`,root),'utf8'),{window});
test('all 24 characters have six distinct animated health rows inside transparent battle crops',async()=>{
 const catalog=window.RPG_CHARACTER_HEALTH,characters=window.DAMAGE_SPRITE_DATA;
 assert.equal(Object.keys(catalog).length,24);assert.equal(characters.length,24);
 for(const character of characters){
  const id=character.id,meta=catalog[id];assert.ok(meta,id);
  assert.deepEqual(Array.from(meta.rows),[100,80,60,40,20,0]);assert.equal(meta.frames,4);assert.equal(meta.tile,512);
  assert.equal(meta.facing,character.kind==='Hero'?'right':'left');assert.equal(meta.baseHeight,window.RPG_CHARACTER_ATTACKS[id].idleHeight||200);
  const {data,info}=await sharp(new URL('public/rpg/'+meta.src,root).pathname).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  assert.equal(info.width,2048);assert.equal(info.height,3072);assert.equal(info.channels,4);
  for(let row=0;row<6;row++){
   const hashes=[];
   for(let frame=0;frame<4;frame++){
    let x0=512,y0=512,x1=-1,y1=-1,ink=0;const pixels=Buffer.alloc(512*512*4),rgb=new Set();
    for(let y=0;y<512;y++)for(let x=0;x<512;x++){
     const i=((row*512+y)*2048+frame*512+x)*4,a=data[i+3];data.copy(pixels,(y*512+x)*4,i,i+4);
     if(x<140||x>=372||y<140||y>=372)assert.equal(a,0,`${id} ${row}/${frame} crop border`);
     if(a>32){ink++;x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);rgb.add((data[i]<<16)|(data[i+1]<<8)|data[i+2]);}
    }
    assert.ok(ink>300,`${id} ${row}/${frame} empty`);assert.ok(rgb.size>8,`${id} ${row}/${frame} lacks inner variation`);
    assert.ok(x0>=140&&x1<372&&y0>=140&&y1<=355,`${id} ${row}/${frame} overlaps adjacent crop`);
    if(row===3||row===4)assert.ok(y1-y0+1<=Math.ceil(meta.baseHeight*(row===3?.75:.65)),`${id} kneeling height`);
    hashes.push(createHash('sha256').update(pixels).digest('hex'));
   }
   // Four actual frames must survive packaging, including internal pixel movement.
   assert.ok(new Set(hashes).size===4,`${id} health ${meta.rows[row]} does not contain four different frames`);
  }
 }
});
