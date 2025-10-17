const getHomePage = (serverUrl, dbConnected, sessionCount, toolCount) => `
<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <title>MCP Well Database Server | K2 Sistemas</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      
      body { 
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        background: #f7f8fa;
        min-height: 100vh;
      }
      
      .header {
        background: linear-gradient(135deg, #3B5998 0%, #2D4373 100%);
        color: white;
        padding: 24px 40px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        display: flex;
        align-items: center;
        gap: 20px;
      }
      
      .header img {
        height: 48px;
        width: auto;
      }
      
      .header-content {
        flex: 1;
      }
      
      .header h1 { 
        font-size: 1.75rem; 
        font-weight: 600;
        margin-bottom: 4px;
      }
      
      .header .subtitle {
        font-size: 0.95rem;
        opacity: 0.9;
        font-weight: 400;
      }
      
      .container {
        max-width: 1200px;
        margin: 0 auto;
        padding: 40px 20px;
      }
      
      .status-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
        gap: 20px;
        margin-bottom: 40px;
      }
      
      .status-card {
        background: white;
        padding: 24px;
        border-radius: 8px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.06);
        border-left: 4px solid #3B5998;
      }
      
      .status-card .label {
        font-size: 0.875rem;
        color: #6b7280;
        margin-bottom: 8px;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      
      .status-card .value {
        font-size: 1.5rem;
        color: #1a202c;
        font-weight: 600;
      }
      
      .status-card .value.connected {
        color: #10b981;
      }
      
      .status-card .value.disconnected {
        color: #ef4444;
      }
      
      .section {
        background: white;
        border-radius: 8px;
        padding: 32px;
        margin-bottom: 24px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.06);
      }
      
      .section h2 {
        font-size: 1.25rem;
        color: #1a202c;
        margin-bottom: 20px;
        padding-bottom: 12px;
        border-bottom: 2px solid #e5e7eb;
      }
      
      .endpoint-list {
        list-style: none;
      }
      
      .endpoint-list li {
        padding: 12px 0;
        border-bottom: 1px solid #f3f4f6;
      }
      
      .endpoint-list li:last-child {
        border-bottom: none;
      }
      
      .endpoint-list a {
        color: #3B5998;
        text-decoration: none;
        font-weight: 500;
        transition: color 0.2s;
      }
      
      .endpoint-list a:hover {
        color: #2D4373;
        text-decoration: underline;
      }
      
      code {
        background: #f3f4f6;
        padding: 4px 8px;
        border-radius: 4px;
        font-family: 'Courier New', monospace;
        font-size: 0.9rem;
        color: #1a202c;
      }
      
      .mcp-endpoint {
        background: #eff6ff;
        border: 1px solid #bfdbfe;
        padding: 16px;
        border-radius: 6px;
        margin-top: 16px;
      }
      
      .mcp-endpoint code {
        background: white;
        border: 1px solid #dbeafe;
        padding: 8px 12px;
        display: block;
        margin-top: 8px;
      }
      
      .footer {
        text-align: center;
        padding: 24px;
        color: #6b7280;
        font-size: 0.875rem;
      }
    </style>
  </head>
  <body>
    <div class="header">
      <img src="/utils/logo-k2.png" alt="K2 Sistemas" onerror="this.style.display='none'">
      <div class="header-content">
        <h1>MCP Well Database Server</h1>
      </div>
    </div>
    
    <div class="container">
      <div class="status-grid">
        <div class="status-card">
          <div class="label">Servidor</div>
          <div class="value">${serverUrl.replace("https://", "").replace("http://", "")}</div>
        </div>
        
        <div class="status-card">
          <div class="label">Database</div>
          <div class="value ${dbConnected ? "connected" : "disconnected"}">${dbConnected ? "Conectado" : "Desconectado"}</div>
        </div>
        
        <div class="status-card">
          <div class="label">Sessões MCP</div>
          <div class="value">${sessionCount}</div>
        </div>
        
        <div class="status-card">
          <div class="label">Ferramentas</div>
          <div class="value">${toolCount}</div>
        </div>
      </div>
      
      <div class="section">
        <ul class="endpoint-list">
          <li><a href="/docs">Documentação da API</a></li>
          <li><a href="/health">Health Check</a></li>
        </ul>
      </div>
      
      <div class="section">
        <h2>Conectar com Claude/ChatGPT</h2>
        <p>Use o endpoint MCP para conectar assistentes de IA:</p>
        <div class="mcp-endpoint">
          <strong>Endpoint MCP:</strong>
          <code>${serverUrl}/mcp</code>
        </div>
      </div>
    </div>
    
    <div class="footer">
      &copy; 2025 K2 Sistemas
    </div>
  </body>
</html>
`;

const getUnifiedAuthPage = (client, params, error = null) => {
  const client_name = client.client_name || "Aplicação Desconhecida";
  const scope = params.scope || "mcp";
  
  return `
<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <title>Autenticação | K2 Sistemas</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      
      body { 
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        background: #f7f8fa;
        min-height: 100vh;
        display: flex;
        flex-direction: column;
      }
      
      .header {
        background: linear-gradient(135deg, #3B5998 0%, #2D4373 100%);
        color: white;
        padding: 20px 40px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        display: flex;
        align-items: center;
        gap: 16px;
      }
      
      .header img {
        height: 40px;
        width: auto;
      }
      
      .header h1 {
        font-size: 1.5rem;
        font-weight: 600;
      }
      
      .content {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 40px 20px;
      }
      
      .auth-container {
        background: white;
        border-radius: 8px;
        padding: 40px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        max-width: 480px;
        width: 100%;
      }
      
      .auth-title {
        font-size: 1.75rem;
        color: #1a202c;
        margin-bottom: 8px;
        font-weight: 600;
      }
      
      .auth-subtitle {
        color: #6b7280;
        margin-bottom: 32px;
        font-size: 0.95rem;
      }
      
      .app-info {
        background: #f0f9ff;
        border-left: 4px solid #3B5998;
        padding: 16px;
        border-radius: 6px;
        margin-bottom: 24px;
      }
      
      .app-info strong {
        color: #3B5998;
        font-size: 1.125rem;
        display: block;
        margin-bottom: 4px;
      }
      
      .app-info p {
        color: #4b5563;
        font-size: 0.9rem;
      }
      
      .permissions {
        background: #fef3c7;
        border-left: 4px solid #f59e0b;
        padding: 16px;
        border-radius: 6px;
        margin-bottom: 24px;
      }
      
      .permissions strong {
        color: #92400e;
        display: block;
        margin-bottom: 8px;
        font-size: 0.95rem;
      }
      
      .permissions ul {
        margin-left: 20px;
        color: #78350f;
      }
      
      .permissions li {
        margin: 4px 0;
        font-size: 0.875rem;
      }
      
      .form-group {
        margin-bottom: 20px;
      }
      
      label {
        display: block;
        font-weight: 600;
        margin-bottom: 8px;
        color: #374151;
        font-size: 0.9rem;
      }
      
      input[type="text"],
      input[type="password"] {
        width: 100%;
        padding: 12px;
        border: 2px solid #e5e7eb;
        border-radius: 6px;
        font-size: 1rem;
        transition: border-color 0.2s, box-shadow 0.2s;
      }
      
      input:focus {
        outline: none;
        border-color: #3B5998;
        box-shadow: 0 0 0 3px rgba(59, 89, 152, 0.1);
      }
      
      .error {
        background: #fee2e2;
        color: #dc2626;
        padding: 12px 16px;
        border-radius: 6px;
        margin-bottom: 20px;
        border-left: 4px solid #dc2626;
        font-size: 0.9rem;
      }
      
      .buttons {
        display: flex;
        gap: 12px;
        margin-top: 24px;
      }
      
      button {
        flex: 1;
        padding: 12px;
        border: none;
        border-radius: 6px;
        font-size: 1rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
      }
      
      .approve {
        background: #3B5998;
        color: white;
      }
      
      .approve:hover {
        background: #2D4373;
        transform: translateY(-1px);
        box-shadow: 0 4px 8px rgba(59, 89, 152, 0.3);
      }
      
      .approve:active {
        transform: translateY(0);
      }
      
      .deny {
        background: #f3f4f6;
        color: #374151;
        border: 2px solid #e5e7eb;
      }
      
      .deny:hover {
        background: #e5e7eb;
      }
      
      .footer {
        text-align: center;
        padding: 20px;
        color: #6b7280;
        font-size: 0.875rem;
      }
    </style>
  </head>
  <body>
    <div class="header">
      <img src="/utils/logo-k2.png" alt="K2 Sistemas" onerror="this.style.display='none'">
      <h1>Autenticação OAuth</h1>
    </div>
    
    <div class="content">
      <div class="auth-container">
        <h2 class="auth-title">Autorização Necessária</h2>
        <p class="auth-subtitle">Faça login para autorizar o acesso</p>
        
        ${error ? `<div class="error">${error}</div>` : ""}
        
        <div class="app-info">
          <strong>${client_name}</strong>
          <p>está solicitando acesso aos seus dados de poços</p>
        </div>
        
        <div class="permissions">
          <strong>Permissões Solicitadas</strong>
          <ul>
            <li>Consultar dados geológicos de poços</li>
            <li>Acessar ferramentas MCP (${scope})</li>
            <li>Ler informações do banco de dados</li>
          </ul>
        </div>
        
        <form method="POST" action="/oauth/authorize">
          <div class="form-group">
            <label for="username">Usuário</label>
            <input 
              type="text" 
              id="username"
              name="username" 
              value="${params.username || ""}"
              required 
              autofocus
              autocomplete="username"
              placeholder="Digite seu usuário"
            >
          </div>
          
          <div class="form-group">
            <label for="password">Senha</label>
            <input 
              type="password" 
              id="password"
              name="password" 
              required
              autocomplete="current-password"
              placeholder="Digite sua senha"
            >
          </div>
          
          <input type="hidden" name="client_id" value="${params.client_id}">
          <input type="hidden" name="redirect_uri" value="${params.redirect_uri}">
          <input type="hidden" name="response_type" value="${params.response_type || "code"}">
          <input type="hidden" name="scope" value="${scope}">
          ${params.state ? `<input type="hidden" name="state" value="${params.state}">` : ""}
          ${params.code_challenge ? `<input type="hidden" name="code_challenge" value="${params.code_challenge}">` : ""}
          ${params.code_challenge_method ? `<input type="hidden" name="code_challenge_method" value="${params.code_challenge_method}">` : ""}
          
          <div class="buttons">
            <button type="submit" name="action" value="approve" class="approve">
              Aprovar e Entrar
            </button>
            <button type="submit" name="action" value="deny" class="deny">
              Negar
            </button>
          </div>
        </form>
      </div>
    </div>
    
    <div class="footer">
      &copy; 2025 K2 Sistemas
    </div>
  </body>
</html>
  `;
};

const getDocsPage = (config) => `
<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <title>Documentação da API | K2 Sistemas</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      
      body { 
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        background: #f7f8fa;
        line-height: 1.6;
      }
      
      .header {
        background: linear-gradient(135deg, #3B5998 0%, #2D4373 100%);
        color: white;
        padding: 24px 40px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        display: flex;
        align-items: center;
        gap: 20px;
      }
      
      .header img {
        height: 48px;
        width: auto;
      }
      
      .header-content h1 {
        font-size: 1.75rem;
        font-weight: 600;
        margin-bottom: 4px;
      }
      
      .header-content .subtitle {
        font-size: 0.95rem;
        opacity: 0.9;
      }
      
      .container {
        max-width: 1200px;
        margin: 0 auto;
        padding: 40px 20px;
      }
      
      .section {
        background: white;
        border-radius: 8px;
        padding: 32px;
        margin-bottom: 24px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.06);
      }
      
      h2 {
        color: #1a202c;
        font-size: 1.5rem;
        margin-bottom: 16px;
        padding-bottom: 12px;
        border-bottom: 2px solid #e5e7eb;
      }
      
      h3 {
        color: #374151;
        font-size: 1.125rem;
        margin: 24px 0 12px 0;
      }
      
      code {
        background: #f3f4f6;
        padding: 4px 8px;
        border-radius: 4px;
        font-family: 'Courier New', monospace;
        font-size: 0.9rem;
        color: #1a202c;
      }
      
      pre {
        background: #1a202c;
        color: #e5e7eb;
        padding: 20px;
        border-radius: 8px;
        overflow-x: auto;
        margin: 16px 0;
        font-family: 'Courier New', monospace;
        font-size: 0.875rem;
        line-height: 1.5;
      }
      
      .endpoint {
        background: #f0f9ff;
        border-left: 4px solid #3B5998;
        padding: 16px;
        margin: 16px 0;
        border-radius: 6px;
      }
      
      .method {
        display: inline-block;
        font-weight: 700;
        color: white;
        padding: 4px 12px;
        border-radius: 4px;
        font-size: 0.875rem;
        margin-right: 10px;
        text-transform: uppercase;
      }
      
      .method.get { background: #3B5998; }
      .method.post { background: #10b981; }
      .method.delete { background: #ef4444; }
      
      .endpoint p {
        color: #4b5563;
        margin-top: 8px;
        font-size: 0.9rem;
      }
      
      .info-box {
        background: #fef3c7;
        border-left: 4px solid #f59e0b;
        padding: 16px;
        border-radius: 6px;
        margin: 20px 0;
      }
      
      .info-box strong {
        color: #92400e;
        display: block;
        margin-bottom: 8px;
      }
      
      .info-box p {
        color: #78350f;
        font-size: 0.9rem;
      }
      
      .footer {
        text-align: center;
        padding: 24px;
        color: #6b7280;
        font-size: 0.875rem;
      }
      
      ul {
        margin-left: 20px;
        color: #4b5563;
      }
      
      li {
        margin: 8px 0;
      }
      
      a {
        color: #3B5998;
        text-decoration: none;
        font-weight: 500;
      }
      
      a:hover {
        text-decoration: underline;
      }
    </style>
  </head>
  <body>
    <div class="header">
      <img src="/utils/logo-k2.png" alt="K2 Sistemas" onerror="this.style.display='none'">
      <div class="header-content">
        <h1>Documentação da API OAuth MCP</h1>
      </div>
    </div>
    
    <div class="container">
      <div class="section">
        <h2>Visão Geral</h2>
        <p>Este servidor implementa um fluxo OAuth 2.1 simplificado para o Model Context Protocol (MCP). O login e a autorização acontecem em uma única etapa, sem necessidade de sessões.</p>
        
        <div class="info-box">
          <strong>Diferencial Principal</strong>
          <p>Esta implementação combina login e autorização em uma única página, eliminando a necessidade de cookies de sessão. Os códigos de autorização são armazenados em memória para máximo desempenho.</p>
        </div>
      </div>
      
      <div class="section">
        <h2>Endpoints de Descoberta</h2>
        
        <div class="endpoint">
          <span class="method get">GET</span> <code>/.well-known/oauth-authorization-server</code>
          <p>OAuth 2.1 Authorization Server Metadata - descoberto automaticamente por clientes MCP</p>
        </div>
        
        <div class="endpoint">
          <span class="method get">GET</span> <code>/.well-known/oauth-protected-resource</code>
          <p>Protected Resource Metadata</p>
        </div>
      </div>
      
      <div class="section">
        <h2>Fluxo OAuth</h2>
        
        <div class="endpoint">
          <span class="method post">POST</span> <code>/oauth/register</code>
          <p>Dynamic Client Registration - Claude/ChatGPT se auto-registram</p>
        </div>
        
        <div class="endpoint">
          <span class="method get">GET</span> <code>/oauth/authorize</code>
          <p>Exibe página unificada de login e autorização (etapa única)</p>
        </div>
        
        <div class="endpoint">
          <span class="method post">POST</span> <code>/oauth/authorize</code>
          <p>Processa login + autorização e retorna código de autorização</p>
        </div>
        
        <div class="endpoint">
          <span class="method post">POST</span> <code>/oauth/token</code>
          <p>Troca código de autorização por access/refresh tokens</p>
        </div>
        
        <div class="endpoint">
          <span class="method post">POST</span> <code>/oauth/revoke</code>
          <p>Revoga access ou refresh tokens</p>
        </div>
      </div>
      
      <div class="section">
        <h2>Protocolo MCP</h2>
        
        <div class="endpoint">
          <span class="method post">POST</span> <code>/mcp</code>
          <p>Model Context Protocol endpoint - requer autenticação Bearer token</p>
        </div>
        
        <div class="endpoint">
          <span class="method delete">DELETE</span> <code>/mcp</code>
          <p>Limpeza de sessão MCP (desconexão graciosa)</p>
        </div>
      </div>
      
      <div class="section">
        <h2>Configuração do Servidor</h2>
        <pre>URL do Servidor: ${config.SERVER_URL}
          Expiração de Token: ${config.TOKEN_EXPIRY / 1000} segundos (${config.TOKEN_EXPIRY / 60000} minutos)
          Expiração de Código: ${config.CODE_EXPIRY / 1000} segundos (${config.CODE_EXPIRY / 60000} minutos)
          Fluxo OAuth: Simplificado (sem sessões)
          Armazenamento: PostgreSQL (tokens) + Memória (códigos)
        </pre>
      </div>
      
      <div class="section">
        <h2>Endpoints de Status</h2>
        <ul>
          <li><a href="/health">/health</a> - Verificação de saúde do servidor</li>
          <li><a href="/">/</a> - Página inicial com status do sistema</li>
        </ul>
      </div>
    </div>
    
    <div class="footer">
      &copy; 2025 K2 Sistemas
    </div>
  </body>
</html>
`;

module.exports = {
  getHomePage,
  getUnifiedAuthPage,
  getDocsPage
};