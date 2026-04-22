alter table if exists public.snapshots
add column if not exists graph_snapshot jsonb not null default '{}'::jsonb;

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
  ) as latest_artifact
from public.cases c
join public.companies co on co.id = c.company_id
where c.status = 'active';
