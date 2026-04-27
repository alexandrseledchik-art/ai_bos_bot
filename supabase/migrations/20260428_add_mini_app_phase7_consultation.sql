alter table if exists public.consultation_briefs
  add column if not exists evidence jsonb not null default '[]'::jsonb,
  add column if not exists open_questions jsonb not null default '[]'::jsonb,
  add column if not exists requested_at timestamptz,
  add column if not exists booking_url text;
