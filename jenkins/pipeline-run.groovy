sshagent(credentials: [env.SSH_CRED]) {
  sh label: 'Snapshot', script: 'bash -lc "bash jenkins/scripts/snapshot.sh"'
}