create table if not exists public.website_diagnostic_leads (
  id uuid primary key,
  created_at timestamptz not null default now(),
  status text not null default 'Новая',
  name text not null,
  company text not null,
  contact text not null,
  attribution jsonb not null default '{}'::jsonb,
  average numeric(2,1) not null check (average >= 1 and average <= 5),
  maturity_stage text not null,
  recommendation text not null,
  weak_areas text[] not null default '{}'::text[],
  maturity_scores smallint[] not null,
  company_answers jsonb not null default '[]'::jsonb,
  referrer text,
  page text,
  user_agent text,
  consent boolean not null default false,
  telegram_sent boolean not null default false,
  constraint website_diagnostic_scores_count check (cardinality(maturity_scores) = 10),
  constraint website_diagnostic_weak_count check (cardinality(weak_areas) <= 3)
);

alter table public.website_diagnostic_leads enable row level security;
revoke all on table public.website_diagnostic_leads from anon, authenticated;
grant select, insert, update on table public.website_diagnostic_leads to service_role;

comment on table public.website_diagnostic_leads is
  'Contact-qualified results submitted from seledchik.ru/diagnostika. Service-role access only.';

create index if not exists website_diagnostic_leads_created_at_idx
  on public.website_diagnostic_leads (created_at desc);

create table if not exists public.website_integration_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.website_integration_settings enable row level security;
revoke all on table public.website_integration_settings from anon, authenticated;
grant select on table public.website_integration_settings to service_role;

comment on table public.website_integration_settings is
  'Service-role-only settings for website integrations. Values are never returned to clients.';
