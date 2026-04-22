alter table if exists public.artifacts
add column if not exists content text not null default '';
