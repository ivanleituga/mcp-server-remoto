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
        font-size: 1.05rem;
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
        font-size: 1.3rem;
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
        color: #374151;
        margin-bottom: 8px;
        font-size: 0.95rem;
      }
      
      input[type="text"],
      input[type="password"] {
        width: 100%;
        padding: 12px 16px;
        border: 1px solid #d1d5db;
        border-radius: 6px;
        font-size: 1rem;
        transition: border 0.2s;
        font-family: inherit;
      }
      
      input[type="text"]:focus,
      input[type="password"]:focus {
        outline: none;
        border-color: #3B5998;
        box-shadow: 0 0 0 3px rgba(59, 89, 152, 0.1);
      }
      
      .buttons {
        margin-top: 24px;
        display: flex;
        gap: 12px;
      }
      
      button {
        flex: 1;
        padding: 12px 24px;
        font-size: 1rem;
        font-weight: 600;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.2s;
        font-family: inherit;
      }
      
      .approve {
        background: #3B5998;
        color: white;
      }
      
      .approve:hover {
        background: #2D4373;
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(59, 89, 152, 0.3);
      }
      
      .error-message {
        background: #fee2e2;
        border-left: 4px solid #ef4444;
        color: #991b1b;
        padding: 12px 16px;
        border-radius: 6px;
        margin-bottom: 20px;
        font-size: 0.9rem;
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
      <h1>K2 Sistemas</h1>
    </div>
    
    <div class="content">
      <div class="auth-container">
        <h1 class="auth-title">Autorização Necessária</h1>
        <p class="auth-subtitle">Faça login e autorize o acesso</p>
        
        <div class="app-info">
          <strong>${client_name}</strong>
          <p>está solicitando acesso ao servidor MCP</p>
        </div>
        
        <div class="permissions">
          <strong>Permissões solicitadas:</strong>
          <ul>
            <li>Consultar dados de poços</li>
            <li>Acessar informações de bacias</li>
            <li>Recuperar perfis e curvas</li>
          </ul>
        </div>
        
        ${error ? `<div class="error-message">${error}</div>` : ""}
        
        <form method="POST" action="/oauth/authorize">
          <div class="form-group">
            <label for="username">Usuário</label>
            <input type="text" id="username" name="username" required autofocus>
          </div>
          
          <div class="form-group">
            <label for="password">Senha</label>
            <input type="password" id="password" name="password" required>
          </div>
          
          <input type="hidden" name="client_id" value="${params.client_id}">
          <input type="hidden" name="redirect_uri" value="${params.redirect_uri}">
          <input type="hidden" name="scope" value="${params.scope}">
          ${params.state ? `<input type="hidden" name="state" value="${params.state}">` : ""}
          ${params.code_challenge ? `<input type="hidden" name="code_challenge" value="${params.code_challenge}">` : ""}
          ${params.code_challenge_method ? `<input type="hidden" name="code_challenge_method" value="${params.code_challenge_method}">` : ""}
          
          <div class="buttons">
            <button type="submit" name="action" value="approve" class="approve">
              Aprovar e Entrar
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

const getDocsPage = () => `
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
        <h1>Documentação</h1>
      </div>
    </div>
    
    <div class="container">
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
    </div>
    
    <div class="footer">
      &copy; 2025 K2 Sistemas
    </div>
  </body>
</html>
`;

const getMcpTutorialPage = () => `
<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <title>Conexão e uso do servidor MCP - K2 Sistemas</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      
      html {
        scroll-behavior: smooth;
      }
      
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
      }
      
      .container {
        max-width: 1200px;
        margin: 0 auto;
        padding: 40px 20px;
      }
      
      .intro {
        background: white;
        border-radius: 8px;
        padding: 32px;
        margin-bottom: 24px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.06);
        text-align: center;
      }
      
      .intro h2 {
        color: #1a202c;
        font-size: 1.75rem;
        margin-bottom: 16px;
        font-weight: 700;
      }
      
      .intro p {
        color: #4b5563;
        font-size: 1.05rem;
        line-height: 1.7;
      }
      
      .nav-buttons {
        display: flex;
        gap: 16px;
        justify-content: center;
        margin-bottom: 24px;
      }
      
      .nav-button {
        background: white;
        color: #3B5998;
        border: 2px solid #3B5998;
        padding: 14px 32px;
        border-radius: 8px;
        font-size: 1rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        text-decoration: none;
        display: inline-block;
      }
      
      .nav-button:hover {
        background: #3B5998;
        color: white;
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(59, 89, 152, 0.3);
      }
      
      @media (max-width: 600px) {
        .nav-buttons {
          flex-direction: column;
        }
        
        .nav-button {
          width: 100%;
          text-align: center;
        }
      }
      
      .disclaimer {
        background: #fee2e2;
        border-left: 4px solid #dc2626;
        padding: 20px;
        margin-bottom: 24px;
        border-radius: 6px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.06);
      }
      
      .disclaimer-title {
        font-weight: 700;
        color: #991b1b;
        font-size: 1.125rem;
        margin-bottom: 8px;
      }
      
      .disclaimer p {
        color: #991b1b;
        font-size: 1rem;
        line-height: 1.6;
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
      
      .step {
        background: #f9fafb;
        border-left: 4px solid #3B5998;
        padding: 20px;
        margin: 16px 0;
        border-radius: 6px;
      }
      
      .step-number {
        display: inline-block;
        background: #3B5998;
        color: white;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        text-align: center;
        line-height: 32px;
        font-weight: 700;
        margin-right: 12px;
      }
      
      .step-title {
        font-size: 1.125rem;
        font-weight: 600;
        color: #1a202c;
        margin-bottom: 12px;
      }
      
      .step p {
        color: #4b5563;
        margin: 8px 0;
        padding-left: 44px;
      }
      
      .success {
        background: #d1fae5;
        border-left: 4px solid #10b981;
        padding: 16px;
        margin: 16px 0;
        border-radius: 6px;
      }
      
      .success-title {
        font-weight: 700;
        color: #065f46;
        margin-bottom: 8px;
      }
      
      .success p {
        color: #047857;
      }
      
      .feature-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
        gap: 20px;
        margin: 24px 0;
      }
      
      .feature-card {
        background: white;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        padding: 24px;
        transition: transform 0.2s, box-shadow 0.2s, border-color 0.2s;
        border-left: 4px solid #3B5998;
      }
      
      .feature-card:hover {
        transform: translateY(-4px);
        box-shadow: 0 8px 16px rgba(0,0,0,0.08);
        border-left-color: #2D4373;
      }
      
      .feature-icon {
        display: none;
      }
      
      .feature-title {
        font-weight: 700;
        color: #1a202c;
        font-size: 1.125rem;
        margin-bottom: 12px;
        padding-bottom: 8px;
        border-bottom: 2px solid #e5e7eb;
      }
      
      .feature-desc {
        color: #4b5563;
        font-size: 0.95rem;
        line-height: 1.6;
        margin-bottom: 12px;
      }
      
      .feature-examples {
        background: #f9fafb;
        padding: 16px;
        border-radius: 4px;
        margin-top: 16px;
      }
      
      .feature-examples-title {
        font-weight: 600;
        color: #3B5998;
        font-size: 0.875rem;
        margin-bottom: 10px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      
      .feature-examples ul {
        margin-left: 20px;
        color: #4b5563;
        font-size: 0.9rem;
      }
      
      .feature-examples li {
        margin: 4px 0;
      }
      
      .special-features {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 24px;
        margin: 40px auto;
        max-width: 900px;
      }
      
      .special-card {
        background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
        border: 1px solid #bae6fd;
        border-left: 4px solid #0284c7;
        padding: 28px;
        border-radius: 8px;
        transition: transform 0.2s, box-shadow 0.2s;
      }
      
      .special-card:hover {
        transform: translateY(-4px);
        box-shadow: 0 8px 20px rgba(2, 132, 199, 0.15);
      }
      
      .special-icon {
        display: none;
      }
      
      .special-title {
        font-weight: 700;
        color: #0c4a6e;
        font-size: 1.25rem;
        margin-bottom: 16px;
        padding-bottom: 12px;
        border-bottom: 2px solid #bae6fd;
      }
      
      .special-desc {
        color: #0c4a6e;
        line-height: 1.7;
        font-size: 0.95rem;
      }
      
      @media (max-width: 768px) {
        .special-features {
          grid-template-columns: 1fr;
        }
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
        <h1>Conexão e uso do servidor MCP da K2 Sistemas</h1>
      </div>
    </div>
    
    <div class="container">
      <div class="intro">
        <h2>Acesso Integrado aos Dados Geológicos da ANP</h2>
        <p>
          Este servidor permite que o ChatGPT acesse e analise dados geológicos de poços de petróleo das bacias brasileiras, 
          incluindo informações detalhadas dos arquivos oficiais da ANP (Agência Nacional do Petróleo).
        </p>
      </div>
      
      <div class="nav-buttons">
        <a href="#primeiros-passos" class="nav-button">Primeiros Passos</a>
        <a href="#funcionalidades" class="nav-button">Funcionalidades Disponíveis</a>
      </div>
      
      <div class="disclaimer">
        <div class="disclaimer-title">⚠️ Requisito Importante</div>
        <p>Para ter acesso à essa funcionalidade, você precisa ter o plano plus ou superior do ChatGPT.</p>
      </div>
      
      <div class="section" id="primeiros-passos">
        <h2>Primeiros Passos - Cerca de 1 minuto</h2>
        
        <div class="step">
          <div class="step-title">
            <span class="step-number">1</span>
            Abra as configurações do ChatGPT
          </div>
          <p>
            Clique no seu perfil (canto inferior esquerdo) e selecione <strong>Configurações</strong>.
          </p>
        </div>
        
        <div class="step">
          <div class="step-title">
            <span class="step-number">2</span>
            Ative o modo de desenvolvedor 
          </div>
          <p>
            Na aba de configurações, vá em <strong>Aplicativos e Conectores</strong>, desça até <strong>Configurações Avançadas</strong> e ligue o modo de desenvolvedor
             e clique em voltar.
          </p>
        </div>
        
        <div class="step">
          <div class="step-title">
            <span class="step-number">3</span>
            Adicione o servidor K2
          </div>
          <p>Na aba de Aplicativos e Conectores, clique em <strong>Criar</strong> (canto superior direito). Preencha o nome com <strong>Bacias Terrestres K2</strong>,
           A URL do servidor MCP com <strong>https://mcp.k2sistemas.com.br/mcp</strong>, selecione <strong>"Entendi e quero continuar"</strong> e, em seguida, 
           clique em <strong>Criar</strong> (canto inferior direito). Aguarde alguns segundos e a tela de login aparecerá.
          </p>
        </div>
        
        <div class="step">
          <div class="step-title">
            <span class="step-number">4</span>
            Faça o login
          </div>
          <p>
            Em <strong>Usuário</strong>, use <strong>k2sistemas</strong> e em <strong>Senha</strong>, use <strong>mcpteste</strong>. 
            Clique em <strong>Aprovar e Entrar</strong>.
          </p>
        </div>
        
        <div class="step">
          <div class="step-title">
            <span class="step-number">5</span>
            Último passo
          </div>
          <p>
            Na página principal, clique em <strong>Novo Chat</strong> para criar uma nova conversa. Clique no ícone "<strong style="font-size: 24px;">+</strong>", 
            vá em <strong>Mais</strong> e clique em <strong>Bacias Terrestres K2</strong>.
          </p>
        </div>
        
        <div class="success">
          <div class="success-title">Conexão Estabelecida</div>
          <p>
            O ChatGPT agora pode acessar os nossos dados e funcionalidades nessa conversa!
          </p>
        </div>
      </div>
      
      <div class="section" id="funcionalidades">
        <h2>Funcionalidades Disponíveis</h2>
        
        <p style="color: #4b5563; margin-bottom: 20px;">
          O servidor fornece acesso completo aos dados oficiais da ANP sobre poços exploratórios e produtores 
          das bacias sedimentares brasileiras. Veja o que você pode consultar:
        </p>
        
        <div class="feature-grid">
          <div class="feature-card">
            <div class="feature-title">Informações Gerais dos Poços</div>
            <div class="feature-desc">
              Dados cadastrais completos incluindo localização, coordenadas, operadoras, datas de perfuração, 
              profundidades alcançadas, classificação do poço e histórico operacional.
            </div>
            <div class="feature-examples">
              <div class="feature-examples-title">Exemplos de Consultas</div>
              <ul>
                <li>"Quais poços foram perfurados pela Petrobras na Bacia de Campos?"</li>
                <li>"Mostre poços com profundidade superior a 5000 metros"</li>
                <li>"Liste poços perfurados em 2020 na região offshore"</li>
              </ul>
            </div>
          </div>
          
          <div class="feature-card">
            <div class="feature-title">Descrição Litológica Detalhada</div>
            <div class="feature-desc">
              Informações completas sobre as rochas atravessadas: tipos de rocha, cores, tonalidades, granulometria, 
              arredondamento, intervalos de profundidade e características petrográficas.
            </div>
            <div class="feature-examples">
              <div class="feature-examples-title">Exemplos de Consultas</div>
              <ul>
                <li>"Qual a litologia do poço 1-RJS-628A?"</li>
                <li>"Encontre intervalos de arenito no poço X"</li>
                <li>"Mostre a sequência de rochas entre 2000m e 3000m"</li>
              </ul>
            </div>
          </div>
          
          <div class="feature-card">
            <div class="feature-title">Testes de Formação</div>
            <div class="feature-desc">
              Dados completos de testes realizados: pressões medidas, vazões, fluidos recuperados (óleo, gás, água), 
              períodos de fluxo e estática, análises de amostras e interpretações.
            </div>
            <div class="feature-examples">
              <div class="feature-examples-title">Exemplos de Consultas</div>
              <ul>
                <li>"Quais testes de formação foram realizados no poço Y?"</li>
                <li>"Mostre as pressões medidas e fluidos recuperados"</li>
                <li>"Qual a vazão de óleo obtida nos testes?"</li>
              </ul>
            </div>
          </div>
          
          <div class="feature-card">
            <div class="feature-title">Indícios de Hidrocarbonetos</div>
            <div class="feature-desc">
              Registros de evidências de petróleo e gás: tipo de indício, fluorescência, corte em lama, 
              análise de gás, modo de ocorrência, intervalos afetados e características dos indícios.
            </div>
            <div class="feature-examples">
              <div class="feature-examples-title">Exemplos de Consultas</div>
              <ul>
                <li>"Houve indícios de hidrocarbonetos no poço Z?"</li>
                <li>"Mostre os intervalos onde o modo de ocorrência é 'mancha'"</li>
                <li>"Mostre os resultados de análise de gás"</li>
              </ul>
            </div>
          </div>
          
          <div class="feature-card">
            <div class="feature-title">Zonas Reservatório e Intervalos Produtores</div>
            <div class="feature-desc">
              Interpretações de zonas com potencial produtivo: porosidade, permeabilidade, saturação de água e 
              hidrocarbonetos, espessuras úteis, pressões de poros e características petrofísicas.
            </div>
            <div class="feature-examples">
              <div class="feature-examples-title">Exemplos de Consultas</div>
              <ul>
                <li>"Quais as zonas reservatório identificadas no poço?"</li>
                <li>"Mostre porosidade e saturação dos intervalos produtores"</li>
                <li>"Qual a espessura porosa de hidrocarbonetos?"</li>
              </ul>
            </div>
          </div>
          
          <div class="feature-card">
            <div class="feature-title">Formações Geológicas e Estratigrafia</div>
            <div class="feature-desc">
              Identificação das unidades estratigráficas atravessadas: formações, membros, topos e bases, 
              idades geológicas, correlações estratigráficas e interpretações bioestratigráficas.
            </div>
            <div class="feature-examples">
              <div class="feature-examples-title">Exemplos de Consultas</div>
              <ul>
                <li>"Quais formações foram atravessadas no poço?"</li>
                <li>"Em que profundidade está o topo da Formação Namorado?"</li>
                <li>"Mostre a coluna estratigráfica do poço"</li>
              </ul>
            </div>
          </div>
        </div>
        
        <div class="special-features">
          <div class="special-card">
            <div class="special-title">Visualização de Perfis Compostos</div>
            <div class="special-desc">
              <p style="margin-bottom: 12px;">
                <strong>O servidor gera links interativos para visualização de perfis geofísicos.</strong> 
                Você pode solicitar a criação de perfis compostos personalizados combinando até 3 curvas de perfilagem 
                (como Raios Gama, Sônico, Resistividade, Densidade, Neutrão, Caliper, etc.) junto com a coluna litológica do poço.
              </p>
              <p style="margin-bottom: 12px;">
                <strong>Exemplo de solicitação:</strong> "Gere um perfil composto do poço 3-BRSA-1285-RJS com as curvas 
                de Raios Gama, Resistividade e Sônico, incluindo a litologia"
              </p>
              <p>
                O sistema verifica automaticamente quais curvas estão disponíveis para cada poço e cria um link 
                direto para o visualizador gráfico interativo.
              </p>
            </div>
          </div>
          
          <div class="special-card">
            <div class="special-title">Acesso aos Dados DLIS</div>
            <div class="special-desc">
              <p style="margin-bottom: 12px;">
                <strong>Metadados completos dos arquivos DLIS</strong> (Digital Log Information Standard), 
                incluindo informações sobre todas as curvas de perfilagem disponíveis: nomes das curvas, 
                unidades de medida, intervalos de profundidade, espaçamento, datas de aquisição e categorias.
              </p>
              <p>
                Você pode consultar quais curvas estão disponíveis para cada poço e até mesmo acessar os dados 
                brutos de profundidade versus valores medidos para análises específicas.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <div class="footer">
      © 2025 K2 Sistemas
    </div>
  </body>
</html>
`;

module.exports = {
  getHomePage,
  getUnifiedAuthPage,
  getDocsPage,
  getMcpTutorialPage
};