-- Apply to the Chess Burger production project. Safe to rerun.
-- Only the trusted server can settle a saved victory receipt.
begin;
create or replace function public.cb_rpg_battle_reward(p_user_id uuid,p_battle_id uuid)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare v_gold integer;v_doc jsonb;v_reward jsonb;v_amount integer;v_index integer;
begin
 select gold_points into v_gold from public.cb_profiles where user_id=p_user_id for update;
 if not found then raise exception 'Your CBG account is unavailable';end if;
 select metadata into v_doc from public.cb_inventory_items where user_id=p_user_id and item_kind='rpg_profile' and item_id='hero' for update;
 if not found then raise exception 'Choose your hero first';end if;
 select value,(ordinality-1)::integer into v_reward,v_index from jsonb_array_elements(coalesce(v_doc->'awards','[]')) with ordinality where value->>'id'=p_battle_id::text;
 if v_reward is null then raise exception 'Victory receipt unavailable';end if;
 if coalesce((v_reward->>'cbgPaid')::boolean,false) then return jsonb_set(v_doc,'{state,cbg}',to_jsonb(v_gold));end if;
 v_amount=coalesce((v_reward->>'cbg')::integer,0);
 if v_amount<1 or v_amount>24 then raise exception 'Invalid victory reward';end if;
 if v_gold::bigint+v_amount>2147483647 then raise exception 'CBG balance limit reached';end if;
 if not exists(select 1 from public.cb_gold_ledger where id='rpg-victory:'||p_battle_id::text) then
  insert into public.cb_gold_ledger(id,user_id,delta,kind,reference_id) values('rpg-victory:'||p_battle_id::text,p_user_id,v_amount,'rpg_monster_reward',p_battle_id);
  update public.cb_profiles set gold_points=gold_points+v_amount where user_id=p_user_id;
  v_gold=v_gold+v_amount;
 elsif not exists(select 1 from public.cb_gold_ledger where id='rpg-victory:'||p_battle_id::text and user_id=p_user_id) then raise exception 'Reward reference unavailable';end if;
 v_doc=jsonb_set(v_doc,array['awards',v_index::text,'cbgPaid'],'true'::jsonb);
 v_doc=jsonb_set(jsonb_set(v_doc,'{state,cbg}',to_jsonb(v_gold)),'{revision}',to_jsonb(coalesce((v_doc->>'revision')::integer,0)+1));
 update public.cb_inventory_items set metadata=v_doc,updated_at=now() where user_id=p_user_id and item_kind='rpg_profile' and item_id='hero';
 return v_doc;
end $$;
revoke all on function public.cb_rpg_battle_reward(uuid,uuid) from public,anon,authenticated;
grant execute on function public.cb_rpg_battle_reward(uuid,uuid) to service_role;
notify pgrst,'reload schema';
commit;
