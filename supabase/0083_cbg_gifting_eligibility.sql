begin;

-- CBG gifting is a progression feature. Enforce the rule in the database so
-- older clients and direct API calls cannot bypass the Bag interface.
create or replace function public.cb_gift_gold(p_sender_id uuid,p_username text,p_amount integer,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_recipient uuid;v_sender_gold integer;v_sender_cbr integer;v_recipient_gold integer;v_inserted uuid;
begin
 if p_amount<1 then raise exception 'Enter a valid CBG amount.';end if;
 select user_id into v_recipient from public.cb_profiles where lower(username)=lower(trim(both '@' from p_username));
 if v_recipient is null then raise exception 'Player username not found.';end if;
 if v_recipient=p_sender_id then raise exception 'You cannot gift CBG to yourself.';end if;
 perform pg_advisory_xact_lock(hashtextextended(least(p_sender_id::text,v_recipient::text)||greatest(p_sender_id::text,v_recipient::text),0));
 select gold_points,cbr into v_sender_gold,v_sender_cbr from public.cb_profiles where user_id=p_sender_id for update;
 if v_sender_gold is null then raise exception 'Player profile not found.';end if;
 if coalesce(v_sender_cbr,0)<177 then raise exception 'Reach Player Level 3 before gifting CBG.';end if;
 if v_sender_gold<188 then raise exception 'Keep at least 188 CBG in your balance to activate CBG gifting.';end if;
 perform 1 from public.cb_profiles where user_id=v_recipient for update;
 insert into public.cb_gold_gifts(request_id,sender_id,recipient_id,amount)
 values(p_request_id,p_sender_id,v_recipient,p_amount)
 on conflict(request_id) do nothing returning request_id into v_inserted;
 if v_inserted is null then return jsonb_build_object('gifted',false,'gold',v_sender_gold);end if;
 if v_sender_gold<p_amount then raise exception 'You do not have enough CBG.';end if;
 update public.cb_profiles set gold_points=gold_points-p_amount where user_id=p_sender_id returning gold_points into v_sender_gold;
 update public.cb_profiles set gold_points=gold_points+p_amount where user_id=v_recipient returning gold_points into v_recipient_gold;
 insert into public.cb_gold_ledger(id,user_id,delta,kind,reference_id) values('gold-gift-out:'||p_request_id::text,p_sender_id,-p_amount,'gold_gift',p_request_id) on conflict(id) do nothing;
 insert into public.cb_gold_ledger(id,user_id,delta,kind,reference_id) values('gold-gift-in:'||p_request_id::text,v_recipient,p_amount,'gold_gift',p_request_id) on conflict(id) do nothing;
 return jsonb_build_object('gifted',true,'gold',v_sender_gold,'recipient_id',v_recipient,'recipient_gold',v_recipient_gold,'amount',p_amount);
end $$;

revoke all on function public.cb_gift_gold(uuid,text,integer,uuid) from public,anon,authenticated;
grant execute on function public.cb_gift_gold(uuid,text,integer,uuid) to service_role;

commit;
