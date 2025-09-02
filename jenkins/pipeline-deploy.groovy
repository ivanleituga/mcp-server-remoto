// Empacota o app em artifact.tgz (prioriza diretórios típicos de build)
sh label: 'Package', script: '''
#!/usr/bin/env bash
set -Eeuo pipefail
required=(PORT RENDER_EXTERNAL_URL DB_HOST DB_PORT DB_NAME)
for v in "${required[@]}"; do
  [ -n "${!v:-}" ] || { echo "[ERRO] Variável obrigatória ausente: $v"; exit 1; }
done
if [ -f package-lock.json ]; then npm ci; else npm install; fi
has_build="$(node -p 'try{(require("./package.json").scripts||{}).build?"yes":""}catch(e){""}')"
[ "$has_build" = "yes" ] && npm run build || true
out=""
for d in dist build .next out; do [ -d "$d" ] && { out="$d"; break; }; done
bundle="bundle"; rm -rf "$bundle"; mkdir -p "$bundle"
if [ -n "$out" ]; then
  cp -r "$out"/. "$bundle"/ || true
else
  [ -f package.json ] && cp package.json "$bundle/"
  [ -f package-lock.json ] && cp package-lock.json "$bundle/"
  [ -f npm-shrinkwrap.json ] && cp npm-shrinkwrap.json "$bundle/" || true
  [ -d src ] && cp -r src "$bundle/"
  [ -d utils ] && cp -r utils "$bundle/"
  shopt -s nullglob; for f in *.js; do cp "$f" "$bundle/"; done; shopt -u nullglob
fi
find "$bundle" -name .svn -type d -prune -exec rm -rf {} +
mkdir -p artifacts
artifact="artifacts/release-$(date +%s).tar.gz"
tar -czf "$artifact" -C "$bundle" .
echo "$artifact" > artifacts/last_artifact.txt
echo "$artifact"; du -h "$artifact"; tar -tzf "$artifact" | head -n 50
'''

sshagent(credentials: [env.SSH_CRED]) {
  withCredentials([usernamePassword(credentialsId: env.DB_CRED_ID, usernameVariable: 'DB_USER', passwordVariable: 'DB_PASSWORD')]) {
    sh label: 'Deploy', script: '''
#!/usr/bin/env bash
set -Eeuo pipefail
required=(DEPLOY_HOST DEPLOY_USER DEPLOY_PATH PORT RENDER_EXTERNAL_URL DB_HOST DB_PORT DB_NAME DB_USER DB_PASSWORD)
for v in "${required[@]}"; do
  [ -n "${!v:-}" ] || { echo "[ERRO] Variável obrigatória ausente: $v"; exit 1; }
done
artifact_path="$(cat artifacts/last_artifact.txt)"
[ -f "$artifact_path" ] || { echo "[ERRO] Artefato não encontrado: $artifact_path"; exit 2; }
artifact_name="$(basename "$artifact_path")"
port="${DEPLOY_SSH_PORT:-22}"
env_local=".env.deploy"
cat > "$env_local" <<EOF
DB_HOST=${DB_HOST}
DB_PORT=${DB_PORT}
DB_NAME=${DB_NAME}
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASSWORD}
PORT=${PORT}
RENDER_EXTERNAL_URL=${RENDER_EXTERNAL_URL}
NODE_ENV=production
EOF
chmod 600 "$env_local"
scp -P "$port" -o BatchMode=yes -o StrictHostKeyChecking=accept-new "$artifact_path" "$env_local" "${DEPLOY_USER}@${DEPLOY_HOST}:/tmp/"
ssh -p "$port" -o BatchMode=yes -o StrictHostKeyChecking=accept-new \
  "${DEPLOY_USER}@${DEPLOY_HOST}" \
  DEPLOY_PATH="${DEPLOY_PATH}" ART="/tmp/${artifact_name}" ENVF="/tmp/.env.deploy" bash -lc '
set -Eeuo pipefail
BASE="${DEPLOY_PATH:?}"
STG="$BASE/.staging"
ART="${ART:?}"
ENVF="${ENVF:?}"

echo "=== REMOTE CONTEXT ==="
whoami || true
id || true
hostname -f || hostname || true
printf "BASE=%s\nSTAGING=%s\nART=%s\nENVF=%s\nPORT=%s\n" "$BASE" "$STG" "$ART" "$ENVF" "${PORT:-}"
command -v node >/dev/null 2>&1 && node -v || echo "node: not found"
command -v npm  >/dev/null 2>&1 && npm -v  || echo "npm: not found"
echo

mkdir -p "$BASE" "$STG" "$BASE/shared"
rm -rf "$STG"; mkdir -p "$STG"

echo "=== UNTAR -> STAGING ==="
echo "tar -xzf $ART -C $STG"
tar -xzf "$ART" -C "$STG"
echo "ls -la $STG"
ls -la "$STG" || true
echo
echo "STAGING tree (máx 2 níveis):"
if command -v tree >/dev/null 2>&1; then
  tree -L 2 "$STG" || true
else
  find "$STG" -maxdepth 2 -printf "%y %p\\n" | sort | sed -n "1,200p"
fi
echo

echo "=== RSYNC -> BASE ==="
echo "rsync -a --delete --exclude node_modules/ $STG/ $BASE/"
rsync -a --delete --exclude "node_modules/" "$STG"/ "$BASE"/
echo "ls -la $BASE"
ls -la "$BASE" || true
echo
echo "Arquivos relevantes no BASE (máx 2 níveis):"
find "$BASE" -maxdepth 2 -type f \\( -name "package.json" -o -name "package-lock.json" -o -name "*.js" \\) -printf "%p\\n" | sort | sed -n "1,200p"
echo
pkg="$(find "$BASE" -maxdepth 2 -name package.json | head -n1 || true)"
if [ -n "$pkg" ]; then
  echo "package.json path:"
  (realpath "$pkg" 2>/dev/null || echo "$pkg")
else
  echo "package.json NÃO ENCONTRADO em $BASE"
fi
echo

echo "=== .env (mascarado) ==="
if [ -f "$ENVF" ]; then
  install -m 600 "$ENVF" "$BASE/.env"
fi
if [ -f "$BASE/.env" ]; then
  sed -E "s/(DB_PASSWORD|DB_PSW)=.*/\\1=********/; s/(PASSWORD)=.*/\\1=********/" "$BASE/.env" || true
else
  echo "sem $BASE/.env"
fi
echo

echo "=== Espaço em disco e dono dos arquivos ==="
du -sh "$BASE" || true
stat -c "%U:%G %n" "$BASE" 2>/dev/null || ls -ld "$BASE" || true
echo

rm -f "$ART" "$ENVF"; rm -rf "$STG"
'
echo "DEPLOY OK"
'''
  }
}
