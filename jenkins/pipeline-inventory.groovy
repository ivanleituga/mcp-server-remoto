// Stage: Inventário
// Objetivo: coletar informações do diretório de deploy no servidor remoto (estrutura, symlinks, releases, permissões, tamanhos).
// Política: não reinicia processos nem lê logs de aplicação; apenas inspeciona e imprime metadados úteis no console do Jenkins.

sshagent(credentials: [env.SSH_CRED]) {           
  // Abre um contexto com agente SSH carregando a credencial configurada em env.SSH_CRED
  // - Tipo esperado: "SSH Username with private key"
  // - Efeito: popula SSH_AUTH_SOCK para que comandos 'ssh'/'scp' usem a chave automaticamente

  // Executa o script de inventário no agente Jenkins.
  // - label: rótulo do step exibido na UI do Jenkins
  // - script: usa 'bash -lc' (shell de login) para garantir PATH/perfis corretos e então chama o script.
  //   O script 'jenkins/scripts/inventory.sh' deve:
  //     * Conectar ao host remoto usando $DEPLOY_USER@$DEPLOY_HOST (via ssh)
  //     * Listar $DEPLOY_PATH (ex.: releases/, shared/, current -> releases/<id>)
  //     * Exibir permissões/tamanhos/datas (ls -la, du -sh, readlink -f), sem alterar nada no servidor
  sh label: 'Inventário', script: 'bash -lc "bash jenkins/scripts/inventory.sh"'
}