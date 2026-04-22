alter table if exists public.threads
add column if not exists entry_state jsonb not null default '{}'::jsonb;
