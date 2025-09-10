sshagent(credentials: [env.SSH_CRED]) {
  withCredentials([usernamePassword(credentialsId: env.DB_CRED_ID, usernameVariable: 'DB_USER', passwordVariable: 'DB_PASSWORD')]) {
    sh label: 'Deploy', script: 'bash -lc "bash jenkins/scripts/deploy.sh"'
  }
}