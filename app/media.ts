import {getSupabase} from './supabase';
export async function uploadStaffImage(file:File,userId:string){
 if(!file.type.startsWith('image/'))throw Error('Choose an image file.');
 const bitmap=await createImageBitmap(file),scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d')!.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();let blob:Blob|null=null;
 for(let q=.86;q>=.3;q-=.08){blob=await new Promise(r=>canvas.toBlob(r,'image/webp',q));if(blob&&blob.size<=999_999)break;}
 if(!blob||blob.type!=='image/webp'||blob.size>999_999)throw Error('Choose a smaller image.');const c=await getSupabase();if(!c)throw Error('Connect to upload images.');const path=userId+'/staff-'+crypto.randomUUID()+'.webp';const{error}=await c.storage.from('cb-profile-media').upload(path,blob,{contentType:'image/webp'});if(error)throw Error(error.message);return c.storage.from('cb-profile-media').getPublicUrl(path).data.publicUrl;
}
