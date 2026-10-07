-- Requires 0101. Publishes a finite daily/weekly batch atomically.
begin;
create or replace function public.cb_create_arena_series(
 p_owner_id uuid,p_title text,p_starts_at timestamptz,p_ends_at timestamptz,
 p_loss_limit integer,p_repeat text,p_count integer
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_step integer;v_session jsonb;v_sessions jsonb:='[]'::jsonb;i integer;
begin
 perform pg_advisory_xact_lock(hashtext('cb_arena_owner_schedule'));
 if not exists(select 1 from public.cb_profiles where user_id=p_owner_id and role='owner') then raise exception 'Owner access is required.';end if;
 if p_repeat is null or p_repeat not in('daily','weekly') or p_count is null or p_count not between 2 and 28 then raise exception 'Choose daily or weekly and 2–28 sessions.';end if;
 v_step:=case when p_repeat='weekly' then 7 else 1 end;
 for i in 0..p_count-1 loop
  v_session:=public.cb_save_arena_session(p_owner_id,null,p_title,
   p_starts_at+make_interval(hours=>i*v_step*24),
   p_ends_at+make_interval(hours=>i*v_step*24),p_loss_limit);
  v_sessions:=v_sessions||jsonb_build_array(v_session);
 end loop;
 return jsonb_build_object('sessions',v_sessions,'count',p_count);
end $$;
revoke all on function public.cb_create_arena_series(uuid,text,timestamptz,timestamptz,integer,text,integer) from public,anon,authenticated;
grant execute on function public.cb_create_arena_series(uuid,text,timestamptz,timestamptz,integer,text,integer) to service_role;
commit;
