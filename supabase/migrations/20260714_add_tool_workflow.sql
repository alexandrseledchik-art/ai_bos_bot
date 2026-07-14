create table if not exists public.tool_instances (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  tool_id uuid not null references public.tools(id) on delete restrict,
  status text not null default 'not_started' check (status in ('not_started','in_progress','waiting_for_user','submitted','analyzed','needs_update','completed','archived')),
  fill_mode text not null default 'chat' check (fill_mode in ('chat','document')),
  current_step integer not null default 0,
  progress_percent integer not null default 0 check (progress_percent between 0 and 100),
  telegram_start_token text not null unique,
  started_at timestamptz,
  completed_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tool_document_instances (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  tool_instance_id uuid not null unique references public.tool_instances(id) on delete cascade,
  template_google_file_id text,
  google_file_id text,
  google_file_url text not null,
  google_folder_id text,
  copy_status text not null default 'pending' check (copy_status in ('pending','created','failed','manual_link_added')),
  access_status text not null default 'unknown',
  last_read_at timestamptz,
  last_snapshot_id uuid,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tool_answers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  tool_instance_id uuid not null references public.tool_instances(id) on delete cascade,
  question_key text not null,
  question_text text not null,
  answer_text text not null,
  source text not null check (source in ('chat_text','chat_voice','web_form','google_document','ai_prefill','manual_admin')),
  confidence numeric(3,2) not null default 1.00,
  status text not null default 'confirmed' check (status in ('suggested','confirmed','corrected','rejected','superseded')),
  evidence_message_id text,
  updated_by text not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tool_instance_id, question_key)
);

create table if not exists public.tool_snapshots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  tool_instance_id uuid not null references public.tool_instances(id) on delete cascade,
  summary text not null,
  key_findings jsonb not null default '[]'::jsonb,
  risks jsonb not null default '[]'::jsonb,
  open_questions jsonb not null default '[]'::jsonb,
  extracted_observations jsonb not null default '[]'::jsonb,
  content_text text not null default '',
  recommended_next_tool_id uuid references public.tools(id) on delete set null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tool_journeys (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  case_id uuid not null unique references public.cases(id) on delete cascade,
  current_layer_key text,
  current_tool_instance_id uuid references public.tool_instances(id) on delete set null,
  completed_tool_ids uuid[] not null default '{}',
  next_tool_ids uuid[] not null default '{}',
  status text not null default 'active' check (status in ('active','completed','paused','archived')),
  progress_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tool_instances_company_status_idx on public.tool_instances(company_id, status, updated_at desc);
create index if not exists tool_answers_instance_idx on public.tool_answers(tool_instance_id, created_at);
create index if not exists tool_snapshots_instance_idx on public.tool_snapshots(tool_instance_id, created_at desc);

do $$
declare table_name text;
begin
  foreach table_name in array array['tool_instances','tool_document_instances','tool_answers','tool_snapshots','tool_journeys'] loop
    execute format('drop trigger if exists %I on public.%I', table_name || '_set_updated_at', table_name);
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', table_name || '_set_updated_at', table_name);
    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end $$;

-- Browser clients never query these tables directly. With RLS enabled and no
-- permissive policy, access is denied by default; server routes use service_role
-- and additionally scope every query by workspace/company.
