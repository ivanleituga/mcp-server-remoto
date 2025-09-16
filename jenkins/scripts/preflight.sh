#!/usr/bin/env bash
# Shebang: executa este script com o interpretador bash encontrado no PATH do sistema.

set -Eeuo pipefail
# -E: preserva traps de ERR em funções/subshells.
# -e: encerra o script se qualquer comando retornar status != 0.
# -u: erro ao referenciar variáveis não definidas.
# -o pipefail: o status do pipeline é o do primeiro comando que falhar.

# Lista de variáveis OBRIGATÓRIAS, uma por linha.
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

# Array que acumulará os nomes das variáveis ausentes ou vazias.
missing=()

# Percorre cada linha da lista 'required'.
while IFS= read -r v; do
  # Pula linhas vazias (robustez contra espaços extras).
  [ -z "$v" ] && continue

  # Teste 1: a variável NÃO está definida (unset)?
  #   ${!v+x} expande para vazio se a variável $v não existe; caso exista, expande para algo (ex.: 'x').
  if [ -z "${!v+x}" ]; then
    missing+=("$v")
  # Teste 2: a variável está definida, porém VAZIA?
  #   ${!v} faz "indireção": pega o valor da variável cujo nome está em $v.
  elif [ -z "${!v}" ]; then
    missing+=("$v")
  fi
# Redireciona o conteúdo da string 'required' como entrada do while (here-string).
done <<< "$required"

# Se encontrou qualquer variável faltante/vazia, lista e finaliza com erro.
if [ ${#missing[@]} -gt 0 ]; then
  printf 'Variáveis ausentes/vazias:\n'
  printf ' - %s\n' "${missing[@]}"
  exit 1
fi