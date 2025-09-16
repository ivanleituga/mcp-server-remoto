// Stage: Smoke Test
// Objetivo: verificar se a aplicação recém-deployada responde na URL de health.
// Política: se falhar, o STAGE marca FAILURE, mas o BUILD permanece SUCCESS para permitir
//  continuidade do pipeline (ex.: stage de rollback condicional).

echo "[smoke] Iniciando verificação…"

// Define o caminho padrão de health caso SMOKE_PATH não esteja definido.
// Ex.: '/health', '/actuator/health', etc. Pode ser sobrescrito via parâmetro/variável.
def smokePath = (env.SMOKE_PATH ?: '/health')

// Flag de resultado do smoke. Começa como 'false' e só vira 'true' se o script passar.
env.SMOKE_OK = 'false'

// catchError controla como a falha é reportada:
// - stageResult: 'FAILURE'  -> este stage aparece como falho no visual do pipeline
// - buildResult: 'SUCCESS'  -> o build global não é interrompido; próximos stages continuam
catchError(buildResult: 'SUCCESS', stageResult: 'FAILURE') {
  // Executa o script de smoke. Ele deve ler RENDER_EXTERNAL_URL e (opcionalmente) SMOKE_PATH
  // do ambiente e realizar uma requisição HTTP simples (ex.: curl) à URL de health.
  // Dica: no shell, construir a URL como "${RENDER_EXTERNAL_URL}${SMOKE_PATH:-/health}".
  sh label: 'Smoke', script: 'bash -lc "bash jenkins/scripts/smoke.sh"'

  // Se o script não lançar erro, consideramos o smoke bem-sucedido.
  env.SMOKE_OK = 'true'
}

// Log final com a URL verificada e o status calculado.
// Observação: usamos 'smokePath' local para compor a URL apenas para o log;
// o script deve usar as variáveis de ambiente para efetuar a verificação real.
echo "[smoke] Resultado: SMOKE_OK=${env.SMOKE_OK} | URL=${env.RENDER_EXTERNAL_URL}${smokePath}"
