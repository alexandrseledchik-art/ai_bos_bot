create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'case_kind') then
    create type public.case_kind as enum ('preliminary_screening', 'diagnostic_case');
  end if;

  if not exists (select 1 from pg_type where typname = 'case_mode') then
    create type public.case_mode as enum ('clarification_mode', 'diagnostic_mode', 'website_screening_mode');
  end if;

  if not exists (select 1 from pg_type where typname = 'case_status') then
    create type public.case_status as enum ('active', 'archived');
  end if;

  if not exists (select 1 from pg_type where typname = 'decision_action') then
    create type public.decision_action as enum ('clarify', 'screen', 'diagnose', 'answer');
  end if;

  if not exists (select 1 from pg_type where typname = 'signal_sufficiency') then
    create type public.signal_sufficiency as enum ('weak', 'partial', 'enough');
  end if;

  if not exists (select 1 from pg_type where typname = 'artifact_kind') then
    create type public.artifact_kind as enum ('screening', 'diagnosis', 'action_wave', 'snapshot');
  end if;
end
$$;

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  external_id text not null unique,
  name text not null,
  telegram_chat_id text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cases (
  id uuid primary key default gen_random_uuid(),
  external_id text not null unique,
  company_id uuid not null references public.companies(id) on delete cascade,
  kind public.case_kind not null,
  mode public.case_mode not null,
  summary text not null default '',
  status public.case_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.threads (
  id uuid primary key default gen_random_uuid(),
  external_id text not null unique,
  company_id uuid not null references public.companies(id) on delete cascade,
  telegram_chat_id text not null unique,
  active_case_id uuid references public.cases(id) on delete set null,
  entry_state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  external_id text not null unique,
  thread_id uuid not null references public.threads(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  text text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  external_id text not null unique,
  case_id uuid not null references public.cases(id) on delete cascade,
  statement text not null,
  confidence numeric(3,2) not null default 0.60,
  created_at timestamptz not null default now()
);

create table if not exists public.symptoms (
  id uuid primary key default gen_random_uuid(),
  external_id text not null unique,
  case_id uuid not null references public.cases(id) on delete cascade,
  statement text not null,
  evidence text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.hypotheses (
  id uuid primary key default gen_random_uuid(),
  external_id text not null unique,
  case_id uuid not null references public.cases(id) on delete cascade,
  statement text not null,
  basis text not null default '',
  confidence numeric(3,2) not null default 0.50,
  created_at timestamptz not null default now()
);

create table if not exists public.constraints (
  id uuid primary key default gen_random_uuid(),
  external_id text not null unique,
  case_id uuid not null references public.cases(id) on delete cascade,
  statement text not null,
  confidence numeric(3,2) not null default 0.50,
  created_at timestamptz not null default now()
);

create table if not exists public.situations (
  id uuid primary key default gen_random_uuid(),
  external_id text not null unique,
  case_id uuid not null references public.cases(id) on delete cascade,
  summary text not null,
  source text not null default 'conversation',
  created_at timestamptz not null default now()
);

create table if not exists public.action_waves (
  id uuid primary key default gen_random_uuid(),
  external_id text not null unique,
  case_id uuid not null references public.cases(id) on delete cascade,
  first_step text not null,
  not_now text not null,
  why_this_first text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.tool_recommendations (
  id uuid primary key default gen_random_uuid(),
  external_id text not null unique,
  case_id uuid not null references public.cases(id) on delete cascade,
  name text not null,
  reason text not null,
  usage_moment text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.artifacts (
  id uuid primary key default gen_random_uuid(),
  external_id text not null unique,
  case_id uuid not null references public.cases(id) on delete cascade,
  kind public.artifact_kind not null,
  title text not null,
  summary text not null,
  path text not null default '',
  content text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.snapshots (
  id uuid primary key default gen_random_uuid(),
  external_id text not null unique,
  case_id uuid not null references public.cases(id) on delete cascade,
  mode public.case_mode not null,
  action public.decision_action not null,
  signal_sufficiency public.signal_sufficiency not null,
  understanding text not null,
  known_facts jsonb not null default '[]'::jsonb,
  observations jsonb not null default '[]'::jsonb,
  working_hypotheses jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists companies_telegram_chat_id_idx on public.companies(telegram_chat_id);
create index if not exists cases_company_id_idx on public.cases(company_id);
create index if not exists cases_status_idx on public.cases(status);
create index if not exists threads_company_id_idx on public.threads(company_id);
create index if not exists messages_thread_id_created_at_idx on public.messages(thread_id, created_at desc);
create index if not exists goals_case_id_idx on public.goals(case_id);
create index if not exists symptoms_case_id_idx on public.symptoms(case_id);
create index if not exists hypotheses_case_id_idx on public.hypotheses(case_id);
create index if not exists constraints_case_id_idx on public.constraints(case_id);
create index if not exists situations_case_id_idx on public.situations(case_id);
create index if not exists action_waves_case_id_idx on public.action_waves(case_id);
create index if not exists tool_recommendations_case_id_idx on public.tool_recommendations(case_id);
create index if not exists artifacts_case_id_idx on public.artifacts(case_id);
create index if not exists snapshots_case_id_created_at_idx on public.snapshots(case_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists companies_set_updated_at on public.companies;
create trigger companies_set_updated_at
before update on public.companies
for each row execute function public.set_updated_at();

drop trigger if exists cases_set_updated_at on public.cases;
create trigger cases_set_updated_at
before update on public.cases
for each row execute function public.set_updated_at();

drop trigger if exists threads_set_updated_at on public.threads;
create trigger threads_set_updated_at
before update on public.threads
for each row execute function public.set_updated_at();

create or replace view public.active_case_overview as
select
  c.id as case_id,
  c.company_id,
  c.kind,
  c.mode,
  c.summary,
  c.status,
  c.created_at,
  c.updated_at,
  co.name as company_name,
  co.telegram_chat_id,
  (
    select jsonb_build_object(
      'mode', s.mode,
      'action', s.action,
      'signal_sufficiency', s.signal_sufficiency,
      'understanding', s.understanding,
      'created_at', s.created_at
    )
    from public.snapshots s
    where s.case_id = c.id
    order by s.created_at desc
    limit 1
  ) as latest_snapshot,
  (
    select jsonb_build_object(
      'title', a.title,
      'kind', a.kind,
      'path', a.path,
      'created_at', a.created_at
    )
    from public.artifacts a
    where a.case_id = c.id
    order by a.created_at desc
    limit 1
  ) as latest_artifact
from public.cases c
join public.companies co on co.id = c.company_id
where c.status = 'active';
