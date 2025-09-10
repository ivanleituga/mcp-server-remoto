sshagent(credentials: [env.SSH_CRED]) {
  sh label: 'Inventário', script: 'bash -lc "bash jenkins/scripts/inventario.sh"'
}