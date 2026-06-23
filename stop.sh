#!/usr/bin/env bash
set -euo pipefail
echo "[stop.sh] stopping meme-render"
systemctl stop meme-render || true
echo "[stop.sh] done"
