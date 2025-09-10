#!/usr/bin/env bash
set -Eeuo pipefail
[ -f artifact.tgz ] || { echo "[ERRO] artifact.tgz não encontrado"; exit 2; }
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
scp -o BatchMode=yes -o StrictHostKeyChecking=accept-new -p artifact.tgz "$env_local" "${DEPLOY_USER}@${DEPLOY_HOST}:/tmp/"
sed -E 's/^(DB_PASSWORD)=.*/\1=********/' "$env_local" || true
ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new \
  "${DEPLOY_USER}@${DEPLOY_HOST}" \
  BASE="${DEPLOY_PATH}" ART="/tmp/artifact.tgz" ENVF="/tmp/.env.deploy" PORT="${PORT}" \
  bash -s <<'REMOTE'
set -Eeuo pipefail
set -x
mkdir -p "$BASE" "$BASE/.deploy-logs"
tmp_extract="$(mktemp -d)"
tar -xzf "$ART" -C "$tmp_extract"
rsync -a --delete --delete-excluded --exclude='.deploy-logs' --exclude='.git' --exclude='.svn' "$tmp_extract"/ "$BASE"/
rm -rf "$tmp_extract"
find "$BASE" -type d -name '.git' -prune -exec rm -rf {} +
find "$BASE" -type d -name '.svn' -prune -exec rm -rf {} +
install -m 600 "$ENVF" "$BASE/.env"
rm -f "$ART" "$ENVF"
echo "$BASE"; ls -la "$BASE" || true
set +x
sed -E 's/^(DB_PASSWORD)=.*/\1=********/' "$BASE/.env" || true
set -x
pkg="$(find "$BASE" -maxdepth 1 -name package.json | head -n1 || true)"
if [ -f "$BASE/package-lock.json" ] || [ -f "$BASE/npm-shrinkwrap.json" ]; then
  (cd "$BASE" && npm ci --omit=dev)
else
  (cd "$BASE" && npm install --omit=dev)
fi
if command -v sudo >/dev/null 2>&1; then
  sudo -n fuser -k -TERM -n tcp "$PORT" || true
else
  fuser -k -TERM -n tcp "$PORT" || true
fi
sleep 1
cd "$BASE"
set +x
set -a; . "$BASE/.env"; set +a
nohup npm start > "$BASE/.start.out" 2> "$BASE/.start.err" < /dev/null &
sleep 1
tail -n 120 "$BASE/.start.err" || true
REMOTE