import {database} from './rpg-db.mjs';
export function guildDatabase(){
 const db=database(),originalFrom=db.from.bind(db),originalRpc=db.rpc.bind(db);
 db.guildMembers=new Map();db.guildStashes=new Map();db.guildReceipts=new Map();
 db.from=table=>{
  const rows=()=>table==='cb_guild_members'?[...db.guildMembers].map(([user_id,guild_id])=>({user_id,guild_id})):table==='cb_guilds'?[{id:'guild-a',name:'Test Guild'}]:table==='cb_rpg_guild_stashes'?[...db.guildStashes].map(([guild_id,value])=>({guild_id,...value})):table==='cb_rpg_guild_transfers'?[...db.guildReceipts].map(([request_id,value])=>({request_id,...value})):null;
  if(rows()===null)return originalFrom(table);
  const filters=[];return {select(){return this;},eq(key,value){filters.push(r=>r[key]===value);return this;},async maybeSingle(){return {data:structuredClone(rows().find(r=>filters.every(f=>f(r)))||null),error:null};}};
 };
 db.rpc=async(name,args)=>{
  if(name!=='cb_rpg_guild_transfer')return originalRpc(name,args);
  const user=args.p_user_id,guild=args.p_guild_id,row=[...db.rows.values()].find(r=>r.user_id===user&&r.item_kind==='rpg_profile'),stash=db.guildStashes.get(guild)||{revision:0,items:[]};
  const error=message=>({error:{message}});
  if(db.guildMembers.get(user)!==guild)return error('You must still belong to this guild');
  if(db.guildReceipts.has(args.p_request_id))return {data:{document:structuredClone(row.metadata),guildStash:structuredClone(stash)}};
  if(row.metadata.revision!==args.p_revision||stash.revision!==args.p_stash_revision)return error('This inventory changed. Refresh and retry');
  row.metadata={...structuredClone(args.p_document),revision:args.p_revision+1};
  const next={revision:stash.revision+1,items:structuredClone(args.p_items)};db.guildStashes.set(guild,next);db.guildReceipts.set(args.p_request_id,{user_id:user,guild_id:guild});
  return {data:{document:structuredClone(row.metadata),guildStash:structuredClone(next)},error:null};
 };
 return db;
}
