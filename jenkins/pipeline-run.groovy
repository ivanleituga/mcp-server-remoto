// Start/Reload remoto com fallback: systemd (sudo) → systemd --user → PM2 → nohup, + health-check
sshagent(credentials: [env.SSH_CRED]) {
  sh label: 'Start/Reload & Health', script: '''
bash <<'BASH_LOCAL'
set -Eeuo pipefail

ssh -o StrictHostKeyChecking=no "${DEPLOY_USER}@${DEPLOY_HOST}" "DEPLOY_PATH='${DEPLOY_PATH}' PORT='${PORT}' NODE_ENV='${NODE_ENV}' bash -s" <<'BASH_REMOTE'
set -Eeuo pipefail
trap 'echo "[ERRO] Falha na linha $LINENO"; exit 1' ERR

: "${DEPLOY_PATH:?Faltou DEPLOY_PATH}"
: "${PORT:?Faltou PORT}"

LOG_DIR="${DEPLOY_PATH}/.deploy-logs"
mkdir -p "$LOG_DIR"
ts="$(date +%Y%m%d-%H%M%S)"
LOG_STD="${LOG_DIR}/start-${ts}.log"
LOG_ERR="${LOG_DIR}/start-${ts}.err"
exec > >(tee -a "$LOG_STD") 2> >(tee -a "$LOG_ERR" >&2)

[ -d "$DEPLOY_PATH" ] || { echo "Diretório não existe: $DEPLOY_PATH"; exit 1; }
cd "$DEPLOY_PATH"

[ -f package.json ] || { echo "package.json não encontrado em $DEPLOY_PATH"; exit 1; }
APP_NAME="$(grep -Po '"name"\\s*:\\s*"\\K[^"]+' package.json || true)"
[ -n "$APP_NAME" ] || { echo 'Campo "name" ausente em package.json'; exit 1; }
echo "APP_NAME: $APP_NAME"

health_check() {
  local tries=30
  local url="http://127.0.0.1:${PORT}/"
  for i in $(seq 1 "$tries"); do
    if command -v curl >/dev/null 2>&1 && curl -sS --max-time 5 -o /dev/null "$url"; then
      echo "Saúde OK em ${url}"
      return 0
    fi
    echo "Aguardando serviço (tentativa $i/${tries})..."
    sleep 2
  done
  echo "Health-check falhou em ${url}"
  return 1
}

restart_systemd_sudo() {
  command -v systemctl >/dev/null 2>&1 || return 1
  sudo -n true 2>/dev/null || return 1
  echo "[systemd+sudo] Tentando ${APP_NAME}.service"
  if sudo systemctl status "${APP_NAME}.service" >/dev/null 2>&1; then
    sudo systemctl restart "${APP_NAME}.service"
    return 0
  fi
  return 1
}

restart_systemd_user() {
  command -v systemctl >/dev/null 2>&1 || return 1
  echo "[systemd --user] Tentando ${APP_NAME}.service"
  if systemctl --user status "${APP_NAME}.service" >/dev/null 2>&1; then
    systemctl --user restart "${APP_NAME}.service"
    return 0
  fi
  return 1
}

reload_or_start_pm2() {
  command -v pm2 >/dev/null 2>&1 || return 1
  echo "[PM2] Usando PM2"
  if pm2 describe "${APP_NAME}" >/dev/null 2>&1; then
    pm2 reload "${APP_NAME}" --update-env
  else
    pm2 start "npm -- start" --name "${APP_NAME}" --update-env
    pm2 save || true
    pm2 startup >/dev/null 2>&1 || true
  fi
  return 0
}

start_with_nohup() {
  echo "[nohup] Iniciando fallback"
  pkill -f "node .*src/index.js" 2>/dev/null || true
  nohup npm start >"${LOG_DIR}/app.out" 2>"${LOG_DIR}/app.err" < /dev/null &
  return 0
}

echo "=== Estratégia 1/4: systemd (sudo) ==="
if restart_systemd_sudo; then
  if health_check; then exit 0; else
    echo "[systemd+sudo] Logs recentes:"
    sudo journalctl -u "${APP_NAME}.service" --no-pager -n 200 || true
    exit 1
  fi
fi

echo "=== Estratégia 2/4: systemd (user) ==="
if restart_systemd_user; then
  if health_check; then exit 0; else
    echo "[systemd --user] Logs recentes:"
    journalctl --user -u "${APP_NAME}.service" --no-pager -n 200 || true
    exit 1
  fi
fi

echo "=== Estratégia 3/4: PM2 ==="
if reload_or_start_pm2; then
  if health_check; then exit 0; else
    echo "[PM2] Logs recentes:"
    pm2 logs "${APP_NAME}" --lines 200 --nostream || true
    exit 1
  fi
fi

echo "=== Estratégia 4/4: nohup ==="
if start_with_nohup; then
  if health_check; then
    echo "Serviço ativo via nohup. Logs em ${LOG_DIR}/app.out e ${LOG_DIR}/app.err"
    exit 0
  else
    echo "[nohup] Erro ao subir. Últimas linhas dos logs:"
    tail -n 200 "${LOG_DIR}/app.err" || true
    exit 1
  fi
fi

echo "Nenhuma estratégia conseguiu iniciar o serviço."
exit 1
BASH_REMOTE
BASH_LOCAL
'''
}
