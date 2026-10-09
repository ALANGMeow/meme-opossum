#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
# Prepare the deployment while the current service is still running.
exec bash ./start.sh
