milestone 1

def recipientsRaw = (env.APPROVAL_EMAILS ?: params.APPROVAL_EMAILS ?: '').trim()
def recipients = recipientsRaw.split(/\s*,\s*/).findAll { it }
if (!recipients) { error('APPROVAL_EMAILS vazio') }

def changeLines = []
for (def cs in currentBuild.changeSets) {
  for (def entry in cs.items) {
    changeLines << "- ${entry.author} :: ${entry.msg}".toString()
  }
}

def subject = "[PENDING] ${env.JOB_NAME} #${env.BUILD_NUMBER} - Aprovação necessária"
def message = (env.APPROVAL_MESSAGE ?: params.APPROVAL_MESSAGE ?: 'Aprovar build e deploy?').trim()
def okLabel = (env.APPROVAL_OK_LABEL ?: params.APPROVAL_OK_LABEL ?: 'Aprovar').trim()
def timeoutHours = ((env.APPROVAL_TIMEOUT_HOURS ?: params.APPROVAL_TIMEOUT_HOURS ?: '2') as Integer)
def submitters = (env.APPROVAL_SUBMITTERS ?: params.APPROVAL_SUBMITTERS ?: '').trim()

def bodyHtml = """
<p>${message}</p>
<p><b>Job:</b> ${env.JOB_NAME} #${env.BUILD_NUMBER}</p>
<p><b>URL:</b> <a href="${env.BUILD_URL}">${env.BUILD_URL}</a></p>
<p><b>Changes:</b><br/>${changeLines.isEmpty() ? '(sem changelog disponível)' : changeLines.join('<br/>')}</p>
"""

echo "APPROVAL_EMAILS=${recipients.join(',')}"
emailext(subject: subject, to: recipients.join(','), mimeType: 'text/html', body: bodyHtml)

timeout(time: timeoutHours, unit: 'HOURS') {
  if (submitters) {
    input message: message, ok: okLabel, submitter: submitters
  } else {
    input message: message, ok: okLabel
  }
}
