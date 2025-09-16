// Stage: Rollback
// Objetivo: reverter para o release anterior caso o Smoke Test tenha falhado.
// Regras:
//   - Se env.SMOKE_OK == 'true', não executa rollback (apenas loga e retorna).
//   - Caso contrário, executa o script de rollback (remoto) dentro de um contexto SSH com credencial.

// Verifica a flag de resultado do smoke:
// (env.SMOKE_OK ?: '') -> usa string vazia se a variável não existir (evita NPE)
// .trim().toLowerCase() -> normaliza espaços e capitalização
if ((env.SMOKE_OK ?: '').trim().toLowerCase() == 'true') {
  // Smoke OK: não há motivo para reverter; encerra o stage de rollback
  echo "[rollback] SMOKE_OK=true; rollback não necessário."
  return
}

// Se chegou aqui, o smoke falhou ou não foi executado; inicia rollback
echo "[rollback] Iniciando rollback (SMOKE_OK != true)..."

// Abre um agente SSH carregando a credencial configurada no Jenkins:
// - env.SSH_CRED deve referenciar um "SSH Username with private key" válido
// - Dentro do bloco, comandos 'ssh' e 'scp' usarão a chave via SSH_AUTH_SOCK
sshagent(credentials: [env.SSH_CRED]) {
  // Executa o script de rollback:
  // - 'bash -lc' garante ambiente de login (PATH, perfis) e então chama o script
  // - o script 'jenkins/scripts/rollback.sh' deve realizar a reversão no host remoto
  //   (ex.: ler $DEPLOY_PATH/.previous_release e repontar o symlink $DEPLOY_PATH/current)
  sh label: 'Rollback', script: 'bash -lc "bash jenkins/scripts/rollback.sh"'
}

// Finaliza o stage com log informativo
echo "[rollback] Concluído."