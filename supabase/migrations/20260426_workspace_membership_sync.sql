create or replace function public.ensure_workspace_member(
  target_workspace_id uuid,
  target_user_id uuid,
  target_role text default 'member'
)
returns void
language plpgsql
as $$
begin
  if target_workspace_id is null or target_user_id is null then
    return;
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (
    target_workspace_id,
    target_user_id,
    case when target_role = 'owner' then 'owner' else 'member' end
  )
  on conflict (workspace_id, user_id)
  do update
    set role = case
      when public.workspace_members.role = 'owner' or excluded.role = 'owner' then 'owner'
      else 'member'
    end,
    updated_at = now();
end;
$$;

create or replace function public.sync_case_workspace_member()
returns trigger
language plpgsql
as $$
begin
  if new.user_id is not null and new.workspace_id is not null then
    perform public.ensure_workspace_member(new.workspace_id, new.user_id, 'owner');
  end if;

  return new;
end;
$$;

create or replace function public.sync_conversation_workspace_member()
returns trigger
language plpgsql
as $$
begin
  if new.user_id is not null and new.workspace_id is not null then
    perform public.ensure_workspace_member(new.workspace_id, new.user_id, 'member');
  end if;

  return new;
end;
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'cases'
      and column_name = 'user_id'
  ) then
    execute 'drop trigger if exists cases_sync_workspace_member on public.cases';
    execute $sql$
      create trigger cases_sync_workspace_member
      after insert or update of user_id, workspace_id on public.cases
      for each row execute function public.sync_case_workspace_member()
    $sql$;

    execute $sql$
      insert into public.workspace_members (workspace_id, user_id, role)
      select distinct c.workspace_id, c.user_id, 'owner'
      from public.cases c
      where c.user_id is not null
        and c.workspace_id is not null
      on conflict (workspace_id, user_id)
      do update
        set role = case
          when public.workspace_members.role = 'owner' or excluded.role = 'owner' then 'owner'
          else 'member'
        end,
        updated_at = now()
    $sql$;
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'conversations'
      and column_name = 'user_id'
  ) then
    execute 'drop trigger if exists conversations_sync_workspace_member on public.conversations';
    execute $sql$
      create trigger conversations_sync_workspace_member
      after insert or update of user_id, workspace_id on public.conversations
      for each row execute function public.sync_conversation_workspace_member()
    $sql$;

    execute $sql$
      insert into public.workspace_members (workspace_id, user_id, role)
      select distinct conv.workspace_id, conv.user_id, 'member'
      from public.conversations conv
      where conv.user_id is not null
        and conv.workspace_id is not null
      on conflict (workspace_id, user_id)
      do update
        set updated_at = now()
    $sql$;
  end if;
end
$$;
