const getHomePage = (serverUrl, dbConnected, sessionCount, toolCount) => `
<!DOCTYPE html>
<html>
  <head>
    <title>MCP Well Database Server</title>
    <meta charset="utf-8">
    <style>
      body { font-family: system-ui, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
      h1 { color: #333; }
      .status { background: #f0f0f0; padding: 15px; border-radius: 5px; margin: 20px 0; }
      .status-item { margin: 10px 0; }
      code { background: #e8e8e8; padding: 2px 6px; border-radius: 3px; }
      a { color: #0066cc; }
    </style>
  </head>
  <body>
    <h1>🔧 MCP Well Database Server</h1>
    <p>OAuth-protected Model Context Protocol server for geological well data.</p>
    
    <div class="status">
      <div class="status-item">🌐 Server: <strong>${serverUrl}</strong></div>
      <div class="status-item">📊 Database: <strong>${dbConnected ? "✅ Connected" : "❌ Disconnected"}</strong></div>
      <div class="status-item">🔌 MCP Sessions: <strong>${sessionCount}</strong></div>
      <div class="status-item">🔧 Tools Available: <strong>${toolCount}</strong></div>
    </div>
    
    <h2>Endpoints</h2>
    <ul>
      <li><a href="/.well-known/oauth-authorization-server">OAuth Discovery</a></li>
      <li><a href="/oauth/status">OAuth Status</a></li>
      <li><a href="/docs">Documentation</a></li>
      <li><a href="/health">Health Check</a></li>
    </ul>
    
    <h2>Connect with Claude/ChatGPT</h2>
    <p>Use the MCP endpoint: <code>${serverUrl}/mcp</code></p>
  </body>
</html>
`;

const getUnifiedAuthPage = (client, params, error = null) => {
  const client_name = client.client_name || "Unknown Application";
  const scope = params.scope || "mcp";
  
  return `
<!DOCTYPE html>
<html>
  <head>
    <title>Login & Authorization</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { 
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
      }
      .container {
        background: white;
        border-radius: 16px;
        padding: 40px;
        box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        max-width: 450px;
        width: 100%;
      }
      h1 { 
        font-size: 1.75rem; 
        margin-bottom: 0.5rem; 
        color: #1a202c; 
      }
      .subtitle { 
        color: #718096; 
        margin-bottom: 2rem; 
        font-size: 0.95rem;
      }
      .app-info {
        background: #f7fafc;
        border-left: 4px solid #3b82f6;
        padding: 1rem;
        border-radius: 8px;
        margin: 1.5rem 0;
      }
      .app-info strong { 
        color: #3b82f6; 
        font-size: 1.125rem; 
        display: block;
        margin-bottom: 0.25rem;
      }
      .app-info p {
        color: #4a5568;
        font-size: 0.875rem;
      }
      .permissions {
        background: #eff6ff;
        border: 1px solid #bfdbfe;
        padding: 1rem;
        border-radius: 8px;
        margin: 1rem 0;
      }
      .permissions strong {
        color: #1e40af;
        display: block;
        margin-bottom: 0.5rem;
      }
      .permissions ul { 
        margin-left: 1.5rem; 
        color: #374151;
      }
      .permissions li {
        margin: 0.25rem 0;
        font-size: 0.9rem;
      }
      .form-group {
        margin-bottom: 1.25rem;
      }
      label {
        display: block;
        font-weight: 600;
        margin-bottom: 0.5rem;
        color: #374151;
        font-size: 0.9rem;
      }
      input[type="text"],
      input[type="password"] {
        width: 100%;
        padding: 0.75rem;
        border: 2px solid #e5e7eb;
        border-radius: 8px;
        font-size: 1rem;
        transition: border-color 0.2s, box-shadow 0.2s;
      }
      input:focus {
        outline: none;
        border-color: #3b82f6;
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
      }
      .error {
        background: #fee2e2;
        color: #dc2626;
        padding: 0.875rem;
        border-radius: 8px;
        margin-bottom: 1rem;
        border: 1px solid #fecaca;
        font-size: 0.9rem;
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }
      .buttons {
        display: flex;
        gap: 0.75rem;
        margin-top: 1.5rem;
      }
      button {
        flex: 1;
        padding: 0.875rem;
        border: none;
        border-radius: 8px;
        font-size: 1rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
      }
      .approve {
        background: #3b82f6;
        color: white;
      }
      .approve:hover {
        background: #2563eb;
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
      }
      .approve:active {
        transform: translateY(0);
      }
      .deny {
        background: #f3f4f6;
        color: #374151;
        border: 1px solid #e5e7eb;
      }
      .deny:hover {
        background: #e5e7eb;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>🔐 Authorization Required</h1>
      <p class="subtitle">Login and authorize access in one step</p>
      
      ${error ? `<div class="error"><span>⚠️</span> ${error}</div>` : ""}
      
      <div class="app-info">
        <strong>${client_name}</strong>
        <p>is requesting access to your MCP Well Database account</p>
      </div>
      
      <div class="permissions">
        <strong>📋 Requested Permissions</strong>
        <ul>
          <li>Query geological well data</li>
          <li>Access MCP tools (${scope})</li>
          <li>Read database information</li>
        </ul>
      </div>
      
      <form method="POST" action="/oauth/authorize">
        <div class="form-group">
          <label for="username">Username</label>
          <input 
            type="text" 
            id="username"
            name="username" 
            value="${params.username || ""}"
            required 
            autofocus
            autocomplete="username"
          >
        </div>
        
        <div class="form-group">
          <label for="password">Password</label>
          <input 
            type="password" 
            id="password"
            name="password" 
            required
            autocomplete="current-password"
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
            ✓ Approve & Login
          </button>
          <button type="submit" name="action" value="deny" class="deny">
            ✕ Deny
          </button>
        </div>
      </form>
    </div>
  </body>
</html>
  `;
};

const getDocsPage = (config) => `
<!DOCTYPE html>
<html>
  <head>
    <title>MCP OAuth Documentation</title>
    <meta charset="utf-8">
    <style>
      body { font-family: system-ui, sans-serif; max-width: 900px; margin: 0 auto; padding: 40px 20px; line-height: 1.6; }
      h1 { color: #333; border-bottom: 3px solid #3b82f6; padding-bottom: 10px; }
      h2 { color: #555; margin-top: 30px; border-bottom: 1px solid #ddd; padding-bottom: 5px; }
      code { background: #f5f5f5; padding: 3px 8px; border-radius: 4px; font-family: 'Courier New', monospace; }
      pre { background: #f5f5f5; padding: 20px; border-radius: 8px; overflow-x: auto; border-left: 4px solid #3b82f6; }
      .endpoint { background: #f0f9ff; padding: 15px; margin: 15px 0; border-radius: 8px; border-left: 4px solid #3b82f6; }
      .method { 
        display: inline-block;
        font-weight: bold; 
        color: white;
        background: #3b82f6;
        padding: 4px 12px;
        border-radius: 4px;
        font-size: 0.85rem;
        margin-right: 10px;
      }
      .method.post { background: #10b981; }
      .method.delete { background: #ef4444; }
      .info-box { background: #fffbeb; border: 1px solid #fbbf24; padding: 15px; border-radius: 8px; margin: 20px 0; }
      .info-box strong { color: #d97706; }
    </style>
  </head>
  <body>
    <h1>🔐 MCP OAuth Server Documentation</h1>
    
    <div class="info-box">
      <strong>⚡ Simplified OAuth 2.1 Flow</strong><br>
      This server implements a streamlined OAuth 2.1 flow without sessions. Login and authorization happen in a single step.
    </div>
    
    <h2>Discovery Endpoints</h2>
    
    <div class="endpoint">
      <span class="method">GET</span> <code>/.well-known/oauth-authorization-server</code>
      <p>OAuth 2.1 Authorization Server Metadata - automatically discovered by MCP clients</p>
    </div>
    
    <div class="endpoint">
      <span class="method">GET</span> <code>/.well-known/oauth-protected-resource</code>
      <p>Protected Resource Metadata</p>
    </div>
    
    <h2>OAuth Flow</h2>
    
    <div class="endpoint">
      <span class="method post">POST</span> <code>/oauth/register</code>
      <p>Dynamic Client Registration - Claude/ChatGPT auto-registers</p>
    </div>
    
    <div class="endpoint">
      <span class="method">GET</span> <code>/oauth/authorize</code>
      <p>Shows unified login & authorization page (single step)</p>
    </div>
    
    <div class="endpoint">
      <span class="method post">POST</span> <code>/oauth/authorize</code>
      <p>Processes login + authorization and returns authorization code</p>
    </div>
    
    <div class="endpoint">
      <span class="method post">POST</span> <code>/oauth/token</code>
      <p>Exchange authorization code for access/refresh tokens</p>
    </div>
    
    <div class="endpoint">
      <span class="method post">POST</span> <code>/oauth/revoke</code>
      <p>Revoke access or refresh tokens</p>
    </div>
    
    <h2>MCP Protocol</h2>
    
    <div class="endpoint">
      <span class="method post">POST</span> <code>/mcp</code>
      <p>Model Context Protocol endpoint - requires Bearer token authentication</p>
    </div>
    
    <div class="endpoint">
      <span class="method delete">DELETE</span> <code>/mcp</code>
      <p>Cleanup MCP session (graceful disconnect)</p>
    </div>
    
    <h2>Configuration</h2>
    <pre>Server URL: ${config.SERVER_URL}
      Token Expiry: ${config.TOKEN_EXPIRY / 1000} seconds (${config.TOKEN_EXPIRY / 60000} minutes)
      Code Expiry: ${config.CODE_EXPIRY / 1000} seconds (${config.CODE_EXPIRY / 60000} minutes)
      OAuth Flow: Simplified (no sessions)
      Storage: PostgreSQL (tokens) + Memory (codes)
    </pre>
    
    <h2>Status Endpoints</h2>
    <ul>
      <li><a href="/health">/health</a> - Server health check</li>
    </ul>
    
    <div class="info-box">
      <strong>🎯 Key Difference from Traditional OAuth</strong><br>
      This implementation combines login and authorization in a single page, eliminating the need for session cookies. Auth codes are stored in memory for maximum performance.
    </div>
  </body>
</html>
`;

module.exports = {
  getHomePage,
  getUnifiedAuthPage,
  getDocsPage
};