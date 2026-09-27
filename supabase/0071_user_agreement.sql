begin;

alter table public.cb_profiles
  add column if not exists agreement_version text;
alter table public.cb_profiles
  add column if not exists agreement_accepted_at timestamptz;

-- Existing and new accounts start without acceptance and must opt in.
-- Do not mark agreement_accepted_at on behalf of a user.
update public.cb_profiles
set agreement_version = null
where agreement_version = 'legacy-exempt';

commit;
