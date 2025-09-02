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
            <strong>generate_lithological_profile</strong>
            <br>
            <small>Generate lithological profile visualization for a specific well</small>
          </div>
          <div class="tool">
            <strong>simple_image_test</strong>
            <br>
            <small>Generate a simple image test</small>
          </div>
        </div>

        <div class="instructions">
          <h2>📱 Connect with Claude</h2>
          <ol style="margin: 1rem 0 1rem 2rem;">
            <li>Open Claude Desktop or Web</li>
            <li>Go to Settings → Connectors</li>
            <li>Click "Add Custom Connector"</li>
            <li>Enter: <code>${SERVER_URL}/mcp</code></li>
            <li>Complete OAuth (auto-approves)</li>
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
        <li>Complete authorization flow</li>
        <li>Tools will be available after authentication</li>
      </ol>
    </body>
  </html>
`;

const getAuthorizePage = (client, params) => `
  <html>
    <body style="font-family: sans-serif; padding: 40px; max-width: 600px; margin: 0 auto;">
      <h1>Autorização OAuth</h1>
      <p>O aplicativo <strong>${client.client_name}</strong> está solicitando acesso ao MCP Server.</p>
      <p>Escopo solicitado: <code>${params.scope || "mcp"}</code></p>
      <form method="POST" action="/oauth/authorize">
        <input type="hidden" name="client_id" value="${params.client_id}">
        <input type="hidden" name="redirect_uri" value="${params.redirect_uri}">
        <input type="hidden" name="response_type" value="${params.response_type}">
        <input type="hidden" name="scope" value="${params.scope}">
        <input type="hidden" name="state" value="${params.state || ""}">
        <input type="hidden" name="code_challenge" value="${params.code_challenge || ""}">
        <input type="hidden" name="code_challenge_method" value="${params.code_challenge_method || ""}">
        <button type="submit" name="action" value="approve" style="padding: 10px 20px; margin: 10px;">Aprovar</button>
        <button type="submit" name="action" value="deny" style="padding: 10px 20px; margin: 10px;">Negar</button>
      </form>
    </body>
  </html>
`;

module.exports = {
  getHomePage,
  getDocsPage,
  getAuthorizePage
};