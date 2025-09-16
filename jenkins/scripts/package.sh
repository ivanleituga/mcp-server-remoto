#!/usr/bin/env bash
# Shebang: executa este script com o interpretador bash encontrado no PATH do sistema.

# Prepara e empacota artefatos gerados no stage "Build" em um tar.gz distribuível,
# incluindo metadados de release e checksum opcional.

set -Eeuo pipefail
# -E: mantém traps de ERR em funções/subshells
# -e: aborta no primeiro comando com status != 0
# -u: erro ao usar variável não definida
# -o pipefail: pipeline falha se qualquer etapa falhar

echo "[package] Iniciando empacotamento…"

# 1) Cria diretório limpo para o bundle
bundle_dir="bundle"              # pasta temporária com o conteúdo que irá para o tar.gz
rm -rf "$bundle_dir"             # remove resíduos de execuções anteriores
mkdir -p "$bundle_dir"           # recria diretório

# 2) Detecta pasta de saída de build comum
out_dir=""
for d in dist build .next out; do
  if [ -d "$d" ]; then           # pega a primeira que existir
    out_dir="$d"
    break
  fi
done

# 3) Copia conteúdo para o bundle
#    Preferência: se houver saída de build, empacotar só ela (menor e mais limpo).
#    Caso contrário, levar fontes mínimas para execução no destino.
if [ -n "$out_dir" ]; then
  echo "[package] Saída de build detectada em: $out_dir"
  rsync -a --delete \
    --exclude='.git' --exclude='.svn' --exclude='node_modules' \
    "$out_dir"/ "$bundle_dir"/      # copia saída de build e mantém permissões/horários
else
  echo "[package] Nenhuma saída de build detectada; incluindo fontes necessárias."
  [ -d src ]    && rsync -a --exclude='.git' --exclude='.svn' src/    "$bundle_dir"/src/    || true
  [ -d utils ]  && rsync -a --exclude='.git' --exclude='.svn' utils/  "$bundle_dir"/utils/  || true
  [ -d public ] && rsync -a --exclude='.git' --exclude='.svn' public/ "$bundle_dir"/public/ || true
  shopt -s nullglob                # evita erro se não houver *.js na raiz
  for f in *.js; do cp "$f" "$bundle_dir/"; done
  shopt -u nullglob
fi

# 4) Copia manifestos/config necessários para runtime no destino
[ -f package.json ]        && cp package.json        "$bundle_dir/" || true
[ -f package-lock.json ]   && cp package-lock.json   "$bundle_dir/" || true
[ -f npm-shrinkwrap.json ] && cp npm-shrinkwrap.json "$bundle_dir/" || true
[ -f ecosystem.config.js ] && cp ecosystem.config.js "$bundle_dir/" || true  # útil para PM2, se usado

# 5) Gera metadados de release (rastreamento de build/deploy)
release_json="$bundle_dir/release_info.json"
app_name="n/d"
app_version="n/d"

# Extrai nome/versão do package.json via Node (se disponíveis)
if command -v node >/dev/null 2>&1 && [ -f package.json ]; then
  app_name="$(node -p "try{require('./package.json').name||'n/d'}catch(e){'n/d'}" || echo 'n/d')"
  app_version="$(node -p "try{require('./package.json').version||'n/d'}catch(e){'n/d'}" || echo 'n/d')"
fi

# Escreve JSON de metadados; usa printf para evitar injeções acidentais
cat > "$release_json" <<JSON
{
  "app_name": "$(printf '%s' "$app_name")",
  "app_version": "$(printf '%s' "$app_version")",
  "svn_revision": "$(printf '%s' "${SVN_REVISION:-n/d}")",
  "job_name": "$(printf '%s' "${JOB_NAME:-n/d}")",
  "build_number": "$(printf '%s' "${BUILD_NUMBER:-n/d}")",
  "node_env": "$(printf '%s' "${NODE_ENV:-n/d}")",
  "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
JSON

# 6) Sanidade: falha se o bundle estiver vazio (previne pacote sem conteúdo)
if [ -z "$(ls -A "$bundle_dir")" ]; then
  echo "[package] ERRO: bundle está vazio."
  exit 1
fi

# 7) Gera tar.gz final (artifact.tgz), excluindo metadados de VCS (.git/.svn)
echo "[package] Gerando artifact.tgz…"
tar -C "$bundle_dir" --exclude-vcs -czf artifact.tgz .

# 8) Gera checksum SHA-256 (artifact.sha256) se ferramenta existir
if command -v sha256sum >/dev/null 2>&1; then
  sha256sum artifact.tgz > artifact.sha256
elif command -v shasum >/devnull 2>&1; then
  shasum -a 256 artifact.tgz > artifact.sha256
else
  echo "[package] Aviso: não há sha256sum/shasum; não será gerado artifact.sha256."
fi

# 9) Sumário do pacote gerado
echo "[package] Concluído."
echo "[package] Arquivo: $(pwd)/artifact.tgz"
[ -f artifact.sha256 ] && echo "[package] Checksum: $(cut -d' ' -f1 artifact.sha256)"
echo "[package] Metadata: $(pwd)/$release_json"