create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'diagnostic_level') then
    create type public.diagnostic_level as enum ('express', 'basic', 'deep');
  end if;

  if not exists (select 1 from pg_type where typname = 'diagnostic_subject_type') then
    create type public.diagnostic_subject_type as enum ('layer', 'domain', 'subdomain');
  end if;

  if not exists (select 1 from pg_type where typname = 'diagnostic_answer_source') then
    create type public.diagnostic_answer_source as enum (
      'user_explicit',
      'inferred_from_chat',
      'inferred_from_document',
      'user_confirmed_inference',
      'user_corrected_inference'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'diagnostic_answer_status') then
    create type public.diagnostic_answer_status as enum (
      'suggested',
      'confirmed',
      'corrected',
      'rejected',
      'expired'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'constraint_hypothesis_status') then
    create type public.constraint_hypothesis_status as enum (
      'suggested',
      'confirmed',
      'rejected',
      'superseded'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'next_step_status') then
    create type public.next_step_status as enum (
      'suggested',
      'accepted',
      'done',
      'skipped',
      'superseded'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'document_source_status') then
    create type public.document_source_status as enum (
      'link_added',
      'access_ok',
      'access_lost',
      'pending_analysis',
      'analyzed',
      'needs_update'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'tool_recommendation_status') then
    create type public.tool_recommendation_status as enum (
      'recommended',
      'opened',
      'link_added',
      'analyzed',
      'needs_update',
      'closed'
    );
  end if;
end
$$;

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id bigint not null unique,
  auth_user_id uuid references auth.users(id) on delete set null,
  username text,
  first_name text,
  last_name text,
  language_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_app_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  app_user_id uuid not null references public.app_users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, app_user_id)
);

create table if not exists public.company_profiles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  industry text,
  company_size text,
  revenue_range text,
  user_role text,
  current_request text,
  onboarding_status text not null default 'draft',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id)
);

create table if not exists public.problem_contexts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  request_text text not null,
  request_type text not null default 'unknown',
  user_claimed_cause text,
  primary_flow text,
  status text not null default 'active',
  confidence numeric(3,2) not null default 0.50,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.observations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  source_type text not null check (source_type in ('chat', 'document', 'diagnostic', 'manual')),
  source_id text,
  statement text not null,
  normalized_signal text,
  layer text,
  layer_class text,
  flow_type text,
  confidence numeric(3,2) not null default 0.50,
  evidence jsonb not null default '[]'::jsonb,
  status text not null default 'active' check (status in ('active', 'rejected', 'expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.diagnostic_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  level public.diagnostic_level not null default 'express',
  status text not null default 'draft' check (status in ('draft', 'completed', 'superseded')),
  completion_percent numeric(5,2) not null default 0,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.diagnostic_answers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  diagnostic_run_id uuid not null references public.diagnostic_runs(id) on delete cascade,
  level public.diagnostic_level not null,
  subject_type public.diagnostic_subject_type not null,
  subject_key text not null,
  score integer check (score between 1 and 5),
  selected_description text,
  source public.diagnostic_answer_source not null,
  status public.diagnostic_answer_status not null,
  confidence numeric(3,2) not null default 0.50,
  evidence_observation_ids uuid[] not null default '{}',
  corrected_from uuid references public.diagnostic_answers(id) on delete set null,
  confirmed_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (diagnostic_run_id, subject_type, subject_key, version)
);

create table if not exists public.maturity_scores (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  case_id uuid references public.cases(id) on delete cascade,
  diagnostic_run_id uuid not null references public.diagnostic_runs(id) on delete cascade,
  subject_type public.diagnostic_subject_type not null,
  subject_key text not null,
  score numeric(4,2) not null,
  source_level public.diagnostic_level not null,
  confidence numeric(3,2) not null default 0.50,
  calculated_from jsonb not null default '[]'::jsonb,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.constraint_hypotheses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  title text not null,
  layer text,
  layer_class text,
  constraint_type text,
  explanation text not null,
  supporting_observation_ids uuid[] not null default '{}',
  alternative_hypotheses jsonb not null default '[]'::jsonb,
  confidence numeric(3,2) not null default 0.50,
  status public.constraint_hypothesis_status not null default 'suggested',
  version integer not null default 1,
  superseded_by uuid references public.constraint_hypotheses(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.next_steps (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  constraint_hypothesis_id uuid references public.constraint_hypotheses(id) on delete set null,
  title text not null,
  description text not null,
  why_this_first text not null,
  action_type text not null,
  target_entity_type text,
  target_entity_id uuid,
  confidence numeric(3,2) not null default 0.50,
  status public.next_step_status not null default 'suggested',
  version integer not null default 1,
  superseded_by uuid references public.next_steps(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tools (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  short_description text not null,
  when_to_use text not null,
  template_url text,
  layer_keys text[] not null default '{}',
  problem_types text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tool_recommendations
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade,
  add column if not exists company_id uuid references public.companies(id) on delete cascade,
  add column if not exists tool_id uuid references public.tools(id) on delete restrict,
  add column if not exists priority integer not null default 1,
  add column if not exists status public.tool_recommendation_status not null default 'recommended',
  add column if not exists source text not null default 'ai_boss',
  add column if not exists updated_at timestamptz not null default now();

update public.tool_recommendations tr
set workspace_id = c.workspace_id,
    company_id = c.company_id
from public.cases c
where tr.case_id = c.id
  and (tr.workspace_id is null or tr.company_id is null);

create table if not exists public.document_sources (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  case_id uuid references public.cases(id) on delete cascade,
  tool_id uuid references public.tools(id) on delete set null,
  url text not null,
  title text,
  source_kind text not null default 'link' check (source_kind in ('link', 'google_sheet', 'google_doc', 'excel', 'pdf')),
  status public.document_source_status not null default 'link_added',
  last_analyzed_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.document_snapshots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  case_id uuid references public.cases(id) on delete cascade,
  document_source_id uuid not null references public.document_sources(id) on delete cascade,
  summary text not null,
  extracted_observations jsonb not null default '[]'::jsonb,
  risks jsonb not null default '[]'::jsonb,
  open_questions jsonb not null default '[]'::jsonb,
  status text not null default 'active' check (status in ('active', 'superseded')),
  version integer not null default 1,
  superseded_by uuid references public.document_snapshots(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.consultation_briefs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  title text not null,
  summary text not null,
  current_request text not null,
  constraint_summary text,
  next_step_summary text,
  maturity_summary jsonb not null default '{}'::jsonb,
  source_artifact_ids uuid[] not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'ready', 'sent')),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists app_users_telegram_user_id_idx on public.app_users(telegram_user_id);
create index if not exists workspace_app_members_workspace_app_user_idx on public.workspace_app_members(workspace_id, app_user_id);
create index if not exists company_profiles_company_id_idx on public.company_profiles(company_id);
create index if not exists problem_contexts_case_status_idx on public.problem_contexts(case_id, status);
create index if not exists observations_case_status_idx on public.observations(case_id, status);
create unique index if not exists observations_case_source_signal_unique
  on public.observations(case_id, source_type, source_id, normalized_signal);
create index if not exists diagnostic_runs_case_level_status_idx on public.diagnostic_runs(case_id, level, status);
create index if not exists diagnostic_answers_run_subject_status_idx on public.diagnostic_answers(diagnostic_run_id, subject_key, status);
create index if not exists maturity_scores_company_subject_idx on public.maturity_scores(company_id, subject_type, subject_key);
create unique index if not exists maturity_scores_run_subject_version_unique
  on public.maturity_scores(diagnostic_run_id, subject_type, subject_key, version);
create index if not exists constraint_hypotheses_case_status_created_idx on public.constraint_hypotheses(case_id, status, created_at desc);
create index if not exists next_steps_case_status_created_idx on public.next_steps(case_id, status, created_at desc);
create index if not exists tools_slug_idx on public.tools(slug);
create unique index if not exists tool_recommendations_case_tool_unique
  on public.tool_recommendations(case_id, tool_id)
  where tool_id is not null;
create index if not exists document_sources_company_status_idx on public.document_sources(company_id, status);
create index if not exists document_snapshots_source_created_idx on public.document_snapshots(document_source_id, created_at desc);
create index if not exists consultation_briefs_case_created_idx on public.consultation_briefs(case_id, created_at desc);

drop trigger if exists app_users_set_updated_at on public.app_users;
create trigger app_users_set_updated_at
before update on public.app_users
for each row execute function public.set_updated_at();

drop trigger if exists workspace_app_members_set_updated_at on public.workspace_app_members;
create trigger workspace_app_members_set_updated_at
before update on public.workspace_app_members
for each row execute function public.set_updated_at();

drop trigger if exists company_profiles_set_updated_at on public.company_profiles;
create trigger company_profiles_set_updated_at
before update on public.company_profiles
for each row execute function public.set_updated_at();

drop trigger if exists problem_contexts_set_updated_at on public.problem_contexts;
create trigger problem_contexts_set_updated_at
before update on public.problem_contexts
for each row execute function public.set_updated_at();

drop trigger if exists observations_set_updated_at on public.observations;
create trigger observations_set_updated_at
before update on public.observations
for each row execute function public.set_updated_at();

drop trigger if exists diagnostic_runs_set_updated_at on public.diagnostic_runs;
create trigger diagnostic_runs_set_updated_at
before update on public.diagnostic_runs
for each row execute function public.set_updated_at();

drop trigger if exists diagnostic_answers_set_updated_at on public.diagnostic_answers;
create trigger diagnostic_answers_set_updated_at
before update on public.diagnostic_answers
for each row execute function public.set_updated_at();

drop trigger if exists maturity_scores_set_updated_at on public.maturity_scores;
create trigger maturity_scores_set_updated_at
before update on public.maturity_scores
for each row execute function public.set_updated_at();

drop trigger if exists constraint_hypotheses_set_updated_at on public.constraint_hypotheses;
create trigger constraint_hypotheses_set_updated_at
before update on public.constraint_hypotheses
for each row execute function public.set_updated_at();

drop trigger if exists next_steps_set_updated_at on public.next_steps;
create trigger next_steps_set_updated_at
before update on public.next_steps
for each row execute function public.set_updated_at();

drop trigger if exists tools_set_updated_at on public.tools;
create trigger tools_set_updated_at
before update on public.tools
for each row execute function public.set_updated_at();

drop trigger if exists tool_recommendations_set_updated_at on public.tool_recommendations;
create trigger tool_recommendations_set_updated_at
before update on public.tool_recommendations
for each row execute function public.set_updated_at();

drop trigger if exists document_sources_set_updated_at on public.document_sources;
create trigger document_sources_set_updated_at
before update on public.document_sources
for each row execute function public.set_updated_at();

drop trigger if exists document_snapshots_set_updated_at on public.document_snapshots;
create trigger document_snapshots_set_updated_at
before update on public.document_snapshots
for each row execute function public.set_updated_at();

drop trigger if exists consultation_briefs_set_updated_at on public.consultation_briefs;
create trigger consultation_briefs_set_updated_at
before update on public.consultation_briefs
for each row execute function public.set_updated_at();

alter table public.app_users enable row level security;
alter table public.workspace_app_members enable row level security;
alter table public.company_profiles enable row level security;
alter table public.problem_contexts enable row level security;
alter table public.observations enable row level security;
alter table public.diagnostic_runs enable row level security;
alter table public.diagnostic_answers enable row level security;
alter table public.maturity_scores enable row level security;
alter table public.constraint_hypotheses enable row level security;
alter table public.next_steps enable row level security;
alter table public.tools enable row level security;
alter table public.document_sources enable row level security;
alter table public.document_snapshots enable row level security;
alter table public.consultation_briefs enable row level security;
