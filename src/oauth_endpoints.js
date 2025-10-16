const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");
const { getUnifiedAuthPage, getDocsPage } = require("../utils/templates");
const { validateUser } = require("./oauth_storage");
const {
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
  CODE_EXPIRY: 120000     // 2 minutos
};

// ===============================================
// ARMAZENAMENTO EM MEMÓRIA (AUTH CODES)
// ===============================================

const authCodes = new Map();

function createAuthCode(data) {
  authCodes.set(data.code, {
    ...data,
    createdAt: Date.now()
  });
}

function getAuthCode(code) {
  const data = authCodes.get(code);
  if (!data) return null;
  
  if (Date.now() > data.expiresAt) {
    authCodes.delete(code);
    return null;
  }
  
  return data;
}

function consumeAuthCode(code) {
  authCodes.delete(code);
}

// ===============================================
// PKCE VALIDATION
// ===============================================

function validatePKCE(codeVerifier, codeChallenge, method = "S256") {
  if (method === "S256") {
    const hash = crypto
      .createHash("sha256")
      .update(codeVerifier)
      .digest("base64url");
    return hash === codeChallenge;
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
  
  app.get("/.well-known/oauth-authorization-server", (_req, res) => {
    console.log("📋 OAuth Discovery: Authorization Server");

    res.json({
      issuer: config.SERVER_URL,
      authorization_endpoint: `${config.SERVER_URL}/oauth/authorize`,
      token_endpoint: `${config.SERVER_URL}/oauth/token`,
      // ❌ REMOVIDO: registration_endpoint
      revocation_endpoint: `${config.SERVER_URL}/oauth/revoke`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256", "plain"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: ["mcp", "read", "write"],
      service_documentation: `${config.SERVER_URL}/docs`
    });
  });
  
  app.get("/.well-known/oauth-protected-resource", (_req, res) => {
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
  // AUTHORIZATION ENDPOINT (GET)
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
    console.log(`   State: ${state}`);
    console.log(`   PKCE: ${code_challenge ? "Yes" : "No"}`);
    console.log(`   PKCE Method: ${code_challenge_method || "none"}`);
    
    try {
      const client = await getClientById(client_id);
      
      if (!client) {
        console.log(`   ❌ Client não encontrado: ${client_id}`);
        return res.status(400).send(`
          <h1>Client Not Found</h1>
          <p>The client_id "${client_id}" is not registered.</p>
          <p>Please contact the administrator to register this client.</p>
        `);
      }
      
      if (!client.redirect_uris.includes(redirect_uri)) {
        console.log("   ❌ Redirect URI inválido");
        return res.status(400).send("Invalid redirect_uri");
      }
      
      console.log("   📄 Mostrando página de login & aprovação unificada...");
      res.send(getUnifiedAuthPage(client, req.query));
      
    } catch (error) {
      console.error("❌ Erro ao processar autorização:", error.message);
      res.status(500).send("Internal error");
    }
  });
  
  // -----------------------------------------------
  // AUTHORIZATION ENDPOINT (POST)
  // -----------------------------------------------

  app.post("/oauth/authorize", async (req, res) => {
    const {
      client_id,
      redirect_uri,
      scope,
      state,
      code_challenge,
      code_challenge_method,
      username,
      password,
      action
    } = req.body;
  
    console.log("\n🔐 POST /oauth/authorize");
    console.log(`   Action: ${action}`);
    console.log(`   Client: ${client_id}`);
    console.log(`   Username: ${username}`);
  
    try {
      const redirectUrl = new URL(redirect_uri);
    
      if (action === "deny") {
        console.log("   ❌ Usuário NEGOU autorização");
        redirectUrl.searchParams.set("error", "access_denied");
        redirectUrl.searchParams.set("error_description", "User denied authorization");
        if (state) redirectUrl.searchParams.set("state", state);
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
          return res.status(401)
            .header("WWW-Authenticate", 
              "Bearer realm=\"MCP Server\", " +
              "error=\"invalid_token\", " +
              "error_description=\"Refresh token is invalid or expired\"")
            .json({
              error: "invalid_grant",
              error_description: "Refresh token is invalid or expired"
            });
        }
        
        if (refreshData.revoked) {
          console.log("   ❌ Refresh token foi revogado");
          return res.status(401)
            .header("WWW-Authenticate", 
              "Bearer realm=\"MCP Server\", error=\"invalid_token\"")
            .json({
              error: "invalid_grant",
              error_description: "Refresh token has been revoked"
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
    if (req.method === "OPTIONS") {
      return next();
    }
    
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.log("⚠️  Missing or invalid Authorization header");
      return res.status(401)
        .header("WWW-Authenticate", 
          "Bearer realm=\"MCP Server\", " +
          `resource_metadata_uri="${config.SERVER_URL}/.well-known/oauth-protected-resource"`)
        .json({ 
          error: "unauthorized",
          error_description: "Bearer token required"
        });
    }
    
    const token = authHeader.substring(7);
    
    try {
      const tokenData = await getToken(token);
      
      if (!tokenData) {
        console.log(`❌ Token inválido: ${token.substring(0, 20)}...`);
        return res.status(401)
          .header("WWW-Authenticate", 
            "Bearer realm=\"MCP Server\", error=\"invalid_token\"")
          .json({
            error: "invalid_token",
            error_description: "The access token is invalid"
          });
      }
      
      if (tokenData.expires_at && Date.now() > tokenData.expires_at) {
        console.log(`❌ Token expirado: ${token.substring(0, 20)}...`);
        return res.status(401)
          .header("WWW-Authenticate", 
            "Bearer realm=\"MCP Server\", error=\"invalid_token\"")
          .json({
            error: "invalid_token",
            error_description: "The access token has expired"
          });
      }
      
      if (tokenData.revoked) {
        console.log(`❌ Token revogado: ${token.substring(0, 20)}...`);
        return res.status(401)
          .header("WWW-Authenticate", 
            "Bearer realm=\"MCP Server\", error=\"invalid_token\"")
          .json({
            error: "invalid_token",
            error_description: "The access token has been revoked"
          });
      }
      
      console.log(`✅ Token válido - User: ${tokenData.user_username}, Client: ${tokenData.client_id}`);
      
      req.oauth = {
        user: tokenData.user_username,
        user_id: tokenData.user_id,
        client_id: tokenData.client_id,
        scope: tokenData.scope
      };
      
      return next();
      
    } catch (error) {
      console.error("❌ Erro ao validar token:", error.message);
      return res.status(500).json({ error: "internal_error" });
    }
  }
  
  app.get("/docs", (_req, res) => {
    res.send(getDocsPage(config));
  });
  
  return { validateToken };
}

module.exports = { setupOAuthEndpoints };