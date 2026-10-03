-- Private, encrypted certificate snapshots and opaque verification tokens.
-- Keep issued certificates even when a classroom room or tournament is removed.
alter table public.cb_seba_certificates alter column room_id drop not null;
alter table public.cb_seba_certificates drop constraint if exists cb_seba_certificates_room_id_fkey;
alter table public.cb_seba_certificates add constraint cb_seba_certificates_room_id_fkey foreign key (room_id) references public.cb_classroom_rooms(id) on delete set null;
alter table public.cb_seba_certificates drop constraint if exists cb_seba_certificates_tournament_id_fkey;
alter table public.cb_seba_certificates add constraint cb_seba_certificates_tournament_id_fkey foreign key (tournament_id) references public.cb_seba_tournaments(id) on delete set null;
create table if not exists public.cb_seba_certificate_proofs (
  certificate_id uuid primary key references public.cb_seba_certificates(id) on delete cascade,
  student_id uuid not null,
  code_hash text not null unique,
  sealed_code text not null,
  sealed_snapshot text not null,
  created_at timestamptz not null default now()
);
create index if not exists cb_seba_certificate_proofs_student_idx on public.cb_seba_certificate_proofs(student_id, created_at desc);
alter table public.cb_seba_certificate_proofs enable row level security;
revoke all on public.cb_seba_certificate_proofs from anon, authenticated;
-- The service-role API alone can issue, read and verify proofs.
