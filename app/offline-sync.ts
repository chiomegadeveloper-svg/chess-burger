import {arena} from './arena-client';
import type {ArenaMatch} from './game-rules';
import {getSupabase} from './supabase';
type OfflineRecord={id:string;white_id:string;black_id:string|null;white_name:string;black_name:string;control:string;pgn:string;result:string|null;created_at:number;finished_at:number};
const key=(id:string)=>'cb-pending-results:'+id;
export function queueOffline(match:ArenaMatch,userId:string){
 if(userId==='guest-device'||!match.result)return;
 const pending=JSON.parse(localStorage.getItem(key(userId))??'[]') as OfflineRecord[];
 if(!pending.some(m=>m.id===match.id))pending.push({id:match.id,white_id:match.white_id,black_id:match.black_id,white_name:match.white?.display_name??'White',black_name:match.black?.display_name??'Black',control:match.control,pgn:match.pgn,result:match.result,created_at:match.created_at,finished_at:Date.now()});
 localStorage.setItem(key(userId),JSON.stringify(pending));
}
let syncing:Promise<void>|null=null;
export function syncOffline(){
 if(syncing)return syncing;
 syncing=(async()=>{const client=await getSupabase(),session=client?(await client.auth.getSession()).data.session:null;if(!session)return;const storageKey=key(session.user.id);const pending=JSON.parse(localStorage.getItem(storageKey)??'[]') as OfflineRecord[];
  for(const record of pending){await arena('offline-result',{record});const current=JSON.parse(localStorage.getItem(storageKey)??'[]') as OfflineRecord[];localStorage.setItem(storageKey,JSON.stringify(current.filter(m=>m.id!==record.id)));}
 })().finally(()=>{syncing=null;});return syncing;
}
