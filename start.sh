#!/usr/bin/env bash
# Pull latest code from GitHub, install server deps, (re)start systemd service, reload nginx.
# Run from the repo root on the server: bash start.sh   (or ./start.sh after chmod +x)
set -euo pipefail

cd "$(dirname "$0")"

echo "[start.sh] git pull"
git pull --ff-only

echo "[start.sh] install server deps"
(cd server && npm install --omit=dev)

echo "[start.sh] sync systemd unit"
install -m 0644 deploy/meme-render.service /etc/systemd/system/meme-render.service
systemctl daemon-reload
systemctl enable meme-render >/dev/null

echo "[start.sh] sync nginx site"
install -m 0644 deploy/nginx-meme.conf /etc/nginx/conf.d/meme.conf
# Disable Ubuntu's default site if it exists, so our default_server wins.
if [ -e /etc/nginx/sites-enabled/default ]; then
  rm -f /etc/nginx/sites-enabled/default
fi
nginx -t

echo "[start.sh] restart services"
systemctl restart meme-render
systemctl reload nginx || systemctl restart nginx

echo "[start.sh] done. status:"
systemctl --no-pager --lines=0 status meme-render | head -5 || true
