const { v4: uuidv4 } = require("uuid");
const crypto = require("crypto");
const { getDocsPage, getUnifiedAuthPage } = require("../utils/templates");
const { 
  validateUser,
  createClient,
  getClientById,
  createToken,
  getToken,
  revokeToken
} = require("./oauth_storage");

// ===============================================
// CONFIGURAÇÃO
// ===============================================
const config = {
  SERVER_URL: process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 3000}`,
  TOKEN_EXPIRY: 3600000,  // 1 hora
  CODE_EXPIRY: 600000     // 10 minutos
};

// ===============================================
// AUTH CODES EM MEMÓRIA
// ===============================================
const authCodes = new Map();

function createAuthCode(codeData) {
  const { code, client_id, user_id, username, redirect_uri, scope, code_challenge, code_challenge_method, expiresAt } = codeData;
  
  authCodes.set(code, {
    client_id,
    user_id,
    username,
    redirect_uri,
    scope,
    code_challenge,
    code_challenge_method,
    expiresAt,
    used: false
  });
}

function getAuthCode(code) {
  const data = authCodes.get(code);
  
  if (!data) {
    return null;
  }
  
  if (data.expiresAt < Date.now()) {
    authCodes.delete(code);
    return null;
  }
  
  if (data.used) {
    return null;
  }
  
  return data;
}

function consumeAuthCode(code) {
  authCodes.delete(code);
  console.log("   🗑️  Auth code consumido e removido da memória");
  console.log(`   📊 Total codes em memória: ${authCodes.size}`);
}

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
      
      const client = await createClient({
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
  // AUTHORIZATION ENDPOINT (UNIFICADO)
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
    console.log(`   Scope: ${scope || "mcp"}`);
    console.log(`   State: ${state || "none"}`);
    console.log(`   PKCE: ${code_challenge ? "Yes" : "No"}`);
    if (code_challenge_method) {
      console.log(`   PKCE Method: ${code_challenge_method}`);
    }
  
    try {
      const client = await getClientById(client_id);
      
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
      
      console.log("   📄 Mostrando página de login & aprovação unificada...");
      
      res.send(getUnifiedAuthPage(client, req.query));
      
    } catch (error) {
      console.error("❌ Erro no authorize:", error.message);
      res.status(500).send("Internal error");
    }
  });
  
  app.post("/oauth/authorize", async (req, res) => {
    const {
      username,
      password,
      client_id,
      redirect_uri,
      scope,
      state,
      code_challenge,
      code_challenge_method,
      action
    } = req.body;
    
    console.log("\n🔐 POST /oauth/authorize");
    console.log(`   Username: ${username}`);
    console.log(`   Action: ${action}`);
    console.log(`   Client ID: ${client_id}`);
    
    try {
      const redirectUrl = new URL(redirect_uri);
      
      if (action === "deny") {
        console.log("   ❌ Usuário NEGOU autorização");
        redirectUrl.searchParams.set("error", "access_denied");
        if (state) {
          redirectUrl.searchParams.set("state", state);
        }
        
        console.log(`   ↪️  Redirecionando para: ${redirectUrl.toString()}`);
        return res.redirect(redirectUrl.toString());
      }
      
      const validation = await validateUser(username, password);
      
      if (!validation.valid) {
        console.log(`   ❌ Validação falhou: ${validation.error}`);
        
        const client = await getClientById(client_id);
        return res.send(getUnifiedAuthPage(client, req.body, validation.error));
      }
      
      console.log(`   ✅ Usuário autenticado: ${validation.username}`);
      console.log("   ✅ Usuário APROVOU autorização");
      
      const authCode = `code_${uuidv4()}`;
      
      createAuthCode({
        code: authCode,
        client_id,
        user_id: validation.userId,
        username: validation.username,
        redirect_uri,
        scope: scope || "mcp",
        code_challenge,
        code_challenge_method: code_challenge_method || "S256",
        expiresAt: Date.now() + config.CODE_EXPIRY
      });
      
      console.log(`   🎫 Código autorizado: ${authCode.substring(0, 20)}...`);
      
      redirectUrl.searchParams.set("code", authCode);
      if (state) {
        redirectUrl.searchParams.set("state", state);
      }
      
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
    const { grant_type, code, code_verifier, refresh_token } = req.body;
    
    console.log("\n🎫 POST /oauth/token");
    console.log(`   Grant Type: ${grant_type}`);
    
    try {
      if (grant_type === "authorization_code") {
        const authData = getAuthCode(code);
        
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
        
        await createToken({
          token: accessToken,
          token_type: "access",
          client_id: authData.client_id,
          user_id: authData.user_id,
          scope: authData.scope,
          expiresAt: Date.now() + config.TOKEN_EXPIRY
        });
        
        await createToken({
          token: refreshToken,
          token_type: "refresh",
          client_id: authData.client_id,
          user_id: authData.user_id,
          scope: authData.scope,
          expiresAt: null
        });
        
        consumeAuthCode(code);
        
        console.log("   ✅ Tokens gerados:");
        console.log(`      Access: ${accessToken.substring(0, 20)}...`);
        console.log(`      Refresh: ${refreshToken.substring(0, 20)}...`);
        console.log(`      User: ${authData.username}`);
        
        res.json({
          access_token: accessToken,
          token_type: "Bearer",
          expires_in: Math.floor(config.TOKEN_EXPIRY / 1000),
          refresh_token: refreshToken,
          scope: authData.scope
        });
        
      } else if (grant_type === "refresh_token") {
        const refreshData = await getToken(refresh_token);
        
        if (!refreshData || refreshData.token_type !== "refresh") {
          console.log("   ❌ Refresh token inválido");
          return res.status(400).json({
            error: "invalid_grant",
            error_description: "Invalid refresh token"
          });
        }
        
        const newAccessToken = `mcp_${uuidv4()}`;
        
        await createToken({
          token: newAccessToken,
          token_type: "access",
          client_id: refreshData.client_id,
          user_id: refreshData.user_id,
          scope: refreshData.scope,
          expiresAt: Date.now() + config.TOKEN_EXPIRY
        });
        
        console.log(`   ✅ Token renovado: ${newAccessToken.substring(0, 20)}...`);
        console.log(`      User: ${refreshData.user_username}`);
        console.log(`      🔄 REUSANDO refresh token: ${refresh_token.substring(0, 20)}...`);
        
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
      const tokenData = await getToken(token);
      
      if (tokenData) {
        await revokeToken(token);
        console.log("   ✅ Token revogado");
      } else {
        console.log("   ⚠️  Token não encontrado (já revogado ou inválido)");
      }
      
      res.status(200).send();
      
    } catch (error) {
      console.error("❌ Erro ao revogar token:", error.message);
      res.status(200).send();
    }
  });
  
  // -----------------------------------------------
  // MIDDLEWARE DE VALIDAÇÃO
  // -----------------------------------------------
  
  async function validateToken(req, res, next) {
    if (req.body?.method === "initialize") {
      console.log("🆓 Initialize request");
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
        const tokenData = await getToken(token);
        
        if (!tokenData) {
          console.log(`❌ Token inválido: ${token.substring(0, 20)}...`);
          return res.status(401).json({
            error: "invalid_token",
            error_description: "The access token is invalid"
          });
        }
        
        console.log(`✅ Token válido - User: ${tokenData.user_username}, Client: ${tokenData.client_id}`);
        
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
  
  app.get("/docs", (req, res) => {
    res.send(getDocsPage(config));
  });
  
  return { validateToken };
}

module.exports = { setupOAuthEndpoints };