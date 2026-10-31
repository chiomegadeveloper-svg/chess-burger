import {read,write,fail} from './store.mjs';
import {healthCap,manaCap} from './rewards.mjs';
import C from './src/inventory-core.js';

const literal=value=>value.replace(/[\\%_]/g,'\\$&');
export function parseCommand(value){
 if(typeof value!=='string'||value.length>100||/[\x00-\x1f<>]/.test(value))fail('Enter a valid recovery command.',400);
 const match=value.trim().match(/^(healme|recoverme|heal|recover)(?:\s+(.+))?$/i);
 if(!match)fail('Use healme, heal <hero name>, recoverme or recover <hero name>.',400);
 const verb=match[1].toLowerCase(),self=verb.endsWith('me');let name=match[2]?.trim();
 if(self&&name||!self&&!name)fail('Use healme, heal <hero name>, recoverme or recover <hero name>.',400);
 if(name?.startsWith('"')&&name.endsWith('"'))name=name.slice(1,-1).trim();
 if(!self&&(!name||name.length>41))fail('Enter the exact hero name, or @username.',400);
 return {self,name,mode:verb.startsWith('recover')?'recover':'heal'};
}
export async function consoleRequest(client,actor,role,input,now=Date.now()){
 if(role!=='owner')fail('Owner access is required.',403);
 if(input.action==='owner_console_access')return {allowed:true};
 const parsed=parseCommand(input.command),requestId=input.requestId;
 if(typeof requestId!=='string'||!/^[a-zA-Z0-9-]{8,100}$/.test(requestId))fail('A command request ID is required.',400);
 let user=actor,doc;
 if(parsed.self)doc=await read(client,actor);
 else if(parsed.name.startsWith('@')){
  const username=parsed.name.slice(1);if(!/^[a-z0-9_]{2,40}$/i.test(username))fail('Enter a valid @username.',400);
  const result=await client.from('cb_profiles').select('user_id').ilike('username',literal(username)).limit(2);
  if(result.error)fail('Hero lookup is unavailable.',503);if(result.data?.length!==1)fail('Username not found or ambiguous.',404);
  user=result.data[0].user_id;doc=await read(client,user);
 }else{
  if(parsed.name.length>24)fail('Hero names have at most 24 characters.',400);
  const result=await client.from('cb_inventory_items').select('user_id,metadata').eq('item_kind','rpg_profile').eq('item_id','hero').ilike('metadata->>name',literal(parsed.name)).limit(2);
  if(result.error)fail('Hero lookup is unavailable.',503);if(!result.data?.length)fail('Hero not found. Use the exact character name.',404);
  if(result.data.length>1)fail('Multiple heroes use that name. Use heal @username or recover @username.',409);
  user=result.data[0].user_id;doc=result.data[0].metadata;
 }
 if(!doc?.state)fail('This player has not selected a hero.',404);
 const prior=(doc.ownerCommandReceipts||[]).find(r=>r.actor===actor&&r.requestId===requestId);
 if(prior){if(prior.command!==input.command)fail('This request ID was already used.',409);return {ok:true,message:prior.message,recovery:prior.recovery};}
 const grant={id:crypto.randomUUID(),mode:parsed.mode,at:now};
 const shared=await client.from('cb_inventory_items').select('user_id,item_id,metadata').eq('item_kind','rpg_battle').contains('metadata',{participants:[user]}).in('metadata->>status',['active','pending']).limit(1).maybeSingle();
 if(shared.error)fail('Battle lookup is unavailable. Please retry.',503);
 let row=shared.data;
 if(!row&&doc.pvpId){const finished=await client.from('cb_inventory_items').select('user_id,item_id,metadata').eq('item_kind','rpg_battle').eq('item_id',doc.pvpId).contains('metadata',{participants:[user]}).limit(1).maybeSingle();if(finished.error)fail('Battle lookup is unavailable. Please retry.',503);row=finished.data;}
 const b=row?.metadata?.state||doc.battle;
 if(b?.status==='finished'&&doc.healthBattle!==b.id){const a=b.actors.find(a=>a.userId===user);if(a){doc.state.currentHp=a.hp;doc.state.currentMp=a.mp;doc.state.currentAp=a.ap;doc.healthBattle=b.id;}}
 if(b&&['active','pending'].includes(b.status)){
  if(doc.offline?.battleId===b.id&&!row){
   if((doc.offline.ownerRecoveries||[]).length>=100)fail('Finish this battle before sending more recovery commands.',409);
   doc.offline.ownerRecoveries=[...(doc.offline.ownerRecoveries||[]),grant];
  }else{
   const combatant=b.actors.find(a=>a.userId===user);if(!combatant)fail('The active hero changed. Retry the command.',409);
   combatant.hp=combatant.maxHp;if(parsed.mode==='recover'){combatant.mp=combatant.maxMp;combatant.ap=combatant.maxAp;}
   b.version++;if(row)await write(client,row.user_id,'rpg_battle',row.item_id,{...row.metadata,state:b});
  }
 }
 doc.state.currentHp=healthCap(doc.state);
 if(parsed.mode==='recover'){doc.state.currentMp=manaCap(doc.state);doc.state.currentAp=C.maxAp(doc.state);}
 doc.ownerRecovery=grant;
 const message=`${doc.name}: ${parsed.mode==='recover'?'Health, AP and MP restored to 100%':'Health restored to 100%'}.`;
 doc.ownerCommandReceipts=[...(doc.ownerCommandReceipts||[]),{actor,requestId,command:input.command,message,recovery:grant}].slice(-50);
 await write(client,user,'rpg_profile','hero',doc);
 const audit=await client.from('cb_admin_logs').insert({actor_user_id:actor,action:'rpg_owner_recovery',details:{user_id:user,hero_name:doc.name,mode:grant.mode,recovery_id:grant.id}});
 if(audit.error)console.warn('rpg.owner-recovery-audit-unavailable',{recovery_id:grant.id});
 return {ok:true,message,recovery:grant};
}
