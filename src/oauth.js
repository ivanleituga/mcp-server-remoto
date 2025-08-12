const { v4: uuidv4 } = require("uuid");
const crypto = require("crypto");

// ===============================================
// ARMAZENAMENTO EM MEMÓRIA
// ===============================================
const storage = {
  clients: new Map(),     // client_id -> client info
  authCodes: new Map(),   // code -> auth info
  tokens: new Map(),      // token -> token info
  sessions: new Map()     // session_id -> session info
};

// ===============================================
// CONFIGURAÇÃO
// ===============================================
const config = {
  SERVER_URL: process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 3000}`,
  TOKEN_EXPIRY: 3600000,  // 1 hora em ms
  CODE_EXPIRY: 600000,    // 10 minutos em ms
  AUTO_APPROVE: true      // Auto-aprovar para desenvolvimento
};

// ===============================================
// FUNÇÕES AUXILIARES
// ===============================================

// Gerar código PKCE challenge
function generateCodeChallenge(verifier) {
  return crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64url");
}

// Validar PKCE
function validatePKCE(codeVerifier, codeChallenge, method = "S256") {
  if (method === "S256") {
    return generateCodeChallenge(codeVerifier) === codeChallenge;
  }
  return codeVerifier === codeChallenge; // plain
}

// Limpar itens expirados
function cleanupExpired() {
  const now = Date.now();
  
  // Limpar códigos expirados
  for (const [code, data] of storage.authCodes) {
    if (now > data.expiresAt) {
      storage.authCodes.delete(code);
      console.log(`🧹 Código expirado removido: ${code}`);
    }
  }
  
  // Limpar tokens expirados
  for (const [token, data] of storage.tokens) {
    if (data.expiresAt && now > data.expiresAt) {
      storage.tokens.delete(token);
      console.log(`🧹 Token expirado removido: ${token.substring(0, 20)}...`);
    }
  }
}

// Executar limpeza a cada 5 minutos
setInterval(cleanupExpired, 300000);

// ===============================================
// IMPLEMENTAÇÃO OAUTH
// ===============================================

function setupOAuthEndpoints(app) {
  
  // -----------------------------------------------
  // 1. DISCOVERY ENDPOINTS
  // -----------------------------------------------
  
  // Authorization Server Metadata
  app.get("/.well-known/oauth-authorization-server", (req, res) => {
    console.log("📋 OAuth Discovery: Authorization Server");
    
    res.json({
      issuer: config.SERVER_URL,
      authorization_endpoint: `${config.SERVER_URL}/oauth/authorize`,
      token_endpoint: `${config.SERVER_URL}/oauth/token`,
      registration_endpoint: `${config.SERVER_URL}/oauth/register`,
      revocation_endpoint: `${config.SERVER_URL}/oauth/revoke`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256", "plain"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: ["mcp", "read", "write"],
      service_documentation: `${config.SERVER_URL}/docs`
    });
  });
  
  // Protected Resource Metadata
  app.get("/.well-known/oauth-protected-resource", (req, res) => {
    console.log("📋 OAuth Discovery: Protected Resource");
    
    res.json({
      resource: config.SERVER_URL,
      authorization_servers: [config.SERVER_URL],
      bearer_methods_supported: ["header"],
      resource_documentation: `${config.SERVER_URL}/docs`,
      resource_signing_alg_values_supported: ["none"]
    });
  });
  
  // -----------------------------------------------
  // 2. CLIENT REGISTRATION
  // -----------------------------------------------
  
  app.post("/oauth/register", (req, res) => {
    console.log("📝 Client Registration Request:", JSON.stringify(req.body, null, 2));
    
    const clientId = `client_${uuidv4()}`;
    const clientSecret = `secret_${uuidv4()}`;
    
    const client = {
      client_id: clientId,
      client_secret: clientSecret,
      client_name: req.body.client_name || "MCP Client",
      redirect_uris: req.body.redirect_uris || ["https://claude.ai/api/mcp/auth_callback"],
      grant_types: req.body.grant_types || ["authorization_code", "refresh_token"],
      response_types: req.body.response_types || ["code"],
      scope: req.body.scope || "mcp",
      created_at: Date.now()
    };
    
    storage.clients.set(clientId, client);
    
    console.log(`✅ Client registered: ${clientId}`);
    console.log(`   Name: ${client.client_name}`);
    console.log(`   Redirect URIs: ${client.redirect_uris.join(", ")}`);
    
    res.json({
      client_id: clientId,
      client_secret: clientSecret,
      client_id_issued_at: Math.floor(client.created_at / 1000),
      grant_types: client.grant_types,
      response_types: client.response_types,
      redirect_uris: client.redirect_uris,
      token_endpoint_auth_method: "none",
      scope: client.scope
    });
  });
  
  // -----------------------------------------------
  // 3. AUTHORIZATION ENDPOINT
  // -----------------------------------------------
  
  app.get("/oauth/authorize", (req, res) => {
    const {
      client_id,
      redirect_uri,
      response_type,
      scope,
      state,
      code_challenge,
      code_challenge_method
    } = req.query;
    
    console.log("🔐 Authorization Request:");
    console.log(`   Client ID: ${client_id}`);
    console.log(`   Redirect URI: ${redirect_uri}`);
    console.log(`   Scope: ${scope}`);
    console.log(`   PKCE: ${code_challenge ? "Yes" : "No"}`);
    
    // Validar cliente
    const client = storage.clients.get(client_id);
    if (!client) {
      console.log("❌ Cliente não encontrado:", client_id);
      return res.status(400).send("Invalid client_id");
    }
    
    // Validar redirect_uri
    if (!client.redirect_uris.includes(redirect_uri)) {
      console.log("❌ Redirect URI inválido:", redirect_uri);
      return res.status(400).send("Invalid redirect_uri");
    }
    
    // AUTO-APROVAÇÃO (para desenvolvimento)
    if (config.AUTO_APPROVE) {
      console.log("✅ Auto-aprovando autorização...");
      
      const authCode = `code_${uuidv4()}`;
      
      storage.authCodes.set(authCode, {
        client_id,
        redirect_uri,
        scope: scope || "mcp",
        code_challenge,
        code_challenge_method: code_challenge_method || "S256",
        createdAt: Date.now(),
        expiresAt: Date.now() + config.CODE_EXPIRY
      });
      
      console.log(`✅ Código de autorização gerado: ${authCode}`);
      
      // Redirecionar com o código
      const redirectUrl = new URL(redirect_uri);
      redirectUrl.searchParams.set("code", authCode);
      if (state) redirectUrl.searchParams.set("state", state);
      
      console.log(`↪️ Redirecionando para: ${redirectUrl.toString()}`);
      return res.redirect(redirectUrl.toString());
    }
    
    // Em produção, aqui mostraria uma tela de consentimento
    res.send(`
      <html>
        <body style="font-family: sans-serif; padding: 40px; max-width: 600px; margin: 0 auto;">
          <h1>Autorização OAuth</h1>
          <p>O aplicativo <strong>${client.client_name}</strong> está solicitando acesso ao MCP Server.</p>
          <p>Escopo solicitado: <code>${scope || "mcp"}</code></p>
          <form method="POST" action="/oauth/authorize">
            <input type="hidden" name="client_id" value="${client_id}">
            <input type="hidden" name="redirect_uri" value="${redirect_uri}">
            <input type="hidden" name="response_type" value="${response_type}">
            <input type="hidden" name="scope" value="${scope}">
            <input type="hidden" name="state" value="${state || ""}">
            <input type="hidden" name="code_challenge" value="${code_challenge || ""}">
            <input type="hidden" name="code_challenge_method" value="${code_challenge_method || ""}">
            <button type="submit" name="action" value="approve" style="padding: 10px 20px; margin: 10px;">Aprovar</button>
            <button type="submit" name="action" value="deny" style="padding: 10px 20px; margin: 10px;">Negar</button>
          </form>
        </body>
      </html>
    `);
  });
  
  // POST para processar aprovação/negação
  app.post("/oauth/authorize", (req, res) => {
    const {
      action,
      client_id,
      redirect_uri,
      scope,
      state,
      code_challenge,
      code_challenge_method
    } = req.body;
    
    console.log(`🔐 Authorization ${action === "approve" ? "APPROVED" : "DENIED"}`);
    
    const redirectUrl = new URL(redirect_uri);
    
    if (action === "approve") {
      const authCode = `code_${uuidv4()}`;
      
      storage.authCodes.set(authCode, {
        client_id,
        redirect_uri,
        scope: scope || "mcp",
        code_challenge,
        code_challenge_method: code_challenge_method || "S256",
        createdAt: Date.now(),
        expiresAt: Date.now() + config.CODE_EXPIRY
      });
      
      console.log(`✅ Código autorizado: ${authCode}`);
      
      redirectUrl.searchParams.set("code", authCode);
    } else {
      redirectUrl.searchParams.set("error", "access_denied");
    }
    
    if (state) redirectUrl.searchParams.set("state", state);
    
    res.redirect(redirectUrl.toString());
  });
  
  // -----------------------------------------------
  // 4. TOKEN ENDPOINT
  // -----------------------------------------------
  
  app.post("/oauth/token", (req, res) => {
    const { grant_type, code, code_verifier, refresh_token, client_id } = req.body;
    
    console.log("🎫 Token Request:");
    console.log(`   Grant Type: ${grant_type}`);
    console.log(`   Client ID: ${client_id}`);
    
    if (grant_type === "authorization_code") {
      // Trocar código por token
      const authData = storage.authCodes.get(code);
      
      if (!authData) {
        console.log("❌ Código inválido ou expirado");
        return res.status(400).json({
          error: "invalid_grant",
          error_description: "Invalid or expired authorization code"
        });
      }
      
      // Validar PKCE se necessário
      if (authData.code_challenge) {
        if (!code_verifier) {
          console.log("❌ PKCE verifier ausente");
          return res.status(400).json({
            error: "invalid_request",
            error_description: "PKCE code_verifier required"
          });
        }
        
        const valid = validatePKCE(
          code_verifier,
          authData.code_challenge,
          authData.code_challenge_method
        );
        
        if (!valid) {
          console.log("❌ PKCE verificação falhou");
          return res.status(400).json({
            error: "invalid_grant",
            error_description: "PKCE verification failed"
          });
        }
        
        console.log("✅ PKCE validado com sucesso");
      }
      
      // Gerar tokens
      const accessToken = `mcp_${uuidv4()}`;
      const refreshToken = `refresh_${uuidv4()}`;
      
      const tokenData = {
        client_id: authData.client_id,
        scope: authData.scope,
        createdAt: Date.now(),
        expiresAt: Date.now() + config.TOKEN_EXPIRY
      };
      
      storage.tokens.set(accessToken, tokenData);
      storage.tokens.set(refreshToken, {
        ...tokenData,
        type: "refresh",
        expiresAt: null // Refresh tokens não expiram automaticamente
      });
      
      // Remover código usado
      storage.authCodes.delete(code);
      
      console.log("✅ Tokens gerados:");
      console.log(`   Access: ${accessToken.substring(0, 20)}...`);
      console.log(`   Refresh: ${refreshToken.substring(0, 20)}...`);
      
      res.json({
        access_token: accessToken,
        token_type: "Bearer",
        expires_in: Math.floor(config.TOKEN_EXPIRY / 1000),
        refresh_token: refreshToken,
        scope: authData.scope
      });
      
    } else if (grant_type === "refresh_token") {
      // Renovar access token
      const refreshData = storage.tokens.get(refresh_token);
      
      if (!refreshData || refreshData.type !== "refresh") {
        console.log("❌ Refresh token inválido");
        return res.status(400).json({
          error: "invalid_grant",
          error_description: "Invalid refresh token"
        });
      }
      
      const newAccessToken = `mcp_${uuidv4()}`;
      
      storage.tokens.set(newAccessToken, {
        client_id: refreshData.client_id,
        scope: refreshData.scope,
        createdAt: Date.now(),
        expiresAt: Date.now() + config.TOKEN_EXPIRY
      });
      
      console.log(`✅ Token renovado: ${newAccessToken.substring(0, 20)}...`);
      
      res.json({
        access_token: newAccessToken,
        token_type: "Bearer",
        expires_in: Math.floor(config.TOKEN_EXPIRY / 1000),
        refresh_token: refresh_token, // Mantém o mesmo refresh token
        scope: refreshData.scope
      });
      
    } else {
      console.log("❌ Grant type não suportado:", grant_type);
      res.status(400).json({
        error: "unsupported_grant_type"
      });
    }
  });
  
  // -----------------------------------------------
  // 5. TOKEN REVOCATION
  // -----------------------------------------------
  
  app.post("/oauth/revoke", (req, res) => {
    const { token, token_type_hint } = req.body;
    
    console.log("🗑️ Token Revocation Request");
    
    if (storage.tokens.has(token)) {
      storage.tokens.delete(token);
      console.log("✅ Token revogado");
    }
    
    res.status(200).send();
  });
  
  // -----------------------------------------------
  // 6. MIDDLEWARE DE VALIDAÇÃO
  // -----------------------------------------------
  
  function validateToken(req, res, next) {
    // SEMPRE permitir initialize sem autenticação
    if (req.body?.method === "initialize") {
      console.log("🆓 Initialize request - bypass OAuth");
      return next();
    }
    
    // SEMPRE permitir OPTIONS (CORS preflight)
    if (req.method === "OPTIONS") {
      return next();
    }
    
    // Verificar header Authorization
    const authHeader = req.headers.authorization;
    
    // Em desenvolvimento, avisar mas permitir
    if (!authHeader) {
      console.log("⚠️ No auth header - allowing for development");
      // Em produção, descomente a linha abaixo:
      // return res.status(401).json({ error: "Authorization required" });
      return next();
    }
    
    // Validar Bearer token
    if (authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      const tokenData = storage.tokens.get(token);
      
      if (!tokenData) {
        console.log("❌ Token inválido:", token.substring(0, 20) + "...");
        return res.status(401).json({
          error: "invalid_token",
          error_description: "The access token is invalid"
        });
      }
      
      // Verificar expiração
      if (tokenData.expiresAt && Date.now() > tokenData.expiresAt) {
        console.log("❌ Token expirado");
        storage.tokens.delete(token);
        return res.status(401).json({
          error: "invalid_token",
          error_description: "The access token has expired"
        });
      }
      
      console.log("✅ Token válido - Client:", tokenData.client_id);
      req.oauth = tokenData;
      return next();
    }
    
    console.log("❌ Formato de autorização inválido");
    res.status(401).json({
      error: "invalid_request",
      error_description: "Invalid authorization header format"
    });
  }
  
  // -----------------------------------------------
  // 7. ENDPOINT DE STATUS
  // -----------------------------------------------
  
  app.get("/oauth/status", (req, res) => {
    res.json({
      clients: storage.clients.size,
      active_codes: storage.authCodes.size,
      active_tokens: storage.tokens.size,
      auto_approve: config.AUTO_APPROVE,
      token_expiry: config.TOKEN_EXPIRY / 1000 + " seconds",
      server_url: config.SERVER_URL
    });
  });
  
  // -----------------------------------------------
  // 8. ENDPOINT DE DOCUMENTAÇÃO
  // -----------------------------------------------
  
  app.get("/docs", (req, res) => {
    res.send(`
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
    `);
  });
  
  return { validateToken };
}

// ===============================================
// EXPORTS
// ===============================================

module.exports = { setupOAuthEndpoints };