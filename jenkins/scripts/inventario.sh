#!/usr/bin/env bash
set -Eeuo pipefail
ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new \
  "${DEPLOY_USER}@${DEPLOY_HOST}" \
  BASE="${DEPLOY_PATH}" bash -s <<'REMOTE'
set -Eeuo pipefail
: "${BASE:?}"
echo "BASE=${BASE}"
[ -d "$BASE" ] || { echo "Base não existe: $BASE"; exit 1; }
find "$BASE" -type d -not -path "*/node_modules/*" -printf "%P\n" | sed '/^$/d' | sort
REMOTE