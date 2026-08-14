#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_dir="$(cd "$script_dir/.." && pwd)"
runtime_dir="/srv/codex/runtime/ai-boss"
previous_file="$runtime_dir/previous-image"
current_file="$runtime_dir/current-image"
compose=(docker compose -f "$project_dir/docker-compose.yml" --project-directory "$project_dir")

[[ -f "$previous_file" ]] || { echo "Rollback image is not recorded." >&2; exit 1; }
previous_image="$(tr -d '\r\n' < "$previous_file")"
[[ "$previous_image" =~ ^ai-boss:(git-[0-9a-f]{7,40}|vps-[0-9a-f]{7,40}|local)$ ]] || {
  echo "Rollback image has an unexpected name." >&2
  exit 1
}
docker image inspect "$previous_image" >/dev/null

current_image="$(docker inspect --format '{{.Config.Image}}' ai-boss)"
"$script_dir/vps-backup.sh"
AI_BOSS_IMAGE="$previous_image" "${compose[@]}" up -d --no-build --force-recreate

for _ in $(seq 1 75); do
  state="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' ai-boss 2>/dev/null || true)"
  [[ "$state" == "healthy" ]] && break
  [[ "$state" == "unhealthy" || "$state" == "exited" ]] && { echo "Rollback container is $state" >&2; exit 1; }
  sleep 1
done

"$script_dir/vps-healthcheck.sh"
printf '%s\n' "$current_image" > "$previous_file"
printf '%s\n' "$previous_image" > "$current_file"
chmod 600 "$previous_file" "$current_file"

echo "VPS rollback: ok ($previous_image)"
