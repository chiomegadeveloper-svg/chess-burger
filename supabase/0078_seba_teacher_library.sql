-- Teacher's private puzzle and position collection. All access goes through the authenticated classroom API.
create table if not exists public.cb_seba_folders (
 id uuid primary key default gen_random_uuid(), teacher_id uuid not null references auth.users(id) on delete cascade,
 name text not null check(char_length(name) between 1 and 60), created_at timestamptz not null default now()
);
create index if not exists cb_seba_folders_teacher on public.cb_seba_folders(teacher_id,created_at);
create table if not exists public.cb_seba_materials (
 id uuid primary key default gen_random_uuid(), teacher_id uuid not null references auth.users(id) on delete cascade,
 folder_id uuid not null references public.cb_seba_folders(id) on delete cascade,
 name text not null check(char_length(name) between 1 and 90), fen text not null,
 annotations jsonb not null default '[]'::jsonb,
 source_puzzle_id text, hint text not null default '', solution jsonb not null default '[]'::jsonb,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists cb_seba_materials_teacher_folder on public.cb_seba_materials(teacher_id,folder_id,updated_at desc);
alter table public.cb_seba_folders enable row level security;
alter table public.cb_seba_materials enable row level security;
