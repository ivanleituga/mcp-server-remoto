echo "[checkout] Iniciando checkout do SVN: ${env.SVN_URL}"

def svnResult = checkout([
  $class: 'SubversionSCM',
  locations: [[
    credentialsId: env.SVN_CRED_ID,
    remote: env.SVN_URL,
    local: '.',
    depthOption: 'infinity',
    ignoreExternalsOption: true
  ]],
  workspaceUpdater: [$class: 'CheckoutUpdater']
])

def revision = (svnResult?.SVN_REVISION ?: env.SVN_REVISION ?: 'n/a')
echo "[checkout] Concluído. SVN_REVISION=${revision}"
sh 'ls -la || true'
