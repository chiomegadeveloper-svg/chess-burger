-- Shared RPG equipment and CBG storage. Apply to Chess Burger project ohaaoiiuaakidttsonxj.
-- Reviewed installation SQL; no existing guild, hero or wallet rows are rewritten.
begin;
create table if not exists public.cb_rpg_guild_stashes (
 guild_id uuid primary key references public.cb_guilds(id) on delete cascade,
 revision integer not null default 0 check(revision>=0),
 items jsonb not null default '[]'::jsonb check(jsonb_typeof(items)='array' and jsonb_array_length(items)<=144),
 updated_at timestamptz not null default now()
);
alter table public.cb_rpg_guild_stashes add column if not exists cbg_balance bigint not null default 0 check(cbg_balance between 0 and 2147483647);
create table if not exists public.cb_rpg_guild_transfers (
 request_id uuid primary key,
 user_id uuid not null references public.cb_profiles(user_id),
 guild_id uuid not null references public.cb_guilds(id),
 item_uid text not null,
 from_zone text not null check(from_zone in('bag','stash','guild')),
 to_zone text not null check(to_zone in('bag','stash','guild')),
 created_at timestamptz not null default now()
);
create index if not exists cb_rpg_guild_transfers_guild_time on public.cb_rpg_guild_transfers(guild_id,created_at desc);
alter table public.cb_rpg_guild_stashes enable row level security;
alter table public.cb_rpg_guild_transfers enable row level security;
revoke all on public.cb_rpg_guild_stashes,public.cb_rpg_guild_transfers from public,anon,authenticated;
grant select,insert,update,delete on public.cb_rpg_guild_stashes,public.cb_rpg_guild_transfers to service_role;

create or replace function public.cb_rpg_guild_transfer(
 p_user_id uuid,p_guild_id uuid,p_request_id uuid,p_revision integer,p_stash_revision integer,
 p_document jsonb,p_items jsonb,p_item_uid text,p_from text,p_to text
) returns jsonb language plpgsql security invoker set search_path=public as $$
declare v_doc jsonb;v_stash public.cb_rpg_guild_stashes%rowtype;v_receipt public.cb_rpg_guild_transfers%rowtype;
begin
 -- Match guild leave/kick lock order, then retain membership throughout the transfer.
 perform 1 from public.cb_guilds where id=p_guild_id for update;
 if not found then raise exception 'Guild is no longer available';end if;
 perform 1 from public.cb_guild_members where guild_id=p_guild_id and user_id=p_user_id for share;
 if not found then raise exception 'You must still belong to this guild';end if;
 select metadata into v_doc from public.cb_inventory_items where user_id=p_user_id and item_kind='rpg_profile' and item_id='hero' for update;
 if not found or v_doc->'state' is null or v_doc->'state'='null'::jsonb then raise exception 'Choose your hero first';end if;
 insert into public.cb_rpg_guild_stashes(guild_id) values(p_guild_id) on conflict do nothing;
 select * into v_stash from public.cb_rpg_guild_stashes where guild_id=p_guild_id for update;
 select * into v_receipt from public.cb_rpg_guild_transfers where request_id=p_request_id;
 if found then
  if v_receipt.user_id<>p_user_id or v_receipt.guild_id<>p_guild_id then raise exception 'Transfer reference is unavailable';end if;
  return jsonb_build_object('document',v_doc,'guildStash',jsonb_build_object('revision',v_stash.revision,'items',v_stash.items,'cbg',v_stash.cbg_balance));
 end if;
 if coalesce((v_doc->>'revision')::integer,0)<>p_revision or v_stash.revision<>p_stash_revision then raise exception 'This inventory changed. Refresh and retry';end if;
 if coalesce(v_doc->>'generation','')<>coalesce(p_document->>'generation','') then raise exception 'Your hero was reset. Reopen RPG';end if;
 if v_doc#>>'{battle,status}'='active' or exists(select 1 from public.cb_inventory_items where item_kind='rpg_battle' and metadata->'participants' ? p_user_id::text and metadata->>'status' in('active','pending')) then raise exception 'Finish your battle before using the guild stash';end if;
 if p_request_id is null or p_from not in('bag','stash','guild') or p_to not in('bag','stash','guild') or (p_from<>'guild' and p_to<>'guild') or jsonb_typeof(p_items)<>'array' then raise exception 'Invalid guild transfer';end if;
 if coalesce((p_document#>>'{state,inventoryRevision}')::integer,0)<>coalesce((v_doc#>>'{state,inventoryRevision}')::integer,0)+1 then raise exception 'Invalid inventory revision';end if;
 v_doc=jsonb_set(p_document,'{revision}',to_jsonb(p_revision+1));
 update public.cb_inventory_items set metadata=v_doc,updated_at=now() where user_id=p_user_id and item_kind='rpg_profile' and item_id='hero';
 update public.cb_rpg_guild_stashes set items=p_items,revision=revision+1,updated_at=now() where guild_id=p_guild_id returning * into v_stash;
 insert into public.cb_rpg_guild_transfers(request_id,user_id,guild_id,item_uid,from_zone,to_zone) values(p_request_id,p_user_id,p_guild_id,p_item_uid,p_from,p_to);
 return jsonb_build_object('document',v_doc,'guildStash',jsonb_build_object('revision',v_stash.revision,'items',v_stash.items,'cbg',v_stash.cbg_balance));
end $$;
revoke all on function public.cb_rpg_guild_transfer(uuid,uuid,uuid,integer,integer,jsonb,jsonb,text,text,text) from public,anon,authenticated;
grant execute on function public.cb_rpg_guild_transfer(uuid,uuid,uuid,integer,integer,jsonb,jsonb,text,text,text) to service_role;

create table if not exists public.cb_rpg_guild_cbg_transfers (
 request_id uuid primary key,
 user_id uuid not null references public.cb_profiles(user_id),
 guild_id uuid not null references public.cb_guilds(id),
 direction text not null check(direction in('deposit','withdraw')),
 amount integer not null check(amount between 1 and 1000000),
 wallet_after integer not null check(wallet_after>=0),
 stash_after bigint not null check(stash_after between 0 and 2147483647),
 created_at timestamptz not null default now()
);
create index if not exists cb_rpg_guild_cbg_guild_time on public.cb_rpg_guild_cbg_transfers(guild_id,created_at desc);
create index if not exists cb_rpg_guild_cbg_user_time on public.cb_rpg_guild_cbg_transfers(user_id,created_at desc);
alter table public.cb_rpg_guild_cbg_transfers enable row level security;
revoke all on public.cb_rpg_guild_cbg_transfers from public,anon,authenticated;
grant select,insert,update,delete on public.cb_rpg_guild_cbg_transfers to service_role;

create or replace function public.cb_rpg_guild_cbg(p_user_id uuid,p_guild_id uuid,p_request_id uuid,p_direction text,p_amount integer,p_generation text)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare v_gold integer;v_doc jsonb;v_stash public.cb_rpg_guild_stashes%rowtype;v_prior public.cb_rpg_guild_cbg_transfers%rowtype;v_delta integer;
begin
 -- Same guild→wallet→hero lock order as guild donations and merchant/reward settlement.
 perform 1 from public.cb_guilds where id=p_guild_id for update;
 if not found then raise exception 'Guild is no longer available';end if;
 perform 1 from public.cb_guild_members where guild_id=p_guild_id and user_id=p_user_id for share;
 if not found then raise exception 'You must still belong to this guild';end if;
 select gold_points into v_gold from public.cb_profiles where user_id=p_user_id for update;
 if not found or v_gold is null then raise exception 'Your CBG account is unavailable';end if;
 select metadata into v_doc from public.cb_inventory_items where user_id=p_user_id and item_kind='rpg_profile' and item_id='hero' for update;
 if not found or v_doc->'state' is null or v_doc->'state'='null'::jsonb then raise exception 'Choose your hero first';end if;
 if coalesce(v_doc->>'generation','')<>coalesce(p_generation,'') then raise exception 'Your hero was reset. Reopen RPG';end if;
 insert into public.cb_rpg_guild_stashes(guild_id) values(p_guild_id) on conflict do nothing;
 select * into v_stash from public.cb_rpg_guild_stashes where guild_id=p_guild_id for update;
 if p_request_id is null or p_direction is null or p_direction not in('deposit','withdraw') or p_amount is null or p_amount<1 or p_amount>1000000 then raise exception 'Enter a whole CBG amount from 1 to 1,000,000';end if;
 select * into v_prior from public.cb_rpg_guild_cbg_transfers where request_id=p_request_id;
 if found then
  if v_prior.user_id<>p_user_id or v_prior.guild_id<>p_guild_id or v_prior.direction<>p_direction or v_prior.amount<>p_amount then raise exception 'Transfer reference was already used';end if;
  return jsonb_build_object('document',jsonb_set(v_doc,'{state,cbg}',to_jsonb(v_gold)),'walletCbg',v_gold,'guildStash',jsonb_build_object('revision',v_stash.revision,'items',v_stash.items,'cbg',v_stash.cbg_balance));
 end if;
 if v_doc#>>'{battle,status}'='active' or exists(select 1 from public.cb_inventory_items where item_kind='rpg_battle' and metadata->'participants' ? p_user_id::text and metadata->>'status' in('active','pending')) then raise exception 'Finish your battle before using the guild stash';end if;
 v_delta=case when p_direction='deposit' then -p_amount else p_amount end;
 if v_gold::bigint+v_delta<0 then raise exception 'Not enough CBG in your wallet';end if;
 if v_stash.cbg_balance-v_delta<0 then raise exception 'Not enough CBG in the guild stash';end if;
 if v_gold::bigint+v_delta>2147483647 or v_stash.cbg_balance-v_delta>2147483647 then raise exception 'CBG balance limit reached';end if;
 update public.cb_profiles set gold_points=gold_points+v_delta where user_id=p_user_id;
 v_doc=jsonb_set(jsonb_set(v_doc,'{state,cbg}',to_jsonb(v_gold+v_delta)),'{revision}',to_jsonb(coalesce((v_doc->>'revision')::integer,0)+1));
 update public.cb_inventory_items set metadata=v_doc,updated_at=now() where user_id=p_user_id and item_kind='rpg_profile' and item_id='hero';
 update public.cb_rpg_guild_stashes set cbg_balance=cbg_balance-v_delta,revision=revision+1,updated_at=now() where guild_id=p_guild_id returning * into v_stash;
 insert into public.cb_gold_ledger(id,user_id,delta,kind,reference_id) values('rpg-guild-cbg:'||p_request_id::text,p_user_id,v_delta,case when v_delta<0 then 'rpg_guild_deposit' else 'rpg_guild_withdrawal' end,p_request_id);
 insert into public.cb_rpg_guild_cbg_transfers(request_id,user_id,guild_id,direction,amount,wallet_after,stash_after) values(p_request_id,p_user_id,p_guild_id,p_direction,p_amount,v_gold+v_delta,v_stash.cbg_balance);
 return jsonb_build_object('document',v_doc,'walletCbg',v_gold+v_delta,'guildStash',jsonb_build_object('revision',v_stash.revision,'items',v_stash.items,'cbg',v_stash.cbg_balance));
end $$;
revoke all on function public.cb_rpg_guild_cbg(uuid,uuid,uuid,text,integer,text) from public,anon,authenticated;
grant execute on function public.cb_rpg_guild_cbg(uuid,uuid,uuid,text,integer,text) to service_role;
notify pgrst,'reload schema';
commit;
