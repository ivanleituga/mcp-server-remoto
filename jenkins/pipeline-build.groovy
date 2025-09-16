// Stage: Build
// Objetivo: usar a instalação Node configurada no Jenkins e executar o build.sh.
// Observação: este stage não empacota; o empacotamento ocorre no stage "Package".

// Envolve o bloco em um ambiente Node.js provido pelo plugin "NodeJS" do Jenkins.
// - nodeJSInstallationName: nome da instalação cadastrada em "Manage Jenkins" > "Global Tool Configuration".
// - Efeito: ajusta PATH/NPM_HOME para que 'node' e 'npm' usem a versão especificada por NODEJS_TOOL_NAME.
nodejs(nodeJSInstallationName: env.NODEJS_TOOL_NAME) {

  // Executa o script de build do projeto.
  // - label: rótulo exibido na UI do Jenkins para facilitar a leitura dos logs.
  // - script: 'bash -lc' abre um shell de login (-l) e executa (-c) o comando, garantindo PATH/perfis corretos (ex.: nvm).
  //   O script 'jenkins/scripts/build.sh' deve:
  //     * Logar versões de Node e NPM;
  //     * Instalar dependências com 'npm ci' (se houver lockfile) ou 'npm install' (fallback);
  //     * Executar 'npm run build' se existir no package.json;
  //     * Não empacotar (apenas preparar artefatos de build).
  // Observação: respeita a variável CI já definida no pipeline (se houver).
  sh label: 'Build', script: 'bash -lc "bash jenkins/scripts/build.sh"'
}
