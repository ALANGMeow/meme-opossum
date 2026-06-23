#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
bash ./stop.sh
bash ./start.sh
