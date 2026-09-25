-- Older Bag gift tables require product_id as well as the newer item_id.
-- Fill the legacy field before its NOT NULL constraint is checked.
begin;

create or replace function public.cb_fill_legacy_item_gift_product_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.product_id is null then
    new.product_id := new.item_id;
  end if;
  return new;
end;
$$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'cb_item_gifts' and column_name = 'product_id'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'cb_item_gifts' and column_name = 'item_id'
  ) then
    drop trigger if exists cb_fill_legacy_item_gift_product_id on public.cb_item_gifts;
    create trigger cb_fill_legacy_item_gift_product_id
      before insert on public.cb_item_gifts
      for each row execute function public.cb_fill_legacy_item_gift_product_id();
  end if;
end;
$$;

revoke all on function public.cb_fill_legacy_item_gift_product_id() from public, anon, authenticated;
grant execute on function public.cb_fill_legacy_item_gift_product_id() to service_role;

commit;
