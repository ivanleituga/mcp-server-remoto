const { v4: uuidv4 } = require("uuid");
const crypto = require("crypto");
const { getAuthorizePage, getDocsPage, getLoginPage } = require("../utils/templates");
const storage = require("./oauth_storage");

// ===============================================
// CONFIGURAÇÃO
// ===============================================
const config = {
  SERVER_URL: process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 3000}`,
  TOKEN_EXPIRY: 3600000,  // 1 hora
  CODE_EXPIRY: 600000,    // 10 minutos
  SESSION_EXPIRY: 3600000, // 1 hora
  AUTO_APPROVE: false
};

// ===============================================
// FUNÇÕES AUXILIARES PKCE
// ===============================================

function generateCodeChallenge(verifier) {
  return crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64url");
}

function validatePKCE(codeVerifier, codeChallenge, method = "S256") {
  if (method === "S256") {
    return generateCodeChallenge(codeVerifier) === codeChallenge;
  }
  return codeVerifier === codeChallenge;
}

// ===============================================
// FUNÇÕES DE SESSÃO
// ===============================================

async function createSessionForUser(username, userId) {
  const sessionId = uuidv4();
  
  await storage.createSession({
    session_id: sessionId,
    user_id: userId,
    expiresAt: Date.now() + config.SESSION_EXPIRY
  });
  
  console.log(`✅ Nova sessão criada: ${sessionId} (user: ${username})`);
  return sessionId;
}

async function validateSession(sessionId) {
  if (!sessionId) {
    console.log("⚠️  Nenhum session_id fornecido");
    return null;
  }
  
  const session = await storage.getSession(sessionId);
  
  if (!session) {
    console.log(`❌ Sessão não encontrada ou expirada: ${sessionId}`);
    return null;
  }
  
  console.log(`✅ Sessão válida: ${sessionId} (user: ${session.user_username})`);
  
  // Retornar formato compatível com código atual
  return {
    user: session.user_username,
    userId: session.user_id,
    createdAt: new Date(session.created_at).getTime(),
    expiresAt: new Date(session.expires_at).getTime()
  };
}

// ===============================================
// IMPLEMENTAÇÃO OAUTH
// ===============================================

function setupOAuthEndpoints(app) {
  
  // -----------------------------------------------
  // DISCOVERY ENDPOINTS
  // -----------------------------------------------
  
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
  // CLIENT REGISTRATION
  // -----------------------------------------------
  
  app.post("/oauth/register", async (req, res) => {
    console.log("📝 Client Registration Request:", JSON.stringify(req.body, null, 2));
    
    try {
      const clientId = `client_${uuidv4()}`;
      const clientSecret = `secret_${uuidv4()}`;
      
      const client = await storage.createClient({
        client_id: clientId,
        client_secret: clientSecret,
        client_name: req.body.client_name || "MCP Client",
        redirect_uris: req.body.redirect_uris || ["https://claude.ai/api/mcp/auth_callback"],
        grant_types: req.body.grant_types || ["authorization_code", "refresh_token"],
        response_types: req.body.response_types || ["code"],
        scope: req.body.scope || "mcp"
      });
      
      console.log(`✅ Client registered: ${clientId}`);
      console.log(`   Name: ${client.client_name}`);
      console.log(`   Redirect URIs: ${client.redirect_uris.join(", ")}`);
      
      res.json({
        client_id: clientId,
        client_secret: clientSecret,
        client_id_issued_at: Math.floor(new Date(client.created_at).getTime() / 1000),
        grant_types: client.grant_types,
        response_types: client.response_types,
        redirect_uris: client.redirect_uris,
        token_endpoint_auth_method: "none",
        scope: client.scope
      });
      
    } catch (error) {
      console.error("❌ Erro ao registrar cliente:", error.message);
      res.status(500).json({ error: "internal_error" });
    }
  });
  
  // -----------------------------------------------
  // LOGIN FLOW
  // -----------------------------------------------
  
  app.get("/oauth/login", (req, res) => {
    console.log("\n🔑 GET /oauth/login");
    console.log("   Query params:", JSON.stringify(req.query, null, 2));
    
    res.send(getLoginPage(req.query));
  });
  
  app.post("/oauth/login", async (req, res) => {
    console.log("\n🔑 POST /oauth/login");
    console.log("   Body keys:", Object.keys(req.body));
    
    const { username, password, client_id, redirect_uri, response_type, scope, state, code_challenge, code_challenge_method } = req.body;
    
    console.log(`   Username: ${username}`);
    console.log(`   Password: ${password ? "[PRESENTE]" : "[AUSENTE]"}`);
    console.log(`   OAuth params: client_id=${client_id}`);
    
    // Validar usuário via banco de dados
    const validation = await storage.validateUser(username, password);
    
    if (!validation.valid) {
      console.log(`   ❌ Validação falhou: ${validation.error}`);
      
      return res.send(getLoginPage({
        ...req.body,
        error: validation.error
      }));
    }
    
    console.log(`   ✅ Login autorizado: ${validation.username}`);
    
    try {
      // Criar sessão no banco
      const sessionId = await createSessionForUser(validation.username, validation.userId);
      
      res.cookie("session_id", sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: config.SESSION_EXPIRY
      });
      
      console.log(`   🍪 Cookie session_id definido: ${sessionId.substring(0, 20)}...`);
      
      // Redirecionar para authorize
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
      
    } catch (error) {
      console.error("❌ Erro ao criar sessão:", error.message);
      res.status(500).send("Internal error");
    }
  });
  
  // -----------------------------------------------
  // AUTHORIZATION ENDPOINT
  // -----------------------------------------------
  
  app.get("/oauth/authorize", async (req, res) => {
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
  
    try {
      const client = await storage.getClientById(client_id);
      
      if (!client) {
        console.log("   ❌ Cliente não encontrado:", client_id);
        return res.status(400).send("Invalid client_id");
      }
  
      if (!client.redirect_uris.includes(redirect_uri)) {
        console.log("   ❌ Redirect URI inválido:", redirect_uri);
        return res.status(400).send("Invalid redirect_uri");
      }
  
      if (response_type !== "code") {
        console.log("   ❌ Response type inválido:", response_type);
        return res.status(400).send("Invalid response_type - only 'code' is supported");
      }
      
      const sessionId = req.cookies?.session_id;
      console.log(`   🍪 Cookie session_id: ${sessionId ? sessionId.substring(0, 20) + "..." : "[AUSENTE]"}`);
      
      const session = await validateSession(sessionId);
      
      if (!session) {
        console.log("   ❌ Sessão inválida ou ausente - redirecionando para login");
        
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
      
      res.send(getAuthorizePage(client, req.query));
      
    } catch (error) {
      console.error("❌ Erro no authorize:", error.message);
      res.status(500).send("Internal error");
    }
  });
  
  app.post("/oauth/authorize", async (req, res) => {
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
    
    try {
      const sessionId = req.cookies?.session_id;
      const session = await validateSession(sessionId);
      
      if (!session) {
        console.log("   ❌ Sessão inválida ao processar aprovação");
        return res.status(401).send("Session expired. Please login again.");
      }
      
      const redirectUrl = new URL(redirect_uri);
      
      if (action === "approve") {
        console.log("   ✅ Usuário APROVOU autorização");
        
        const authCode = `code_${uuidv4()}`;
        
        await storage.createAuthCode({
          code: authCode,
          client_id,
          user_id: session.userId,
          redirect_uri,
          scope: scope || "mcp",
          code_challenge,
          code_challenge_method: code_challenge_method || "S256",
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
      
    } catch (error) {
      console.error("❌ Erro ao processar aprovação:", error.message);
      res.status(500).send("Internal error");
    }
  });
  
  // -----------------------------------------------
  // TOKEN ENDPOINT
  // -----------------------------------------------
  
  app.post("/oauth/token", async (req, res) => {
    const { grant_type, code, code_verifier, refresh_token, client_id } = req.body;
    
    console.log("\n🎫 POST /oauth/token");
    console.log(`   Grant Type: ${grant_type}`);
    console.log(`   Client ID: ${client_id}`);
    
    try {
      if (grant_type === "authorization_code") {
        const authData = await storage.getAuthCode(code);
        
        if (!authData) {
          console.log("   ❌ Código inválido ou expirado");
          return res.status(400).json({
            error: "invalid_grant",
            error_description: "Invalid or expired authorization code"
          });
        }
        
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
        
        const accessToken = `mcp_${uuidv4()}`;
        const refreshToken = `refresh_${uuidv4()}`;
        
        // Criar tokens no banco
        await storage.createToken({
          token: accessToken,
          token_type: "access",
          client_id: authData.client_id,
          user_id: authData.user_id,
          scope: authData.scope,
          expiresAt: Date.now() + config.TOKEN_EXPIRY
        });
        
        await storage.createToken({
          token: refreshToken,
          token_type: "refresh",
          client_id: authData.client_id,
          user_id: authData.user_id,
          scope: authData.scope,
          expiresAt: null // Refresh tokens não expiram
        });
        
        // Marcar código como usado e deletar
        await storage.markAuthCodeAsUsed(code);
        await storage.deleteAuthCode(code);
        
        console.log("   ✅ Tokens gerados:");
        console.log(`      Access: ${accessToken.substring(0, 20)}...`);
        console.log(`      Refresh: ${refreshToken.substring(0, 20)}...`);
        console.log(`      User: ${authData.user_username}`);
        
        res.json({
          access_token: accessToken,
          token_type: "Bearer",
          expires_in: Math.floor(config.TOKEN_EXPIRY / 1000),
          refresh_token: refreshToken,
          scope: authData.scope
        });
        
      } else if (grant_type === "refresh_token") {
        const refreshData = await storage.getToken(refresh_token);
        
        if (!refreshData || refreshData.token_type !== "refresh") {
          console.log("   ❌ Refresh token inválido");
          return res.status(400).json({
            error: "invalid_grant",
            error_description: "Invalid refresh token"
          });
        }
        
        const newAccessToken = `mcp_${uuidv4()}`;
        
        await storage.createToken({
          token: newAccessToken,
          token_type: "access",
          client_id: refreshData.client_id,
          user_id: refreshData.user_id,
          scope: refreshData.scope,
          expiresAt: Date.now() + config.TOKEN_EXPIRY
        });
        
        console.log(`   ✅ Token renovado: ${newAccessToken.substring(0, 20)}...`);
        console.log(`      User: ${refreshData.user_username}`);
        
        res.json({
          access_token: newAccessToken,
          token_type: "Bearer",
          expires_in: Math.floor(config.TOKEN_EXPIRY / 1000),
          refresh_token: refresh_token,
          scope: refreshData.scope
        });
        
      } else {
        console.log("   ❌ Grant type não suportado:", grant_type);
        res.status(400).json({
          error: "unsupported_grant_type"
        });
      }
      
    } catch (error) {
      console.error("❌ Erro no token endpoint:", error.message);
      res.status(500).json({ error: "internal_error" });
    }
  });
  
  // -----------------------------------------------
  // TOKEN REVOCATION
  // -----------------------------------------------
  
  app.post("/oauth/revoke", async (req, res) => {
    const { token } = req.body;
    
    console.log("\n🗑️  POST /oauth/revoke");
    console.log(`   Token: ${token ? token.substring(0, 20) + "..." : "[AUSENTE]"}`);
    
    try {
      const tokenData = await storage.getToken(token);
      
      if (tokenData) {
        await storage.revokeToken(token);
        console.log("   ✅ Token revogado");
      } else {
        console.log("   ⚠️  Token não encontrado (já revogado ou inválido)");
      }
      
      res.status(200).send();
      
    } catch (error) {
      console.error("❌ Erro ao revogar token:", error.message);
      res.status(200).send(); // OAuth spec: sempre retornar 200
    }
  });
  
  // -----------------------------------------------
  // MIDDLEWARE DE VALIDAÇÃO
  // -----------------------------------------------
  
  async function validateToken(req, res, next) {
    if (req.body?.method === "initialize") {
      console.log("🆓 Initialize request - bypass OAuth");
      return next();
    }
    
    if (req.method === "OPTIONS") {
      return next();
    }
    
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      console.log("⚠️  No auth header");
      return res.status(401).json({ 
        error: "unauthorized",
        error_description: "Authorization header required" 
      });
    }
    
    if (authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      
      try {
        const tokenData = await storage.getToken(token);
        
        if (!tokenData) {
          console.log(`❌ Token inválido: ${token.substring(0, 20)}...`);
          return res.status(401).json({
            error: "invalid_token",
            error_description: "The access token is invalid"
          });
        }
        
        console.log(`✅ Token válido - User: ${tokenData.user_username}, Client: ${tokenData.client_id}`);
        
        // Formato compatível com código atual
        req.oauth = {
          user: tokenData.user_username,
          client_id: tokenData.client_id,
          scope: tokenData.scope
        };
        
        return next();
        
      } catch (error) {
        console.error("❌ Erro ao validar token:", error.message);
        return res.status(500).json({ error: "internal_error" });
      }
    }
    
    console.log("❌ Formato de autorização inválido");
    res.status(401).json({
      error: "invalid_request",
      error_description: "Invalid authorization header format"
    });
  }
  
  // -----------------------------------------------
  // STATUS & DEBUG ENDPOINTS
  // -----------------------------------------------
  
  app.get("/oauth/status", async (req, res) => {
    try {
      const { pool } = require("./database");
      
      const clientsResult = await pool.query("SELECT COUNT(*) FROM mcp_clients");
      const codesResult = await pool.query("SELECT COUNT(*) FROM mcp_auth_codes WHERE used = false");
      const tokensResult = await pool.query("SELECT COUNT(*) FROM mcp_tokens WHERE revoked = false");
      const sessionsResult = await pool.query("SELECT COUNT(*) FROM mcp_sessions WHERE expires_at > CURRENT_TIMESTAMP");
      
      const clientsCount = clientsResult.rows[0].count;
      const codesCount = codesResult.rows[0].count;
      const tokensCount = tokensResult.rows[0].count;
      const sessionsCount = sessionsResult.rows[0].count;
      
      res.json({
        clients: parseInt(clientsCount),
        active_codes: parseInt(codesCount),
        active_tokens: parseInt(tokensCount),
        active_sessions: parseInt(sessionsCount),
        auto_approve: config.AUTO_APPROVE,
        authentication: "enabled (database)",
        storage: "PostgreSQL",
        token_expiry: config.TOKEN_EXPIRY / 1000 + " seconds",
        session_expiry: config.SESSION_EXPIRY / 1000 + " seconds",
        server_url: config.SERVER_URL
      });
      
    } catch (error) {
      console.error("❌ Erro ao buscar status:", error.message);
      res.status(500).json({ error: "internal_error" });
    }
  });
  
  app.get("/docs", (req, res) => {
    res.send(getDocsPage(config));
  });
  
  return { validateToken };
}

module.exports = { setupOAuthEndpoints };