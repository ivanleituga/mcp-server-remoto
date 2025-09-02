// Valida todas as variáveis obrigatórias. Falha se qualquer uma estiver ausente/vazia.
sh label: 'Preflight', script: '''
bash <<'BASH'
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
    missing+=("$v")                        # não definida
  elif [ -z "${!v}" ]; then
    missing+=("$v")                        # definida porém vazia
  fi
done <<< "$required"

if [ ${#missing[@]} -gt 0 ]; then
  printf 'Variáveis ausentes/vazias:\\n'
  printf ' - %s\\n' "${missing[@]}"
  exit 1
fi
BASH
'''
