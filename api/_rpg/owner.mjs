import {read,insert,write,fail} from './store.mjs';
import {consoleRequest} from './owner-console.mjs';
export async function ownerRequest(client,actor,role,input){
 if(role!=='owner')fail('Owner access is required.',403);
 if(['owner_console_access','owner_command'].includes(input.action))return consoleRequest(client,actor,role,input);
 if(input.action==='owner_search'){
  const query=String(input.query||'').trim().replace(/^@+/,'').toLowerCase();
  if(!/^[a-z0-9_]{2,40}$/.test(query))fail('Enter at least two username characters.',400);
  const found=await client.from('cb_profiles').select('user_id,username,display_name').ilike('username',`%${query}%`).order('username').limit(10);
  if(found.error)fail('User search is unavailable. Please retry.',503);return {users:found.data||[]};
 }
 if(!['owner_review','owner_reset'].includes(input.action))fail('Unknown owner action.',400);
 if(!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(String(input.userId)))fail('Choose a user from search results.',400);
 const found=await client.from('cb_profiles').select('user_id,username,display_name').eq('user_id',input.userId).maybeSingle();
 if(found.error)fail('User lookup is unavailable.',503);if(!found.data)fail('User not found.',404);
 const user=found.data,doc=await read(client,user.user_id);
 if(input.action==='owner_review')return {user,hero:doc?.state?{name:doc.name,heroId:doc.heroId,level:doc.state.level,revision:doc.revision}:null};
 if(!doc?.state)fail('This user is already at hero selection.');
 if(String(input.confirmation||'').trim().replace(/^@+/,'').toLowerCase()!==String(user.username).toLowerCase())fail('Type the selected username to approve this reset.',400);
 if(input.revision!==doc.revision)fail('This hero changed. Review the latest hero before approving the reset.');
 const id=crypto.randomUUID(),reset={id,actor,username:user.username,at:Date.now()};
 if(!await insert(client,user.user_id,'rpg_reset',id,{revision:0,...reset,previous:doc}))fail('Could not preserve the previous hero. Please retry.',503);
 await write(client,user.user_id,'rpg_profile','hero',{revision:doc.revision,generation:id,state:null,heroId:null,name:null,lastReset:reset});
 await client.from('cb_inventory_items').delete().eq('user_id',user.user_id).eq('item_kind','rpg_presence').eq('item_id','live');
 const audit=await client.from('cb_admin_logs').insert({actor_user_id:actor,action:'rpg_hero_reset',details:{username:user.username,user_id:user.user_id,hero_name:doc.name,hero_id:doc.heroId,level:doc.state.level,reset_id:id}});
 if(audit.error)console.warn('rpg.reset-audit-log-unavailable',{reset_id:id});
 return {ok:true,user,hero:null};
}
