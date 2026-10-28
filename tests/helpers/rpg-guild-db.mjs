import {database} from './rpg-db.mjs';
export function guildDatabase(){
 const db=database(),originalFrom=db.from.bind(db),originalRpc=db.rpc.bind(db);
 db.guildMembers=new Map();db.guildStashes=new Map();db.guildReceipts=new Map();db.guildWallets=new Map();db.guildCbgReceipts=new Map();db.guildGoldLedger=[];
 db.from=table=>{
  if(table==='cb_profiles'){let user;return {select(){return this;},eq(key,value){if(key==='user_id')user=value;return this;},async maybeSingle(){return {data:{user_id:user,gold_points:db.guildWallets.get(user)||0,display_name:'Test Player'},error:null};}};}
  const rows=()=>table==='cb_guild_members'?[...db.guildMembers].map(([user_id,guild_id])=>({user_id,guild_id})):table==='cb_guilds'?[{id:'guild-a',name:'Test Guild'}]:table==='cb_rpg_guild_stashes'?[...db.guildStashes].map(([guild_id,value])=>({guild_id,...value})):table==='cb_rpg_guild_transfers'?[...db.guildReceipts].map(([request_id,value])=>({request_id,...value})):null;
  if(rows()===null)return originalFrom(table);
  const filters=[];return {select(){return this;},eq(key,value){filters.push(r=>r[key]===value);return this;},async maybeSingle(){return {data:structuredClone(rows().find(r=>filters.every(f=>f(r)))||null),error:null};}};
 };
 db.rpc=async(name,args)=>{
  if(name==='cb_rpg_guild_cbg'){
   const user=args.p_user_id,guild=args.p_guild_id,row=[...db.rows.values()].find(r=>r.user_id===user&&r.item_kind==='rpg_profile'),stash=db.guildStashes.get(guild)||{revision:0,items:[],cbg_balance:0},balance=db.guildWallets.get(user)||0,prior=db.guildCbgReceipts.get(args.p_request_id);
   const error=message=>({error:{message}});
   if(db.guildMembers.get(user)!==guild)return error('You must still belong to this guild');
   const result=()=>({data:{document:structuredClone(row.metadata),walletCbg:db.guildWallets.get(user)||0,guildStash:{revision:(db.guildStashes.get(guild)||stash).revision,items:structuredClone((db.guildStashes.get(guild)||stash).items),cbg:(db.guildStashes.get(guild)||stash).cbg_balance||0}},error:null});
   if(prior){if(prior.user!==user||prior.guild!==guild||prior.amount!==args.p_amount||prior.direction!==args.p_direction)return error('Transfer reference was already used');return result();}
   const delta=args.p_direction==='deposit'?-args.p_amount:args.p_amount,shared=stash.cbg_balance||0;
   if(balance+delta<0)return error('Not enough CBG in your wallet');if(shared-delta<0)return error('Not enough CBG in the guild stash');
   db.guildWallets.set(user,balance+delta);db.guildStashes.set(guild,{...stash,revision:stash.revision+1,cbg_balance:shared-delta});row.metadata={...structuredClone(row.metadata),revision:row.metadata.revision+1,state:{...structuredClone(row.metadata.state),cbg:balance+delta}};db.guildCbgReceipts.set(args.p_request_id,{user,guild,direction:args.p_direction,amount:args.p_amount});db.guildGoldLedger.push({user,delta,requestId:args.p_request_id});return result();
  }
  if(name!=='cb_rpg_guild_transfer')return originalRpc(name,args);
  const user=args.p_user_id,guild=args.p_guild_id,row=[...db.rows.values()].find(r=>r.user_id===user&&r.item_kind==='rpg_profile'),stash=db.guildStashes.get(guild)||{revision:0,items:[]};
  const error=message=>({error:{message}});
  if(db.guildMembers.get(user)!==guild)return error('You must still belong to this guild');
  if(db.guildReceipts.has(args.p_request_id))return {data:{document:structuredClone(row.metadata),guildStash:structuredClone(stash)}};
  if(row.metadata.revision!==args.p_revision||stash.revision!==args.p_stash_revision)return error('This inventory changed. Refresh and retry');
  row.metadata={...structuredClone(args.p_document),revision:args.p_revision+1};
  const next={...stash,revision:stash.revision+1,items:structuredClone(args.p_items)};db.guildStashes.set(guild,next);db.guildReceipts.set(args.p_request_id,{user_id:user,guild_id:guild});
  return {data:{document:structuredClone(row.metadata),guildStash:{...structuredClone(next),cbg:next.cbg_balance||0}},error:null};
 };
 return db;
}
