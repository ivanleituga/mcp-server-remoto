// Valida todas as variáveis obrigatórias. Falha se qualquer uma estiver ausente/vazia.
sh label: 'Preflight', script: 'bash -lc "bash jenkins/scripts/preflight.sh"'