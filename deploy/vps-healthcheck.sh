#!/usr/bin/env bash

set -euo pipefail

deep=false
if [[ "${1:-}" == "--deep" ]]; then
  deep=true
elif [[ -n "${1:-}" ]]; then
  echo "Usage: $0 [--deep]" >&2
  exit 2
fi

container_name="ai-boss"
public_base_url="https://aiboss.seledchik.ru"

container_status="$(docker inspect --format '{{.State.Status}}' "$container_name" 2>/dev/null || true)"
container_health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_name" 2>/dev/null || true)"

[[ "$container_status" == "running" ]] || { echo "AI-BOSS container is not running" >&2; exit 1; }
[[ "$container_health" == "healthy" ]] || { echo "AI-BOSS container health is $container_health" >&2; exit 1; }

curl --fail --silent --show-error --max-time 10 http://127.0.0.1:3000/healthz >/dev/null
curl --fail --silent --show-error --max-time 15 "$public_base_url/healthz" >/dev/null
curl --fail --silent --show-error --max-time 15 "$public_base_url/api/telegram" >/dev/null

docker exec "$container_name" node -e '
  fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getWebhookInfo`)
    .then((response) => response.json())
    .then((payload) => {
      if (!payload.ok) throw new Error(payload.description || "getWebhookInfo failed");
      const info = payload.result || {};
      if (info.url !== "https://aiboss.seledchik.ru/api/telegram") {
        throw new Error(`unexpected webhook: ${info.url || "not set"}`);
      }
      if (info.last_error_message) throw new Error(info.last_error_message);
    })
    .catch((error) => {
      console.error(`Telegram webhook check failed: ${error.message}`);
      process.exit(1);
    });
'

if [[ "$deep" == true ]]; then
  curl --fail --silent --show-error --max-time 90 \
    -X POST "$public_base_url/api/site-navigator" \
    -H 'Origin: https://seledchik.ru' \
    -H 'Content-Type: application/json' \
    --data '{"question":"Что такое AI-BOSS? Ответь одним предложением.","history":[],"page":{"path":"/"}}' \
    | node -e '
      let body = "";
      process.stdin.on("data", (chunk) => { body += chunk; });
      process.stdin.on("end", () => {
        const payload = JSON.parse(body);
        if (!payload.ok || !payload.answer) process.exit(1);
      });
    '

  docker exec "$container_name" node -e '
    fetch("https://aiboss.seledchik.ru/api/telegram", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-telegram-bot-api-secret-token": process.env.TELEGRAM_WEBHOOK_SECRET
      },
      body: JSON.stringify({ update_id: 999999999 })
    })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || !payload.ok || !payload.ignored) process.exit(1);
      })
      .catch(() => process.exit(1));
  '
fi

if [[ "$deep" == true ]]; then
  echo "VPS healthcheck: ok (deep)"
else
  echo "VPS healthcheck: ok"
fi
