// Stage: Checkout (SVN)
// Objetivo: trazer o código do repositório SVN para o workspace do Jenkins.
// Pré-requisitos: env.SVN_URL e env.SVN_CRED_ID já validados no Preflight (SVN).

echo "[checkout] Iniciando checkout do SVN: ${env.SVN_URL ?: '(não definido)'}"

// Estratégia de atualização do workspace:
// - CheckoutUpdater: rápido, mantém arquivos existentes e atualiza o que mudou.
// - CleanCheckout: limpa completamente o workspace antes de baixar tudo de novo.
// Permite alternar via variável CLEAN_CHECKOUT=true no job (opcional).
def updater = [$class: 'CheckoutUpdater']
if ((env.CLEAN_CHECKOUT ?: '').toString().trim().equalsIgnoreCase('true')) {
  updater = [$class: 'CleanCheckout']
  echo "[checkout] CLEAN_CHECKOUT=true → usando CleanCheckout (workspace será recriado)."
}

// Monta a configuração do SCM Subversion:
// - credentialsId: credencial de acesso ao SVN (armazenada no Jenkins).
// - remote: URL do repositório/projeto no SVN.
// - local: diretório local ('.' = raiz do workspace).
// - depthOption: 'infinity' pega tudo recursivamente.
// - ignoreExternalsOption: true ignora svn:externals (evita dependências externas).
def scmConfig = [
  $class: 'SubversionSCM',
  locations: [[
    credentialsId: env.SVN_CRED_ID,
    remote: env.SVN_URL,
    local: '.',
    depthOption: 'infinity',
    ignoreExternalsOption: true
  ]],
  workspaceUpdater: updater
]

// Executa o checkout e captura metadados retornados pelo plugin.
def svnResult = checkout(scmConfig)

// Descobre a revisão aplicada:
// - Tenta a chave retornada pelo checkout (svnResult.SVN_REVISION).
// - Se não houver, tenta variável de ambiente (env.SVN_REVISION).
// - Caso não exista, usa 'n/a' como fallback.
def revision = (svnResult?.SVN_REVISION ?: env.SVN_REVISION ?: 'n/a')

// Exporta a revisão para o ambiente (útil para logs, inventário e notificações).
if (revision && revision != 'n/a') {
  env.SVN_REVISION = revision
}

// Log final do stage com revisão e caminho do workspace.
echo "[checkout] Concluído. SVN_REVISION=${revision} | WORKSPACE=${pwd()}"

// Lista o conteúdo do workspace para conferência.
// '|| true' evita falha do stage caso 'ls' retorne erro (ex.: diretório vazio).
sh 'ls -la || true'
