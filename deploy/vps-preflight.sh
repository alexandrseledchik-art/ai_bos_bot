#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_dir="$(cd "$script_dir/.." && pwd)"
env_file="$project_dir/.env"

fail() {
  echo "Preflight failed: $*" >&2
  exit 1
}

for command_name in docker curl git stat grep; do
  command -v "$command_name" >/dev/null 2>&1 || fail "missing command: $command_name"
done

docker compose version >/dev/null 2>&1 || fail "Docker Compose plugin is unavailable"
docker info >/dev/null 2>&1 || fail "Docker daemon is unavailable"

[[ -f "$env_file" ]] || fail "missing $env_file"

env_mode="$(stat -c '%a' "$env_file")"
[[ "$env_mode" == "600" || "$env_mode" == "400" ]] || fail ".env permissions must be 600 or 400, got $env_mode"

required_keys=(
  TELEGRAM_BOT_TOKEN
  TELEGRAM_WEBHOOK_SECRET
  APP_BASE_URL
  ADMIN_DASHBOARD_TOKEN
  OPENAI_API_KEY
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
)

for key in "${required_keys[@]}"; do
  count="$(grep -c "^${key}=..*" "$env_file" || true)"
  [[ "$count" == "1" ]] || fail "$key must be configured exactly once"
done

app_base_url="$(grep '^APP_BASE_URL=' "$env_file" | cut -d= -f2-)"
[[ "$app_base_url" == "https://aiboss.seledchik.ru" ]] || fail "APP_BASE_URL must be https://aiboss.seledchik.ru"

if git -C "$project_dir" ls-files --error-unmatch .env >/dev/null 2>&1; then
  fail ".env must not be tracked by Git"
fi

AI_BOSS_IMAGE=ai-boss:preflight docker compose -f "$project_dir/docker-compose.yml" --project-directory "$project_dir" config --quiet

echo "VPS preflight: ok"
