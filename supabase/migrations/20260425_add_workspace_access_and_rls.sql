create extension if not exists pgcrypto;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

alter table if exists public.companies
  add column if not exists workspace_id uuid references public.workspaces(id) on delete restrict;

alter table if exists public.cases
  add column if not exists workspace_id uuid references public.workspaces(id) on delete restrict;

alter table if exists public.threads
  add column if not exists workspace_id uuid references public.workspaces(id) on delete restrict;

alter table if exists public.artifacts
  add column if not exists workspace_id uuid references public.workspaces(id) on delete restrict;

alter table if exists public.snapshots
  add column if not exists workspace_id uuid references public.workspaces(id) on delete restrict;

do $$
begin
  if to_regclass('public.conversations') is not null then
    execute 'alter table public.conversations add column if not exists workspace_id uuid references public.workspaces(id) on delete restrict';
  end if;
end
$$;

create index if not exists workspace_members_workspace_user_idx on public.workspace_members(workspace_id, user_id);
create index if not exists workspace_members_user_idx on public.workspace_members(user_id);
create index if not exists companies_workspace_id_idx on public.companies(workspace_id);
create index if not exists cases_workspace_id_idx on public.cases(workspace_id);
create index if not exists threads_workspace_id_idx on public.threads(workspace_id);
create index if not exists artifacts_workspace_id_idx on public.artifacts(workspace_id);
create index if not exists snapshots_workspace_id_idx on public.snapshots(workspace_id);

do $$
begin
  if to_regclass('public.conversations') is not null then
    execute 'create index if not exists conversations_workspace_id_idx on public.conversations(workspace_id)';
  end if;
end
$$;

create or replace function public.slugify_workspace_name(input_text text)
returns text
language sql
immutable
as $$
  select coalesce(
    nullif(trim(both '-' from regexp_replace(lower(coalesce(input_text, 'workspace')), '[^a-z0-9]+', '-', 'g')), ''),
    'workspace'
  );
$$;

create or replace function public.ensure_workspace_for_company(company_name text, company_key text)
returns uuid
language plpgsql
as $$
declare
  workspace_id uuid;
  suffix text := left(md5(coalesce(company_key, gen_random_uuid()::text)), 8);
  workspace_name text := coalesce(nullif(company_name, ''), 'Workspace');
begin
  insert into public.workspaces (id, name, slug)
  values (
    gen_random_uuid(),
    workspace_name,
    public.slugify_workspace_name(workspace_name) || '-' || suffix
  )
  returning id into workspace_id;

  return workspace_id;
end;
$$;

create or replace function public.assign_company_workspace()
returns trigger
language plpgsql
as $$
declare
  existing_workspace_id uuid;
begin
  if new.workspace_id is null then
    select c.workspace_id
      into existing_workspace_id
    from public.companies c
    where (new.external_id is not null and c.external_id = new.external_id)
       or (new.telegram_chat_id is not null and c.telegram_chat_id = new.telegram_chat_id)
    order by c.updated_at desc
    limit 1;

    new.workspace_id := coalesce(
      existing_workspace_id,
      public.ensure_workspace_for_company(
        new.name,
        coalesce(new.external_id, left(new.id::text, 8))
      )
    );
  end if;

  return new;
end;
$$;

create or replace function public.assign_case_workspace()
returns trigger
language plpgsql
as $$
begin
  select c.workspace_id
    into new.workspace_id
  from public.companies c
  where c.id = new.company_id;

  if new.workspace_id is null then
    raise exception 'workspace_id could not be derived for case %', new.id;
  end if;

  return new;
end;
$$;

create or replace function public.assign_thread_workspace()
returns trigger
language plpgsql
as $$
begin
  select c.workspace_id
    into new.workspace_id
  from public.companies c
  where c.id = new.company_id;

  if new.workspace_id is null then
    raise exception 'workspace_id could not be derived for thread %', new.id;
  end if;

  return new;
end;
$$;

create or replace function public.assign_case_child_workspace()
returns trigger
language plpgsql
as $$
begin
  select c.workspace_id
    into new.workspace_id
  from public.cases c
  where c.id = new.case_id;

  if new.workspace_id is null then
    raise exception 'workspace_id could not be derived for record in %', tg_table_name;
  end if;

  return new;
end;
$$;

create or replace function public.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = auth.uid()
  );
$$;

create or replace function public.can_access_case(target_case_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.cases c
    where c.id = target_case_id
      and c.workspace_id is not null
      and public.is_workspace_member(c.workspace_id)
  );
$$;

create or replace function public.can_access_thread(target_thread_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.threads t
    where t.id = target_thread_id
      and t.workspace_id is not null
      and public.is_workspace_member(t.workspace_id)
  );
$$;

create or replace function public.can_access_conversation(target_conversation_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  allowed boolean := false;
begin
  if to_regclass('public.conversations') is null then
    return false;
  end if;

  execute $query$
    select exists (
      select 1
      from public.conversations c
      where c.id = $1
        and (
          (c.workspace_id is not null and public.is_workspace_member(c.workspace_id))
          or (c.user_id is not null and c.user_id = auth.uid())
        )
    )
  $query$
  into allowed
  using target_conversation_id;

  return allowed;
end;
$$;

drop trigger if exists workspaces_set_updated_at on public.workspaces;
create trigger workspaces_set_updated_at
before update on public.workspaces
for each row execute function public.set_updated_at();

drop trigger if exists workspace_members_set_updated_at on public.workspace_members;
create trigger workspace_members_set_updated_at
before update on public.workspace_members
for each row execute function public.set_updated_at();

drop trigger if exists companies_assign_workspace on public.companies;
create trigger companies_assign_workspace
before insert or update of workspace_id, name, external_id on public.companies
for each row execute function public.assign_company_workspace();

drop trigger if exists cases_assign_workspace on public.cases;
create trigger cases_assign_workspace
before insert or update of company_id on public.cases
for each row execute function public.assign_case_workspace();

drop trigger if exists threads_assign_workspace on public.threads;
create trigger threads_assign_workspace
before insert or update of company_id on public.threads
for each row execute function public.assign_thread_workspace();

drop trigger if exists artifacts_assign_workspace on public.artifacts;
create trigger artifacts_assign_workspace
before insert or update of case_id on public.artifacts
for each row execute function public.assign_case_child_workspace();

drop trigger if exists snapshots_assign_workspace on public.snapshots;
create trigger snapshots_assign_workspace
before insert or update of case_id on public.snapshots
for each row execute function public.assign_case_child_workspace();

update public.companies
set workspace_id = public.ensure_workspace_for_company(
  name,
  coalesce(external_id, left(id::text, 8))
)
where workspace_id is null;

update public.cases ca
set workspace_id = co.workspace_id
from public.companies co
where ca.company_id = co.id
  and (ca.workspace_id is null or ca.workspace_id is distinct from co.workspace_id);

update public.threads th
set workspace_id = co.workspace_id
from public.companies co
where th.company_id = co.id
  and (th.workspace_id is null or th.workspace_id is distinct from co.workspace_id);

update public.artifacts a
set workspace_id = ca.workspace_id
from public.cases ca
where a.case_id = ca.id
  and (a.workspace_id is null or a.workspace_id is distinct from ca.workspace_id);

update public.snapshots s
set workspace_id = ca.workspace_id
from public.cases ca
where s.case_id = ca.id
  and (s.workspace_id is null or s.workspace_id is distinct from ca.workspace_id);

do $$
begin
  if to_regclass('public.conversations') is not null then
    execute $query$
      update public.conversations conv
      set workspace_id = derived.workspace_id
      from (
        select distinct on (c.conversation_id)
          c.conversation_id,
          c.workspace_id
        from public.cases c
        where c.conversation_id is not null
          and c.workspace_id is not null
        order by c.conversation_id, c.updated_at desc nulls last, c.created_at desc nulls last
      ) derived
      where conv.id = derived.conversation_id
        and (conv.workspace_id is null or conv.workspace_id is distinct from derived.workspace_id)
    $query$;
  end if;
end
$$;

alter table if exists public.companies alter column workspace_id set not null;
alter table if exists public.cases alter column workspace_id set not null;
alter table if exists public.threads alter column workspace_id set not null;
alter table if exists public.artifacts alter column workspace_id set not null;
alter table if exists public.snapshots alter column workspace_id set not null;

alter table if exists public.workspaces enable row level security;
alter table if exists public.workspace_members enable row level security;
alter table if exists public.companies enable row level security;
alter table if exists public.cases enable row level security;
alter table if exists public.threads enable row level security;
alter table if exists public.messages enable row level security;
alter table if exists public.goals enable row level security;
alter table if exists public.symptoms enable row level security;
alter table if exists public.hypotheses enable row level security;
alter table if exists public.constraints enable row level security;
alter table if exists public.situations enable row level security;
alter table if exists public.action_waves enable row level security;
alter table if exists public.tool_recommendations enable row level security;
alter table if exists public.artifacts enable row level security;
alter table if exists public.snapshots enable row level security;
alter table if exists public.conversations enable row level security;
alter table if exists public.case_snapshots enable row level security;
alter table if exists public.prompt_traces enable row level security;
alter table if exists public.users enable row level security;

drop policy if exists "Workspace members can view workspaces" on public.workspaces;
create policy "Workspace members can view workspaces"
on public.workspaces
for select
to authenticated
using (public.is_workspace_member(id));

drop policy if exists "Workspace members can view memberships" on public.workspace_members;
create policy "Workspace members can view memberships"
on public.workspace_members
for select
to authenticated
using (user_id = auth.uid() or public.is_workspace_member(workspace_id));

drop policy if exists "Workspace members can read companies" on public.companies;
create policy "Workspace members can read companies"
on public.companies
for select
to authenticated
using (public.is_workspace_member(workspace_id));

drop policy if exists "Workspace members can create companies" on public.companies;
create policy "Workspace members can create companies"
on public.companies
for insert
to authenticated
with check (public.is_workspace_member(workspace_id));

drop policy if exists "Workspace members can read cases" on public.cases;
create policy "Workspace members can read cases"
on public.cases
for select
to authenticated
using (public.is_workspace_member(workspace_id));

drop policy if exists "Workspace members can create cases" on public.cases;
create policy "Workspace members can create cases"
on public.cases
for insert
to authenticated
with check (public.is_workspace_member(workspace_id));

drop policy if exists "Workspace members can read threads" on public.threads;
create policy "Workspace members can read threads"
on public.threads
for select
to authenticated
using (public.is_workspace_member(workspace_id));

drop policy if exists "Workspace members can create threads" on public.threads;
create policy "Workspace members can create threads"
on public.threads
for insert
to authenticated
with check (public.is_workspace_member(workspace_id));

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'messages'
      and column_name = 'conversation_id'
  ) then
    execute 'drop policy if exists "Workspace members can read messages" on public.messages';
    execute $sql$
      create policy "Workspace members can read messages"
      on public.messages
      for select
      to authenticated
      using (public.can_access_thread(thread_id) or public.can_access_conversation(conversation_id))
    $sql$;

    execute 'drop policy if exists "Workspace members can create messages" on public.messages';
    execute $sql$
      create policy "Workspace members can create messages"
      on public.messages
      for insert
      to authenticated
      with check (public.can_access_thread(thread_id) or public.can_access_conversation(conversation_id))
    $sql$;
  else
    execute 'drop policy if exists "Workspace members can read messages" on public.messages';
    execute $sql$
      create policy "Workspace members can read messages"
      on public.messages
      for select
      to authenticated
      using (public.can_access_thread(thread_id))
    $sql$;

    execute 'drop policy if exists "Workspace members can create messages" on public.messages';
    execute $sql$
      create policy "Workspace members can create messages"
      on public.messages
      for insert
      to authenticated
      with check (public.can_access_thread(thread_id))
    $sql$;
  end if;
end
$$;

drop policy if exists "Workspace members can read goals" on public.goals;
create policy "Workspace members can read goals"
on public.goals
for select
to authenticated
using (public.can_access_case(case_id));

drop policy if exists "Workspace members can create goals" on public.goals;
create policy "Workspace members can create goals"
on public.goals
for insert
to authenticated
with check (public.can_access_case(case_id));

drop policy if exists "Workspace members can read symptoms" on public.symptoms;
create policy "Workspace members can read symptoms"
on public.symptoms
for select
to authenticated
using (public.can_access_case(case_id));

drop policy if exists "Workspace members can create symptoms" on public.symptoms;
create policy "Workspace members can create symptoms"
on public.symptoms
for insert
to authenticated
with check (public.can_access_case(case_id));

drop policy if exists "Workspace members can read hypotheses" on public.hypotheses;
create policy "Workspace members can read hypotheses"
on public.hypotheses
for select
to authenticated
using (public.can_access_case(case_id));

drop policy if exists "Workspace members can create hypotheses" on public.hypotheses;
create policy "Workspace members can create hypotheses"
on public.hypotheses
for insert
to authenticated
with check (public.can_access_case(case_id));

drop policy if exists "Workspace members can read constraints" on public.constraints;
create policy "Workspace members can read constraints"
on public.constraints
for select
to authenticated
using (public.can_access_case(case_id));

drop policy if exists "Workspace members can create constraints" on public.constraints;
create policy "Workspace members can create constraints"
on public.constraints
for insert
to authenticated
with check (public.can_access_case(case_id));

drop policy if exists "Workspace members can read situations" on public.situations;
create policy "Workspace members can read situations"
on public.situations
for select
to authenticated
using (public.can_access_case(case_id));

drop policy if exists "Workspace members can create situations" on public.situations;
create policy "Workspace members can create situations"
on public.situations
for insert
to authenticated
with check (public.can_access_case(case_id));

drop policy if exists "Workspace members can read action waves" on public.action_waves;
create policy "Workspace members can read action waves"
on public.action_waves
for select
to authenticated
using (public.can_access_case(case_id));

drop policy if exists "Workspace members can create action waves" on public.action_waves;
create policy "Workspace members can create action waves"
on public.action_waves
for insert
to authenticated
with check (public.can_access_case(case_id));

drop policy if exists "Workspace members can read tool recommendations" on public.tool_recommendations;
create policy "Workspace members can read tool recommendations"
on public.tool_recommendations
for select
to authenticated
using (public.can_access_case(case_id));

drop policy if exists "Workspace members can create tool recommendations" on public.tool_recommendations;
create policy "Workspace members can create tool recommendations"
on public.tool_recommendations
for insert
to authenticated
with check (public.can_access_case(case_id));

drop policy if exists "Workspace members can read artifacts" on public.artifacts;
create policy "Workspace members can read artifacts"
on public.artifacts
for select
to authenticated
using (public.can_access_case(case_id));

drop policy if exists "Workspace members can create artifacts" on public.artifacts;
create policy "Workspace members can create artifacts"
on public.artifacts
for insert
to authenticated
with check (public.can_access_case(case_id));

drop policy if exists "Workspace members can read snapshots" on public.snapshots;
create policy "Workspace members can read snapshots"
on public.snapshots
for select
to authenticated
using (public.can_access_case(case_id));

drop policy if exists "Workspace members can create snapshots" on public.snapshots;
create policy "Workspace members can create snapshots"
on public.snapshots
for insert
to authenticated
with check (public.can_access_case(case_id));

do $$
begin
  if to_regclass('public.conversations') is not null then
    execute 'drop policy if exists "Users can read conversations" on public.conversations';
    execute $sql$
      create policy "Users can read conversations"
      on public.conversations
      for select
      to authenticated
      using (
        (workspace_id is not null and public.is_workspace_member(workspace_id))
        or (user_id is not null and user_id = auth.uid())
      )
    $sql$;

    execute 'drop policy if exists "Users can create conversations" on public.conversations';
    execute $sql$
      create policy "Users can create conversations"
      on public.conversations
      for insert
      to authenticated
      with check (
        (workspace_id is not null and public.is_workspace_member(workspace_id))
        or (user_id is not null and user_id = auth.uid())
      )
    $sql$;
  end if;
end
$$;

do $$
begin
  if to_regclass('public.case_snapshots') is not null then
    execute 'drop policy if exists "Workspace members can read case snapshots" on public.case_snapshots';
    execute $sql$
      create policy "Workspace members can read case snapshots"
      on public.case_snapshots
      for select
      to authenticated
      using (public.can_access_case(case_id))
    $sql$;

    execute 'drop policy if exists "Workspace members can create case snapshots" on public.case_snapshots';
    execute $sql$
      create policy "Workspace members can create case snapshots"
      on public.case_snapshots
      for insert
      to authenticated
      with check (public.can_access_case(case_id))
    $sql$;
  end if;
end
$$;

do $$
begin
  if to_regclass('public.prompt_traces') is not null then
    execute 'drop policy if exists "Workspace members can read prompt traces" on public.prompt_traces';
    execute $sql$
      create policy "Workspace members can read prompt traces"
      on public.prompt_traces
      for select
      to authenticated
      using (public.can_access_case(case_id) or public.can_access_conversation(conversation_id))
    $sql$;

    execute 'drop policy if exists "Workspace members can create prompt traces" on public.prompt_traces';
    execute $sql$
      create policy "Workspace members can create prompt traces"
      on public.prompt_traces
      for insert
      to authenticated
      with check (public.can_access_case(case_id) or public.can_access_conversation(conversation_id))
    $sql$;
  end if;
end
$$;

do $$
begin
  if to_regclass('public.users') is not null then
    execute 'drop policy if exists "Users can read own profile" on public.users';
    execute $sql$
      create policy "Users can read own profile"
      on public.users
      for select
      to authenticated
      using (id = auth.uid())
    $sql$;

    execute 'drop policy if exists "Users can create own profile" on public.users';
    execute $sql$
      create policy "Users can create own profile"
      on public.users
      for insert
      to authenticated
      with check (id = auth.uid())
    $sql$;

    execute 'drop policy if exists "Users can update own profile" on public.users';
    execute $sql$
      create policy "Users can update own profile"
      on public.users
      for update
      to authenticated
      using (id = auth.uid())
      with check (id = auth.uid())
    $sql$;
  end if;
end
$$;

create or replace view public.active_case_overview
with (security_invoker = true) as
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
      'graph_snapshot', s.graph_snapshot,
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
  ) as latest_artifact,
  c.workspace_id
from public.cases c
join public.companies co on co.id = c.company_id
where c.status = 'active';
