nodejs(nodeJSInstallationName: env.NODEJS_TOOL_NAME) {
  sh label: 'Build', script: 'bash -lc "bash jenkins/scripts/build.sh"'
}