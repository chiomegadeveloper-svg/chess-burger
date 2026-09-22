-- Complete, identity-preserving audit records for both Chess Burger owners.
begin;

create or replace function public.cb_grant_gold(p_username text,p_amount integer) returns void
language plpgsql security definer set search_path='' as $$
declare uid uuid:=(select auth.uid()); clean_username text:=lower(ltrim(coalesce(p_username,''),'@')); old_gold integer; new_gold integer; actor record;
begin
 if uid is null or not exists(select 1 from public.cb_profiles where user_id=uid and role='owner') then raise exception 'Owner only'; end if;
 if p_amount is null or p_amount<1 or p_amount>10000 then raise exception 'Amount must be 1 to 10000'; end if;
 select gold_points into old_gold from public.cb_profiles where username=clean_username for update;
 if not found then raise exception 'Player not found'; end if;
 update public.cb_profiles set gold_points=gold_points+p_amount where username=clean_username returning gold_points into new_gold;
 select display_name,username,role into actor from public.cb_profiles where user_id=uid;
 insert into public.cb_admin_logs(actor_user_id,action,details) values(uid,'grant_gold',jsonb_build_object(
  'actor_name',actor.display_name,'actor_username',actor.username,'actor_role',actor.role,
  'username',clean_username,'amount',p_amount,'previous_gold',old_gold,'current_gold',new_gold));
end $$;

create or replace function public.cb_set_role(p_username text,p_role text) returns void
language plpgsql security definer set search_path='' as $$
declare actor_id uuid:=(select auth.uid()); target_id uuid; previous_role text; owner_total integer; clean_username text:=lower(ltrim(coalesce(p_username,''),'@')); actor record;
begin
 if actor_id is null or not exists(select 1 from public.cb_profiles where user_id=actor_id and role='owner') then raise exception 'Owner only'; end if;
 if clean_username !~ '^[a-z0-9_]{3,24}$' then raise exception 'Enter a valid username'; end if;
 if p_role not in ('player','admin','owner') then raise exception 'Choose Owner, GM/Admin, or Player'; end if;
 select user_id,role into target_id,previous_role from public.cb_profiles where username=clean_username for update;
 if target_id is null then raise exception 'Player not found'; end if;
 if target_id=actor_id then raise exception 'You cannot change your own access level'; end if;
 if previous_role='owner' and p_role<>'owner' then
  select count(*) into owner_total from public.cb_profiles where role='owner';
  if owner_total<=1 then raise exception 'Chess Burger must keep at least one owner'; end if;
 end if;
 update public.cb_profiles set role=p_role where user_id=target_id;
 select display_name,username,role into actor from public.cb_profiles where user_id=actor_id;
 insert into public.cb_admin_logs(actor_user_id,action,details) values(actor_id,'set_role',jsonb_build_object(
  'actor_name',actor.display_name,'actor_username',actor.username,'actor_role',actor.role,
  'target_user_id',target_id,'username',clean_username,'previous_role',previous_role,'role',p_role));
end $$;

revoke all on function public.cb_grant_gold(text,integer),public.cb_set_role(text,text) from public,anon,authenticated;
grant execute on function public.cb_grant_gold(text,integer),public.cb_set_role(text,text) to authenticated;

create or replace function public.cb_audit_announcement() returns trigger
language plpgsql security definer set search_path='' as $$
declare row_data public.cb_feed; actor record;
begin
 if tg_op='DELETE' then row_data:=old; else row_data:=new; end if;
 if row_data.kind='announcement' then
  select display_name,username,role into actor from public.cb_profiles where user_id=(select auth.uid());
  insert into public.cb_admin_logs(actor_user_id,action,details) values((select auth.uid()),'announcement_'||lower(tg_op),jsonb_build_object(
   'actor_name',actor.display_name,'actor_username',actor.username,'actor_role',actor.role,
   'id',row_data.id,'expires_at',row_data.expires_at,'has_photo',row_data.image_url<>''));
 end if;
 return coalesce(new,old);
end $$;
revoke all on function public.cb_audit_announcement() from public,anon,authenticated;
commit;
