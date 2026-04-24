create table if not exists public.runtime_states (
  key text primary key,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

comment on table public.runtime_states is
  'Server-side runtime source of truth for Telegram conversation state. Access is service-role only; relational tables are projections.';

alter table public.runtime_states enable row level security;

revoke all on public.runtime_states from anon;
revoke all on public.runtime_states from authenticated;

drop trigger if exists runtime_states_set_updated_at on public.runtime_states;
create trigger runtime_states_set_updated_at
before update on public.runtime_states
for each row execute function public.set_updated_at();
