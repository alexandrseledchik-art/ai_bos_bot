alter table public.app_users
  add column if not exists access_status text not null default 'pending',
  add column if not exists access_requested_at timestamptz not null default now(),
  add column if not exists access_decided_at timestamptz,
  add column if not exists access_decided_by bigint,
  add column if not exists access_note text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'app_users_access_status_check'
      and conrelid = 'public.app_users'::regclass
  ) then
    alter table public.app_users
      add constraint app_users_access_status_check
      check (access_status in ('pending', 'approved', 'blocked'));
  end if;
end
$$;

create index if not exists app_users_access_status_idx
  on public.app_users(access_status);

create index if not exists app_users_access_requested_at_idx
  on public.app_users(access_requested_at desc);
