// ============================================================================
// Gate de aprovação SEM uso de currentBuild.rawBuild (compatível com Sandbox)
// Estratégia: usar milestones antes e depois do input. Assim, builds antigos
// não avançam se um build mais novo já tiver passado pelo mesmo marco.
// Observação operacional: para que um build mais novo não fique bloqueado
// por um antigo parado no input, NÃO use 'disableConcurrentBuilds()' no pipeline.
// Em vez disso, confie nos 'milestone' + 'timeout' abaixo.
// ============================================================================

// Lê os destinatários a partir de variáveis de ambiente ou parâmetros e remove espaços nas extremidades
def recipientsRaw = (env.APPROVAL_EMAILS ?: params.APPROVAL_EMAILS ?: '').trim()
// Divide por vírgulas (com espaços opcionais) e remove entradas vazias
def recipients = recipientsRaw.split(/\s*,\s*/).findAll { it }
// Falha imediatamente se a lista de destinatários estiver vazia
if (!recipients) { error('APPROVAL_EMAILS vazio') }

// Constrói um changelog simples a partir dos ChangeSets capturados pelo Jenkins
def changeLines = []
for (def cs in currentBuild.changeSets) {
  for (def entry in cs.items) {
    // Para cada alteração, inclui autor e mensagem do commit/changeset
    changeLines << "- ${entry.author} :: ${entry.msg}".toString()
  }
}

// Define o assunto do e-mail de aprovação
def subject = "[PENDING] ${env.JOB_NAME} #${env.BUILD_NUMBER} - Aprovação necessária"
// Mensagem a ser exibida no e-mail e no prompt de aprovação (pode ser sobrescrita via env/params)
def message = (env.APPROVAL_MESSAGE ?: params.APPROVAL_MESSAGE ?: 'Aprovar build e deploy?').trim()
// Rótulo do botão de confirmação no prompt de aprovação
def okLabel = (env.APPROVAL_OK_LABEL ?: params.APPROVAL_OK_LABEL ?: 'Aprovar').trim()
// Timeout (em horas) para a etapa interativa de aprovação
def timeoutHours = ((env.APPROVAL_TIMEOUT_HOURS ?: params.APPROVAL_TIMEOUT_HOURS ?: '2') as Integer)
// Lista de usuários autorizados a aprovar (IDs de login do Jenkins), vazio => qualquer usuário com permissão
def submitters = (env.APPROVAL_SUBMITTERS ?: params.APPROVAL_SUBMITTERS ?: '').trim()

// --------------------------------------------------------------------------
// Marco 10: garante que apenas o build mais novo prossiga a partir daqui.
// Se um build mais novo já tiver passado por este marco, qualquer build mais
// antigo que chegue até aqui será automaticamente abortado.
// Colocado ANTES do envio de e-mail para minimizar notificações de builds obsoletos.
// --------------------------------------------------------------------------
milestone 10

// Envia e-mail de solicitação de aprovação com detalhes do job e mudanças
emailext(
  subject: subject,
  to: recipients.join(','),
  mimeType: 'text/html',
  body: """
<p>${message}</p>
<p><b>Job:</b> ${env.JOB_NAME} #${env.BUILD_NUMBER}</p>
<p><b>URL:</b> <a href="${env.BUILD_URL}">${env.BUILD_URL}</a></p>
<p><b>Changes:</b><br/>${changeLines.isEmpty() ? '(sem changelog disponível)' : changeLines.join('<br/>')}</p>
"""
)

// --------------------------------------------------------------------------
// Etapa interativa com timeout. Se 'submitters' estiver preenchido, restringe
// quem pode aprovar. Enquanto este input aguarda, builds mais novos podem
// executar em paralelo (desde que o pipeline NÃO use disableConcurrentBuilds).
// --------------------------------------------------------------------------
timeout(time: timeoutHours, unit: 'HOURS') {
  if (submitters) {
    // Apenas os usuários listados em 'submitters' podem aprovar
    input message: message, ok: okLabel, submitter: submitters
  } else {
    // Qualquer usuário com permissão pode aprovar
    input message: message, ok: okLabel
  }
}

// --------------------------------------------------------------------------
// Marco 20: proteção pós-input. Se durante a espera surgiu um build mais novo
// que já passou por este marco, este build (mais antigo) será abortado aqui,
// impedindo que continue o deploy mesmo após aprovação tardia.
// --------------------------------------------------------------------------
milestone 20