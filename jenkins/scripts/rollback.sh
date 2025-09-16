#!/usr/bin/env bash
# Shebang: executa este script com o interpretador bash encontrado no PATH do sistema.

# Objetivo: reverter o deploy para o release anterior já existente no servidor.
# Estratégia:
#   - No servidor remoto, ler $DEPLOY_PATH/.previous_release (caminho do release anterior)
#   - Validar se o diretório apontado existe e se há $DEPLOY_PATH/shared/.env
#   - Parar o processo atual que escuta a porta $PORT
#   - Carregar variáveis de ambiente do shared/.env
#   - Iniciar o release anterior (nohup npm start) e repontar o symlink 'current'
#   - Exibir tail dos logs para diagnóstico rápido

set -Eeuo pipefail
# -E: preserva traps do ERR em funções e subshells
# -e: termina o script no primeiro comando com status diferente de zero
# -u: trata uso de variáveis não definidas como erro
# -o pipefail: em pipelines, retorna o status do primeiro comando que falhar

# 1) Validação local mínima: evita abrir SSH sem parâmetros essenciais.
#    req: lista de variáveis obrigatórias; missing: acumula as ausentes/vazias.
req=(DEPLOY_HOST DEPLOY_USER DEPLOY_PATH PORT)
missing=()
for v in "${req[@]}"; do
  [ -n "${!v:-}" ] || missing+=("$v")   # usa expansão indireta ${!v}; se unset ou vazio, adiciona a missing
done
if [ "${#missing[@]}" -gt 0 ]; then
  printf '[rollback] Variáveis ausentes/vazias:\n'
  printf ' - %s\n' "${missing[@]}"
  exit 1
fi

# 2) Execução remota do rollback.
#    -o BatchMode=yes: desativa prompts interativos (falha se exigir senha)
#    -o StrictHostKeyChecking=accept-new: aceita automaticamente chaves de hosts novos
#    Passa variáveis BASE/PORT como ambiente para o shell remoto; 'bash -s' lê o script do heredoc.
ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new \
  "${DEPLOY_USER}@${DEPLOY_HOST}" \
  BASE="${DEPLOY_PATH}" PORT="${PORT}" \
  bash -s <<'REMOTE'
set -Eeuo pipefail

# Garante presença das variáveis críticas no ambiente remoto; aborta se ausentes.
: "${BASE:?}"; : "${PORT:?}"

PREV_FILE="$BASE/.previous_release"   # arquivo contendo o caminho absoluto do release anterior
CUR_LINK="$BASE/current"              # symlink que aponta para o release ativo
SHARED="$BASE/shared"                 # diretório compartilhado (contém .env usado no start)

echo "[rollback-remote] BASE=$BASE PORT=$PORT"

# Verificações de existência/consistência antes de agir.
[ -f "$PREV_FILE" ] || { echo "[rollback-remote] ERRO: arquivo $PREV_FILE não existe."; exit 2; }
PREV="$(cat "$PREV_FILE")"            # lê o caminho do release anterior
[ -d "$PREV" ]     || { echo "[rollback-remote] ERRO: diretório do release anterior inválido: $PREV"; exit 3; }
[ -f "$SHARED/.env" ] || { echo "[rollback-remote] ERRO: $SHARED/.env não encontrado."; exit 4; }

# Para o processo atual que está escutando na porta especificada.
# - fuser -k -TERM -n tcp PORT envia SIGTERM a quem usa a porta TCP informada.
# - tenta com sudo não interativo; se não houver sudo, tenta sem.
if command -v sudo >/dev/null 2>&1; then
  sudo -n fuser -k -TERM -n tcp "$PORT" || true
else
  fuser -k -TERM -n tcp "$PORT" || true
fi
sleep 1  # pequena espera para liberação completa da porta

# Entra no diretório do release anterior e inicia o processo com as variáveis do .env.
cd "$PREV"
set +x                         # evita logar variáveis sensíveis do .env
set -a; . "$SHARED/.env"; set +a   # exporta automaticamente variáveis carregadas do .env
nohup npm start > "$PREV/.start.out" 2> "$PREV/.start.err" < /dev/null &

# Atualiza o symlink 'current' para apontar ao release anterior reativado.
# -sfn: cria link simbólico, força substituição de destino existente, não segue links.
ln -sfn "$PREV" "$CUR_LINK"

# Exibe final dos logs para diagnóstico rápido pós-rollback (se existirem).
echo "[rollback-remote] Tail de erros (.start.err):"
tail -n 120 "$PREV/.start.err" 2>/dev/null || true
echo "[rollback-remote] Tail de stdout (.start.out):"
tail -n 80 "$PREV/.start.out" 2>/dev/null || true

echo "[rollback-remote] Rollback aplicado para: $PREV"
REMOTE

# Conclusão local: se chegou aqui, o comando remoto terminou com sucesso.
echo "[rollback] OK."
