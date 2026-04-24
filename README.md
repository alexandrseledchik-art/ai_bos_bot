# Telegram-First Business Diagnostic Bot

MVP-ядро для Telegram-first AI-бота, который работает не как анкета, а как decision engine:

- сначала интерпретирует смысл;
- формирует конкурирующие рабочие гипотезы;
- отделяет симптомы от пользовательской версии причины;
- ищет главное ограничение системы, а не ближайшую жалобу;
- выбирает один следующий шаг: `clarify`, `screen`, `diagnose` или `answer`.

## Что уже есть

- Routing входа: `url_only`, `url_plus_problem`, `free_text_vague`, `free_text_problem`, `unknown`
- Три режима: `clarification_mode`, `diagnostic_mode`, `website_screening_mode`
- Двухслойная логика состояния:
  - `entryState` в чате — лёгкий скрытый объект маршрутизации
  - `diagnostic_case` — полноценный объект диагностики после достаточного сигнала
- Observation layer:
  - извлекает наблюдения и симптом-сигналы из живого текста до final reasoning
- Graph-assisted reasoning:
  - graph engine не отвечает пользователю сам
  - graph packet подаёт reasoner'у candidate states, candidate causes, conflicts и discriminating signals
- Guardrails против ложной уверенности и внутреннего диагноза по одному URL
- Constraint-first reasoning:
  - не принимает пользовательскую причину за факт
  - строит `candidateConstraints`
  - выбирает discriminating question, а не ближайший локальный совет
- Structured memory с сущностями:
  - `Company`
  - `Case`
  - `Goal`
  - `Symptom`
  - `Hypothesis`
  - `Constraint`
  - `Situation`
  - `ActionWave`
  - `ToolRecommendation`
  - `Artifact`
  - `Snapshot`
- Сохранение артефактов как Markdown-файлов
- Telegram long polling без внешних зависимостей
- OpenAI Responses API как основной reasoning backend
- Heuristic fallback, чтобы MVP работал даже без API ключа

## Архитектура

- [src/application/classify-input.js](/Users/aleksandrseledcik/Library/Mobile%20Documents/com~apple~CloudDocs/Проект%20ТГ%20Бота/src/application/classify-input.js) — маршрутизация входа
- [src/application/observation-extractor.js](/Users/aleksandrseledcik/Library/Mobile%20Documents/com~apple~CloudDocs/Проект%20ТГ%20Бота/src/application/observation-extractor.js) — перевод живого текста в наблюдения и symptom signals
- [src/application/graph-reasoner.js](/Users/aleksandrseledcik/Library/Mobile%20Documents/com~apple~CloudDocs/Проект%20ТГ%20Бота/src/application/graph-reasoner.js) — graph analyzer: candidate states, causes, interventions, discriminating signals
- [src/application/conversation-service.js](/Users/aleksandrseledcik/Library/Mobile%20Documents/com~apple~CloudDocs/Проект%20ТГ%20Бота/src/application/conversation-service.js) — decision flow, promotion из `entryState` в `diagnostic_case`, память, артефакты
- [src/application/guardrails.js](/Users/aleksandrseledcik/Library/Mobile%20Documents/com~apple~CloudDocs/Проект%20ТГ%20Бота/src/application/guardrails.js) — жёсткие ограничения против ложного causal closure и нормализация ответов
- [src/infrastructure/openai/reasoning-client.js](/Users/aleksandrseledcik/Library/Mobile%20Documents/com~apple~CloudDocs/Проект%20ТГ%20Бота/src/infrastructure/openai/reasoning-client.js) — OpenAI + fallback reasoner
- [src/domain/causal-graph.js](/Users/aleksandrseledcik/Library/Mobile%20Documents/com~apple~CloudDocs/Проект%20ТГ%20Бота/src/domain/causal-graph.js) — узлы и связи прагматического weighted causal graph
- [src/infrastructure/graph/load-graph.js](/Users/aleksandrseledcik/Library/Mobile%20Documents/com~apple~CloudDocs/Проект%20ТГ%20Бота/src/infrastructure/graph/load-graph.js) — инфраструктурный loader graph-model
- [src/infrastructure/screening/website-screener.js](/Users/aleksandrseledcik/Library/Mobile%20Documents/com~apple~CloudDocs/Проект%20ТГ%20Бота/src/infrastructure/screening/website-screener.js) — внешний скрининг сайта
- [src/infrastructure/storage/file-store.js](/Users/aleksandrseledcik/Library/Mobile%20Documents/com~apple~CloudDocs/Проект%20ТГ%20Бота/src/infrastructure/storage/file-store.js) — JSON storage + artifact files
- [src/infrastructure/telegram/telegram-bot.js](/Users/aleksandrseledcik/Library/Mobile%20Documents/com~apple~CloudDocs/Проект%20ТГ%20Бота/src/infrastructure/telegram/telegram-bot.js) — Telegram runner

## Запуск

1. Заполни `.env` по примеру из `.env.example`
2. Локальный smoke test:

```bash
npm run smoke
```

3. Прогон golden evals:

```bash
npm run evals
```

4. Прогон диагностического quality framework:

```bash
npm run evals:diagnostic
```

Он меряет не только route/mode/action, а ещё 6 quality-метрик:

- `nextBestQuestion`
- `causeDepth`
- `uncertainty`
- `adviceDiscipline`
- `promotion`
- `artifact`

5. Экспорт текущей памяти в реляционный staging-вид:

```bash
npm run export:memory -- data/smoke-state.json
```

6. Синхронизация локальной памяти в Supabase:

```bash
npm run sync:supabase -- data/smoke-state.json
```

7. Запуск Telegram-бота:

```bash
npm start
```

8. Регистрация Telegram webhook после деплоя на Vercel:

```bash
npm run telegram:webhook
```

## Переменные окружения

- `TELEGRAM_BOT_TOKEN` — токен бота
- `TELEGRAM_WEBHOOK_SECRET` — секрет для заголовка `x-telegram-bot-api-secret-token`
- `APP_BASE_URL` — публичный URL приложения, например `https://your-app.vercel.app`
- `OPENAI_API_KEY` — ключ OpenAI
- `OPENAI_REASONING_MODEL` — по умолчанию `gpt-5.4-mini`
- `OPENAI_REASONING_EFFORT` — `low|medium|high`
- `OPENAI_TRANSCRIPTION_MODEL` — модель для транскрибации голосовых, по умолчанию `gpt-4o-mini-transcribe`
- `OPENAI_TRANSCRIPTION_FALLBACK_MODELS` — запасные модели через запятую, по умолчанию `whisper-1`
- `SCREEN_TIMEOUT_MS` — таймаут для скрининга сайтов
- `MAX_HISTORY_MESSAGES` — сколько последних сообщений давать в reasoning context
- `DATA_ROOT` — опциональный путь для локального state/artifacts; на serverless по умолчанию используется writable `/tmp/aibosbot`
- `MEMORY_BACKEND` — backend памяти: `file` для локальной разработки, `supabase` для production
- `SUPABASE_STATE_MODE` — режим Supabase-памяти: `primary` на Vercel/production или `replicated` для локального file + sync
- `SUPABASE_STATE_KEY` — ключ runtime-state строки в Supabase, по умолчанию `project_state`
- `SUPABASE_URL` — база для следующего этапа миграции
- `SUPABASE_SERVICE_ROLE_KEY` — ключ для серверной синхронизации в Supabase

## Как включить Supabase memory

Создай `.env` в корне проекта и укажи:

```env
MEMORY_BACKEND=supabase
SUPABASE_STATE_MODE=primary
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_SYNC_TRANSPORT=auto
```

В production на Vercel Supabase должен быть source of truth: runtime state читается и пишется в таблицу `runtime_states`, а relational tables остаются проекцией для аналитики, артефактов и будущего интерфейса.

Для локальной разработки можно оставить:

```env
MEMORY_BACKEND=file
```

Или использовать гибридный режим:

```env
MEMORY_BACKEND=supabase
SUPABASE_STATE_MODE=replicated
```

В `replicated` приложение пишет локально в `data/state.json` и best-effort синхронизирует structured memory в Supabase. Этот режим удобен для dev, но не должен быть source of truth на Vercel.

`SUPABASE_SYNC_TRANSPORT`:

- `auto` — сначала пробует REST, затем падает обратно на CLI sync
- `rest` — только REST transport
- `cli` — сразу sync через `supabase db query --linked`

## Доступ и RLS

- В Supabase включён deny-by-default RLS на пользовательских таблицах: `workspaces`, `workspace_members`, `companies`, `cases`, `threads`, `messages`, `snapshots`, `artifacts` и связанных case-entities
- Доступ строится не вокруг прямого `user_id` на каждой записи, а вокруг membership-модели:
  - `workspaces`
  - `workspace_members`
  - `workspace_id` на корневых сущностях
- Graph/runtime sync продолжает работать через `SUPABASE_SERVICE_ROLE_KEY`, а клиентский доступ теперь должен идти только через membership policies
- После миграции новые клиентские пользователи ничего не видят автоматически, пока им не назначен `workspace_members` row
- Для operational-выдачи доступа есть скрипт:

```bash
npm run workspace:membership -- list
npm run workspace:membership -- grant --user-id <auth-user-uuid> --workspace-slug <slug> --role owner
```

- Если в legacy flow появятся `cases.user_id` или `conversations.user_id`, migration [20260426_workspace_membership_sync.sql](</Users/aleksandrseledcik/Library/Mobile Documents/com~apple~CloudDocs/Проект ТГ Бота/supabase/migrations/20260426_workspace_membership_sync.sql>) автоматически синхронизирует `workspace_members`

## Что хранится

- Диалог и решения — локально в `data/state.json` при `MEMORY_BACKEND=file`; в production при `MEMORY_BACKEND=supabase` и `SUPABASE_STATE_MODE=primary` source of truth хранится в `public.runtime_states`
- На уровне `thread` хранится скрытый `entryState`:
  - `claimedProblem`
  - `claimedCause`
  - `symptoms`
  - `observedSignals`
  - `systemLayers`
  - `candidateConstraints`
  - `candidateStates`
  - `candidateCauses`
  - `graphTrace`
  - `discriminatingSignals`
  - `graphConfidence`
  - `selectedConstraint`
  - `nextBestQuestion`
- На уровне `snapshot` теперь дополнительно сохраняется `graphSnapshot`:
  - candidate states
  - candidate causes
  - candidate interventions
  - discriminating signals
  - graph trace
  - graph confidence
- Артефакты кейсов — локально в `data/artifacts/*.md`, а их содержимое дополнительно сохраняется в structured memory для serverless-runtime
- Реляционный staging export — в `data/relational-export/*.json`

## Следующие шаги

- Пошаговый продуктовый план: [docs/STEP_BY_STEP_PLAN.md](</Users/aleksandrseledcik/Library/Mobile Documents/com~apple~CloudDocs/Проект ТГ Бота/docs/STEP_BY_STEP_PLAN.md>)
- Golden evals: [evals/golden-cases.json](</Users/aleksandrseledcik/Library/Mobile Documents/com~apple~CloudDocs/Проект ТГ Бота/evals/golden-cases.json>)
- Diagnostic quality evals: [evals/diagnostic-quality-cases.json](</Users/aleksandrseledcik/Library/Mobile Documents/com~apple~CloudDocs/Проект ТГ Бота/evals/diagnostic-quality-cases.json>)
- SQL схема памяти: [supabase/migrations/20260421_init_business_diagnostic.sql](</Users/aleksandrseledcik/Library/Mobile Documents/com~apple~CloudDocs/Проект ТГ Бота/supabase/migrations/20260421_init_business_diagnostic.sql>)
- Проекция state.json в реляционный вид: [state-projector.js](</Users/aleksandrseledcik/Library/Mobile Documents/com~apple~CloudDocs/Проект ТГ Бота/src/infrastructure/storage/state-projector.js>)

## Vercel Mode

- Vercel webhook handler: [api/telegram.js](</Users/aleksandrseledcik/Library/Mobile Documents/com~apple~CloudDocs/Проект ТГ Бота/api/telegram.js>)
- Local polling runner: [telegram-bot.js](</Users/aleksandrseledcik/Library/Mobile Documents/com~apple~CloudDocs/Проект ТГ Бота/src/infrastructure/telegram/telegram-bot.js>)
- Webhook registration script: [register-telegram-webhook.js](</Users/aleksandrseledcik/Library/Mobile Documents/com~apple~CloudDocs/Проект ТГ Бота/src/scripts/register-telegram-webhook.js>)

Логика одна и та же:

- локально можно продолжать использовать long polling через `npm start`
- на Vercel Telegram должен ходить в `/api/telegram`
- после первого деплоя нужно вызвать `npm run telegram:webhook`
- бот теперь принимает не только текст, но и `voice`/`audio` сообщения; голосовые сначала транскрибируются через OpenAI, а потом идут в тот же диагностический pipeline
- если транскрибация не настроена или не удалась, бот честно просит прислать ту же мысль текстом вместо молчаливого игнора

Это уже не просто чат с промптом: здесь есть routing, decision engine, скрытый `entryState`, promotion в `diagnostic_case`, разделение screening/diagnostic и сохраняемые артефакты.
