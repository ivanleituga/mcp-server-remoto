#!/usr/bin/env bash
set -Eeuo pipefail
required="AGENT_LABEL
DEPLOY_HOST
DEPLOY_USER
DEPLOY_PATH
NODE_ENV
PORT
RENDER_EXTERNAL_URL
DB_HOST
DB_PORT
DB_NAME
DB_CRED_ID
CI
NODEJS_TOOL_NAME
SSH_CRED"
missing=()
while IFS= read -r v; do
  [ -z "$v" ] && continue
  if [ -z "${!v+x}" ]; then
    missing+=("$v")
  elif [ -z "${!v}" ]; then
    missing+=("$v")
  fi
done <<< "$required"
if [ ${#missing[@]} -gt 0 ]; then
  printf 'Variáveis ausentes/vazias:\n'
  printf ' - %s\n' "${missing[@]}"
  exit 1
fi