#!/usr/bin/env bash
# Shebang: executa este script com o interpretador bash encontrado no PATH do sistema.

# Snapshot de Logs no servidor remoto
# O que faz:
#   1) Resolve o release atual via symlink $DEPLOY_PATH/current (se existir).
#   2) Exibe trechos dos arquivos de log (.start.out/.start.err) do release atual.
#   3) Mostra processos Node em execução e quem está escutando na porta $PORT.
#   4) Não falha o pipeline se algum artefato de log não existir; é diagnóstico, não disruptivo.
#
# Variáveis necessárias (locais, no agente Jenkins):
#   DEPLOY_USER  -> usuário SSH para acessar o host remoto
#   DEPLOY_HOST  -> hostname/IP do servidor remoto
#   DEPLOY_PATH  -> diretório base do deploy no servidor remoto (ex.: /projetos/MCP)
#   PORT         -> porta onde a aplicação deve estar escutando (para inspeção)
#
# Observação:
#   - Modelo de releases versionados: logs ficam em $current/.start.*
#   - Compatibilidade com deploy antigo (sem releases): logs podem estar em $BASE/.start.*

set -Eeuo pipefail
# -E: mantém traps de ERR ativas em funções/subshells
# -e: aborta o script se qualquer comando retornar status != 0
# -u: uso de variável não definida é erro
# -o pipefail: pipeline retorna o status do primeiro comando que falhar

# 1) Validação mínima local: garante que temos os parâmetros essenciais antes de abrir SSH
req=(DEPLOY_USER DEPLOY_HOST DEPLOY_PATH PORT)  # lista de variáveis obrigatórias
missing=()                                      # acumula as faltantes
for v in "${req[@]}"; do
  [ -n "${!v:-}" ] || missing+=("$v")          # ${!v} = valor da variável cujo nome está em $v; se vazia/ausente, adiciona em missing
done
if [ "${#missing[@]}" -gt 0 ]; then
  printf '[snapshot] Variáveis ausentes/vazias:\n'
  printf ' - %s\n' "${missing[@]}"
  exit 1                                       # falha cedo para evitar comando SSH inválido
fi

# 2) Execução remota: coleta de logs e estado do processo/porta
ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new \
  "${DEPLOY_USER}@${DEPLOY_HOST}" \
  BASE="${DEPLOY_PATH}" PORT="${PORT}" bash -s <<'REMOTE'
# ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
# -o BatchMode=yes               : desabilita interação (ex.: prompt de senha); se precisar de senha, falha
# -o StrictHostKeyChecking=accept-new : aceita automaticamente chaves de hosts ainda não conhecidos (não interativo)
# "${DEPLOY_USER}@${DEPLOY_HOST}" : destino SSH
# BASE=..., PORT=...             : exporta variáveis de ambiente para a sessão remota
# bash -s                        : executa bash remoto lendo o script do heredoc abaixo

set -Eeuo pipefail
: "${BASE:?}"; : "${PORT:?}"     # garante que BASE e PORT chegaram definidos à máquina remota (erro se vazios)

echo "=== SNAPSHOT DE LOGS ==="
date -u +"%Y-%m-%dT%H:%M:%SZ UTC"  # timestamp UTC do snapshot (útil para correlação)
echo "BASE=$BASE"
echo "PORT=$PORT"

# Resolve release atual (se symlink existir). current -> releases/<id>
CURRENT=""
if [ -L "$BASE/current" ]; then
  CURRENT="$(readlink -f "$BASE/current" 2>/dev/null || true)"  # resolve alvo do symlink; suprime erro
  [ -n "$CURRENT" ] && echo "CURRENT=$CURRENT" || echo "CURRENT=(não resolvido)"
else
  echo "CURRENT=(ausente)"
fi

# Determina caminhos dos logs (preferência: logs do release atual; fallback: logs na raiz BASE)
LOG_ERR=""
LOG_OUT=""
if [ -n "$CURRENT" ]; then
  [ -f "$CURRENT/.start.err" ] && LOG_ERR="$CURRENT/.start.err"
  [ -f "$CURRENT/.start.out" ] && LOG_OUT="$CURRENT/.start.out"
fi
# Fallback para layout antigo (sem releases)
[ -z "$LOG_ERR" ] && [ -f "$BASE/.start.err" ] && LOG_ERR="$BASE/.start.err"
[ -z "$LOG_OUT" ] && [ -f "$BASE/.start.out" ] && LOG_OUT="$BASE/.start.out"

# Exibe trechos de logs, se existirem; se não, informa que não foi encontrado
echo "--- .start.err (tail 120) ---"
[ -n "$LOG_ERR" ] && tail -n 120 "$LOG_ERR" || echo "(arquivo não encontrado)"
echo "--- .start.out (tail 80) ---"
[ -n "$LOG_OUT" ] && tail -n 80 "$LOG_OUT" || echo "(arquivo não encontrado)"

# Lista processos node em execução (heurística simples via ps/grep)
echo "--- processos node ---"
ps -ef | grep '[n]ode' || echo "(nenhum processo node encontrado)"
# O padrão '[n]ode' evita capturar a própria linha do grep nos resultados

# Quem está escutando na porta informada:
#   - tenta 'ss' (moderno e comum em distros recentes)
#   - fallback para 'lsof' (se instalado)
if command -v ss >/dev/null 2>&1; then
  echo "--- ss -ltnp :${PORT} ---"
  # Mostra cabeçalho (NR==1) e linhas que contenham ":PORT"
  ss -ltnp | awk -v p=":${PORT}" 'NR==1 || index($0,p){print}'
elif command -v lsof >/dev/null 2>&1; then
  echo "--- lsof -nP -iTCP:${PORT} -sTCP:LISTEN ---"
  lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN || true
else
  echo "(nem ss nem lsof disponíveis para inspecionar a porta)"
fi

echo "=== FIM DO SNAPSHOT ==="
REMOTE
# ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
# Fim do script remoto executado via SSH/heredoc