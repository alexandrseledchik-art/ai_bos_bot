# Перенос AI-BOSS на VPS

Проект подготовлен к запуску на VPS как обычный Node.js-сервис в Docker. Текущий Vercel-режим при этом не ломается: Vercel может продолжать работать, пока мы не переключим домен и Telegram webhook.

## Что уже готово

- `src/self-hosted-server.js` — Node-сервер для VPS.
- `Dockerfile` — сборка production-контейнера.
- `docker-compose.yml` — запуск сервиса на порту `3000`.
- `/healthz` — health-check.
- API-роуты `/api/telegram`, `/api/companies/*`, `/api/mini-app/*`, `/api/platform/*`, `/api/admin/*` работают через те же handlers, что и на Vercel.
- Страницы `/app`, `/mini-app`, `/companies`, `/admin`, `/book` раздаются как SPA.

## Что нужно для фактического переноса

1. VPS с доступом по SSH.
2. Домен или поддомен, например `app.aiboss.ru`.
3. `.env` с production-переменными.
4. Решение, где храним состояние:
   - Supabase — предпочтительно, если хотим не зависеть от файлов на сервере.
   - `DATA_ROOT=/app/data` — подходит для простого режима, но нужно делать backup.

## Минимальные переменные окружения

Обязательные:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `APP_BASE_URL=https://<домен>`
- `WEB_SESSION_SECRET`
- `ADMIN_DASHBOARD_TOKEN`

Если используем Supabase:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_STATE_MODE`
- `MEMORY_BACKEND`

Если используем OpenAI:

- `OPENAI_API_KEY`
- `OPENAI_MODEL`

Если нужна Google Drive-интеграция:

- `GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_DRIVE_PRIVATE_KEY`
- `GOOGLE_DRIVE_FOLDER_ID`

## Запуск на VPS

```bash
git clone <repo-url> ai-boss
cd ai-boss
cp .env.example .env
# заполнить .env production-значениями
docker compose up -d --build
curl http://127.0.0.1:3000/healthz
```

Ожидаемый ответ:

```json
{"ok":true,"service":"ai-boss","mode":"self-hosted"}
```

## Nginx перед сервисом

Пример:

```nginx
server {
  server_name app.aiboss.ru;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

После этого включить HTTPS через `certbot`.

## Переключение Telegram

После того как домен открылся по HTTPS:

```bash
docker compose exec ai-boss npm run telegram:webhook
docker compose exec ai-boss npm run telegram:miniapp
```

Важно: `APP_BASE_URL` должен быть уже равен VPS-домену.

## Rollback

Если нужно быстро вернуться на Vercel:

1. Вернуть `APP_BASE_URL=https://aibosbot.vercel.app`.
2. Снова зарегистрировать webhook на Vercel.
3. Проверить `/api/telegram`.

## Что остаётся сделать вручную

- Дать SSH-доступ к VPS.
- Выбрать домен или поддомен.
- Перенести production `.env`.
- Настроить Nginx и HTTPS.
- Перерегистрировать Telegram webhook.
