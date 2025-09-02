// Instala dependências e executa "build" se existir script de build no package.json
nodejs(env.NODEJS_TOOL_NAME) {
  sh label: 'Build', script: '''
bash <<'BASH'
set -Eeuo pipefail

# Instala de forma determinística se houver lockfile
if [ -f package-lock.json ] || [ -f npm-shrinkwrap.json ]; then
  npm ci
else
  npm install
fi

# Executa build apenas se definido em scripts
has_build="$(node -p "try{(require('./package.json').scripts||{}).build?'yes':''}catch(e){''}")" || true
if [ "$has_build" = "yes" ]; then
  npm run build
fi
BASH
'''
}
