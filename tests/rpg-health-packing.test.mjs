import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {HEALTH_ROWS,rowGeometry,packHealthSheet,splitHealthCells,projectionCuts} from '../scripts/pack-rpg-health-states.mjs';
test('row geometry preserves common placement and generous transparent margins',()=>{
 const bounds=[{left:20,top:10,width:100,height:190},{left:22,top:8,width:100,height:190}];
 for(const health of HEALTH_ROWS){
  const g=rowGeometry(bounds,200,health);
  assert.ok(g.x>=140&&g.y>=140);
  assert.ok(512-g.x-g.outputWidth>=140);
  assert.equal(g.y+g.outputHeight,356);
  if(health===40||health===20)assert.ok(g.outputHeight<=200*(health===40?.75:.65));
 }
});
test('packer retains four different frames per health row and removes faint alpha',async()=>{
 const width=160,height=240,data=Buffer.alloc(width*height*4);
 for(let row=0;row<6;row++)for(let frame=0;frame<4;frame++){
  for(let y=8;y<32;y++)for(let x=10;x<29;x++){
   const i=((row*40+y)*width+frame*40+x)*4;
   data[i]=60+frame*50;data[i+1]=30+row*30;data[i+3]=255;
  }
  data[((row*40)*width+frame*40)*4+3]=20;
 }
 const source=await sharp(data,{raw:{width,height,channels:4}}).png().toBuffer();
 const output=await packHealthSheet(source,200);
 const {data:packed,info}=await sharp(output).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 assert.equal(info.width,2048);assert.equal(info.height,3072);
 for(let row=0;row<6;row++)for(let frame=0;frame<4;frame++){
  const center=((row*512+330)*2048+frame*512+256)*4;
  assert.ok(Math.abs(packed[center]-(60+frame*50))<=5);
  assert.ok(Math.abs(packed[center+1]-(30+row*30))<=5);
  assert.equal(packed[center+3],255);
  assert.equal(packed[(row*512*2048+frame*512)*4+3],0);
 }
});

test('adaptive grid retains every opaque source pixel when figures cross nominal cuts',()=>{
 const width=400,height=600,data=Buffer.alloc(width*height*4);
 // First row crosses nominal y=100; next row starts150, leaving a safe gutter.
 const bands=[[20,112],[150,193],[230,293],[330,393],[430,493],[530,593]];
 let expected=0;
 for(let row=0;row<6;row++)for(let frame=0;frame<4;frame++)for(let y=bands[row][0];y<bands[row][1];y++)for(let x=frame*100+15;x<frame*100+85;x++){
  const i=(y*width+x)*4;data[i]=row*30;data[i+3]=255;expected++;
 }
 const result=splitHealthCells(data,{width,height});
 assert.ok(result.ys[1]>112);assert.equal(result.sourceInk,expected);assert.equal(result.retainedInk,expected);
 for(let i=0;i<24;i++){
  const cell=result.cells[i],row=Math.floor(i/4);let ink=0;
  for(let j=3;j<cell.pixels.length;j+=4)if(cell.pixels[j]>32)ink++;
  assert.equal(ink,70*(bands[row][1]-bands[row][0]));
  assert.equal(cell.bounds.height,bands[row][1]-bands[row][0]);
 }
});
test('adaptive grid rejects boundaries with no transparent gutter',()=>{
 assert.throws(()=>projectionCuts(new Uint32Array(400).fill(1),4,'column'),/Unsafe column boundary/);
});
test('column gutters are detected separately when rows have different horizontal offsets',()=>{
 const width=400,height=600,data=Buffer.alloc(width*height*4),global=new Uint32Array(width);
 for(let row=0;row<6;row++)for(let frame=0;frame<4;frame++)for(let y=row*100+20;y<row*100+80;y++)for(let x=frame*100+(row%2?20:0);x<frame*100+(row%2?100:80);x++){
  data[(y*width+x)*4+3]=255;global[x]++;
 }
 assert.throws(()=>projectionCuts(global,4,'column'),/Unsafe column boundary/);
 const r=splitHealthCells(data,{width,height});assert.equal(r.sourceInk,24*80*60);assert.equal(r.retainedInk,r.sourceInk);
 assert.notDeepEqual(r.xss[0],r.xss[1]);
 for(const cell of r.cells){assert.equal(cell.bounds.width,80);assert.equal(cell.bounds.height,60);}
});

test('standing and kneeling rows normalize body height rather than weapon width',()=>{
 const bounds=[{left:10,top:5,width:220,height:200}];
 const standing=rowGeometry(bounds,163,100);
 assert.equal(standing.outputHeight,163);assert.equal(standing.outputWidth,179);
 for(const health of [80,60])assert.equal(rowGeometry(bounds,163,health).outputHeight,163);
 assert.equal(rowGeometry(bounds,163,40).outputHeight,122);
 assert.equal(rowGeometry(bounds,163,20).outputHeight,106);
 const dead=rowGeometry(bounds,163,0);assert.equal(dead.outputWidth,163);
});
