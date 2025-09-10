pipeline {
  agent { label("${params.AGENT_LABEL}") }
  options { timestamps(); disableConcurrentBuilds(); }
  triggers { pollSCM('H/5 * * * *') }
  
  environment {
    AGENT_LABEL        = "${params.AGENT_LABEL}"
    DEPLOY_HOST        = "${params.DEPLOY_HOST}"
    DEPLOY_USER        = "${params.DEPLOY_USER}"
    DEPLOY_PATH        = "${params.DEPLOY_PATH}"
    NODE_ENV           = "${params.NODE_ENV}"
    PORT               = "${params.PORT}"
    RENDER_EXTERNAL_URL= "${params.RENDER_EXTERNAL_URL}"
    DB_HOST            = "${params.DB_HOST}"
    DB_PORT            = "${params.DB_PORT}"
    DB_NAME            = "${params.DB_NAME}"
    DB_CRED_ID         = "${params.DB_CRED_ID}"
    CI                 = "${params.CI}"
    NODEJS_TOOL_NAME   = "${params.NODEJS_TOOL_NAME}"
    SSH_CRED           = "${params.SSH_CRED}"
    APPROVAL_SUBMITTERS    = "${params.APPROVAL_SUBMITTERS}"
    APPROVAL_EMAILS        = "${params.APPROVAL_EMAILS}"
    APPROVAL_TIMEOUT_HOURS = "${params.APPROVAL_TIMEOUT_HOURS}"
    APPROVAL_MESSAGE       = "${params.APPROVAL_MESSAGE}"
    APPROVAL_OK_LABEL      = "${params.APPROVAL_OK_LABEL}"
  }

stages {
  stage('Checkout')              { steps { script { load 'jenkins/pipeline-checkout.groovy'  } } }
  stage('Preflight')             { steps { script { load 'jenkins/pipeline-preflight.groovy' } } }
  stage('Aprovação')             { steps { script { load 'jenkins/pipeline-approval.groovy'  } }}  
  stage('Build')                 { steps { script { load 'jenkins/pipeline-build.groovy'     } } }
  stage('Empacotar e Deploy')    { steps { script { load 'jenkins/pipeline-deploy.groovy'    } } }
  stage('Inventário')            { steps { script { load 'jenkins/pipeline-inventario.groovy'} } }
  stage('Start/Reload')          { steps { script { load 'jenkins/pipeline-run.groovy' } } }
}
  post { always { cleanWs() } }
}
