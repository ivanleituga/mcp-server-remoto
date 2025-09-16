// Stage: Deploy
// Objetivo: enviar o artifact (artifact.tgz) e variáveis de ambiente ao servidor remoto e
//  promover um novo release versionado (releases/<timestamp>), atualizando o symlink 'current'.

sshagent(credentials: [env.SSH_CRED]) {
  // Abre um contexto com o agente SSH usando a credencial indicada
  // em env.SSH_CRED (tipo esperado: "SSH Username with private key").
  // Efeito: comandos 'ssh'/'scp' executados dentro deste bloco usam
  // automaticamente a chave via SSH_AUTH_SOCK (sem pedir senha).

  withCredentials([usernamePassword(
    // Injeta as credenciais do banco (usuário/senha) de forma temporária
    // e mascarada no log. O ID deve existir no Jenkins e apontar para
    // uma credencial do tipo "Username with password".
    credentialsId: env.DB_CRED_ID,
    usernameVariable: 'DB_USER',
    passwordVariable: 'DB_PASSWORD'
  )]) {
    // Executa o script de deploy no agente Jenkins:
    // - 'bash -lc' garante um shell de login (carrega PATH/perfis) e então executa o script.
    // - jenkins/scripts/deploy.sh deve:
    //     * validar presença de artifact.tgz (gerado no stage Package);
    //     * montar .env.deploy (usando, entre outras, DB_USER/DB_PASSWORD injetadas aqui);
    //     * transferir artifact.tgz e .env.deploy para /tmp do host remoto (via scp);
    //     * no host: criar releases/<timestamp>, descompactar, instalar deps (--omit=dev),
    //                parar processo na PORT e iniciar novo via 'nohup npm start',
    //                atualizar symlink $DEPLOY_PATH/current e aplicar retenção.
    // Pré-requisitos de ambiente (já definidos em stages/params anteriores):
    //   DEPLOY_HOST, DEPLOY_USER, DEPLOY_PATH, PORT, NODE_ENV, RENDER_EXTERNAL_URL, etc.
    sh label: 'Deploy', script: 'bash -lc "bash jenkins/scripts/deploy.sh"'
  } // Fim do withCredentials (DB_USER/DB_PASSWORD deixam de existir no ambiente)
}   // Fim do sshagent (o agente SSH é descarregado)