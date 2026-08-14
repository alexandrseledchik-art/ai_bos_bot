# AI-BOSS production on VPS

Статус: основной production-контур. Vercel больше не обслуживает Telegram webhook и site navigator.

## Production topology

```text
Telegram / seledchik.ru
        ↓ HTTPS
aiboss.seledchik.ru
        ↓ Nginx
127.0.0.1:3000
        ↓
Docker container ai-boss
        ├─ OpenAI Responses API
        ├─ Telegram Bot API
        └─ Supabase + local replicated state
```

- VPS: `82.202.131.145`, Ubuntu 24.04.
- Project: `/srv/codex/projects/ai-boss`.
- Public URL: `https://aiboss.seledchik.ru`.
- Telegram webhook: `https://aiboss.seledchik.ru/api/telegram`.
- Node.js port is published only on `127.0.0.1:3000`.
- Nginx configuration source: `deploy/nginx-aiboss.seledchik.ru.conf`.

## Required environment

Production secrets live only in `/srv/codex/projects/ai-boss/.env`. The file must have mode `600` and must never be committed.

Required variables:

- `TELEGRAM_BOT_TOKEN`;
- `TELEGRAM_WEBHOOK_SECRET`;
- `APP_BASE_URL=https://aiboss.seledchik.ru`;
- `ADMIN_DASHBOARD_TOKEN`;
- `OPENAI_API_KEY`;
- `SUPABASE_URL`;
- `SUPABASE_SERVICE_ROLE_KEY`.

Important optional variables:

- `WEB_SESSION_SECRET` — separate signature secret for platform login;
- `OPENAI_REASONING_MODEL` — active reasoning model;
- `OPENAI_REASONING_EFFORT`;
- `OPENAI_TRANSCRIPTION_MODEL`;
- `MEMORY_BACKEND=supabase`;
- `SUPABASE_STATE_MODE=replicated` for local state with Supabase projection, or `primary` when Supabase is the only runtime source of truth;
- Google Drive integration variables.

Never pass secret values in command arguments, chat messages, Git or Docker image layers.

## Routine commands

Run from the project directory:

```bash
npm run vps:preflight
npm run vps:health
npm run vps:health:deep
npm run vps:backup
```

The shallow health check verifies:

- Docker health;
- local and public `/healthz`;
- public Telegram endpoint;
- Telegram webhook URL and current Telegram delivery error.

The deep check additionally performs one real site-navigator model call and a signed empty Telegram webhook probe. It should be used after deploys, not every five minutes.

## Deployment

Production deploy requires a clean Git worktree:

```bash
git status --short
npm run vps:deploy
```

`vps:deploy` performs the following sequence:

1. validates `.env`, Docker, Compose and the public URL;
2. runs the production regression suite;
3. creates a protected backup;
4. builds an immutable image `ai-boss:git-<revision>`;
5. starts a canary on `127.0.0.1:3001`;
6. checks canary health and makes a real site-navigator request;
7. replaces the production container;
8. waits for Docker health;
9. runs the public deep health check;
10. records current and previous images in `/srv/codex/runtime/ai-boss`.

On a failed production health check, the script restores the previous container or image automatically.

The Telegram webhook normally does not need to be registered again because its URL remains unchanged. To verify or restore it explicitly:

```bash
docker compose exec ai-boss npm run telegram:webhook
```

## Rollback

```bash
npm run vps:rollback
```

Rollback uses the recorded previous image, creates a backup before switching and verifies service health afterwards.

## Backups

`deploy/vps-backup.sh` stores protected backups in `/srv/codex/backups/ai-boss`:

- local `data/` archive;
- a mode-`600` copy of `.env`;
- manifest with Git revision, Docker image and SHA-256 checksums.

Retention is 30 days. The directory is mode `700`.

This backup does not replace Supabase provider backups. If Supabase becomes the only source of truth, database-level backup and restore must also be configured in Supabase.

## Scheduled operations

Systemd units are stored in `deploy/systemd`. Install them once as root:

```bash
sudo deploy/install-systemd.sh
```

Timers:

- `ai-boss-health.timer` — every five minutes;
- `ai-boss-backup.timer` — daily at approximately 03:30 UTC.

Inspect them with:

```bash
systemctl status ai-boss-health.timer ai-boss-backup.timer
journalctl -u ai-boss-health.service -n 100
journalctl -u ai-boss-backup.service -n 100
```

## Nginx and TLS

The active Nginx site must proxy all routes to `127.0.0.1:3000`. There must be no special proxy to `aibosbot.vercel.app`.

Before reload:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

TLS certificates are managed by Certbot under `/etc/letsencrypt/live/aiboss.seledchik.ru`.

## Post-deploy verification

Required checks:

```bash
curl -fsS https://aiboss.seledchik.ru/healthz
npm run vps:health:deep
docker ps --filter name=ai-boss
docker logs --since 10m ai-boss
```

Expected state:

- container `ai-boss` is `healthy`;
- webhook points to the VPS domain and IP `82.202.131.145`;
- pending Telegram updates do not grow;
- site navigator returns a live answer;
- recent logs contain no repeating errors.
