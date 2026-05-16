alter table public.tools
  add column if not exists source text not null default 'manual',
  add column if not exists source_spreadsheet_id text,
  add column if not exists source_gid text,
  add column if not exists source_row integer,
  add column if not exists layer_title text,
  add column if not exists domain_title text,
  add column if not exists subdomain_title text,
  add column if not exists tool_status text,
  add column if not exists result text,
  add column if not exists relation text,
  add column if not exists link_label text,
  add column if not exists architecture_order integer,
  add column if not exists embedding_suggestion text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists tools_source_idx
  on public.tools(source, source_spreadsheet_id, source_gid);

create index if not exists tools_layer_keys_gin_idx
  on public.tools using gin(layer_keys);

create index if not exists tools_problem_types_gin_idx
  on public.tools using gin(problem_types);
