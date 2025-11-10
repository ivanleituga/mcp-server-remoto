const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");
const { getUnifiedAuthPage, getDocsPage } = require("../utils/templates");
const AuditLogger = require("./audit_logger");
const { validateUser } = require("./oauth_storage");
const {
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
  TOKEN_EXPIRY: 12 * 60 * 60 * 1000,  // 12 horas
  CODE_EXPIRY: 120000                  // 2 minutos
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
  // DYNAMIC CLIENT REGISTRATION
  // -----------------------------------------------
  
  app.post("/oauth/register", async (req, res) => {
    const { client_name, redirect_uris = [], scope } = req.body;
    
    console.log("\n📝 POST /oauth/register");
    console.log(`   Body keys: ${JSON.stringify(Object.keys(req.body))}`);
    console.log("📝 Client Registration Request:", JSON.stringify(req.body, null, 2));
    
    try {
      if (!client_name) {
        console.log("   ❌ Client name ausente");
        return res.status(400).json({
          error: "invalid_client_metadata",
          error_description: "client_name is required"
        });
      }
      
      if (!Array.isArray(redirect_uris) || redirect_uris.length === 0) {
        console.log("   ❌ redirect_uris inválido");
        return res.status(400).json({
          error: "invalid_client_metadata",
          error_description: "redirect_uris must be a non-empty array"
        });
      }
      
      const client_id = uuidv4();
      
      const client = await createClient({
        client_id,
        client_name,
        redirect_uris,
        scope: scope || "mcp"
      });
      
      console.log(`   ✅ Cliente registrado: ${client_id}`);
      
      res.status(201).json({
        client_id: client.client_id,
        client_name: client.client_name,
        redirect_uris: client.redirect_uris,
        grant_types: client.grant_types,
        response_types: client.response_types,
        token_endpoint_auth_method: "none",
        scope: client.scope
      });
      
    } catch (error) {
      console.error("   ❌ Erro no registro:", error.message);
      res.status(500).json({
        error: "server_error",
        error_description: "Internal server error"
      });
    }
  });

  // -----------------------------------------------
  // AUTHORIZATION ENDPOINT (GET)
  // -----------------------------------------------
  
  app.get("/oauth/authorize", async (req, res) => {
    const {
      client_id,
      redirect_uri,
      state,
      code_challenge,
      code_challenge_method = "S256",
      scope = "mcp"
    } = req.query;
    
    console.log("\n🔐 GET /oauth/authorize");
    console.log(`   Client ID: ${client_id}`);
    console.log(`   Redirect URI: ${redirect_uri}`);
    console.log(`   PKCE: ${code_challenge ? "✅" : "❌"}`);
    
    try {
      if (!client_id || !redirect_uri) {
        return res.status(400).json({
          error: "invalid_request",
          error_description: "client_id and redirect_uri are required"
        });
      }
      
      if (!code_challenge) {
        return res.status(400).json({
          error: "invalid_request",
          error_description: "code_challenge is required (PKCE)"
        });
      }
      
      const client = await getClientById(client_id);
      
      if (!client) {
        console.log(`   ❌ Client não encontrado: ${client_id}`);
        return res.status(400).json({
          error: "invalid_client",
          error_description: "Client not found"
        });
      }
      
      const validRedirect = client.redirect_uris.includes(redirect_uri);
      if (!validRedirect) {
        console.log(`   ❌ Redirect URI inválido: ${redirect_uri}`);
        return res.status(400).json({
          error: "invalid_request",
          error_description: "Invalid redirect_uri"
        });
      }
      
      console.log("   ✅ Mostrando página de login/autorização");
      
      res.send(getUnifiedAuthPage(client, {
        client_id,
        redirect_uri,
        state,
        code_challenge,
        code_challenge_method,
        scope
      }));
      
    } catch (error) {
      console.error("   ❌ Erro:", error.message);
      res.status(500).json({
        error: "server_error",
        error_description: "Internal server error"
      });
    }
  });

  // -----------------------------------------------
  // AUTHORIZATION ENDPOINT (POST) - Login + Approve
  // -----------------------------------------------
  
  app.post("/oauth/authorize", async (req, res) => {
    const {
      username,
      password,
      action,
      client_id,
      redirect_uri,
      state,
      code_challenge,
      code_challenge_method = "S256",
      scope = "mcp"
    } = req.body;
    
    console.log("\n🔐 POST /oauth/authorize");
    console.log(`   Action: ${action}`);
    console.log(`   Username: ${username}`);
    
    try {
      if (action === "deny") {
        console.log("   ❌ Usuário negou autorização");
        const errorUrl = new URL(redirect_uri);
        errorUrl.searchParams.set("error", "access_denied");
        errorUrl.searchParams.set("error_description", "User denied authorization");
        if (state) errorUrl.searchParams.set("state", state);
        return res.redirect(errorUrl.toString());
      }
      
      const userValidation = await validateUser(username, password);
      
      if (!userValidation.valid) {
        console.log(`   ❌ Validação falhou: ${userValidation.error}`);
        
        // Log de login falhado
        await AuditLogger.logLoginFailure(username, client_id, req, userValidation.error);
        
        const client = await getClientById(client_id);
        return res.send(getUnifiedAuthPage(client, {
          client_id,
          redirect_uri,
          state,
          code_challenge,
          code_challenge_method,
          scope
        }, userValidation.error));
      }
      
      // Log de login bem-sucedido
      await AuditLogger.logLogin(userValidation.userId, client_id, req);
      
      const code = crypto.randomBytes(32).toString("base64url");
      
      createAuthCode({
        code,
        client_id,
        user_id: userValidation.userId,
        redirect_uri,
        scope,
        code_challenge,
        code_challenge_method,
        expiresAt: Date.now() + config.CODE_EXPIRY
      });
      
      console.log(`   ✅ Authorization code gerado: ${code.substring(0, 20)}...`);
      console.log(`   📤 Redirecionando para: ${redirect_uri}`);
      
      const successUrl = new URL(redirect_uri);
      successUrl.searchParams.set("code", code);
      if (state) successUrl.searchParams.set("state", state);
      
      res.redirect(successUrl.toString());
      
    } catch (error) {
      console.error("   ❌ Erro:", error.message);
      res.status(500).json({
        error: "server_error",
        error_description: "Internal server error"
      });
    }
  });

  // -----------------------------------------------
  // TOKEN ENDPOINT
  // -----------------------------------------------
  
  app.post("/oauth/token", async (req, res) => {
    const {
      grant_type,
      code,
      client_id,
      code_verifier,
      refresh_token
    } = req.body;
    
    console.log("\n🎫 POST /oauth/token");
    console.log(`   Grant type: ${grant_type}`);
    
    try {
      // -----------------------------------------------
      // AUTHORIZATION CODE GRANT
      // -----------------------------------------------
      
      if (grant_type === "authorization_code") {
        console.log("🔑 Authorization Code Grant");
        
        if (!code || !client_id || !code_verifier) {
          console.log("   ❌ Parâmetros faltando");
          return res.status(400).json({
            error: "invalid_request",
            error_description: "code, client_id, and code_verifier are required"
          });
        }
        
        const codeData = getAuthCode(code);
        
        if (!codeData || codeData.client_id !== client_id) {
          console.log("   ❌ Authorization code inválido");
          return res.status(400).json({
            error: "invalid_grant",
            error_description: "Invalid or expired authorization code"
          });
        }
        
        if (!validatePKCE(code_verifier, codeData.code_challenge, codeData.code_challenge_method)) {
          console.log("   ❌ PKCE validation falhou");
          consumeAuthCode(code);
          return res.status(400).json({
            error: "invalid_grant",
            error_description: "PKCE validation failed"
          });
        }
        
        consumeAuthCode(code);
        console.log("   ✅ PKCE válido");
        
        const accessToken = crypto.randomBytes(32).toString("base64url");
        const refreshToken = crypto.randomBytes(32).toString("base64url");
        
        await createToken({
          token: accessToken,
          token_type: "access",
          client_id: codeData.client_id,
          user_id: codeData.user_id,
          scope: codeData.scope,
          expiresAt: Date.now() + config.TOKEN_EXPIRY
        });
        
        await createToken({
          token: refreshToken,
          token_type: "refresh",
          client_id: codeData.client_id,
          user_id: codeData.user_id,
          scope: codeData.scope
        });
        
        console.log(`   ✅ Access token: ${accessToken.substring(0, 20)}...`);
        console.log(`   ✅ Refresh token: ${refreshToken.substring(0, 20)}...`);
        
        return res.json({
          access_token: accessToken,
          token_type: "bearer",
          expires_in: config.TOKEN_EXPIRY / 1000,
          refresh_token: refreshToken,
          scope: codeData.scope
        });
      }
      
      // -----------------------------------------------
      // REFRESH TOKEN GRANT (COM TOKEN ROTATION)
      // -----------------------------------------------
      
      if (grant_type === "refresh_token") {
        console.log("🔄 Refresh Token Grant");
        
        if (!refresh_token) {
          console.log("   ❌ refresh_token ausente");
          return res.status(400).json({
            error: "invalid_request",
            error_description: "refresh_token is required"
          });
        }

        const refreshData = await getToken(refresh_token);
        
        if (!refreshData || refreshData.token_type !== "refresh") {
          console.log(`   ❌ Refresh token inválido: ${refresh_token.substring(0, 20)}...`);
          return res.status(401)
            .header("WWW-Authenticate", 
              "Bearer realm=\"MCP Server\", error=\"invalid_token\"")
            .json({
              error: "invalid_token",
              error_description: "Invalid or expired refresh token"
            });
        }

        const newAccessToken = crypto.randomBytes(32).toString("base64url");
        await createToken({
          token: newAccessToken,
          token_type: "access",
          client_id: refreshData.client_id,
          user_id: refreshData.user_id,
          scope: refreshData.scope,
          expiresAt: Date.now() + config.TOKEN_EXPIRY
        });

        const newRefreshToken = crypto.randomBytes(32).toString("base64url");
        await createToken({
          token: newRefreshToken,
          token_type: "refresh",
          client_id: refreshData.client_id,
          user_id: refreshData.user_id,
          scope: refreshData.scope
        });

        await revokeToken(refresh_token);

        console.log("   ✅ Token rotation concluída");
        console.log(`   🔑 Novo access token: ${newAccessToken.substring(0, 20)}...`);
        console.log(`   🔑 Novo refresh token: ${newRefreshToken.substring(0, 20)}...`);
        console.log(`   🗑️  Refresh token antigo DELETADO: ${refresh_token.substring(0, 20)}...`);

        return res.json({
          access_token: newAccessToken,
          token_type: "bearer",
          expires_in: config.TOKEN_EXPIRY / 1000,
          refresh_token: newRefreshToken,
          scope: refreshData.scope
        });
      }
      
      // -----------------------------------------------
      // GRANT TYPE NÃO SUPORTADO
      // -----------------------------------------------
      
      console.log(`   ❌ Grant type não suportado: ${grant_type}`);
      return res.status(400).json({
        error: "unsupported_grant_type",
        error_description: `Grant type "${grant_type}" is not supported`
      });
      
    } catch (error) {
      console.error("   ❌ Erro no token endpoint:", error.message);
      return res.status(500).json({
        error: "server_error",
        error_description: "Internal server error"
      });
    }
  });

  // -----------------------------------------------
  // REVOCATION ENDPOINT
  // -----------------------------------------------
  
  app.post("/oauth/revoke", async (req, res) => {
    const { token } = req.body;
    
    console.log("\n🔴 POST /oauth/revoke");
    console.log(`   Token: ${token ? token.substring(0, 20) + "..." : "[AUSENTE]"}`);
    
    try {
      const tokenData = await getToken(token);
      
      if (tokenData) {
        await revokeToken(token);
        console.log("   ✅ Token deletado");
      } else {
        console.log("   ⚠️  Token não encontrado (já deletado ou inválido)");
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
    res.send(getDocsPage());
  });
  
  return { validateToken };
}

module.exports = { setupOAuthEndpoints };