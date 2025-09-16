#!/usr/bin/env bash
# Shebang: executa este script com o interpretador bash encontrado no PATH do sistema.

# Inventário do deploy no servidor remoto
# Escopo:
#   - Validar variáveis mínimas locais (DEPLOY_USER, DEPLOY_HOST, DEPLOY_PATH)
#   - Conectar via SSH e, no servidor:
#       * Confirmar existência de $BASE
#       * Exibir caminho de BASE e, se houver, o alvo do symlink current
#       * Listar releases (mais recentes primeiro)
#       * Exibir metadados do release atual (release_info.json), se existir
#       * Listar estrutura (poucos níveis) ignorando node_modules/.git/.svn
#       * Mostrar uso de disco de $BASE
# Observação: não lê logs nem processos; isso fica para o stage Snapshot.

set -Eeuo pipefail
# -E: preserva traps de ERR em funções/subshells
# -e: aborta no primeiro comando que retornar status != 0
# -u: erro ao usar variável não definida
# -o pipefail: em pipelines, falha se qualquer comando falhar

# 1) Validação mínima local: impede abrir SSH sem parâmetros essenciais
req=(DEPLOY_USER DEPLOY_HOST DEPLOY_PATH)   # variáveis obrigatórias no lado local
missing=()                                   # acumula nomes ausentes/vazios
for v in "${req[@]}"; do
  [ -n "${!v:-}" ] || missing+=("$v")       # ${!v} = indireção; lê valor da var cujo nome está em $v
done
if [ "${#missing[@]}" -gt 0 ]; then
  printf '[inventario] Variáveis ausentes/vazias:\n'
  printf ' - %s\n' "${missing[@]}"
  exit 1
fi

# 2) Execução remota: coleta de inventário
# -o BatchMode=yes                : sem prompts interativos (falha se exigir senha)
# -o StrictHostKeyChecking=accept-new : aceita chaves de hosts novos automaticamente
# Passa BASE como variável de ambiente para o shell remoto.
ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new \
  "${DEPLOY_USER}@${DEPLOY_HOST}" \
  BASE="${DEPLOY_PATH}" bash -s <<'REMOTE'
set -Eeuo pipefail

# Garante que BASE está definida no ambiente remoto (falha com mensagem se vazia/ausente)
: "${BASE:?}"

echo "=== INVENTÁRIO ==="
echo "BASE=$BASE"

# Confirma diretório base; aborta com erro se não existir
if [ ! -d "$BASE" ]; then
  echo "ERRO: Base não existe: $BASE"
  exit 2
fi

# Mostra o symlink 'current', se existir, e resolve seu destino real
if [ -L "$BASE/current" ]; then
  CURRENT_TARGET="$(readlink -f "$BASE/current" 2>/dev/null || true)"
  echo "CURRENT=$CURRENT_TARGET"
else
  echo "CURRENT=(ausente)"
fi

# Lista releases ordenados por data (mais novos primeiro), se houver
echo "--- RELEASES ---"
if [ -d "$BASE/releases" ]; then
  ls -1dt "$BASE/releases"/* 2>/dev/null || true   # -t ordena por data; -d não entra nos diretórios
else
  echo "(diretório releases ausente)"
fi

# Metadados do release atual: exibe release_info.json, se existir
if [ -L "$BASE/current" ] && [ -f "$BASE/current/release_info.json" ]; then
  echo "--- release_info.json (current) ---"
  cat "$BASE/current/release_info.json" || true
fi

# Estrutura do BASE (até 2 níveis), ignorando node_modules/.git/.svn
# -maxdepth 2: limita a profundidade
# -mindepth 1: não imprime o próprio BASE
# -printf "%P\n": imprime caminho relativo a BASE (GNU find)
echo "--- ESTRUTURA (até 2 níveis, sem node_modules/.git/.svn) ---"
find "$BASE" -maxdepth 2 -mindepth 1 -type d \
  -not -path "*/node_modules/*" \
  -not -path "*/.git/*" \
  -not -path "*/.svn/*" \
  -printf "%P\n" | sed '/^$/d' | sort || true

# Uso de disco do BASE (tamanho agregado)
echo "--- USO DE DISCO ---"
du -sh "$BASE" 2>/dev/null || true

echo "=== FIM DO INVENTÁRIO ==="
REMOTE