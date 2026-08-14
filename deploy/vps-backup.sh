#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_dir="$(cd "$script_dir/.." && pwd)"
backup_root="/srv/codex/backups/ai-boss"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
data_archive="$backup_root/data-$timestamp.tar.gz"
env_backup="$backup_root/env-$timestamp"
manifest="$backup_root/manifest-$timestamp.txt"

mkdir -p "$backup_root"
chmod 700 "$backup_root"

tar --create --gzip --file "$data_archive.partial" --directory "$project_dir" data
tar --list --gzip --file "$data_archive.partial" >/dev/null
chmod 600 "$data_archive.partial"
mv "$data_archive.partial" "$data_archive"

install -m 600 "$project_dir/.env" "$env_backup"

revision="$(git -C "$project_dir" rev-parse HEAD)"
image="$(docker inspect --format '{{.Config.Image}}' ai-boss 2>/dev/null || echo unavailable)"
{
  echo "created_at=$timestamp"
  echo "git_revision=$revision"
  echo "docker_image=$image"
  sha256sum "$data_archive" "$env_backup"
} > "$manifest"
chmod 600 "$manifest"

find "$backup_root" -maxdepth 1 -type f -mtime +30 -delete

echo "VPS backup: ok ($timestamp)"
