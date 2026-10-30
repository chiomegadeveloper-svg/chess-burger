/* Isolate each source tile before ct.js uploads it: no atlas-edge sampling. */
(function(root){
 'use strict';
 function layout(width,height,column,row){
  const x=Math.round(column*width/6),y=Math.round(row*height/6),w=Math.round((column+1)*width/6)-x,h=Math.round((row+1)*height/6)-y;
  const scale=144/Math.max(w,h);return {x,y,w,h,width:w*scale,height:h*scale};
 }
 function clean(data,w,h){
  const seen=new Uint8Array(w*h),stack=new Int32Array(w*h);
  for(let i=3;i<data.length;i+=4)if(data[i]<24)data[i]=0;
  for(let start=0;start<w*h;start++){
   if(seen[start]||!data[start*4+3])continue;
   let size=1,read=0,minX=w,minY=h,maxX=0,maxY=0;stack[0]=start;seen[start]=1;
   while(read<size){const point=stack[read++],x=point%w,y=Math.floor(point/w);minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const nx=x+dx,ny=y+dy;if(nx<0||nx>=w||ny<0||ny>=h)continue;const next=ny*w+nx;if(!seen[next]&&data[next*4+3]){seen[next]=1;stack[size++]=next;}}
   }
   const edge=minX<2||minY<2||maxX>=w-2||maxY>=h-2,central=maxX>=w*.25&&minX<=w*.75&&maxY>=h*.25&&minY<=h*.75;
   if(edge&&!central)for(let i=0;i<size;i++)data[stack[i]*4+3]=0;
  }
  return data;
 }
 const footprints=new Map();
 function footprint(data,w,h,scale=1){let width=1,height=1;for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(data[(y*w+x)*4+3]>=24){width=Math.max(width,(Math.abs(x+.5-w/2)*2+1)*scale);height=Math.max(height,(Math.abs(y+.5-h/2)*2+1)*scale);}return {width,height};}
 function fitScale(id,w,h,battle=true){const ink=footprints.get(id)||{width:144,height:144};return .7*Math.min(w*(battle?.42:.86)/ink.width,h*.86/ink.height);}
 function frame(image,column,row,skillId){
  const box=layout(image.width,image.height,column,row),tile=document.createElement('canvas');tile.width=box.w;tile.height=box.h;
  const ctx=tile.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,box.x,box.y,box.w,box.h,0,0,box.w,box.h);
  const pixels=ctx.getImageData(0,0,box.w,box.h);clean(pixels.data,box.w,box.h);ctx.putImageData(pixels,0,0);if(skillId){const ink=footprint(pixels.data,box.w,box.h,box.width/box.w),old=footprints.get(skillId);footprints.set(skillId,{width:Math.max(old?.width||0,ink.width),height:Math.max(old?.height||0,ink.height)});}
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;const out=canvas.getContext('2d');out.imageSmoothingEnabled=true;out.drawImage(tile,(512-box.width)/2,(512-box.height)/2,box.width,box.height);return canvas;
 }
 root.RPGSkillFrames={layout,clean,frame,footprint,fitScale};
})(globalThis);
