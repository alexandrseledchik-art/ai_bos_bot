# Business Diagnosis Telegram Assistant

Telegram-first AI assistant for business diagnosis and managerial analysis.

## What it is
- Telegram chat is the main interface for reasoning and interaction.
- Mini App is only for saved results, artifacts, and continuation context.
- The bot works as a decision engine: understand -> hypothesize -> assess signal -> choose next step.
- Replies are pushed back to Telegram through Bot API, not returned as fake local JSON only.

## Stack
- Next.js App Router
- TypeScript
- OpenAI API
- Telegram Bot API
- Supabase schema migrations
- Zod

## Scripts
- `npm install`
- `npm run dev`
- `npm run build`
- `npm run typecheck`
- `npm run test:unit`

## Required env vars
- `OPENAI_API_KEY`
- `OPENAI_MODEL` (optional, defaults to `gpt-5.4-mini`)
- `OPENAI_TRANSCRIPTION_MODEL` (optional, defaults to `whisper-1`)
- `OPENAI_VISION_MODEL` (optional)
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_BOT_USERNAME` (optional, for future continue-case deeplinks)
- `NEXT_PUBLIC_APP_URL` (optional)
- `SUPABASE_URL` (for future production persistence)
- `SUPABASE_ANON_KEY` (for future production persistence)
- `SUPABASE_SERVICE_ROLE_KEY` (for future server persistence)

## Local run
1. Install dependencies: `npm install`
2. Set env vars.
3. Run: `npm run dev`
4. Point Telegram webhook to `/api/telegram/webhook`

## MVP boundaries
Included:
- Telegram webhook
- text flow
- voice/audio transcription
- image context extraction
- website context extraction
- router / diagnostic / renderer prompts
- strict JSON validation
- Supabase-backed persistence when server env vars are configured
- in-memory persistence fallback for local tests and isolated development
- Mini App results UI
- continue-case deeplink via `/start case_<id>`

Still minimal:
- no auth/UI layer beyond saved results
- no advanced analytics or workflow engine
- no PDF/report generation

## Deployment
- Deploy to Vercel
- set env vars
- connect webhook to deployed `/api/telegram/webhook`
- apply Supabase migrations
- set `TELEGRAM_BOT_USERNAME`, if you want continue-case links from Mini App back to chat

## Product guardrails
- no fake diagnosis on weak signal
- no internal business diagnosis from URL-only input
- no ownership inference from reference link
- one strong question instead of questionnaire
- saved result as artifact for strong cases

## Acceptance / UAT
- See [docs/project-brief.md](/Users/aleksandrseledcik/Documents/New%20project/docs/project-brief.md) for product framing.
- See [docs/test-cases.md](/Users/aleksandrseledcik/Documents/New%20project/docs/test-cases.md) for 10 core manual acceptance scenarios.
