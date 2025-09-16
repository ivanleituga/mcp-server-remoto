#!/usr/bin/env bash
# Shebang: executa este script com o interpretador bash encontrado no PATH do sistema.

# Publica um release versionado em um host remoto a partir do artifact gerado no stage "Package".
# Fluxo:
#   1) Gera .env.deploy local com variáveis necessárias à execução remota
#   2) Envia artifact.tgz + .env.deploy para /tmp do host remoto (via scp)
#   3) No host: cria releases/<timestamp>, descompacta, instala deps, mata processo antigo na $PORT e inicia novo
#   4) Atualiza symlink $DEPLOY_PATH/current -> releases/<timestamp>
#   5) Aplica retenção (mantém só os N releases mais recentes)

set -Eeuo pipefail
# -E: mantém traps de ERR em funções/subshells
# -e: aborta no primeiro comando com status != 0
# -u: erro ao usar variável não definida
# -o pipefail: pipeline falha se qualquer etapa falhar

# 1) Sanidade local: exige o pacote produzido no stage "Package"
[ -f artifact.tgz ] || { echo "[deploy] ERRO: artifact.tgz não encontrado."; exit 2; }

# 2) Monta arquivo de ambiente (.env.deploy) que será instalado no servidor (shared/.env)
#    Obs.: chmod 600 restringe a leitura/escrita ao usuário (evita exposição de segredos)
env_local=".env.deploy"
cat > "$env_local" <<EOF
NODE_ENV=${NODE_ENV}
PORT=${PORT}
RENDER_EXTERNAL_URL=${RENDER_EXTERNAL_URL}
DB_HOST=${DB_HOST}
DB_PORT=${DB_PORT}
DB_NAME=${DB_NAME}
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASSWORD}
EOF
chmod 600 "$env_local"

# 3) Define ID do release (timestamp legível) e quantidade de releases a manter (retenção)
release_id="$(date +%Y%m%d-%H%M%S)"   # ex.: 20250904-142355
retain_n="${RELEASE_KEEP:-5}"         # padrão: manter 5 releases

# Envia artefatos para a /tmp do host remoto
# - BatchMode=yes: falha se precisar de senha (ci sem interação)
# - StrictHostKeyChecking=accept-new: aceita automaticamente novos hosts (evita prompt)
# - -p: preserva timestamps/modos básicos
echo "[deploy] Enviando artifacts para ${DEPLOY_USER}@${DEPLOY_HOST}…"
scp -o BatchMode=yes -o StrictHostKeyChecking=accept-new -p artifact.tgz "$env_local" "${DEPLOY_USER}@${DEPLOY_HOST}:/tmp/"

# 4) Execução remota principal (entre EOFs):
#    - Cria layout $BASE/{releases,shared}
#    - Move .env seguro para $BASE/shared/.env
#    - Descompacta artifact em $BASE/releases/$REL
#    - Instala dependências (produção)
#    - Para processo antigo (porta $PORT) e inicia novo com nohup
#    - Atualiza symlink $BASE/current
#    - Aplica retenção
ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new \
  "${DEPLOY_USER}@${DEPLOY_HOST}" \
  BASE="${DEPLOY_PATH}" REL="${release_id}" PORT="${PORT}" KEEP="${retain_n}" ENVF="/tmp/.env.deploy" ART="/tmp/artifact.tgz" \
  bash -s <<'REMOTE'
set -Eeuo pipefail

# Exige presença de todas as variáveis críticas; aborta se qualquer uma faltar
: "${BASE:?}"; : "${REL:?}"; : "${PORT:?}"; : "${KEEP:?}"; : "${ENVF:?}"; : "${ART:?}"

RELEASES="$BASE/releases"     # releases versionados: $BASE/releases/<timestamp>
SHARED="$BASE/shared"         # diretório para arquivos compartilhados (.env, uploads, etc.)
CUR_LINK="$BASE/current"      # symlink apontando para o release ativo

echo "[deploy-remote] Base: $BASE | Release: $REL | Porta: $PORT | Retenção: $KEEP"
mkdir -p "$RELEASES" "$SHARED"

# Guarda caminho do release atual (se houver) para possível rollback
if [ -L "$CUR_LINK" ]; then
  readlink -f "$CUR_LINK" > "$BASE/.previous_release" || true
fi

# Instala o .env como arquivo seguro em shared/ e remove o temporário em /tmp
install -m 600 "$ENVF" "$SHARED/.env"
rm -f "$ENVF"

# Prepara diretório do novo release e descompacta o artifact nele
TARGET="$RELEASES/$REL"
mkdir -p "$TARGET"
tar -xzf "$ART" -C "$TARGET"
rm -f "$ART"

# Garante que node/npm existem no host (pré-requisito para rodar a app)
command -v node >/dev/null 2>&1 || { echo "[deploy-remote] ERRO: 'node' não encontrado no host."; exit 3; }
command -v npm  >/dev/null 2>&1 || { echo "[deploy-remote] ERRO: 'npm' não encontrado no host."; exit 3; }

# Instala dependências apenas de produção (omit=dev) com lockfile se houver (npm ci), senão npm install
if [ -f "$TARGET/package-lock.json" ] || [ -f "$TARGET/npm-shrinkwrap.json" ]; then
  (cd "$TARGET" && npm ci --omit=dev)
else
  (cd "$TARGET" && npm install --omit=dev)
fi

# Encerra processo escutando a porta alvo, se existir:
# - usa fuser para enviar SIGTERM (-TERM) ao processo na porta tcp:$PORT
# - tenta com sudo não interativo se disponível; senão tenta sem sudo
if command -v sudo >/dev/null 2>&1; then
  sudo -n fuser -k -TERM -n tcp "$PORT" || true
else
  fuser -k -TERM -n tcp "$PORT" || true
fi
sleep 1  # pequena espera para liberação da porta

# Inicia o novo processo:
# - carrega variáveis do shared/.env (set -a exporta automaticamente as variáveis "sourced")
# - nohup para manter o processo após o término da sessão ssh
# - redireciona stdout/stderr para arquivos em $TARGET
cd "$TARGET"
set +x                                # evita logar segredos ao 'source' do .env
set -a; . "$SHARED/.env"; set +a      # exporta variáveis do .env para o processo filho
nohup npm start > "$TARGET/.start.out" 2> "$TARGET/.start.err" < /dev/null &

# Atualiza o symlink 'current' para apontar para o release recém-promovido
ln -sfn "$TARGET" "$CUR_LINK"

# Retenção: mantém apenas os N diretórios de releases mais recentes; remove os demais
# - ls -1dt: ordena por data (mais recente primeiro)
# - tail -n +$((KEEP+1)): a partir do (KEEP+1)-ésimo, remove
ls -1dt "$RELEASES"/* 2>/dev/null | tail -n +"$((KEEP+1))" | xargs -r rm -rf || true

echo "[deploy-remote] Release promovido: $TARGET"
REMOTE

# 5) Higiene local: tentativa de mascarar senha em qualquer saída acidental envolvendo o .env.deploy
#    (Lê o arquivo e descarta a saída; não altera o arquivo em disco)
sed -E 's/^(DB_PASSWORD)=.*/\1=********/' "$env_local" >/dev/null 2>&1 || true

echo "[deploy] Concluído: release ${release_id} publicado em ${DEPLOY_HOST}:${DEPLOY_PATH}"
#!/usr/bin/env bash
# Publica um release versionado em um host remoto a partir do artifact gerado no stage "Package".
# Fluxo:
#   1) Gera .env.deploy local com variáveis necessárias à execução remota
#   2) Envia artifact.tgz + .env.deploy para /tmp do host remoto (via scp)
#   3) No host: cria releases/<timestamp>, descompacta, instala deps, mata processo antigo na $PORT e inicia novo
#   4) Atualiza symlink $DEPLOY_PATH/current -> releases/<timestamp>
#   5) Aplica retenção (mantém só os N releases mais recentes)