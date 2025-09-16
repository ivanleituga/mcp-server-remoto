#!/usr/bin/env bash
# Shebang: executa este script com o interpretador bash encontrado no PATH do sistema.

# Objetivo: validar que a aplicação está respondendo após o deploy.
# Verifica ${RENDER_EXTERNAL_URL}${SMOKE_PATH:-/health} com tentativas e intervalo configuráveis.
# Saída:
#   - exit 0 em sucesso (HTTP 2xx/3xx)
#   - exit != 0 em falha após esgotar as tentativas
#
# Variáveis usadas (de ambiente):
#   RENDER_EXTERNAL_URL  (obrigatória)
#   SMOKE_PATH           (opcional, padrão: /health)
#   SMOKE_RETRIES        (opcional, padrão: 15 tentativas)
#   SMOKE_DELAY_SEC      (opcional, padrão: 2 segundos entre tentativas)
#   SMOKE_TIMEOUT_SEC    (opcional, padrão: 5 segundos de timeout por tentativa)

set -Eeuo pipefail
# -E: preserva traps de ERR em funções/subshells
# -e: aborta o script no primeiro comando com status != 0
# -u: erro ao usar variável não definida
# -o pipefail: em pipelines, retorna o status do primeiro comando que falhar

# 1) Valida variáveis mínimas
if [ -z "${RENDER_EXTERNAL_URL:-}" ]; then
  # RENDER_EXTERNAL_URL é obrigatória para montar a URL alvo do smoke
  echo "[smoke] ERRO: RENDER_EXTERNAL_URL não definida."
  exit 1
fi

# Define padrões caso variáveis não estejam setadas
SMOKE_PATH="${SMOKE_PATH:-/health}"         # caminho de health por padrão
SMOKE_RETRIES="${SMOKE_RETRIES:-15}"        # número de tentativas
SMOKE_DELAY_SEC="${SMOKE_DELAY_SEC:-2}"     # atraso entre tentativas (segundos)
SMOKE_TIMEOUT_SEC="${SMOKE_TIMEOUT_SEC:-5}" # timeout por tentativa (segundos)

# Normaliza a junção entre base e path para evitar // ou ausência de /
base="${RENDER_EXTERNAL_URL%/}"  # remove eventual barra final
path="/${SMOKE_PATH#/}"          # garante que começa com uma barra
url="${base}${path}"             # URL final a ser verificada

# Loga parâmetros efetivos
echo "[smoke] URL: ${url}"
echo "[smoke] Tentativas: ${SMOKE_RETRIES} | Intervalo: ${SMOKE_DELAY_SEC}s | Timeout: ${SMOKE_TIMEOUT_SEC}s"

# 2) Loop de tentativas
attempt=1
while [ "$attempt" -le "$SMOKE_RETRIES" ]; do
  # Faz requisição HTTP e captura o status code
  #   -sS         : silencioso, mas mostra erros
  #   -o /dev/null: descarta o corpo da resposta
  #   -w '%{http_code}': imprime somente o status code
  #   --max-time  : timeout (segundos) para a tentativa
  #   -H UA       : cabeçalho de User-Agent para identificação no servidor
  # '|| true' evita que -e aborte o script caso o curl falhe (mantemos controle de erro manualmente)
  code="$(curl -sS -o /dev/null -w "%{http_code}" --max-time "${SMOKE_TIMEOUT_SEC}" -H "User-Agent: Jenkins-Smoke" "${url}" || true)"

  # Sucesso se código HTTP for 2xx ou 3xx (regex simples)
  if [[ "$code" =~ ^2[0-9][0-9]$ || "$code" =~ ^3[0-9][0-9]$ ]]; then
    echo "[smoke] OK na tentativa ${attempt} (HTTP ${code})."
    exit 0
  fi

  # Caso ainda indisponível, informa e aguarda antes de tentar novamente
  echo "[smoke] Ainda não disponível (HTTP ${code:-ERR}) — tentativa ${attempt}/${SMOKE_RETRIES}."
  attempt=$((attempt+1))
  sleep "${SMOKE_DELAY_SEC}"
done

# 3) Falha após esgotar tentativas
echo "[smoke] FALHA: serviço não respondeu com 2xx/3xx após ${SMOKE_RETRIES} tentativas."
exit 2