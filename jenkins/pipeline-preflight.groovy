// Executa o preflight genérico antes dos demais stages.
// Função: validar variáveis obrigatórias e pré-requisitos do ambiente.
// Comportamento: se o script retornar código != 0, este step falha e o pipeline é interrompido.
sh(
  // Rótulo exibido na UI do Jenkins para facilitar a leitura dos logs
  // 'bash -lc': abre um shell de login (-l) e executa (-c) o script indicado
  label: 'Preflight',
  // O script deve: checar variáveis requeridas, relatar ausentes/vazias e sair com erro quando necessário                                            
  script: 'bash -lc "bash jenkins/scripts/preflight.sh"'
)
