-- Vercel + Supabase CMS role migration. Run once in Supabase SQL Editor.
-- Owners may assign Owner, GM/Admin, or Player. At least one owner always remains.
begin;
create or replace function public.cb_set_role(p_username text,p_role text) returns void
language plpgsql security definer set search_path='' as $$
declare
 actor_id uuid:=(select auth.uid());
 target_id uuid;
 target_role text;
 owner_total integer;
 clean_username text:=lower(ltrim(coalesce(p_username,''),'@'));
begin
 if actor_id is null or not exists(select 1 from public.cb_profiles where user_id=actor_id and role='owner') then
  raise exception 'Owner only';
 end if;
 if clean_username !~ '^[a-z0-9_]{3,24}$' then raise exception 'Enter a valid username'; end if;
 if p_role not in ('player','admin','owner') then raise exception 'Choose Owner, GM/Admin, or Player'; end if;
 select user_id,role into target_id,target_role from public.cb_profiles where username=clean_username for update;
 if target_id is null then raise exception 'Player not found'; end if;
 if target_id=actor_id then raise exception 'You cannot change your own access level'; end if;
 if target_role='owner' and p_role<>'owner' then
  select count(*) into owner_total from public.cb_profiles where role='owner';
  if owner_total<=1 then raise exception 'Chess Burger must keep at least one owner'; end if;
 end if;
 update public.cb_profiles set role=p_role where user_id=target_id;
 insert into public.cb_admin_logs(actor_user_id,action,details)
 values(actor_id,'set_role',jsonb_build_object('username',clean_username,'role',p_role));
end;
$$;
revoke all on function public.cb_set_role(text,text) from public,anon,authenticated;
grant execute on function public.cb_set_role(text,text) to authenticated;
commit;