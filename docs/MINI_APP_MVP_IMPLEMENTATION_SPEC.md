# Mini App MVP Implementation Spec

> Статус на 14.08.2026: реализация заморожена. Документ сохранён как техническая история и возможный дальний вариант. Текущий production-фокус — Telegram-first бот и дополнительная веб-платформа `/app`, а не отдельная Telegram Mini App.

## 1. Назначение документа

Этот документ переводит `TELEGRAM_MINI_APP_PRD.md` в техническое ТЗ для первой реализации Mini App.

Цель MVP:

> Пользователь заходит в кабинет компании → проходит короткий onboarding → проходит экспресс-диагностику → получает матрицу зрелости → видит гипотезу главного ограничения → получает один следующий шаг → получает 3 рекомендованных инструмента → сохраняет управленческий результат как артефакт → может продолжить с AI-BOSS или подготовить резюме для консультации с Александром.

MVP не должен пытаться сразу реализовать базовую и глубокую диагностику, автосинхронизацию документов, Google OAuth, визуальный causal graph или генерацию инструментов.

Ключевое продуктово-архитектурное правило:

- AI-BOSS является самостоятельной управляющей функцией бизнеса.
- Консультация с Александром — опциональное усиление, а не обязательное условие получения ценности.
- Основной результат MVP — не запись на консультацию, а сохранённый управленческий результат: контекст, гипотеза ограничения, следующий шаг, инструмент/артефакт и обновлённая память кейса.
- Следующий слой после MVP — внешний пользовательский маршрут по инструментам: web-builder архитектуры бизнеса, личный кабинет, личная копия Google-шаблона, заполнение через документ или чат, snapshot и постоянный контекст компании. Детали: `docs/EXTERNAL_USER_TOOL_WORKFLOW_SPEC.md`.

## 2. Текущий контекст проекта

В проекте уже есть:

- Telegram webhook и bot runtime.
- `conversation-service`.
- `classify-input`.
- `observation-extractor`.
- `graph-reasoner`.
- `guardrails`.
- `reasoning-client`.
- Supabase projection/store.
- Таблицы `workspaces`, `workspace_members`, `companies`, `cases`, `threads`, `messages`, `snapshots`, `artifacts`, `tool_recommendations`.
- RLS-логика вокруг workspace membership.

Для Mini App нужно не переписывать текущую архитектуру, а добавить слой кабинета поверх существующей памяти.

Ключевое решение:

- `Company` остаётся устойчивой сущностью бизнеса.
- `cases` используется как техническая реализация `DiagnosticCase`.
- Новые таблицы связываются с `cases.id`, `companies.id`, `workspaces.id`.
- Mini App не ходит напрямую в Supabase из браузера в MVP.
- Mini App ходит в наши `/api/mini-app/*` routes.
- API проверяет Telegram WebApp `initData`, определяет пользователя и workspace, затем работает с Supabase через server-side ключ.

## 3. MVP-границы

Входит в MVP:

- Telegram Mini App frontend.
- Проверка Telegram WebApp `initData`.
- Короткий onboarding.
- Кабинет компании.
- Express diagnostics по 11 слоям.
- Предзаполнение диагностики на основе сигналов из чата.
- Подтверждение / исправление предположений.
- Maturity matrix.
- Rule-based shortlist ограничения.
- AI explanation гипотезы ограничения.
- One next step.
- 3 recommended tools.
- Сохранение ссылок на документы.
- Ручной или bot-анализ документа в короткий `Snapshot`.
- Consultation brief как optional escalation.
- Floating button “Спросить AI-BOSS”.

Не входит в MVP:

- Базовая диагностика по доменам.
- Глубокая диагностика по поддоменам.
- Полный внешний маршрут по программе инструментов.
- Web-builder архитектуры бизнеса по 11 слоям.
- Автоматическое создание личной копии Google-шаблона для каждого пользователя.
- Заполнение Google-документа ботом по ответам из чата.
- Google OAuth.
- Google Picker.
- Автоматический polling документов.
- Автоматическая синхронизация Google Sheets.
- Генерация новых инструментов.
- Визуальный causal graph.
- Командный web cabinet вне Telegram.

## 4. Important implementation constraints

Эти правила важнее локальных решений ниже по документу.

- Не создавать дублирующие сущности, если уже есть рабочая таблица.
- Не создавать новую таблицу `cases`; использовать существующую `public.cases`.
- Если нет active diagnostic case, создать запись в существующей `public.cases` с `kind = 'diagnostic_case'`, актуальным `mode`, `status = 'active'`.
- Все layer keys брать только из `BUSINESS_LAYERS_V1`.
- Не использовать старые разрозненные layer keys в новом Mini App UI.
- `suggested` answers не участвуют в официальной матрице зрелости до подтверждения пользователем.
- `constraint_hypotheses` всегда показываются как гипотезы, пока пользователь или консультант их не подтвердил.
- Mini App не использует Supabase напрямую из браузера в MVP.
- Frontend ходит только в `/api/mini-app/*`.
- API проверяет Telegram WebApp `initData`.
- Все новые таблицы должны иметь `updated_at` trigger.
- Не использовать английские термины в пользовательском UI без русской расшифровки.

## 5. Архитектура потока

Основной поток:

```text
Telegram Mini App
  → /api/mini-app/bootstrap
  → verifyTelegramInitData
  → resolveAppUser
  → resolveWorkspace
  → resolveCompany
  → resolveActiveDiagnosticCase
  → loadDashboardState
```

Диагностический поток:

```text
Chat messages
  → ObservationExtractor
  → observations
  → DiagnosticPrefillEngine
  → suggested DiagnosticAnswers
  → user confirms/corrects
  → MaturityCalculator
  → maturity matrix
  → ConstraintReasoner
  → constraint hypothesis
  → NextStepSelector
  → ToolRecommender
```

Документный поток MVP:

```text
User adds document link
  → DocumentSource
  → user requests analysis
  → AI/manual analysis
  → Snapshot
  → observations, if useful
  → diagnostic prefill / constraint context
```

## 6. Telegram Mini App auth

### 6.1. Почему не direct Supabase в MVP

Telegram Mini App пользователь не равен Supabase Auth user по умолчанию.

Если пустить frontend напрямую в Supabase, придётся сразу решать:

- Supabase Auth;
- связку Telegram user → auth.users;
- RLS для Telegram identity;
- session refresh;
- browser-safe keys.

Для MVP проще и безопаснее:

- frontend отправляет Telegram `initData` на наш API;
- API проверяет подпись через `TELEGRAM_BOT_TOKEN`;
- API работает с Supabase server-side;
- доступ проверяется на уровне API.

### 6.2. Нужные функции

Новый модуль:

```text
src/infrastructure/telegram/verify-webapp-init-data.js
```

Функции:

- `verifyTelegramWebAppInitData(initData, botToken)`
- `parseTelegramWebAppUser(initData)`
- `assertFreshAuthDate(authDate, maxAgeSeconds)`

Минимальные проверки:

- hash валиден;
- `auth_date` не старше допустимого окна;
- есть `user.id`;
- request идёт только по HTTPS в production.

### 6.3. App user

Нужна таблица `app_users`, чтобы хранить Telegram-пользователя независимо от Supabase Auth.

Supabase Auth можно связать позже через nullable `auth_user_id`.

## 7. Supabase schema

Новая migration:

```text
supabase/migrations/YYYYMMDD_add_mini_app_mvp.sql
```

### 7.1. Enums

```sql
create type public.diagnostic_level as enum ('express', 'basic', 'deep');
create type public.diagnostic_subject_type as enum ('layer', 'domain', 'subdomain');
create type public.diagnostic_answer_source as enum (
  'user_explicit',
  'inferred_from_chat',
  'inferred_from_document',
  'user_confirmed_inference',
  'user_corrected_inference'
);
create type public.diagnostic_answer_status as enum (
  'suggested',
  'confirmed',
  'corrected',
  'rejected',
  'expired'
);
create type public.constraint_hypothesis_status as enum (
  'suggested',
  'confirmed',
  'rejected',
  'superseded'
);
create type public.next_step_status as enum (
  'suggested',
  'accepted',
  'done',
  'skipped',
  'superseded'
);
create type public.document_source_status as enum (
  'link_added',
  'access_ok',
  'access_lost',
  'pending_analysis',
  'analyzed',
  'needs_update'
);
create type public.tool_recommendation_status as enum (
  'recommended',
  'opened',
  'link_added',
  'analyzed',
  'needs_update',
  'closed'
);
```

### 7.2. `app_users`

```sql
create table public.app_users (
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
```

### 7.3. `workspace_app_members`

```sql
create table public.workspace_app_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  app_user_id uuid not null references public.app_users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, app_user_id)
);
```

MVP access rule:

- API verifies Telegram user.
- API checks `workspace_app_members`.
- If no company/workspace exists for this Telegram user, API creates workspace + company + membership.

### 7.4. `company_profiles`

```sql
create table public.company_profiles (
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
```

### 7.5. `problem_contexts`

```sql
create table public.problem_contexts (
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
```

### 7.6. `observations`

```sql
create table public.observations (
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
```

### 7.7. `diagnostic_runs`

```sql
create table public.diagnostic_runs (
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
```

### 7.8. `diagnostic_answers`

```sql
create table public.diagnostic_answers (
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
```

`evidence_observation_ids uuid[]` допустим для MVP как быстрый вариант. Правильная Post-MVP модель — join-таблица:

```sql
create table public.diagnostic_answer_evidence (
  diagnostic_answer_id uuid not null references public.diagnostic_answers(id) on delete cascade,
  observation_id uuid not null references public.observations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (diagnostic_answer_id, observation_id)
);
```

### 7.9. `maturity_scores`

```sql
create table public.maturity_scores (
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
```

### 7.10. `constraint_hypotheses`

```sql
create table public.constraint_hypotheses (
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
```

### 7.11. `next_steps`

```sql
create table public.next_steps (
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
```

### 7.12. `tools`

```sql
create table public.tools (
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
```

### 7.13. `tool_recommendations`

Существующая таблица `tool_recommendations` уже хранит рекомендации бота по кейсу. Для MVP не создавать `mini_app_tool_recommendations`, чтобы не получить две конкурирующие сущности.

Нужно расширить существующую `public.tool_recommendations`:

```sql
alter table public.tool_recommendations
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade,
  add column if not exists company_id uuid references public.companies(id) on delete cascade,
  add column if not exists tool_id uuid references public.tools(id) on delete restrict,
  add column if not exists priority integer not null default 1,
  add column if not exists status public.tool_recommendation_status not null default 'recommended',
  add column if not exists source text not null default 'ai_boss';

create unique index if not exists tool_recommendations_case_tool_unique
  on public.tool_recommendations(case_id, tool_id)
  where tool_id is not null;
```

Если выяснится, что старая таблица несовместима с Mini App, тогда допустимо создать отдельную таблицу, но в migration и коде нужно явно зафиксировать: старая `tool_recommendations` не используется Mini App.

### 7.14. `document_sources`

```sql
create table public.document_sources (
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
```

### 7.15. `document_snapshots`

Можно использовать существующую `snapshots`, но для Mini App документные выводы удобнее хранить отдельно и затем при необходимости дублировать в общий artifact/snapshot.

```sql
create table public.document_snapshots (
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
```

### 7.16. `consultation_briefs`

```sql
create table public.consultation_briefs (
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
```

### 7.17. Индексы

Обязательные индексы:

```sql
create index on public.app_users(telegram_user_id);
create index on public.workspace_app_members(workspace_id, app_user_id);
create index on public.company_profiles(company_id);
create index on public.problem_contexts(case_id, status);
create index on public.observations(case_id, status);
create index on public.diagnostic_runs(case_id, level, status);
create index on public.diagnostic_answers(diagnostic_run_id, subject_key, status);
create index on public.maturity_scores(company_id, subject_type, subject_key);
create index on public.constraint_hypotheses(case_id, status, created_at desc);
create index on public.next_steps(case_id, status, created_at desc);
create index on public.document_sources(company_id, status);
create index on public.document_snapshots(document_source_id, created_at desc);
```

### 7.18. Updated_at triggers

Все новые таблицы должны использовать существующую функцию `public.set_updated_at()`.

Пример:

```sql
drop trigger if exists app_users_set_updated_at on public.app_users;
create trigger app_users_set_updated_at
before update on public.app_users
for each row execute function public.set_updated_at();
```

Нужно добавить такие triggers для:

- `app_users`;
- `workspace_app_members`;
- `company_profiles`;
- `problem_contexts`;
- `observations`;
- `diagnostic_runs`;
- `diagnostic_answers`;
- `maturity_scores`;
- `constraint_hypotheses`;
- `next_steps`;
- `tools`;
- `document_sources`;
- `document_snapshots`;
- `consultation_briefs`;
- `tool_recommendations`, если migration добавляет туда новые Mini App поля.

### 7.19. RLS

Для MVP API использует service role и сам проверяет Telegram access. Но таблицы всё равно должны иметь RLS включённым.

Рекомендация:

- enable RLS на всех новых таблицах;
- добавить политики через `workspace_members` для будущего Supabase Auth;
- добавить отдельные helper functions позже для `workspace_app_members`, если появится direct browser access.

Минимальное правило:

```sql
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
```

## 8. API routes

Все routes должны:

- принимать `initData` или header `x-telegram-init-data`;
- проверять Telegram подпись;
- resolve user/workspace/company/case;
- возвращать только данные текущего workspace;
- не отдавать service role ключи в браузер.

### 8.1. Bootstrap

```text
GET /api/mini-app/bootstrap
```

Возвращает:

- `appUser`;
- `workspace`;
- `company`;
- `companyProfile`;
- `activeCase`;
- `onboardingStatus`;
- `dashboardSummary`.

Если сущностей нет:

- создать `app_user`;
- создать `workspace`;
- создать `company`;
- создать `workspace_app_member`;
- создать запись в существующей `public.cases` типа `diagnostic_case`;
- вернуть `onboardingStatus = required`.

### 8.2. Onboarding

```text
GET /api/mini-app/onboarding
POST /api/mini-app/onboarding
```

Payload:

```json
{
  "companyName": "string",
  "industry": "string",
  "companySize": "string",
  "revenueRange": "string",
  "currentRequest": "string",
  "userRole": "string"
}
```

Side effects:

- update `companies.name`;
- upsert `company_profiles`;
- upsert `problem_contexts`;
- update active `case.summary`.

### 8.3. Dashboard

```text
GET /api/mini-app/dashboard
```

Возвращает:

- progress onboarding;
- express diagnostic progress;
- maturity matrix;
- latest constraint hypothesis;
- latest next step;
- recommended tools;
- recent documents;
- recent artifacts;
- consultation CTA state.

### 8.4. Express diagnostics

```text
GET /api/mini-app/diagnostics/express
POST /api/mini-app/diagnostics/express/answer
POST /api/mini-app/diagnostics/express/complete
```

`GET` возвращает:

- 11 слоёв;
- 5 описаний зрелости на слой;
- existing answers;
- suggested answers;
- evidence snippets.

`POST answer` принимает:

```json
{
  "subjectKey": "commercial",
  "score": 2,
  "selectedDescription": "string",
  "status": "confirmed",
  "source": "user_explicit"
}
```

Side effects:

- upsert `diagnostic_answers`;
- recalculate `maturity_scores`;
- expire conflicting suggested answers.

### 8.5. Prefill

```text
POST /api/mini-app/diagnostics/prefill
```

Запускает:

- load recent chat observations;
- load document snapshots;
- run `DiagnosticPrefillEngine`;
- save suggested answers with confidence thresholds.

Возвращает:

- suggested answers;
- confidence;
- evidence;
- what user needs to confirm.

### 8.6. Maturity matrix

```text
GET /api/mini-app/maturity
POST /api/mini-app/maturity/recalculate
```

Возвращает:

- layer scores;
- source level;
- confidence;
- gaps to level 3;
- weak layers;
- causal candidate layers.

### 8.7. Constraint

```text
GET /api/mini-app/constraint
POST /api/mini-app/constraint/reason
POST /api/mini-app/constraint/:id/confirm
POST /api/mini-app/constraint/:id/reject
```

`POST reason` запускает:

- `ConstraintReasoner.buildDeterministicShortlist`;
- optional LLM explanation only after deterministic selection;
- save `constraint_hypotheses`.

Important: `ConstraintReasoner` must not ask the LLM to diagnose the business from scratch. The selected hypothesis and alternatives come only from deterministic scoring: maturity gaps, problem context, observations, layer class and evidence strength. The LLM may only explain the already selected hypothesis, alternatives, missing evidence and next check.

### 8.8. Next step

```text
GET /api/mini-app/next-step
POST /api/mini-app/next-step/recalculate
POST /api/mini-app/next-step/:id/accept
POST /api/mini-app/next-step/:id/done
```

### 8.9. Tools

```text
GET /api/mini-app/tools
GET /api/mini-app/tools/recommended
POST /api/mini-app/tools/recalculate
POST /api/mini-app/tools/:id/opened
```

`GET /tools` — полный каталог.

`GET /tools/recommended` — 3–5 инструментов для текущего кейса.

### 8.10. Documents

```text
GET /api/mini-app/documents
POST /api/mini-app/documents
POST /api/mini-app/documents/:id/analyze
```

MVP analysis:

- если документ публично доступен или пользователь вставил текст, бот анализирует;
- если доступа нет, вернуть понятную ошибку;
- сохранить `document_snapshot`;
- создать observations из полезных выводов.

### 8.11. Assistant context

```text
POST /api/mini-app/assistant/context
```

Payload:

```json
{
  "screenId": "maturity_matrix",
  "question": "Почему это не главное ограничение?",
  "context": {
    "caseId": "uuid",
    "layerKey": "commercial",
    "currentScore": 2
  }
}
```

Route вызывает existing reasoning pipeline, но передаёт `screenContext`.

### 8.12. Consultation

```text
GET /api/mini-app/consultation/brief
POST /api/mini-app/consultation/brief
POST /api/mini-app/consultation/request
```

MVP:

- подготовить summary;
- показать CTA;
- ссылка на запись задаётся в config/env.

## 9. Frontend screens

Рекомендуемый MVP frontend:

- React SPA в `app/mini-app`.
- API остаётся в `/api/mini-app/*`.
- Telegram SDK подключается на клиенте.
- Все запросы отправляют `window.Telegram.WebApp.initData`.

Если будет выбран Next.js, нужно отдельно добавить dependencies и маршруты. Если хотим минимально трогать текущий backend, проще сделать Vite SPA.

Phase 2 implementation decision:

- текущий repo настроен как Vercel functions/static project (`framework: null`) без Next-зависимостей и build pipeline;
- чтобы не расширять MVP и не перестраивать deploy, Phase 2 shell реализуется как static SPA;
- Next.js App Router можно вернуться рассмотреть перед фазами с полноценным frontend state и формами.

### 9.1. Route map

```text
/mini-app
/mini-app/onboarding
/mini-app/diagnostics/express
/mini-app/maturity
/mini-app/constraint
/mini-app/next-step
/mini-app/tools
/mini-app/tools/:slug
/mini-app/documents
/mini-app/consultation
```

### 9.2. Общий layout

На каждом экране:

- header;
- back button;
- home button;
- floating “Спросить AI-BOSS”;
- loading state;
- error state;
- autosave indicator where relevant.

### 9.3. Home dashboard

Блоки:

- company header;
- onboarding status;
- diagnostic progress;
- maturity matrix preview;
- current constraint hypothesis;
- next step;
- 3 recommended tools;
- documents;
- artifacts;
- consultation CTA.

### 9.4. Onboarding

Поля:

- название компании;
- отрасль;
- размер;
- диапазон выручки;
- текущий запрос;
- роль пользователя.

UX:

- не больше 1 экрана;
- если данные уже есть из чата, показать как prefilled;
- кнопка “Подтвердить и перейти к диагностике”.

### 9.5. Express diagnostics

Для каждого слоя:

- название;
- короткое объяснение;
- 5 уровней зрелости;
- suggested state, if any;
- evidence snippet;
- buttons confirm/correct/reject.

Важно:

- пользователь не должен чувствовать анкету;
- каждый слой объясняется через смысл, а не термин;
- можно пропустить слой;
- прогресс сохраняется.

### 9.6. Maturity matrix

Показывает:

- 11 слоёв;
- score;
- color;
- source: explicit / suggested / confirmed;
- confidence;
- gap to 3;
- “не равно главному ограничению” hint.

CTA:

- “Объяснить результат”.
- “Перейти к гипотезе ограничения”.

### 9.7. Constraint screen

Показывает:

- current hypothesis;
- why likely;
- supporting observations;
- alternatives;
- what still needs checking;
- confidence;
- status.

Actions:

- confirm;
- reject;
- ask AI-BOSS;
- calculate next step.

### 9.8. Next step screen

Показывает:

- one recommended next step;
- why this first;
- what not to do now;
- related tool;
- expected result.

Actions:

- accept;
- mark done;
- ask why;
- open tool;
- prepare consultation brief.

### 9.9. Tools

Recommended tools block:

- 3–5 tools;
- reason;
- template link;
- status;
- button “Открыть”.

Catalog:

- all active tools;
- search/filter later;
- MVP can be simple list.

### 9.10. Documents

MVP:

- add link;
- show status;
- run analysis;
- show snapshot summary;
- show extracted observations.

No automatic sync in MVP.

### 9.11. Consultation

Показывает:

- what is already known;
- current request;
- maturity summary;
- constraint hypothesis;
- next step;
- documents/tools used;
- CTA to book.

Actions:

- generate/update brief;
- copy summary;
- open booking link.

## 10. Decision services

### 10.1. `ObservationExtractor`

Status: existing, extend.

Input:

- messages;
- entryState;
- active case;
- optional screen context.

Output:

- observations;
- normalized signals;
- possible layers;
- confidence.

Implementation:

- reuse `src/application/observation-extractor.js`;
- add persistence into `observations`;
- avoid duplicate observations by normalized signal + case id.

### 10.2. `DiagnosticPrefillEngine`

New file:

```text
src/application/diagnostic-prefill-engine.js
```

Input:

- observations;
- company profile;
- problem context;
- existing diagnostic answers;
- document snapshots.

Output:

- suggested answers by layer;
- confidence;
- evidence observation ids;
- short explanation.

Rules:

- confidence < 0.5: internal only;
- 0.5–0.75: show as “предположение системы”;
- >= 0.75: show as “вероятная оценка, подтвердите”;
- never write as confirmed without user action.

### 10.3. `MaturityCalculator`

New file:

```text
src/application/maturity-calculator.js
```

MVP:

- calculate express layer scores only;
- source level = `express`;
- only confirmed/corrected/user explicit answers affect official score;
- suggested answers can show as preview, not official matrix.

Post-MVP:

- domain average;
- subdomain average;
- weighted maturity.

### 10.4. `ConstraintReasoner`

New file:

```text
src/application/constraint-reasoner.js
```

MVP logic:

- deterministic shortlist first;
- optional AI explanation only after deterministic selection;
- save as hypothesis.

Shortlist inputs:

- weak layers;
- gap to 3;
- problem context relevance;
- class priority A/B/C/D;
- observations count;
- evidence strength;
- existing graph packet if available.

Hard boundary:

- LLM cannot select the constraint;
- LLM cannot diagnose from scratch;
- LLM can only explain the deterministic selection, alternatives, missing evidence and next check.

Output:

- top 1 hypothesis;
- 2–3 alternatives;
- explanation;
- confidence;
- missing evidence.

Guardrail:

- never present as final diagnosis unless user confirmed.

### 10.5. `NextStepSelector`

New file:

```text
src/application/next-step-selector.js
```

Input:

- active case;
- constraint hypothesis;
- maturity matrix;
- observations;
- tools;
- documents.

Output:

- one next step;
- why this first;
- not now;
- related tool.

MVP examples:

- confirm a suggested diagnostic answer;
- complete express diagnostic;
- open relevant tool;
- add document link;
- prepare consultation brief.

### 10.6. `ToolRecommender`

New file or extension:

```text
src/application/tool-recommender.js
```

Input:

- problem context;
- constraint hypothesis;
- weak/relevant layers;
- next step.

Output:

- 3 recommended tools;
- reasons;
- priority.

MVP rule:

- recommend, do not generate full tool in chat;
- use catalog `tools`;
- if no matching tools, say no exact tool yet and suggest consultation/diagnostic step.

### 10.7. `ConsultationBriefBuilder`

New file:

```text
src/application/consultation-brief-builder.js
```

Input:

- company profile;
- problem context;
- maturity matrix;
- constraint hypothesis;
- next step;
- documents;
- artifacts.

Output:

- short summary for user;
- structured brief for Alexander;
- open questions.

## 11. Prompts and schemas

Prompts should live in:

```text
prompts/mini-app/
```

Recommended files:

- `observation-extractor.md`
- `diagnostic-prefill.md`
- `constraint-reasoner.md`
- `next-step-selector.md`
- `consultation-brief.md`

Schemas should live in:

```text
schemas/mini-app/
```

Recommended schemas:

- `observation.schema.json`
- `diagnostic-prefill.schema.json`
- `constraint-hypothesis.schema.json`
- `next-step.schema.json`
- `consultation-brief.schema.json`

### 11.1. Prompt rules

All Mini App prompts must enforce:

- answer in the user's language;
- no unexplained English terms;
- if a term is necessary, explain it in simple Russian;
- do not confuse symptom with cause;
- do not turn weak evidence into diagnosis;
- propose, do not assert, until user confirms;
- keep output short and decision-oriented.

### 11.2. `diagnostic-prefill` output shape

```json
{
  "suggestions": [
    {
      "subjectKey": "commercial",
      "score": 2,
      "confidence": 0.68,
      "status": "suggested",
      "reason": "Лиды смешанные, квалификация держится на ручном решении.",
      "evidence": ["observation_uuid"]
    }
  ]
}
```

### 11.3. `constraint-reasoner` output shape

```json
{
  "primaryHypothesis": {
    "title": "Коммерция: смешанный входящий поток и слабый фильтр целевого клиента",
    "layerKey": "commercial",
    "layerClass": "B",
    "constraintType": "quality",
    "confidence": 0.64,
    "explanation": "Это может объяснять перегруз квалификации и низкую конверсию без поспешного вывода про нехватку людей.",
    "missingEvidence": ["Подтвердить, есть ли единые правила отбора и приоритета лида."]
  },
  "alternatives": []
}
```

## 12. Layer catalog

Нужно вынести 11 слоёв в код и использовать единый источник.

New file:

```text
src/domain/business-layers.js
```

Shape:

```js
export const BUSINESS_LAYERS_V1 = [
  {
    key: "owner_context",
    classKey: "A",
    title: "Контур собственника",
    shortDescription: "...",
    diagnosticQuestion: "..."
  }
];
```

Canonical layer keys:

- `owner_context`;
- `external_environment`;
- `strategy`;
- `product_value_proposition`;
- `commercial`;
- `operating_model`;
- `finance`;
- `people_organization`;
- `governance_risks`;
- `technology`;
- `data_analytics`.

Важно:

- заменить старые разрозненные названия там, где они показываются пользователю;
- сохранить backward compatibility для существующих `entryState.businessLayers`;
- mapping `team` → `people_organization`, `operations` → `operating_model`, `product` → `product_value_proposition`, `governance` → `governance_risks`.

### 12.1. Express descriptions

До Phase 3 нужно подготовить 5 описаний зрелости для каждого из 11 слоёв.

Без этого диагностика будет технически готова, но продуктово пустая.

Формат:

```js
{
  layerKey: "commercial",
  levels: [
    { score: 1, title: "Хаос", description: "..." },
    { score: 2, title: "Интуиция", description: "..." },
    { score: 3, title: "Система", description: "..." },
    { score: 4, title: "Управление", description: "..." },
    { score: 5, title: "Оптимизация", description: "..." }
  ]
}
```

## 13. Tool catalog seed

MVP tools:

- Карта ролей и ответственности.
- Разбор целевого клиента.
- Карта воронки.
- Финансовый срез.
- Подготовка к продаже бизнеса.

Seed file:

```text
data/mini-app-tools.seed.sql
```

Fields:

- slug;
- title;
- short_description;
- when_to_use;
- template_url;
- layer_keys;
- problem_types.

## 14. Implementation phases

### Phase 1. Schema and auth

Tasks:

- add migration `add_mini_app_mvp`;
- add `verify-webapp-init-data`;
- add app user/workspace resolver;
- add bootstrap API route.
- extend existing `tool_recommendations` instead of creating duplicate table.
- add `updated_at` triggers for all new tables.

Acceptance:

- Mini App can call bootstrap with valid initData;
- invalid initData rejected;
- user/workspace/company/case created or resolved.

### Phase 2. Frontend shell

Tasks:

- create Mini App frontend shell;
- add routes;
- add API client;
- add Telegram initData provider;
- add layout/back/home/floating AI-BOSS button.

Acceptance:

- `/mini-app` opens in Telegram WebView;
- dashboard loads bootstrap state;
- all screens have back/home.

### Phase 3. Onboarding and express diagnostics

Tasks:

- onboarding form;
- express diagnostics UI;
- layer catalog;
- 5 maturity descriptions for each of 11 layers;
- answer save API;
- diagnostic run creation;
- maturity calculation.

Acceptance:

- user completes onboarding;
- user answers 11 layers;
- matrix shows scores.

### Phase 4. Hybrid prefill

Tasks:

- persist observations from chat;
- create `DiagnosticPrefillEngine`;
- add prefill API;
- show suggested answers;
- confirm/correct/reject UX.

Acceptance:

- if chat has useful signals, express diagnostics is partially suggested;
- suggested answers never become confirmed automatically.

### Phase 5. Constraint and next step

Tasks:

- create `ConstraintReasoner`;
- create `NextStepSelector`;
- add screens and APIs;
- add explanation guardrails.

Acceptance:

- app shows hypothesis, not final diagnosis;
- hypothesis references evidence;
- app shows one next step.

### Phase 6. Tools and documents

Tasks:

- seed tools;
- implement tool recommendations;
- add document links;
- implement manual/bot document analysis snapshot.

Acceptance:

- dashboard shows 3 recommended tools;
- user can add document link;
- snapshot summary is saved and visible.

### Phase 7. Consultation brief

Tasks:

- create brief builder;
- consultation screen;
- booking CTA config;
- artifact/brief save.

Acceptance:

- user can prepare consultation summary;
- summary includes request, matrix, hypothesis, next step.

## 15. Testing and evals

Unit tests:

- `verifyTelegramWebAppInitData`;
- `DiagnosticPrefillEngine`;
- `MaturityCalculator`;
- `ConstraintReasoner`;
- `NextStepSelector`;
- `ToolRecommender`.

API tests:

- bootstrap valid/invalid auth;
- onboarding save;
- answer save;
- prefill thresholds;
- constraint generation;
- document link save.

Evals:

- 10 sales cases;
- 10 owner bottleneck cases;
- 10 sale preparation cases;
- 10 tool-first cases;
- 10 vague requests.

Quality checks:

- no English terms without explanation;
- no final diagnosis on weak evidence;
- no “min score = main constraint” logic;
- no repeated questionnaire feel;
- suggested answers require confirmation.

Smoke:

```text
npm run smoke
npm run evals
npm run evals:diagnostic
npm run evals:quality
```

## 16. Open decisions before coding

Recommendation:

- frontend stack for MVP: Next.js App Router inside existing project, unless current repo structure makes Vite SPA significantly simpler.

Need to decide:

- booking URL for Alexander;
- exact tool template URLs;
- exact 5 descriptions per layer for express diagnostics;
- whether Mini App starts from onboarding or dashboard with onboarding card;
- whether document analysis accepts only public links in MVP;
- whether consultation brief is stored as `consultation_briefs` only or also as `artifacts`.

## 17. MVP acceptance criteria

MVP is done when:

- user opens Telegram Mini App;
- Telegram initData is verified;
- company/workspace/case resolves;
- user completes onboarding;
- user completes express diagnostics;
- matrix shows 11 layer scores;
- suggested answers from chat can appear but require confirmation;
- app shows current constraint as hypothesis;
- app does not choose constraint only by lowest score;
- app shows one next step;
- app shows 3 recommended tools;
- user can add document link;
- app can save short document snapshot;
- app can prepare consultation brief;
- every internal screen has back/home;
- floating AI-BOSS button exists;
- tests/evals/smoke pass.
