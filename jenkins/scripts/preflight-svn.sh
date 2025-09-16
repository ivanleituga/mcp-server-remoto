#!/usr/bin/env bash
# Shebang: executa este script com o interpretador bash encontrado no PATH do sistema.

# Preflight exclusivo do SVN (antes do Checkout do código)
# Objetivo: validar se há ambiente e credenciais mínimas para acessar o repositório SVN.
# Itens verificados:
#   1) Variáveis obrigatórias: SVN_URL, SVN_USER, SVN_PASS
#   2) Formato básico de SVN_URL (http(s), svn, svn+ssh)
#   3) Presença do binário 'svn' no PATH do agente
#   4) Autenticação/acesso com `svn info` de forma não interativa
# Em qualquer falha, sai com código diferente de zero.

set -Eeuo pipefail
# -E: preserva ERR traps em funções/subshells
# -e: encerra o script se qualquer comando falhar (exit status != 0)
# -u: erro ao referenciar variáveis não definidas
# -o pipefail: o exit code de um pipeline é o do primeiro comando que falhar

# Declara a lista de variáveis obrigatórias para o preflight
required_vars=(SVN_URL SVN_USER SVN_PASS)

# Vetor para acumular nomes de variáveis ausentes/vazias
missing=()

# Itera sobre cada variável obrigatória
for v in "${required_vars[@]}"; do
  # Usa expansão indireta ${!v} para obter o valor da variável cujo nome está em $v
  # ':-' evita erro do -u quando a variável não existe, substituindo por string vazia
  if [ -z "${!v:-}" ]; then
    # Acumula o nome da variável faltante
    missing+=("$v")
  fi
done

# Se houver pelo menos uma variável faltante, relata e encerra com erro
if [ "${#missing[@]}" -gt 0 ]; then
  printf '[preflight-svn] Variáveis ausentes/vazias:\n'
  printf ' - %s\n' "${missing[@]}"
  exit 1
fi

# Valida o esquema/protocolo básico da URL do SVN
case "$SVN_URL" in
  http://*|https://*|svn://*|svn+ssh://*)
    # Aceita: HTTP, HTTPS, SVN nativo, SVN sobre SSH
    ;;
  *)
    # Qualquer outro esquema é considerado inválido
    echo "[preflight-svn] SVN_URL inválida: '$SVN_URL'"
    exit 1
    ;;
esac

# Verifica se o binário 'svn' está disponível no PATH
command -v svn >/dev/null 2>&1 || { echo "[preflight-svn] Binário 'svn' não encontrado"; exit 1; }

# Tenta acessar informações do repositório usando as credenciais fornecidas
# --non-interactive: não pede entrada do usuário
# --trust-server-cert: aceita certificado do servidor (útil em ambientes com certificados self-signed)
# --username/--password: credenciais injetadas pelo Jenkins via withCredentials
# Redireciona stdout/stderr para /dev/null para manter o log limpo; falha do comando cai no 'if ! ...'
if ! svn info \
    --non-interactive \
    --trust-server-cert \
    --username "$SVN_USER" \
    --password "$SVN_PASS" \
    "$SVN_URL" >/dev/null 2>&1; then
  echo "[preflight-svn] Falha ao autenticar/acessar SVN_URL com as credenciais fornecidas"
  exit 2
fi

# Se chegou até aqui, as validações de URL, binário e credenciais tiveram sucesso
echo "[preflight-svn] OK: SVN_URL acessível e credenciais válidas"