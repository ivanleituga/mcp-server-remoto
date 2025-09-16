// Stage: Snapshot de Logs
// Objetivo: coletar uma fotografia rápida do estado da aplicação no servidor (logs recentes e processos).
// Escopo: somente leitura/diagnóstico; não reinicia serviço nem altera arquivos ou permissões.

sshagent(credentials: [env.SSH_CRED]) {        
    // Abre um contexto SSH usando a credencial indicada por env.SSH_CRED
    // (tipo esperado: "SSH Username with private key"). O agente exporta
    // SSH_AUTH_SOCK para que 'ssh' dentro do bloco use a chave automaticamente.

  // Executa o script de snapshot no agente Jenkins.
  // - label: nome amigável do step na UI do Jenkins.
  // - script: 'bash -lc' garante um shell de login (PATH/perfis corretos) e então chama o script real.
  //   O script 'jenkins/scripts/logs_snapshot.sh' conecta ao host remoto e:
  //     * Resolve o release atual via $DEPLOY_PATH/current (se existir)
  //     * Exibe tails de .start.out/.start.err (se existirem)
  //     * Lista processos Node e quem escuta em $PORT
  //   Pré-requisitos no ambiente: DEPLOY_USER, DEPLOY_HOST, DEPLOY_PATH e PORT definidos.
  sh label: 'Snapshot de Logs', script: 'bash -lc "bash jenkins/scripts/logs_snapshot.sh"'
}
