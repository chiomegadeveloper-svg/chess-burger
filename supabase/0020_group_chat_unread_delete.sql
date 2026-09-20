-- Group chat, unread counters and sender-owned message deletion.
-- Safe to run after 0019_chat_hub.sql.
begin;
alter table public.cb_chat_messages add column if not exists group_id uuid;
alter table public.cb_chat_messages add column if not exists read_at timestamptz;
alter table public.cb_chat_messages add column if not exists deleted_at timestamptz;

create table if not exists public.cb_chat_groups(id uuid primary key default gen_random_uuid(),name text not null check(char_length(btrim(name)) between 3 and 48),owner_id uuid not null references public.cb_profiles(user_id) on delete cascade,created_at timestamptz not null default now());
create table if not exists public.cb_chat_group_members(group_id uuid not null references public.cb_chat_groups(id) on delete cascade,user_id uuid not null references public.cb_profiles(user_id) on delete cascade,role text not null default 'member' check(role in('owner','member')),last_read_at timestamptz not null default 'epoch',joined_at timestamptz not null default now(),primary key(group_id,user_id));
create table if not exists public.cb_chat_reads(user_id uuid not null references public.cb_profiles(user_id) on delete cascade,channel text not null check(channel='community'),last_read_at timestamptz not null default now(),primary key(user_id,channel));
alter table public.cb_chat_groups enable row level security;alter table public.cb_chat_group_members enable row level security;alter table public.cb_chat_reads enable row level security;
revoke all on public.cb_chat_groups,public.cb_chat_group_members,public.cb_chat_reads from anon,authenticated;
create index if not exists cb_chat_group_idx on public.cb_chat_messages(group_id,created_at desc) where group_id is not null;

create or replace function public.cb_send_group_chat_message(p_id uuid,p_sender_id uuid,p_group_id uuid,p_body text) returns void language plpgsql security definer set search_path=public as $function$
begin
 p_body:=trim(coalesce(p_body,''));if char_length(p_body) not between 1 and 1000 then raise exception 'Write a message of up to 1,000 characters.';end if;
 if not exists(select 1 from public.cb_chat_group_members where group_id=p_group_id and user_id=p_sender_id) then raise exception 'You are not a member of this group.';end if;
 if exists(select 1 from public.cb_chat_messages where sender_id=p_sender_id and created_at>now()-interval '1 second' and id<>p_id) then raise exception 'Please wait a moment before sending again.';end if;
 insert into public.cb_chat_messages(id,sender_id,recipient_id,group_id,body) values(p_id,p_sender_id,null,p_group_id,p_body) on conflict(id) do nothing;
 delete from public.cb_chat_messages where group_id=p_group_id and id not in(select id from public.cb_chat_messages where group_id=p_group_id order by created_at desc,id desc limit 100);
end;$function$;
revoke all on function public.cb_send_group_chat_message(uuid,uuid,uuid,text) from public,anon,authenticated;grant execute on function public.cb_send_group_chat_message(uuid,uuid,uuid,text) to service_role;
notify pgrst,'reload schema';commit;
