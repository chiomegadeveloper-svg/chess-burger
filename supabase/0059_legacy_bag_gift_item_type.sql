-- Preserve legacy cb_item_gifts.item_type when newer gift RPCs write item_kind.
-- Older databases have item_type NOT NULL; migration 0058 adds item_kind but
-- CREATE TABLE IF NOT EXISTS leaves the legacy constraint in place.
begin;

create or replace function public.cb_fill_legacy_item_gift_type()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.item_type is null then
    new.item_type := new.item_kind;
  end if;
  return new;
end;
$$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'cb_item_gifts' and column_name = 'item_type'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'cb_item_gifts' and column_name = 'item_kind'
  ) then
    drop trigger if exists cb_fill_legacy_item_gift_type on public.cb_item_gifts;
    create trigger cb_fill_legacy_item_gift_type
      before insert on public.cb_item_gifts
      for each row execute function public.cb_fill_legacy_item_gift_type();
  end if;
end;
$$;

revoke all on function public.cb_fill_legacy_item_gift_type() from public, anon, authenticated;
grant execute on function public.cb_fill_legacy_item_gift_type() to service_role;

commit;
