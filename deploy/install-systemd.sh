#!/usr/bin/env bash

set -euo pipefail

if [[ "$(id -u)" != "0" ]]; then
  echo "Run this script as root." >&2
  exit 1
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
unit_dir="$script_dir/systemd"

for unit in ai-boss-health.service ai-boss-health.timer ai-boss-backup.service ai-boss-backup.timer; do
  install -o root -g root -m 644 "$unit_dir/$unit" "/etc/systemd/system/$unit"
done

systemctl daemon-reload
systemctl enable --now ai-boss-health.timer ai-boss-backup.timer
systemctl start ai-boss-health.service ai-boss-backup.service

echo "AI-BOSS systemd timers installed."
