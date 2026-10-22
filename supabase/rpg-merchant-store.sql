-- Atomic merchant trades. Apply once to the Chess Burger production project.
-- Only the trusted server may call this function; item rolls/prices are server-owned.
begin;
create or replace function public.cb_rpg_merchant_trade(p_user_id uuid,p_request_id uuid,p_revision integer,p_delta integer,p_document jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare v_gold integer;v_doc jsonb;v_previous public.cb_gold_ledger%rowtype;
begin
 select gold_points into v_gold from public.cb_profiles where user_id=p_user_id for update;
 if not found then raise exception 'Your CBG account is unavailable';end if;
 select metadata into v_doc from public.cb_inventory_items where user_id=p_user_id and item_kind='rpg_profile' and item_id='hero' for update;
 if not found then raise exception 'Choose your hero first';end if;
 if p_delta=0 and p_request_id is null and p_document is null then return jsonb_set(v_doc,'{state,cbg}',to_jsonb(v_gold));end if;
 select * into v_previous from public.cb_gold_ledger where id='rpg-merchant:'||p_request_id::text;
 if found then
  if v_previous.user_id<>p_user_id then raise exception 'Trade reference is unavailable';end if;
  return jsonb_set(v_doc,'{state,cbg}',to_jsonb(v_gold));
 end if;
 if coalesce((v_doc->>'revision')::integer,0)<>p_revision then raise exception 'Your inventory changed. Reopen the merchant';end if;
 if coalesce(p_document->>'generation','')<>coalesce(v_doc->>'generation','') then raise exception 'Your hero was reset. Reopen RPG';end if;
 if p_delta=0 or abs(p_delta)>1000000 then raise exception 'Invalid merchant price';end if;
 if v_gold+p_delta<0 then raise exception 'Not enough CBG';end if;
 if v_gold::bigint+p_delta>2147483647 then raise exception 'CBG balance limit reached';end if;
 if v_doc#>>'{battle,status}'='active' or exists(select 1 from public.cb_inventory_items where item_kind='rpg_battle' and metadata->'participants' ? p_user_id::text and metadata->>'status' in('active','pending')) then raise exception 'Finish your battle before trading';end if;
 v_doc=jsonb_set(jsonb_set(p_document,'{revision}',to_jsonb(p_revision+1)),'{state,cbg}',to_jsonb(v_gold+p_delta));
 update public.cb_profiles set gold_points=gold_points+p_delta where user_id=p_user_id;
 update public.cb_inventory_items set metadata=v_doc,updated_at=now() where user_id=p_user_id and item_kind='rpg_profile' and item_id='hero';
 insert into public.cb_gold_ledger(id,user_id,delta,kind,reference_id) values('rpg-merchant:'||p_request_id::text,p_user_id,p_delta,case when p_delta<0 then 'rpg_merchant_purchase' else 'rpg_merchant_sale' end,p_request_id);
 return v_doc;
end $$;
revoke all on function public.cb_rpg_merchant_trade(uuid,uuid,integer,integer,jsonb) from public,anon,authenticated;
grant execute on function public.cb_rpg_merchant_trade(uuid,uuid,integer,integer,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
