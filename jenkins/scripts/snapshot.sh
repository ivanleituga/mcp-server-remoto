#!/usr/bin/env bash
set -Eeuo pipefail
ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new \
  "${DEPLOY_USER}@${DEPLOY_HOST}" \
  BASE="${DEPLOY_PATH}" PORT="${PORT}" \
  bash -s <<'REMOTE'
set -Eeuo pipefail
echo "BASE=$BASE"
[ -f "$BASE/.start.err" ] && { tail -n 80 "$BASE/.start.err" || true; echo; }
[ -f "$BASE/.start.out" ] && { tail -n 40 "$BASE/.start.out" || true; echo; }
ps -ef | grep '[n]ode' || true
REMOTE