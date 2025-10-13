// Templates HTML para as páginas do servidor
const getHomePage = (SERVER_URL, dbConnected, transportsCount, toolsCount) => `
  <!DOCTYPE html>
  <html>
    <head>
      <title>MCP Well Database</title>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
          font-family: -apple-system, system-ui, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          padding: 20px;
        }
        .container {
          max-width: 800px;
          margin: 0 auto;
          background: white;
          border-radius: 16px;
          padding: 40px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        }
        h1 { 
          font-size: 2.5rem;
          margin-bottom: 1rem;
          color: #1a202c;
        }
        .status {
          display: inline-flex;
          align-items: center;
          padding: 6px 12px;
          border-radius: 100px;
          font-size: 0.875rem;
          font-weight: 600;
          margin-left: 1rem;
        }
        .status.online {
          background: #10b981;
          color: white;
        }
        .status.offline {
          background: #ef4444;
          color: white;
        }
        .grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1rem;
          margin: 2rem 0;
        }
        .card {
          background: #f9fafb;
          padding: 1.5rem;
          border-radius: 8px;
          border: 1px solid #e5e7eb;
        }
        .card h3 {
          font-size: 0.875rem;
          color: #6b7280;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 0.5rem;
        }
        .card p {
          font-size: 1.5rem;
          font-weight: 700;
          color: #1f2937;
        }
        .tools {
          margin: 2rem 0;
        }
        .tool {
          background: #fef3c7;
          border-left: 4px solid #f59e0b;
          padding: 1rem;
          margin: 0.5rem 0;
          border-radius: 4px;
        }
        .tool strong {
          color: #92400e;
        }
        .instructions {
          background: #dbeafe;
          border: 2px solid #3b82f6;
          border-radius: 8px;
          padding: 1.5rem;
          margin: 2rem 0;
        }
        code {
          background: #1f2937;
          color: #f3f4f6;
          padding: 2px 6px;
          border-radius: 4px;
          font-family: 'Monaco', 'Courier New', monospace;
        }
        .button {
          display: inline-block;
          background: #3b82f6;
          color: white;
          padding: 0.75rem 1.5rem;
          border-radius: 8px;
          text-decoration: none;
          font-weight: 600;
          margin: 0.5rem;
          transition: all 0.2s;
        }
        .button:hover {
          background: #2563eb;
          transform: translateY(-2px);
        }
        .footer {
          text-align: center;
          margin-top: 3rem;
          padding-top: 2rem;
          border-top: 1px solid #e5e7eb;
          color: #6b7280;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>
          🚀 MCP Well Database
          <span class="status online">ONLINE</span>
        </h1>
        
        <div class="grid">
          <div class="card">
            <h3>Database</h3>
            <p>${dbConnected ? "✅ Connected" : "❌ Offline"}</p>
          </div>
          <div class="card">
            <h3>Active Sessions</h3>
            <p>${transportsCount}</p>
          </div>
          <div class="card">
            <h3>Tools Available</h3>
            <p>${toolsCount}</p>
          </div>
          <div class="card">
            <h3>OAuth Status</h3>
            <p>✅ Enabled</p>
          </div>
        </div>

        <div class="tools">
          <h2>🔧 Available Tools</h2>
          <div class="tool">
            <strong>fetch_well_database_schema</strong>
            <br>
            <small>Returns the full database schema with all tables and columns</small>
          </div>
          <div class="tool">
            <strong>query_well_database</strong>
            <br>
            <small>Execute SQL queries on the well and basin database</small>
          </div>
          <div class="tool">
            <strong>get_well_curves</strong>
            <br>
            <small>List all available curves for a specific well</small>
          </div>
          <div class="tool">
            <strong>generate_composite_profile_link</strong>
            <br>
            <small>Generate a link to the Composite Profile Viewer for a specific well</small>
          </div>
          <div class="tool">
            <strong>get_dlis_metadata</strong>
            <br>
            <small>Retrieve DLIS metadata and curve measurements for specific wells</small>
          </div>
        </div>

        <div class="instructions">
          <h2>📱 Connect with Claude</h2>
          <ol style="margin: 1rem 0 1rem 2rem;">
            <li>Open Claude Desktop or Web</li>
            <li>Go to Settings → Connectors</li>
            <li>Click "Add Custom Connector"</li>
            <li>Enter: <code>${SERVER_URL}/mcp</code></li>
            <li>Complete OAuth authentication</li>
          </ol>
        </div>

        <div style="text-align: center; margin: 2rem 0;">
          <a href="/oauth/status" class="button">OAuth Status</a>
          <a href="/docs" class="button">Documentation</a>
          <a href="/health" class="button">Health Check</a>
        </div>

        <div class="footer">
          <p>MCP Well Database Server v1.0.0</p>
          <p style="margin-top: 0.5rem;">
            <small>Streamable HTTP Protocol 2025-03-26</small>
          </p>
        </div>
      </div>
    </body>
  </html>
`;

const getLoginPage = (params) => {
  const error = params.error || "";
  const username = params.username || "";
  const client_id = params.client_id || "";
  const redirect_uri = params.redirect_uri || "";
  const response_type = params.response_type || "";
  const scope = params.scope || "";
  const state = params.state || "";
  const code_challenge = params.code_challenge || "";
  const code_challenge_method = params.code_challenge_method || "";

  return `
  <!DOCTYPE html>
  <html>
    <head>
      <title>MCP Well Database - Login</title>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
          font-family: -apple-system, system-ui, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .login-container {
          background: white;
          border-radius: 16px;
          padding: 40px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
          max-width: 400px;
          width: 100%;
        }
        h1 {
          font-size: 1.75rem;
          margin-bottom: 0.5rem;
          color: #1a202c;
          text-align: center;
        }
        .subtitle {
          text-align: center;
          color: #6b7280;
          margin-bottom: 2rem;
          font-size: 0.875rem;
        }
        .error {
          background: #fee2e2;
          border: 1px solid #ef4444;
          color: #991b1b;
          padding: 12px;
          border-radius: 8px;
          margin-bottom: 1.5rem;
          font-size: 0.875rem;
          text-align: center;
        }
        .form-group {
          margin-bottom: 1.5rem;
        }
        label {
          display: block;
          font-weight: 600;
          color: #374151;
          margin-bottom: 0.5rem;
          font-size: 0.875rem;
        }
        input[type="text"],
        input[type="password"] {
          width: 100%;
          padding: 12px;
          border: 2px solid #e5e7eb;
          border-radius: 8px;
          font-size: 1rem;
          transition: border-color 0.2s;
        }
        input[type="text"]:focus,
        input[type="password"]:focus {
          outline: none;
          border-color: #3b82f6;
        }
        button {
          width: 100%;
          background: #3b82f6;
          color: white;
          padding: 12px;
          border: none;
          border-radius: 8px;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s;
        }
        button:hover {
          background: #2563eb;
        }
        button:active {
          transform: scale(0.98);
        }
        .info {
          margin-top: 1.5rem;
          padding: 12px;
          background: #dbeafe;
          border-radius: 8px;
          font-size: 0.875rem;
          color: #1e40af;
          text-align: center;
        }
        .users-hint {
          margin-top: 1rem;
          padding: 10px;
          background: #f3f4f6;
          border-radius: 6px;
          font-size: 0.75rem;
          color: #6b7280;
          text-align: center;
        }
        .users-hint strong {
          color: #374151;
        }
      </style>
    </head>
    <body>
      <div class="login-container">
        <h1>🔐 MCP Well Database</h1>
        <p class="subtitle">Authentication Required</p>
        
        ${error ? `<div class="error">❌ ${error}</div>` : ""}
        
        <form method="POST" action="/oauth/login">
          <div class="form-group">
            <label for="username">Username</label>
            <input 
              type="text" 
              id="username" 
              name="username" 
              value="${username}"
              required
              autofocus
            >
          </div>
          
          <div class="form-group">
            <label for="password">Password</label>
            <input 
              type="password" 
              id="password" 
              name="password" 
              placeholder="Enter your password"
              required
            >
          </div>
          
          <!-- Hidden fields to preserve OAuth parameters -->
          <input type="hidden" name="client_id" value="${client_id}">
          <input type="hidden" name="redirect_uri" value="${redirect_uri}">
          <input type="hidden" name="response_type" value="${response_type}">
          <input type="hidden" name="scope" value="${scope}">
          <input type="hidden" name="state" value="${state}">
          <input type="hidden" name="code_challenge" value="${code_challenge}">
          <input type="hidden" name="code_challenge_method" value="${code_challenge_method}">
          
          <button type="submit">🔓 Sign In</button>
        </form>
        
        <div class="info">
          🔒 OAuth 2.1 with PKCE
        </div>     
      </div>
    </body>
  </html>
  `;
};

const getDocsPage = (config) => `
  <html>
    <head>
      <title>MCP OAuth Documentation</title>
      <style>
        body { font-family: sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        h1 { color: #333; }
        h2 { color: #666; margin-top: 30px; }
        code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; }
        pre { background: #f4f4f4; padding: 15px; border-radius: 5px; overflow-x: auto; }
        .endpoint { background: #e8f4f8; padding: 10px; margin: 10px 0; border-radius: 5px; }
        .method { font-weight: bold; color: #0066cc; }
      </style>
    </head>
    <body>
      <h1>🔐 MCP OAuth Server Documentation</h1>
      
      <h2>Discovery Endpoints</h2>
      <div class="endpoint">
        <span class="method">GET</span> <code>/.well-known/oauth-authorization-server</code>
        <br>OAuth 2.1 Authorization Server Metadata
      </div>
      <div class="endpoint">
        <span class="method">GET</span> <code>/.well-known/oauth-protected-resource</code>
        <br>Protected Resource Metadata
      </div>
      
      <h2>OAuth Flow</h2>
      <div class="endpoint">
        <span class="method">POST</span> <code>/oauth/register</code>
        <br>Dynamic Client Registration
      </div>
      <div class="endpoint">
        <span class="method">GET</span> <code>/oauth/login</code>
        <br>Login Page (authentication required)
      </div>
      <div class="endpoint">
        <span class="method">GET</span> <code>/oauth/authorize</code>
        <br>Authorization Endpoint (with PKCE support)
      </div>
      <div class="endpoint">
        <span class="method">POST</span> <code>/oauth/token</code>
        <br>Token Exchange Endpoint
      </div>
      <div class="endpoint">
        <span class="method">POST</span> <code>/oauth/revoke</code>
        <br>Token Revocation Endpoint
      </div>
      
      <h2>Configuration</h2>
      <pre>
       Auto-Approve: ${config.AUTO_APPROVE}
       Token Expiry: ${config.TOKEN_EXPIRY / 1000} seconds
       Code Expiry: ${config.CODE_EXPIRY / 1000} seconds
       Server URL: ${config.SERVER_URL}
      </pre>
      
      <h2>Current Status</h2>
      <p>Check <a href="/oauth/status">/oauth/status</a> for current server status.</p>
      
      <h2>Testing with Claude</h2>
      <ol>
        <li>Add Custom Connector: <code>${config.SERVER_URL}/mcp</code></li>
        <li>Claude will auto-discover OAuth endpoints</li>
        <li>You'll be redirected to login page</li>
        <li>After authentication, approve authorization</li>
        <li>Tools will be available after successful OAuth flow</li>
      </ol>
    </body>
  </html>
`;

const getAuthorizePage = (client, params) => {
  const scope = params.scope || "mcp";
  const client_name = client.client_name || "Unknown Application";
  
  return `
  <!DOCTYPE html>
  <html>
    <head>
      <title>Authorization Required</title>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
          font-family: -apple-system, system-ui, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .auth-container {
          background: white;
          border-radius: 16px;
          padding: 40px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
          max-width: 500px;
          width: 100%;
        }
        h1 {
          font-size: 1.75rem;
          margin-bottom: 0.5rem;
          color: #1a202c;
        }
        .app-info {
          background: #f3f4f6;
          padding: 1rem;
          border-radius: 8px;
          margin: 1.5rem 0;
        }
        .app-info strong {
          color: #3b82f6;
          font-size: 1.125rem;
        }
        .scope-info {
          background: #dbeafe;
          padding: 1rem;
          border-radius: 8px;
          margin: 1rem 0;
        }
        .scope-info h3 {
          font-size: 0.875rem;
          color: #1e40af;
          margin-bottom: 0.5rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .scope-list {
          list-style: none;
          padding: 0;
        }
        .scope-list li {
          padding: 0.5rem 0;
          color: #1f2937;
        }
        .scope-list li:before {
          content: "✓ ";
          color: #10b981;
          font-weight: bold;
          margin-right: 0.5rem;
        }
        .button-group {
          display: flex;
          gap: 1rem;
          margin-top: 2rem;
        }
        button {
          flex: 1;
          padding: 12px;
          border: none;
          border-radius: 8px;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        .approve {
          background: #10b981;
          color: white;
        }
        .approve:hover {
          background: #059669;
        }
        .deny {
          background: #ef4444;
          color: white;
        }
        .deny:hover {
          background: #dc2626;
        }
        button:active {
          transform: scale(0.98);
        }
        .warning {
          margin-top: 1.5rem;
          padding: 1rem;
          background: #fef3c7;
          border-left: 4px solid #f59e0b;
          border-radius: 4px;
          font-size: 0.875rem;
          color: #92400e;
        }
      </style>
    </head>
    <body>
      <div class="auth-container">
        <h1>🔐 Authorization Request</h1>
        
        <div class="app-info">
          <p style="margin-bottom: 0.5rem; color: #6b7280; font-size: 0.875rem;">Application requesting access:</p>
          <strong>${client_name}</strong>
        </div>
        
        <p style="margin: 1.5rem 0; color: #4b5563;">
          This application is requesting permission to access your MCP Well Database.
        </p>
        
        <div class="scope-info">
          <h3>Requested Permissions:</h3>
          <ul class="scope-list">
            <li>Access to well database queries</li>
            <li>View well curves and profiles</li>
            <li>Generate composite profile links</li>
            <li>Retrieve DLIS metadata</li>
          </ul>
        </div>
        
        <form method="POST" action="/oauth/authorize">
          <input type="hidden" name="client_id" value="${params.client_id || ""}">
          <input type="hidden" name="redirect_uri" value="${params.redirect_uri || ""}">
          <input type="hidden" name="response_type" value="${params.response_type || ""}">
          <input type="hidden" name="scope" value="${scope}">
          <input type="hidden" name="state" value="${params.state || ""}">
          <input type="hidden" name="code_challenge" value="${params.code_challenge || ""}">
          <input type="hidden" name="code_challenge_method" value="${params.code_challenge_method || ""}">
          
          <div class="button-group">
            <button type="submit" name="action" value="deny" class="deny">
              ❌ Deny
            </button>
            <button type="submit" name="action" value="approve" class="approve">
              ✅ Approve
            </button>
          </div>
        </form>
        
        <div class="warning">
          ⚠️ Only approve if you trust this application. By approving, you grant access to your well database.
        </div>
      </div>
    </body>
  </html>
  `;
};

module.exports = {
  getHomePage,
  getLoginPage,
  getDocsPage,
  getAuthorizePage
};