// jenkins/pipeline-test.groovy
// Stage: Test
// Objetivo: executar o script de testes (jenkins/scripts/test.sh) usando a instalação de Node.js
// configurada no Jenkins. Esse wrapper garante que `node` e `npm` estejam no PATH durante o step.
//
// Pré-requisitos no Jenkins:
// - Plugin "NodeJS" instalado e uma instalação nomeada (ex.: "Node 18") configurada em
//   "Gerenciar Jenkins" → "Global Tool Configuration" → "NodeJS".
// - A variável de ambiente NODEJS_TOOL_NAME deve conter EXATAMENTE o nome dessa instalação.
// - O arquivo "jenkins/scripts/test.sh" deve existir no workspace após o Checkout e ter permissão de leitura.
//
// O que pode causar erro aqui:
// - NODEJS_TOOL_NAME vazio ou com nome incorreto → o step `nodejs(...)` falha ao injetar o tool.
// - Plugin NodeJS ausente ou instalação não configurada → `nodejs(...)` não encontra o tool.
// - test.sh inexistente ou sem permissão de leitura → o `sh` falha com "No such file or directory".
// - Sistema Windows como agente → usar `sh` requer um shell Bash (ex.: Git Bash). Caso contrário,
//   seria necessário usar `bat`/PowerShell.
// - Ferramentas de teste/lint não instaladas (node_modules ausente) → seu test.sh deve tratar isso
//   (como no script que ignora com sucesso quando não há deps).
// - Variáveis de ambiente usadas dentro do test.sh ausentes → falha interna no script.
//
// Observação sobre `bash -lc`:
// - O `-l` (login) ajuda a carregar PATH/perfis (útil se o agente usa NVM ou PATH customizado).
// - O `-c` executa o comando fornecido como string.
// - Mantemos `bash -lc "bash jenkins/scripts/test.sh"` para garantir ambiente consistente.
//
// Escopo do `nodejs(...)`:
// - Dentro do bloco, `node`/`npm`/`npx` resolvem para a instalação selecionada (via PATH).
// - Fora do bloco, o PATH volta ao normal.

nodejs(nodeJSInstallationName: env.NODEJS_TOOL_NAME) {
  // Executa o script de testes com um rótulo amigável no console do Jenkins.
  // Importante: o script deve ser autocontido (validar se há package.json, node_modules etc.)
  // e devolver código de saída adequado (0 = sucesso; !=0 = falha do stage).
  sh label: 'Test', script: 'bash -lc "bash jenkins/scripts/test.sh"'
}
