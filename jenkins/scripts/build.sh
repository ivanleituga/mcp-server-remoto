#!/usr/bin/env bash
# Shebang: executa este script com o interpretador bash encontrado no PATH do sistema.

# Objetivo: preparar o ambiente de build e executar o build da aplicação.
# Escopo: instala dependências e roda "npm run build" se existir.
# Observação: não empacota; o empacotamento ocorre no stage "Package".

set -Eeuo pipefail

# 1) Loga as versões para rastreabilidade.
#    Útil para depuração e auditoria do build.
echo "[build] Node: $(node -v 2>/dev/null || echo 'n/d')"
echo "[build] NPM : $(npm -v  2>/dev/null || echo 'n/d')"

# 2) Instala dependências de forma determinística quando houver lockfile.
#    - npm ci: usa as versões exatas do package-lock.json; é mais rápido e previsível.
#    - npm install: fallback quando não há lockfile (ou shrinkwrap).
if [ -f package-lock.json ] || [ -f npm-shrinkwrap.json ]; then
  echo "[build] Instalando dependências com npm ci..."
  npm ci
else
  echo "[build] Instalando dependências com npm install..."
  npm install
fi

# 3) Verifica se há script "build" declarado no package.json e executa se existir.
#    Caso contrário, apenas informa que não há passo de build.
has_build="$(node -p "try{(require('./package.json').scripts||{}).build?'yes':''}catch(e){''}")" || true
if [ "$has_build" = "yes" ]; then
  echo "[build] Executando: npm run build"
  npm run build
else
  echo "[build] Sem script \"build\" no package.json; nada para compilar."
fi

# 4) Relatório informativo do que foi gerado (sem empacotar).
#    Apenas lista diretórios de saída comuns; não falha se não existirem.
for d in dist build .next out; do
  if [ -d "$d" ]; then
    echo "[build] Saída detectada em: $d"
  fi
done

echo "[build] Concluído."