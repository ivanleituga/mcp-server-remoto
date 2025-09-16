// Stage: Preflight (SVN)
// Este bloco realiza pré-checagens específicas para uso de SVN antes do checkout.
// Valida:
// 1) Parâmetros mínimos obrigatórios (SVN_URL, SVN_CRED_ID).
// 2) Presença do cliente de linha de comando `svn` no agente Jenkins.
// 3) Autenticação e acesso à URL do repositório via credenciais do Jenkins (username/password).
// Em caso de falha em qualquer etapa, interrompe o pipeline imediatamente.
//
// POSSÍVEIS CAUSAS DE ERRO (geral):
// - Variáveis de ambiente não definidas ou vazias (ex.: parâmetro do job não preenchido).
// - Uso de métodos proibidos pela Script Security sandbox (ex.: env.get('X') ou env['X']).
// - Cliente SVN não instalado no agente, ou PATH diferente em shells não interativos.
// - Credenciais inválidas/expiradas no Jenkins (credentialsId errado).
// - Problemas de rede/ACL (firewall, proxy, DNS, porta 443 bloqueada, IP não acessível).
// - Certificado TLS do servidor com issues (autoassinado, hostname diferente), se não tratado no script.
// - URL do repositório incorreta (typo, caminho errado, falta de /trunk, etc.).

echo "[preflight-svn] Iniciando pré-checagens de SVN..."

// Define a lista de variáveis obrigatórias para o preflight de SVN.
// SVN_URL: URL completa do repositório (ex.: https://host/svn/projeto/trunk)
// SVN_CRED_ID: ID das credenciais (tipo "Username with password") cadastradas no Jenkins

// 'missing' recebe os nomes das variáveis que estão ausentes ou vazias.
// ATENÇÃO IMPORTANTE (Script Security):
// - NÃO use env.get('CHAVE') nem env['CHAVE'] (getAt), ambos podem gerar RejectedAccessException.
// - A maneira segura no sandbox é acessar explicitamente as propriedades (env.SVN_URL, env.SVN_CRED_ID).
def missing = []
if (! (env.SVN_URL    ?: '').trim()) missing << 'SVN_URL'
if (! (env.SVN_CRED_ID?: '').trim()) missing << 'SVN_CRED_ID'

// Se houver qualquer variável ausente/vazia, falha com mensagem explícita informando quais são.
// POSSÍVEIS CAUSAS DE ERRO:
// - Parametrização do job faltando.
// - Nome da variável diferente do esperado no Jenkinsfile.
if (missing) {
  error "[preflight-svn] Parâmetros ausentes/vazios: ${missing.join(', ')}"
}

// Verifica se o binário do Subversion está disponível no PATH do agente.
// Usa 'bash -lc' para garantir shell de login (carrega PATH/perfis), redirecionando saída para /dev/null.
// 'label' define o rótulo amigável exibido na UI do Jenkins para esta etapa.
// POSSÍVEIS CAUSAS DE ERRO:
// - Pacote Subversion não instalado no agente.
// - PATH diferente entre shell do Jenkins e shell interativo.
sh label: 'svn --version', script: 'bash -lc "svn --version >/dev/null"'

// Abre um bloco onde as credenciais de SVN são injetadas como variáveis de ambiente temporárias:
// - SVN_USER: usuário extraído da credencial (username)
// - SVN_PASS: senha extraída da credencial (password)
// O 'credentialsId' deve corresponder exatamente a env.SVN_CRED_ID
// POSSÍVEIS CAUSAS DE ERRO:
// - credentialsId inexistente no Jenkins.
// - Tipo de credencial diferente (não é "Username with password").
// - Permissões do job para usar a credencial (folders/ownership) incorretas.
withCredentials([
  usernamePassword(
    credentialsId: env.SVN_CRED_ID,
    usernameVariable: 'SVN_USER',
    passwordVariable: 'SVN_PASS'
  )
]) {
  // Executa o script de preflight específico do projeto.
  // Espera-se que 'jenkins/scripts/preflight-svn.sh' valide autenticação e acesso, por exemplo:
  //   svn --non-interactive --username "$SVN_USER" --password "$SVN_PASS" info "$SVN_URL"
  // O uso de 'bash -lc' mantém consistência com o ambiente de shell e PATH.
  // POSSÍVEIS CAUSAS DE ERRO (dentro do script):
  // - URL inválida (typo, esquema errado, falta de /trunk).
  // - 401/403 por credenciais incorretas ou ACL no repositório/projeto.
  // - Falha de TLS (certificado inválido) se o script não tratar --trust-server-cert.
  // - Timeout/rede (DNS, firewall, proxy).
  sh label: 'Preflight SVN', script: 'bash -lc "bash jenkins/scripts/preflight-svn.sh"'
}

// Se todas as checagens passaram, registra sucesso.
// Até aqui, garantimos: parâmetros presentes, binário `svn` disponível, e credenciais válidas para a URL informada.
echo "[preflight-svn] OK: parâmetros, binário e autenticação SVN verificados."
