-- SEba by Chess Burger v1.021: teachers may buy CBC directly for an active student.
create or replace function public.cb_buy_cbc_for_student(
  p_teacher_id uuid,
  p_room_id uuid,
  p_username text,
  p_quantity integer,
  p_request_id uuid
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  recipient uuid;
  unit_price integer;
  total integer;
  teacher_gold integer;
  recipient_cbc bigint;
  ledger_id text := 'seba-student-cbc:' || p_request_id::text;
begin
  if p_quantity<1 or p_quantity>1000 then
    raise exception 'CBC quantity must be 1 to 1000';
  end if;

  if not exists(
    select 1 from public.cb_classroom_rooms
    where id=p_room_id and teacher_id=p_teacher_id
      and status='active' and expires_at>now()
  ) then
    raise exception 'Only the active room teacher can buy CBC for its students';
  end if;

  select p.user_id into recipient
  from public.cb_profiles p
  join public.cb_classroom_enrollments e
    on e.student_id=p.user_id and e.room_id=p_room_id
  where lower(p.username)=lower(trim(leading '@' from p_username));
  if recipient is null then
    raise exception 'Student username is not enrolled in this room';
  end if;

  select cbc_gold_price into unit_price
  from public.cb_classroom_settings where id=true;
  if coalesce(unit_price,0)<1 then
    raise exception 'The owner has not set the CBC price yet';
  end if;
  total := unit_price*p_quantity;

  insert into public.cb_classroom_wallets(user_id)
  values(recipient) on conflict(user_id) do nothing;
  if exists(select 1 from public.cb_classroom_credit_ledger where id=ledger_id) then
    select gold_points into teacher_gold from public.cb_profiles where user_id=p_teacher_id;
    select cbc into recipient_cbc from public.cb_classroom_wallets where user_id=recipient;
    return jsonb_build_object('gold',teacher_gold,'recipient_cbc',recipient_cbc);
  end if;

  select gold_points into teacher_gold
  from public.cb_profiles where user_id=p_teacher_id for update;
  if teacher_gold<total then raise exception 'Not enough CBG'; end if;

  update public.cb_profiles set gold_points=gold_points-total
  where user_id=p_teacher_id returning gold_points into teacher_gold;
  update public.cb_classroom_wallets set cbc=cbc+p_quantity,updated_at=now()
  where user_id=recipient returning cbc into recipient_cbc;
  insert into public.cb_gold_ledger(id,user_id,delta,kind,reference_id)
  values(ledger_id,p_teacher_id,-total,'seba_student_cbc',p_room_id);
  insert into public.cb_classroom_credit_ledger(id,user_id,delta,kind,reference_id)
  values(ledger_id,recipient,p_quantity,'teacher_purchase',p_room_id);

  return jsonb_build_object('gold',teacher_gold,'recipient_cbc',recipient_cbc);
end $$;

revoke all on function public.cb_buy_cbc_for_student(uuid,uuid,text,integer,uuid)
from public,anon,authenticated;
grant execute on function public.cb_buy_cbc_for_student(uuid,uuid,text,integer,uuid)
to service_role;
