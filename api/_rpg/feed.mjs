import {createHash} from 'node:crypto';
import {write} from './store.mjs';
const heroes={rogue:'Varkesh',theft:'Nyxlor',assassin:'Morvex',mage:'Aetherion',tank:'Draumgard',archer:'Thalorien',queen:'Seraphyne',crusader:'Aurex'};
function idFor(user,doc,event){const hex=createHash('sha256').update(JSON.stringify(['rpg-feed-v1',user,doc.generation||doc.createdAt,doc.heroId,event])).digest('hex');return `${hex.slice(0,8)}-${hex.slice(8,12)}-5${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;}
// The durable cursor advances only after idempotent feed writes succeed.
export async function publishRpgFeed(client,user,doc){
 const cursor=doc.feedCursor;if(!cursor)return;
 const level=Math.max(1,Math.min(88,doc.state.level));if(cursor.registered&&cursor.level>=level)return;
 try{
  const profile=await client.from('cb_profiles').select('display_name').eq('user_id',user).maybeSingle();
  if(profile.error)throw Error('Profile unavailable');
  const name=profile.data?.display_name||doc.name,hero=heroes[doc.heroId];if(!hero)return;
  const events=[];
  if(!cursor.registered)events.push({id:idFor(user,doc,'registered'),content:`joined Chess Burger RPG with Hero: ${hero}.`});
  for(let n=Math.max(2,cursor.level+1);n<=level;n++)events.push({id:idFor(user,doc,'level-'+n),content:`reached Level ${n} in Chess Burger RPG with Hero: ${hero}.`});
  const result=await client.from('cb_feed').upsert(events.map(event=>({...event,user_id:user,kind:'new_reward',display_name:name})),{onConflict:'id',ignoreDuplicates:true});
  if(result.error)throw Error('Feed unavailable');
  const previous=doc.feedCursor;doc.feedCursor={registered:true,level};
  try{await write(client,user,'rpg_profile','hero',doc);}catch(error){doc.feedCursor=previous;throw error;}
 }catch(error){console.warn('rpg.feed-pending',{userId:user,message:error.message});}
}
