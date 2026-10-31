// Export whole connected artwork islands, including parts crossing old grid lines.
// Original pixel colors are retained; the grid only identifies each island's owner.
export function isolateSkillFrames(data,width,height){
 const size=width*height,seen=new Uint8Array(size),queue=new Int32Array(size),owners=new Int16Array(size).fill(-1);
 const bounds=Array.from({length:36},()=>({left:width,top:height,right:-1,bottom:-1,pixels:0}));
 for(let start=0;start<size;start++){
  if(seen[start]||data[start*4+3]<24)continue;
  let read=0,count=1,sumX=0,sumY=0;queue[0]=start;seen[start]=1;
  while(read<count){
   const p=queue[read++],x=p%width,y=Math.floor(p/width);sumX+=x;sumY+=y;
   for(const n of [x?p-1:-1,x<width-1?p+1:-1,y?p-width:-1,y<height-1?p+width:-1]){
    if(n<0||seen[n]||data[n*4+3]<24)continue;seen[n]=1;queue[count++]=n;
   }
  }
  if(count<16)continue; // Remove isolated atlas noise without cutting real trails.
  const col=Math.min(5,Math.floor((sumX/count+.5)*6/width)),row=Math.min(5,Math.floor((sumY/count+.5)*6/height)),id=row*6+col,b=bounds[id];
  for(let i=0;i<count;i++){const p=queue[i],x=p%width,y=Math.floor(p/width);owners[p]=id;b.left=Math.min(b.left,x);b.right=Math.max(b.right,x);b.top=Math.min(b.top,y);b.bottom=Math.max(b.bottom,y);b.pixels++;}
 }
 return bounds.map((b,id)=>{
  if(!b.pixels)return null;
  const w=b.right-b.left+1,h=b.bottom-b.top+1,pixels=new Uint8Array(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const p=(b.top+y)*width+b.left+x;if(owners[p]===id)pixels.set(data.subarray(p*4,p*4+4),(y*w+x)*4);}
  return {...b,width:w,height:h,data:pixels};
 });
}
