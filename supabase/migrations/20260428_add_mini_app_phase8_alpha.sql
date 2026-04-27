create table if not exists public.mini_app_analytics_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  app_user_id uuid references public.app_users(id) on delete set null,
  event_name text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.mini_app_eval_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  problem_context text not null default '',
  observations_count integer not null default 0,
  suggested_answers_count integer not null default 0,
  confirmed_answers_count integer not null default 0,
  selected_constraint jsonb,
  confidence numeric(3,2),
  next_step jsonb,
  quality_flags jsonb not null default '[]'::jsonb,
  trigger_event text not null default 'snapshot',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists mini_app_analytics_events_case_created_idx
  on public.mini_app_analytics_events(case_id, created_at desc);

create index if not exists mini_app_analytics_events_name_created_idx
  on public.mini_app_analytics_events(event_name, created_at desc);

create index if not exists mini_app_eval_logs_case_created_idx
  on public.mini_app_eval_logs(case_id, created_at desc);

alter table public.mini_app_analytics_events enable row level security;
alter table public.mini_app_eval_logs enable row level security;
