const { v4: uuidv4 } = require("uuid");
const crypto = require("crypto");
const { getAuthorizePage, getDocsPage, getLoginPage } = require("../utils/templates");

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
  TOKEN_EXPIRY: 3600000,    // 1 hora em ms
  CODE_EXPIRY: 600000,      // 10 minutos em ms
  SESSION_EXPIRY: 3600000,  // 1 hora em ms
  AUTO_APPROVE: false,      // 🔥 DESATIVADO - agora usa fluxo real!
  OAUTH_PASSWORD: process.env.OAUTH_PASSWORD || "SENHA_NAO_CONFIGURADA"
};

// Validação crítica: se não houver senha configurada, avisar no console
if (config.OAUTH_PASSWORD === "SENHA_NAO_CONFIGURADA") {
  console.warn("\n⚠️  ATENÇÃO: OAUTH_PASSWORD não configurada no .env!");
  console.warn("⚠️  Configure OAUTH_PASSWORD para habilitar autenticação real.\n");
}

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
  
  // Limpar sessões expiradas
  for (const [sessionId, data] of storage.sessions) {
    if (now > data.expiresAt) {
      storage.sessions.delete(sessionId);
      console.log(`🧹 Sessão expirada removida: ${sessionId.substring(0, 20)}...`);
    }
  }
}

// Executar limpeza a cada 5 minutos
setInterval(cleanupExpired, 300000);

// ===============================================
// FUNÇÕES DE SESSÃO
// ===============================================

// Criar nova sessão de usuário autenticado
function createSession(user = "admin") {
  const sessionId = uuidv4();
  const session = {
    user: user,
    createdAt: Date.now(),
    expiresAt: Date.now() + config.SESSION_EXPIRY
  };
  
  storage.sessions.set(sessionId, session);
  console.log(`✅ Nova sessão criada: ${sessionId} (user: ${user})`);
  
  return sessionId;
}

// Validar sessão existente
function validateSession(sessionId) {
  if (!sessionId) {
    console.log("⚠️  Nenhum session_id fornecido");
    return null;
  }
  
  const session = storage.sessions.get(sessionId);
  
  if (!session) {
    console.log(`❌ Sessão não encontrada: ${sessionId}`);
    return null;
  }
  
  // Verificar se expirou
  if (Date.now() > session.expiresAt) {
    console.log(`❌ Sessão expirada: ${sessionId}`);
    storage.sessions.delete(sessionId);
    return null;
  }
  
  console.log(`✅ Sessão válida: ${sessionId} (user: ${session.user})`);
  return session;
}

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
  // 3. LOGIN FLOW (NOVO!)
  // -----------------------------------------------
  
  // GET /oauth/login - Exibir tela de login
  app.get("/oauth/login", (req, res) => {
    console.log("\n🔑 GET /oauth/login");
    console.log("   Query params:", JSON.stringify(req.query, null, 2));
    
    // Renderizar página de login com parâmetros OAuth preservados
    res.send(getLoginPage(req.query));
  });
  
  // POST /oauth/login - Processar login
  app.post("/oauth/login", (req, res) => {
    console.log("\n🔑 POST /oauth/login");
    console.log("   Body keys:", Object.keys(req.body));
    
    const { password, client_id, redirect_uri, response_type, scope, state, code_challenge, code_challenge_method } = req.body;
    
    console.log(`   🔐 Tentativa de login com senha: ${password ? "[PRESENTE]" : "[AUSENTE]"}`);
    console.log(`   📋 OAuth params: client_id=${client_id}, redirect_uri=${redirect_uri}`);
    
    // Validar senha
    if (password !== config.OAUTH_PASSWORD) {
      console.log("   ❌ Senha INCORRETA!");
      
      // Renderizar login novamente com erro
      return res.send(getLoginPage({
        ...req.body,
        error: "Invalid password. Please try again."
      }));
    }
    
    console.log("   ✅ Senha CORRETA!");
    
    // Criar sessão de usuário autenticado
    const sessionId = createSession("admin");
    
    // Definir cookie de sessão seguro
    res.cookie("session_id", sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: config.SESSION_EXPIRY
    });
    
    console.log(`   🍪 Cookie session_id definido: ${sessionId.substring(0, 20)}...`);
    
    // Redirecionar para /oauth/authorize com os parâmetros preservados
    const authUrl = new URL(`${config.SERVER_URL}/oauth/authorize`);
    authUrl.searchParams.set("client_id", client_id);
    authUrl.searchParams.set("redirect_uri", redirect_uri);
    authUrl.searchParams.set("response_type", response_type);
    authUrl.searchParams.set("scope", scope || "mcp");
    if (state) authUrl.searchParams.set("state", state);
    if (code_challenge) authUrl.searchParams.set("code_challenge", code_challenge);
    if (code_challenge_method) authUrl.searchParams.set("code_challenge_method", code_challenge_method);
    
    console.log(`   ↪️  Redirecionando para: ${authUrl.toString()}`);
    
    res.redirect(authUrl.toString());
  });
  
  // -----------------------------------------------
  // 4. AUTHORIZATION ENDPOINT (MODIFICADO!)
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
  
    console.log("\n🔐 GET /oauth/authorize");
    console.log(`   Client ID: ${client_id}`);
    console.log(`   Redirect URI: ${redirect_uri}`);
    console.log(`   Response Type: ${response_type}`);
    console.log(`   Scope: ${scope}`);
    console.log(`   PKCE: ${code_challenge ? "Yes" : "No"}`);
  
    // Validar cliente
    const client = storage.clients.get(client_id);
    if (!client) {
      console.log("   ❌ Cliente não encontrado:", client_id);
      return res.status(400).send("Invalid client_id");
    }
  
    // Validar redirect_uri
    if (!client.redirect_uris.includes(redirect_uri)) {
      console.log("   ❌ Redirect URI inválido:", redirect_uri);
      return res.status(400).send("Invalid redirect_uri");
    }
  
    // Validar response_type
    if (response_type !== "code") {
      console.log("   ❌ Response type inválido:", response_type);
      return res.status(400).send("Invalid response_type - only 'code' is supported");
    }
    
    // 🔥 VERIFICAR SESSÃO (NOVO!)
    const sessionId = req.cookies?.session_id;
    console.log(`   🍪 Cookie session_id: ${sessionId ? sessionId.substring(0, 20) + "..." : "[AUSENTE]"}`);
    
    const session = validateSession(sessionId);
    
    if (!session) {
      console.log("   ❌ Sessão inválida ou ausente - redirecionando para login");
      
      // Redirecionar para tela de login preservando parâmetros OAuth
      const loginUrl = new URL(`${config.SERVER_URL}/oauth/login`);
      loginUrl.searchParams.set("client_id", client_id);
      loginUrl.searchParams.set("redirect_uri", redirect_uri);
      loginUrl.searchParams.set("response_type", response_type);
      loginUrl.searchParams.set("scope", scope || "mcp");
      if (state) loginUrl.searchParams.set("state", state);
      if (code_challenge) loginUrl.searchParams.set("code_challenge", code_challenge);
      if (code_challenge_method) loginUrl.searchParams.set("code_challenge_method", code_challenge_method);
      
      console.log(`   ↪️  Redirecionando para login: ${loginUrl.toString()}`);
      return res.redirect(loginUrl.toString());
    }
    
    console.log(`   ✅ Usuário autenticado: ${session.user}`);
    console.log("   📄 Mostrando tela de aprovação...");
    
    // Usuário está autenticado - mostrar tela de aprovação
    res.send(getAuthorizePage(client, req.query));
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
    
    console.log("\n🔐 POST /oauth/authorize");
    console.log(`   Action: ${action}`);
    console.log(`   Client ID: ${client_id}`);
    
    // Verificar sessão novamente
    const sessionId = req.cookies?.session_id;
    const session = validateSession(sessionId);
    
    if (!session) {
      console.log("   ❌ Sessão inválida ao processar aprovação");
      return res.status(401).send("Session expired. Please login again.");
    }
    
    const redirectUrl = new URL(redirect_uri);
    
    if (action === "approve") {
      console.log("   ✅ Usuário APROVOU autorização");
      
      const authCode = `code_${uuidv4()}`;
      
      storage.authCodes.set(authCode, {
        client_id,
        redirect_uri,
        scope: scope || "mcp",
        code_challenge,
        code_challenge_method: code_challenge_method || "S256",
        user: session.user,
        createdAt: Date.now(),
        expiresAt: Date.now() + config.CODE_EXPIRY
      });
      
      console.log(`   🎫 Código autorizado: ${authCode}`);
      
      redirectUrl.searchParams.set("code", authCode);
    } else {
      console.log("   ❌ Usuário NEGOU autorização");
      redirectUrl.searchParams.set("error", "access_denied");
    }
    
    if (state) redirectUrl.searchParams.set("state", state);
    
    console.log(`   ↪️  Redirecionando para: ${redirectUrl.toString()}`);
    res.redirect(redirectUrl.toString());
  });
  
  // -----------------------------------------------
  // 5. TOKEN ENDPOINT
  // -----------------------------------------------
  
  app.post("/oauth/token", (req, res) => {
    const { grant_type, code, code_verifier, refresh_token, client_id } = req.body;
    
    console.log("\n🎫 POST /oauth/token");
    console.log(`   Grant Type: ${grant_type}`);
    console.log(`   Client ID: ${client_id}`);
    
    if (grant_type === "authorization_code") {
      // Trocar código por token
      const authData = storage.authCodes.get(code);
      
      if (!authData) {
        console.log("   ❌ Código inválido ou expirado");
        return res.status(400).json({
          error: "invalid_grant",
          error_description: "Invalid or expired authorization code"
        });
      }
      
      // Validar PKCE se necessário
      if (authData.code_challenge) {
        if (!code_verifier) {
          console.log("   ❌ PKCE verifier ausente");
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
          console.log("   ❌ PKCE verificação falhou");
          return res.status(400).json({
            error: "invalid_grant",
            error_description: "PKCE verification failed"
          });
        }
        
        console.log("   ✅ PKCE validado com sucesso");
      }
      
      // Gerar tokens
      const accessToken = `mcp_${uuidv4()}`;
      const refreshToken = `refresh_${uuidv4()}`;
      
      const tokenData = {
        client_id: authData.client_id,
        user: authData.user,
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
      
      console.log("   ✅ Tokens gerados:");
      console.log(`      Access: ${accessToken.substring(0, 20)}...`);
      console.log(`      Refresh: ${refreshToken.substring(0, 20)}...`);
      console.log(`      User: ${authData.user}`);
      
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
        console.log("   ❌ Refresh token inválido");
        return res.status(400).json({
          error: "invalid_grant",
          error_description: "Invalid refresh token"
        });
      }
      
      const newAccessToken = `mcp_${uuidv4()}`;
      
      storage.tokens.set(newAccessToken, {
        client_id: refreshData.client_id,
        user: refreshData.user,
        scope: refreshData.scope,
        createdAt: Date.now(),
        expiresAt: Date.now() + config.TOKEN_EXPIRY
      });
      
      console.log(`   ✅ Token renovado: ${newAccessToken.substring(0, 20)}...`);
      console.log(`      User: ${refreshData.user}`);
      
      res.json({
        access_token: newAccessToken,
        token_type: "Bearer",
        expires_in: Math.floor(config.TOKEN_EXPIRY / 1000),
        refresh_token: refresh_token, // Mantém o mesmo refresh token
        scope: refreshData.scope
      });
      
    } else {
      console.log("   ❌ Grant type não suportado:", grant_type);
      res.status(400).json({
        error: "unsupported_grant_type"
      });
    }
  });
  
  // -----------------------------------------------
  // 6. TOKEN REVOCATION
  // -----------------------------------------------
  
  app.post("/oauth/revoke", (req, res) => {
    const { token, token_type_hint } = req.body;
    
    console.log("\n🗑️  POST /oauth/revoke");
    console.log(`   Token: ${token ? token.substring(0, 20) + "..." : "[AUSENTE]"}`);
    
    if (storage.tokens.has(token)) {
      storage.tokens.delete(token);
      console.log("   ✅ Token revogado");
    } else {
      console.log("   ⚠️  Token não encontrado (já revogado ou inválido)");
    }
    
    res.status(200).send();
  });
  
  // -----------------------------------------------
  // 7. MIDDLEWARE DE VALIDAÇÃO
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
    
    if (!authHeader) {
      console.log("⚠️  No auth header");
      return res.status(401).json({ 
        error: "unauthorized",
        error_description: "Authorization header required" 
      });
    }
    
    // Validar Bearer token
    if (authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      const tokenData = storage.tokens.get(token);
      
      if (!tokenData) {
        console.log(`❌ Token inválido: ${token.substring(0, 20)}...`);
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
      
      console.log(`✅ Token válido - User: ${tokenData.user}, Client: ${tokenData.client_id}`);
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
  // 8. ENDPOINT DE STATUS
  // -----------------------------------------------
  
  app.get("/oauth/status", (req, res) => {
    res.json({
      clients: storage.clients.size,
      active_codes: storage.authCodes.size,
      active_tokens: storage.tokens.size,
      active_sessions: storage.sessions.size,
      auto_approve: config.AUTO_APPROVE,
      authentication: config.AUTO_APPROVE ? "disabled (auto-approve)" : "enabled (password required)",
      token_expiry: config.TOKEN_EXPIRY / 1000 + " seconds",
      session_expiry: config.SESSION_EXPIRY / 1000 + " seconds",
      server_url: config.SERVER_URL
    });
  });
  
  // -----------------------------------------------
  // 9. ENDPOINT DE DOCUMENTAÇÃO
  // -----------------------------------------------
  
  app.get("/docs", (req, res) => {
    res.send(getDocsPage(config));
  });
  
  return { validateToken };
}

// ===============================================
// EXPORTS
// ===============================================

module.exports = { setupOAuthEndpoints };