begin;

create table if not exists public.cb_profile_testimonials (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.cb_profiles(user_id) on delete cascade,
  author_id uuid not null references public.cb_profiles(user_id) on delete cascade,
  body text not null check (char_length(body) between 2 and 400),
  created_at timestamptz not null default now(),
  check (profile_id <> author_id)
);

create table if not exists public.cb_testimonial_hearts (
  testimonial_id uuid not null references public.cb_profile_testimonials(id) on delete cascade,
  user_id uuid not null references public.cb_profiles(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (testimonial_id, user_id)
);

create index if not exists cb_profile_testimonials_profile_created_idx
  on public.cb_profile_testimonials(profile_id, created_at desc);

alter table public.cb_profile_testimonials enable row level security;
alter table public.cb_testimonial_hearts enable row level security;

drop policy if exists "testimonials read" on public.cb_profile_testimonials;
create policy "testimonials read" on public.cb_profile_testimonials for select to authenticated using (true);
drop policy if exists "testimonials create" on public.cb_profile_testimonials;
create policy "testimonials create" on public.cb_profile_testimonials for insert to authenticated with check (author_id=auth.uid() and profile_id<>auth.uid());
drop policy if exists "profile owner deletes testimonials" on public.cb_profile_testimonials;
create policy "profile owner deletes testimonials" on public.cb_profile_testimonials for delete to authenticated using (profile_id=auth.uid());

drop policy if exists "testimonial hearts read" on public.cb_testimonial_hearts;
create policy "testimonial hearts read" on public.cb_testimonial_hearts for select to authenticated using (true);
drop policy if exists "testimonial hearts create" on public.cb_testimonial_hearts;
create policy "testimonial hearts create" on public.cb_testimonial_hearts for insert to authenticated with check (user_id=auth.uid());
drop policy if exists "testimonial hearts remove" on public.cb_testimonial_hearts;
create policy "testimonial hearts remove" on public.cb_testimonial_hearts for delete to authenticated using (user_id=auth.uid());

commit;
