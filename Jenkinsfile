pipeline {
  agent { label("${params.AGENT_LABEL}") }
  options { timestamps(); disableConcurrentBuilds() }

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
  }

  stages {
    stage('Preflight')           { steps { script { load 'jenkins/pipeline-preflight.groovy' } } }
    stage('Build')               { steps { script { load 'jenkins/pipeline-build.groovy'     } } }
    stage('Empacotar e Deploy')  { steps { script { load 'jenkins/pipeline-deploy.groovy'    } } }
    stage('Start/Reload & Health'){ steps { script { load 'jenkins/pipeline-run.groovy'      } } }
  }

  post { always { cleanWs() } }
}
