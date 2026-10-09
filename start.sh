#!/usr/bin/env bash
# Pull latest code, install server deps, and restart only the application service.
# Run from the repo root on the server: bash start.sh   (or ./start.sh after chmod +x)
set -euo pipefail

cd "$(dirname "$0")"

echo "[start.sh] validate existing nginx config (managed separately)"
nginx -t

echo "[start.sh] git pull"
git pull --ff-only

echo "[start.sh] install server deps"
(cd server && npm install --omit=dev)

echo "[start.sh] sync systemd unit"
install -m 0644 deploy/meme-render.service /etc/systemd/system/meme-render.service
systemctl daemon-reload
systemctl enable meme-render >/dev/null

echo "[start.sh] restart application service"
systemctl restart meme-render

echo "[start.sh] wait for application readiness"
curl --fail --silent --show-error --retry 6 --retry-delay 1 \
  --retry-connrefused --retry-max-time 20 --max-time 5 \
  http://127.0.0.1:8787/healthz
printf '\n'

echo "[start.sh] done. status:"
systemctl --no-pager --lines=0 status meme-render | head -5 || true
