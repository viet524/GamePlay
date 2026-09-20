alter table public."GameConfig"
  add column if not exists author_name text not null default 'Người dùng cộng đồng',
  add column if not exists is_public boolean not null default true;

create index if not exists game_config_public_updated_idx
  on public."GameConfig"(is_public, updated_at desc);
