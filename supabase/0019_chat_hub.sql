-- Community and personal chat with per-user hide/mute preferences.
-- Only the latest 100 community messages and latest 100 messages per pair survive.
begin;

-- Follow and block links use active in the live API. Earlier schemas only
-- permitted pending/accepted, which made those actions fail at insertion.
alter table public.cb_social_links drop constraint if exists cb_social_links_status_check;
alter table public.cb_social_links add constraint cb_social_links_status_check
  check(status in ('pending','accepted','active'));

create table if not exists public.cb_chat_messages (
  id uuid primary key,
  sender_id uuid not null references public.cb_profiles(user_id) on delete cascade,
  recipient_id uuid references public.cb_profiles(user_id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  check (recipient_id is null or sender_id <> recipient_id)
);

create index if not exists cb_chat_community_idx
  on public.cb_chat_messages(created_at desc) where recipient_id is null;
create index if not exists cb_chat_sender_idx
  on public.cb_chat_messages(sender_id,created_at desc);
create index if not exists cb_chat_recipient_idx
  on public.cb_chat_messages(recipient_id,created_at desc);

create table if not exists public.cb_chat_preferences (
  user_id uuid not null references public.cb_profiles(user_id) on delete cascade,
  other_user_id uuid not null references public.cb_profiles(user_id) on delete cascade,
  muted boolean not null default false,
  hidden_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key(user_id,other_user_id),
  check(user_id<>other_user_id)
);

alter table public.cb_chat_messages enable row level security;
alter table public.cb_chat_preferences enable row level security;
revoke all on public.cb_chat_messages,public.cb_chat_preferences from anon,authenticated;

create or replace function public.cb_send_chat_message(
  p_id uuid,
  p_sender_id uuid,
  p_recipient_id uuid,
  p_body text
)
returns void
language plpgsql
security definer
set search_path=public
as $function$
begin
  p_body:=trim(coalesce(p_body,''));
  if char_length(p_body) not between 1 and 1000 then
    raise exception 'Write a message of up to 1,000 characters.';
  end if;
  if p_recipient_id=p_sender_id then raise exception 'Choose another registered player.'; end if;
  if p_recipient_id is not null and not exists(select 1 from public.cb_profiles where user_id=p_recipient_id) then
    raise exception 'This player is unavailable.';
  end if;
  if p_recipient_id is not null and exists(
    select 1 from public.cb_social_links
    where kind='block' and ((user_id=p_sender_id and target_id=p_recipient_id) or (user_id=p_recipient_id and target_id=p_sender_id))
  ) then raise exception 'Chat with this player is blocked.'; end if;

  -- Serialize pruning per room so concurrent sends cannot leave 101 rows.
  perform pg_advisory_xact_lock(hashtextextended(
    case when p_recipient_id is null then 'community'
      else least(p_sender_id::text,p_recipient_id::text)||':'||greatest(p_sender_id::text,p_recipient_id::text)
    end,0
  ));
  if exists(select 1 from public.cb_chat_messages where sender_id=p_sender_id and created_at>now()-interval '1 second' and id<>p_id) then
    raise exception 'Please wait a moment before sending again.';
  end if;

  insert into public.cb_chat_messages(id,sender_id,recipient_id,body)
  values(p_id,p_sender_id,p_recipient_id,p_body)
  on conflict(id) do nothing;

  if p_recipient_id is null then
    delete from public.cb_chat_messages
    where recipient_id is null and id not in(
      select id from public.cb_chat_messages where recipient_id is null order by created_at desc,id desc limit 100
    );
  else
    delete from public.cb_chat_messages
    where recipient_id is not null
      and ((sender_id=p_sender_id and recipient_id=p_recipient_id) or (sender_id=p_recipient_id and recipient_id=p_sender_id))
      and id not in(
        select id from public.cb_chat_messages
        where (sender_id=p_sender_id and recipient_id=p_recipient_id) or (sender_id=p_recipient_id and recipient_id=p_sender_id)
        order by created_at desc,id desc limit 100
      );
  end if;
end;
$function$;

revoke all on function public.cb_send_chat_message(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.cb_send_chat_message(uuid,uuid,uuid,text) to service_role;

notify pgrst,'reload schema';
commit;
