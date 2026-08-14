#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_dir="$(cd "$script_dir/.." && pwd)"
runtime_dir="/srv/codex/runtime/ai-boss"
compose=(docker compose -f "$project_dir/docker-compose.yml" --project-directory "$project_dir")
canary_name="ai-boss-deploy-canary"

wait_for_health() {
  local container_name="$1"
  local expected="$2"
  for _ in $(seq 1 75); do
    local state
    state="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_name" 2>/dev/null || true)"
    if [[ "$state" == "$expected" ]]; then
      return 0
    fi
    if [[ "$state" == "unhealthy" || "$state" == "exited" ]]; then
      return 1
    fi
    sleep 1
  done
  return 1
}

cleanup_canary() {
  if docker container inspect "$canary_name" >/dev/null 2>&1; then
    docker stop "$canary_name" >/dev/null 2>&1 || true
    docker rm "$canary_name" >/dev/null 2>&1 || true
  fi
}

trap cleanup_canary EXIT

"$script_dir/vps-preflight.sh"

if [[ -n "$(git -C "$project_dir" status --porcelain)" ]]; then
  echo "Deploy refused: Git worktree is not clean." >&2
  exit 1
fi

cd "$project_dir"
npm run production:check
"$script_dir/vps-backup.sh"

revision="$(git rev-parse --short=12 HEAD)"
full_revision="$(git rev-parse HEAD)"
image="ai-boss:git-$revision"
created_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

docker build \
  --label "org.opencontainers.image.revision=$full_revision" \
  --label "org.opencontainers.image.created=$created_at" \
  --tag "$image" \
  "$project_dir"

if docker container inspect "$canary_name" >/dev/null 2>&1; then
  cleanup_canary
fi

docker run -d --name "$canary_name" \
  --env-file "$project_dir/.env" \
  -e NODE_ENV=production -e PORT=3001 -e DATA_ROOT=/app/data \
  --health-cmd='node -e "fetch(\"http://127.0.0.1:3001/healthz\").then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"' \
  --health-interval=5s --health-timeout=5s --health-retries=3 --health-start-period=5s \
  -p 127.0.0.1:3001:3001 \
  -v "$project_dir/data:/app/data:ro" \
  "$image" >/dev/null

if ! wait_for_health "$canary_name" healthy; then
  docker logs --tail 100 "$canary_name" >&2 || true
  echo "Deploy refused: canary is unhealthy." >&2
  exit 1
fi

curl --fail --silent --show-error --max-time 90 \
  -X POST http://127.0.0.1:3001/api/site-navigator \
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

cleanup_canary

previous_image="$(docker inspect --format '{{.Config.Image}}' ai-boss 2>/dev/null || true)"
[[ -n "$previous_image" ]] || { echo "Deploy refused: current ai-boss image was not found." >&2; exit 1; }

legacy_name=""
compose_project="$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' ai-boss 2>/dev/null || true)"
if [[ -z "$compose_project" ]]; then
  legacy_name="ai-boss-pre-compose-$revision"
  if docker container inspect "$legacy_name" >/dev/null 2>&1; then
    echo "Deploy refused: rollback container $legacy_name already exists." >&2
    exit 1
  fi
  docker stop ai-boss >/dev/null
  docker rename ai-boss "$legacy_name"
fi

if ! AI_BOSS_IMAGE="$image" "${compose[@]}" up -d --no-build --force-recreate; then
  if [[ -n "$legacy_name" ]]; then
    docker rename "$legacy_name" ai-boss
    docker start ai-boss >/dev/null
  fi
  echo "Deploy failed while starting the production container." >&2
  exit 1
fi

if ! wait_for_health ai-boss healthy; then
  docker logs --tail 100 ai-boss >&2 || true
  if [[ -n "$legacy_name" ]]; then
    docker stop ai-boss >/dev/null 2>&1 || true
    docker rm ai-boss >/dev/null 2>&1 || true
    docker rename "$legacy_name" ai-boss
    docker start ai-boss >/dev/null
  else
    AI_BOSS_IMAGE="$previous_image" "${compose[@]}" up -d --no-build --force-recreate
  fi
  echo "Deploy failed health verification; previous container restored." >&2
  exit 1
fi

"$script_dir/vps-healthcheck.sh" --deep

mkdir -p "$runtime_dir"
chmod 700 "$runtime_dir"
printf '%s\n' "$previous_image" > "$runtime_dir/previous-image"
printf '%s\n' "$image" > "$runtime_dir/current-image"
printf '%s\n' "$full_revision" > "$runtime_dir/current-revision"
chmod 600 "$runtime_dir/previous-image" "$runtime_dir/current-image" "$runtime_dir/current-revision"

echo "VPS deploy: ok ($image)"
