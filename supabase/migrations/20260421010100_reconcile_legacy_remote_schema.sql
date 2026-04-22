create extension if not exists "pgcrypto";

alter table if exists public.users
  add column if not exists username text;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'users'
      and column_name = 'telegram_username'
  ) then
    execute '
      update public.users
      set username = telegram_username
      where username is null
        and telegram_username is not null
    ';
  end if;
end $$;

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  telegram_chat_id bigint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'conversations' and column_name = 'user_id'
  ) then
    execute 'create index if not exists conversations_user_id_idx on public.conversations(user_id)';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'conversations' and column_name = 'telegram_chat_id'
  ) then
    execute 'create index if not exists conversations_telegram_chat_id_idx on public.conversations(telegram_chat_id)';
  end if;
end $$;

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  message_type text not null check (message_type in ('text','voice','audio','image','link','mixed','service')),
  raw_text text,
  normalized_text text,
  telegram_message_id bigint,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table if exists public.messages
  add column if not exists conversation_id uuid references public.conversations(id) on delete set null,
  add column if not exists message_type text,
  add column if not exists raw_text text,
  add column if not exists normalized_text text,
  add column if not exists telegram_message_id bigint,
  add column if not exists metadata_json jsonb not null default '{}'::jsonb;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'messages' and column_name = 'conversation_id'
  ) then
    execute 'create index if not exists messages_conversation_id_idx on public.messages(conversation_id)';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'messages' and column_name = 'telegram_message_id'
  ) then
    execute 'create index if not exists messages_telegram_message_id_idx on public.messages(telegram_message_id)';
  end if;
end $$;

create table if not exists public.artifacts (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  message_id uuid references public.messages(id) on delete set null,
  artifact_type text not null check (
    artifact_type in (
      'audio_transcript',
      'image_context',
      'website_context',
      'preliminary_screening',
      'diagnostic_case',
      'other'
    )
  ),
  content_json jsonb not null default '{}'::jsonb,
  source_url text,
  storage_path text,
  created_at timestamptz not null default now()
);

alter table if exists public.artifacts
  add column if not exists conversation_id uuid references public.conversations(id) on delete set null,
  add column if not exists message_id uuid references public.messages(id) on delete set null,
  add column if not exists artifact_type text,
  add column if not exists content_json jsonb not null default '{}'::jsonb,
  add column if not exists source_url text,
  add column if not exists storage_path text;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'artifacts' and column_name = 'conversation_id'
  ) then
    execute 'create index if not exists artifacts_conversation_id_idx on public.artifacts(conversation_id)';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'artifacts' and column_name = 'message_id'
  ) then
    execute 'create index if not exists artifacts_message_id_idx on public.artifacts(message_id)';
  end if;
end $$;

alter table if exists public.cases
  add column if not exists user_id uuid references public.users(id) on delete set null,
  add column if not exists conversation_id uuid references public.conversations(id) on delete set null,
  add column if not exists title text,
  add column if not exists latest_snapshot_id uuid;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'cases' and column_name = 'conversation_id'
  ) then
    execute 'create index if not exists cases_conversation_id_idx on public.cases(conversation_id)';
  end if;
end $$;

create table if not exists public.case_snapshots (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  action text not null check (action in ('clarify','screen','diagnose','answer')),
  confidence text not null check (confidence in ('low','medium','high')),
  router_reason text not null,
  reply_text text not null,
  structured_output_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'case_snapshots' and column_name = 'case_id'
  ) then
    execute 'create index if not exists case_snapshots_case_id_idx on public.case_snapshots(case_id)';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'cases'
      and column_name = 'latest_snapshot_id'
  ) then
    return;
  end if;

  begin
    alter table public.cases
      add constraint cases_latest_snapshot_id_fkey
      foreign key (latest_snapshot_id)
      references public.case_snapshots(id)
      on delete set null;
  exception
    when duplicate_object then
      null;
  end;
end $$;

create table if not exists public.prompt_traces (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  case_id uuid references public.cases(id) on delete set null,
  stage text not null check (stage in ('router','diagnostic','renderer')),
  prompt_version text not null,
  input_json jsonb not null default '{}'::jsonb,
  output_json jsonb not null default '{}'::jsonb,
  validation_status text not null check (validation_status in ('valid','invalid')),
  created_at timestamptz not null default now()
);

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'prompt_traces' and column_name = 'conversation_id'
  ) then
    execute 'create index if not exists prompt_traces_conversation_id_idx on public.prompt_traces(conversation_id)';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'prompt_traces' and column_name = 'case_id'
  ) then
    execute 'create index if not exists prompt_traces_case_id_idx on public.prompt_traces(case_id)';
  end if;
end $$;
