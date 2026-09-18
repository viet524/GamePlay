create extension if not exists "pgcrypto";

create table if not exists public."TeamMembers" (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  name text not null,
  avatar_url text not null default '',
  color text not null default '#edb73b',
  created_at timestamptz not null default now()
);

create table if not exists public."GameConfig" (
  session_id uuid primary key default gen_random_uuid(),
  session_name text not null default 'Phòng thi công',
  building_name text not null default 'Công trình bí mật',
  building_image_url text not null,
  grid_rows integer not null check (grid_rows between 2 and 8),
  grid_cols integer not null check (grid_cols between 2 and 10),
  quote_text text not null,
  stages_data jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public."GameState" (
  session_id uuid primary key references public."GameConfig"(session_id) on delete cascade,
  current_stage integer not null default 1 check (current_stage between 1 and 4),
  grid_status jsonb not null default '[]'::jsonb,
  question_cursor jsonb not null default '{"1":0,"2":0,"3":0,"4":0}'::jsonb,
  completed boolean not null default false,
  updated_at timestamptz not null default now()
);

create index if not exists team_members_session_idx on public."TeamMembers"(session_id);

alter table public."TeamMembers" enable row level security;
alter table public."GameConfig" enable row level security;
alter table public."GameState" enable row level security;

create policy "public game config access" on public."GameConfig" for all using (true) with check (true);
create policy "public team access" on public."TeamMembers" for all using (true) with check (true);
create policy "public game state access" on public."GameState" for all using (true) with check (true);

insert into storage.buckets (id, name, public)
values ('game-assets', 'game-assets', true)
on conflict (id) do update set public = true;

create policy "public game asset read" on storage.objects for select using (bucket_id = 'game-assets');
create policy "public game asset upload" on storage.objects for insert with check (bucket_id = 'game-assets');

do $$ begin
  alter publication supabase_realtime add table public."GameState";
exception when duplicate_object then null;
end $$;
