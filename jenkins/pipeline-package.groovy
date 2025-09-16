// Stage: Package
// Objetivo: empacotar a aplicação em um artefato único (artifact.tgz) a partir do que foi gerado no Build
//  e disponibilizá-lo no Jenkins para rastreabilidade (com fingerprint).

// Executa o script de empacotamento:
// - label: nome amigável do step na UI do Jenkins
// - script: 'bash -lc' abre um shell de login (-l) e executa (-c) o script indicado
// - jenkins/scripts/package.sh: deve produzir 'artifact.tgz', 'artifact.sha256' e 'bundle/release_info.json'
sh label: 'Package', script: 'bash -lc "bash jenkins/scripts/package.sh"'

// Publica os arquivos gerados como artefatos do build e cria fingerprints:
// - artifacts: lista separada por vírgulas dos caminhos a arquivar (relativos ao workspace)
//   * artifact.tgz         -> pacote distribuível
//   * artifact.sha256      -> checksum do pacote (se gerado pelo script)
//   * bundle/release_info.json -> metadados (app, versão, revisão, build, timestamp)
// - fingerprint: true -> habilita rastreabilidade (tracking) destes arquivos entre builds/projetos
// Observação: se algum arquivo listado não existir, o step falhará (padrão é não permitir arquivo vazio).
archiveArtifacts artifacts: 'artifact.tgz,artifact.sha256,bundle/release_info.json', fingerprint: true
