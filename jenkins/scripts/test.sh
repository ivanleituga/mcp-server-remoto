#!/usr/bin/env bash
# Objetivo: rodar lint e testes SE existirem e SE as ferramentas estiverem instaladas.
# - Ignora com sucesso se:
#     * não houver package.json
#     * não houver node_modules/
#     * existir script "lint", mas eslint não estiver instalado
#     * existir script "test", mas o runner não estiver instalado (detectado por "not found")
# - Se as ferramentas existirem, falha normalmente em caso de erro de lint/test.
#
# Observações e pegadinhas:
# - Este script pressupõe que o stage "Build" já executou npm ci / npm install para criar node_modules/.
# - A detecção de runner “não instalado” usa heurística buscando mensagens como "not found" / "is not recognized".
#   Se seu runner imprimir mensagens diferentes, ajuste o grep correspondente.
# - O cheque de lint verifica especificamente a presença do "eslint" via `npx --no-install eslint -v`.
#   Se o seu script "lint" usar outra ferramenta (ex.: `next lint`, `biome`, `eslint_d`, etc.), adapte a verificação.

set -Eeuo pipefail
# -E: propaga ERR em funções/subshells (habilita traps de ERR).
# -e: encerra no primeiro comando que retornar código != 0 (exceto em blocos que desabilitamos explicitamente).
# -u: erro ao referenciar variável não definida.
# -o pipefail: em pipelines (a | b | c) o código de saída será o do primeiro comando que falhar.

echo "[test] Node: $(node -v 2>/dev/null || echo 'n/d')"
echo "[test] NPM : $(npm -v  2>/dev/null || echo 'n/d')"
# As linhas acima imprimem versões de Node e NPM; caso não estejam no PATH, mostram 'n/d' (não disponível).

if [ ! -f package.json ]; then
  echo "[test] package.json não encontrado; nada para testar. Ignorando."
  exit 0
fi
# Sem package.json, não há scripts a rodar. Saímos com sucesso para não quebrar o pipeline.

# Função: existe script em package.json?
has_script() {
  # Usa Node para ler o package.json e verificar se "scripts" possui a chave solicitada.
  # Retorna 0 (verdadeiro) se existir, 1 caso contrário (ou erro ao ler o package.json).
  node -e "try{process.exit((require('./package.json').scripts||{}).hasOwnProperty(process.argv[1])?0:1)}catch(e){process.exit(1)}" "$1"
}

# Se não há node_modules, geralmente não há binários locais (eslint/jest/etc.)
if [ ! -d node_modules ]; then
  echo "[test] node_modules/ ausente; ignorando lint e testes. (Rodar Build antes do Test.)"
  exit 0
fi
# Importante: esse curto-circuito evita erros do tipo "command not found" quando as deps não foram instaladas.

ran_any=0
# Flag para sabermos se executamos pelo menos um dos dois (lint/test). Usado apenas para log ao final.

# -------------------
# LINT (eslint)
# -------------------
if has_script lint; then
  ran_any=1
  # Verifica se eslint está instalado localmente usando npx sem instalar (`--no-install` evita baixar do registry).
  if npx --no-install eslint -v >/dev/null 2>&1; then
    echo "[test] Executando: npm run -s lint"
    npm run -s lint
    # Se o eslint existir e o lint falhar, `set -e` fará o script abortar aqui com código de erro,
    # sinalizando corretamente falha de qualidade.
  else
    echo "[test] Script 'lint' existe, mas eslint não está instalado. Ignorando lint."
    # Caso o projeto use outra ferramenta no script "lint", ajuste esta verificação para essa ferramenta.
  fi
else
  echo "[test] Script 'lint' não definido; pulando."
fi

# -------------------
# TESTS (runner genérico)
# -------------------
if has_script test; then
  ran_any=1
  echo "[test] Executando: npm test --silent"
  # Vamos capturar STDERR para identificar mensagem típica de runner ausente (ex.: "jest: command not found").
  # Como queremos inspecionar o código de saída sem abortar imediatamente, desabilitamos -e temporariamente:
  set +e
  npm test --silent 2> .test_stderr
  rc=$?           # Guarda o código de saída do "npm test"
  set -e          # Reabilita o fail-fast para o restante do script

  if [ $rc -ne 0 ]; then
    # Heurística para “runner não instalado” (Linux/Mac e Windows):
    if grep -qiE 'not found|is not recognized' .test_stderr; then
      echo "[test] Script 'test' existe, mas runner não está instalado. Ignorando testes."
      rm -f .test_stderr
    else
      echo "[test] Falha nos testes (runner presente)."
      # Mostra o que veio em STDERR para auxiliar diagnóstico:
      cat .test_stderr || true
      rm -f .test_stderr
      exit $rc
      # Propaga o código de erro real dos testes, marcando o stage como falho.
    fi
  else
    # Sucesso: remove arquivo temporário de stderr
    rm -f .test_stderr
  fi
else
  echo "[test] Script 'test' não definido; pulando."
fi

if [ "$ran_any" -eq 0 ]; then
  echo "[test] Nenhum script de teste encontrado; ignorando stage."
fi
# Este log é meramente informativo; mesmo sem lint/test, o stage termina com sucesso.

echo "[test] Concluído."