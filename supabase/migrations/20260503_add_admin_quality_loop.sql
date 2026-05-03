create table if not exists public.admin_conversation_evaluations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  case_id uuid references public.cases(id) on delete cascade,
  thread_id uuid not null references public.threads(id) on delete cascade,
  evaluator_version text not null,
  score integer not null check (score >= 0 and score <= 100),
  status text not null check (status in ('good', 'watch', 'critical')),
  summary text not null default '',
  strengths jsonb not null default '[]'::jsonb,
  issues jsonb not null default '[]'::jsonb,
  improvement_suggestions jsonb not null default '[]'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_improvements (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  case_id uuid references public.cases(id) on delete cascade,
  source_type text not null default 'conversation_evaluation',
  fingerprint text not null unique,
  category text not null default 'general',
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high', 'critical')),
  title text not null,
  description text not null default '',
  suggestion text not null default '',
  frequency integer not null default 1 check (frequency >= 1),
  status text not null default 'open' check (status in ('open', 'planned', 'done', 'ignored')),
  evidence jsonb not null default '[]'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists admin_conversation_evaluations_thread_created_idx
  on public.admin_conversation_evaluations(thread_id, created_at desc);

create index if not exists admin_conversation_evaluations_case_created_idx
  on public.admin_conversation_evaluations(case_id, created_at desc);

create index if not exists admin_conversation_evaluations_status_created_idx
  on public.admin_conversation_evaluations(status, created_at desc);

create index if not exists admin_improvements_status_last_seen_idx
  on public.admin_improvements(status, last_seen_at desc);

create index if not exists admin_improvements_category_frequency_idx
  on public.admin_improvements(category, frequency desc);

drop trigger if exists admin_improvements_set_updated_at on public.admin_improvements;
create trigger admin_improvements_set_updated_at
before update on public.admin_improvements
for each row execute function public.set_updated_at();

alter table public.admin_conversation_evaluations enable row level security;
alter table public.admin_improvements enable row level security;
