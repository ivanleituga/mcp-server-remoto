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
const { pool } = require("./database");

// ===============================================
// CONFIGURAÇÃO
// ===============================================

const SERVER_URL =
  process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 3000}`;

const config = {
  SERVER_URL,
  TOKEN_EXPIRY: 12 * 60 * 60 * 1000, // 12 horas
  CODE_EXPIRY: 2 * 60 * 1000 // 2 minutos
};

// Config Google
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_CALLBACK_URL =
  process.env.GOOGLE_CALLBACK_URL || `${SERVER_URL}/auth/google/callback`;

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
// ARMAZENAMENTO EM MEMÓRIA (GOOGLE LOGIN STATE)
// ===============================================

const loginStates = new Map();
const LOGIN_STATE_TTL = 5 * 60 * 1000; // 5 minutos

function createLoginState(data) {
  const id = crypto.randomBytes(16).toString("base64url");
  loginStates.set(id, {
    ...data,
    createdAt: Date.now()
  });
  return id;
}

function getLoginState(id) {
  const state = loginStates.get(id);
  if (!state) return null;

  if (Date.now() - state.createdAt > LOGIN_STATE_TTL) {
    loginStates.delete(id);
    return null;
  }

  return state;
}

function consumeLoginState(id) {
  const state = getLoginState(id);
  if (state) {
    loginStates.delete(id);
  }
  return state;
}

// ===============================================
// PKCE VALIDATION
// ===============================================

function validatePKCE(codeVerifier, storedChallenge, method) {
  if (!storedChallenge) return false;
  if (method === "plain") {
    return codeVerifier === storedChallenge;
  }

  // S256
  const hash = crypto
    .createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");

  return hash === storedChallenge;
}

// ===============================================
// HELPERS GOOGLE
// ===============================================

/**
 * Cria ou reutiliza usuário baseado nos dados do Google.
 * Usa google_id se existir, senão tenta casar por email.
 */
async function findOrCreateGoogleUser({ googleId, email, name }, req, clientId) {
  if (!googleId) {
    throw new Error("Google profile sem 'sub/id'");
  }

  console.log(
    `[Google OAuth] Autenticando: ${email || "sem email"} (google_id: ${googleId})`
  );

  let user;

  // 1) Tenta por google_id
  let result = await pool.query("SELECT * FROM mcp_users WHERE google_id = $1", [
    googleId
  ]);

  if (result.rows.length > 0) {
    user = result.rows[0];
    console.log(
      `[Google OAuth] Usuário existente por google_id: ${user.username} (id: ${user.id})`
    );
    await pool.query(
      "UPDATE mcp_users SET last_login_at = NOW(), email = COALESCE($2, email) WHERE id = $1",
      [user.id, email || null]
    );
  } else if (email) {
    // 2) Tenta por email
    result = await pool.query("SELECT * FROM mcp_users WHERE email = $1", [email]);
    if (result.rows.length > 0) {
      user = result.rows[0];
      console.log(
        `[Google OAuth] Vinculando google_id a usuário existente: ${user.username} (id: ${user.id})`
      );
      await pool.query(
        "UPDATE mcp_users SET google_id = $1, auth_method = 'google', last_login_at = NOW() WHERE id = $2",
        [googleId, user.id]
      );
    }
  }

  // 3) Se ainda não encontrou, cria novo
  if (!user) {
    const username =
      name || email || `google_${googleId.substring(0, 8)}`;

    console.log(
      `[Google OAuth] Criando novo usuário: ${username} (${email || "sem email"})`
    );

    result = await pool.query(
      `INSERT INTO mcp_users 
         (google_id, email, username, auth_method, is_active, password, created_at, last_login_at)
       VALUES ($1, $2, $3, 'google', true, NULL, NOW(), NOW())
       RETURNING *`,
      [googleId, email || null, username]
    );

    user = result.rows[0];
  }

  // Log de login via Google
  await AuditLogger.logLogin(user.id, clientId, req, "google");

  return user;
}

// ===============================================
// IMPLEMENTAÇÃO OAUTH
// ===============================================

function setupOAuthEndpoints(app) {
  const token_endpoint_auth_method = "none";

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
      token_endpoint_auth_methods_supported: [token_endpoint_auth_method],
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
    console.log("\n📝 POST /oauth/register");
    const { client_name, redirect_uris } = req.body || {};

    if (!client_name || !Array.isArray(redirect_uris) || redirect_uris.length === 0) {
      console.log("   ❌ Requisição inválida");
      return res.status(400).json({
        error: "invalid_client_metadata",
        error_description: "client_name e redirect_uris são obrigatórios"
      });
    }

    try {
      const clientId = uuidv4();
      await createClient({
        client_id: clientId,
        client_name,
        redirect_uris,
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        scope: "mcp read write"
      });

      console.log(`   ✅ Cliente registrado: ${clientId}`);

      res.status(201).json({
        client_id: clientId,
        client_name,
        redirect_uris,
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        scope: "mcp read write",
        token_endpoint_auth_method
      });
    } catch (error) {
      console.error("❌ Erro ao registrar cliente:", error.message);
      res.status(500).json({
        error: "server_error",
        error_description: "Erro ao registrar cliente"
      });
    }
  });

  // -----------------------------------------------
  // AUTHORIZATION ENDPOINT (GET) - MOSTRA TELA
  // -----------------------------------------------

  app.get("/oauth/authorize", async (req, res) => {
    const {
      client_id,
      redirect_uri,
      state,
      code_challenge,
      code_challenge_method = "S256",
      response_type = "code",
      scope = "mcp"
    } = req.query;

    console.log("\n🔐 GET /oauth/authorize");
    console.log(`   Client ID: ${client_id}`);
    console.log(`   Redirect URI: ${redirect_uri}`);
    console.log(`   PKCE: ${code_challenge ? "✅" : "❌"}`);

    try {
      if (!client_id || !redirect_uri) {
        return res.status(400).send("client_id e redirect_uri são obrigatórios");
      }

      const client = await getClientById(client_id);
      if (!client) {
        return res.status(400).send("Cliente inválido");
      }

      const allowedRedirects = client.redirect_uris || [];
      if (!allowedRedirects.includes(redirect_uri)) {
        return res.status(400).send("redirect_uri não registrado para este cliente");
      }

      if (response_type !== "code") {
        return res.status(400).send("response_type inválido");
      }

      if (!code_challenge) {
        return res.status(400).send("PKCE (code_challenge) é obrigatório");
      }

      return res.send(
        getUnifiedAuthPage(client, {
          client_id,
          redirect_uri,
          state,
          scope,
          response_type,
          code_challenge,
          code_challenge_method
        })
      );
    } catch (error) {
      console.error("❌ Erro no GET /oauth/authorize:", error.message);
      return res.status(500).send("Erro interno");
    }
  });

  // -----------------------------------------------
  // AUTHORIZATION ENDPOINT (POST) - LOGIN LOCAL
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
        errorUrl.searchParams.set(
          "error_description",
          "User denied authorization"
        );
        if (state) errorUrl.searchParams.set("state", state);
        return res.redirect(errorUrl.toString());
      }

      const userValidation = await validateUser(username, password);

      if (!userValidation.valid) {
        console.log(`   ❌ Validação falhou: ${userValidation.error}`);

        await AuditLogger.logLoginFailure(
          username,
          client_id,
          req,
          userValidation.error,
          "password"
        );

        const client = await getClientById(client_id);
        return res.send(
          getUnifiedAuthPage(
            client,
            {
              client_id,
              redirect_uri,
              state,
              scope,
              response_type: "code",
              code_challenge,
              code_challenge_method
            },
            userValidation.error
          )
        );
      }

      // Login OK
      await AuditLogger.logLogin(userValidation.userId, client_id, req, "password");

      const code = crypto.randomBytes(32).toString("base64url");
      const expiresAt = Date.now() + config.CODE_EXPIRY;

      createAuthCode({
        code,
        client_id,
        user_id: userValidation.userId,
        redirect_uri,
        scope,
        code_challenge,
        code_challenge_method,
        expiresAt
      });

      console.log("   ✅ Código de autorização gerado");

      const redirectUrl = new URL(redirect_uri);
      redirectUrl.searchParams.set("code", code);
      if (state) redirectUrl.searchParams.set("state", state);

      return res.redirect(redirectUrl.toString());
    } catch (error) {
      console.error("❌ Erro no POST /oauth/authorize:", error.message);
      return res.status(500).send("Erro interno");
    }
  });

  // -----------------------------------------------
  // LOGIN COM GOOGLE (SEM USAR SESSÃO HTTP)
  // -----------------------------------------------

  app.get("/auth/google", async (req, res) => {
    console.log("\n🔵 GET /auth/google");

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      console.error("❌ GOOGLE_CLIENT_ID/SECRET não configurados");
      return res.status(500).send("Login com Google não está configurado");
    }

    const {
      client_id,
      redirect_uri,
      scope = "mcp",
      state,
      response_type = "code",
      code_challenge,
      code_challenge_method = "S256"
    } = req.query;

    console.log("   OAuth params recebidos:", {
      client_id,
      redirect_uri,
      state,
      code_challenge,
      code_challenge_method
    });

    if (!client_id || !redirect_uri || !code_challenge) {
      return res
        .status(400)
        .send("client_id, redirect_uri e code_challenge são obrigatórios");
    }

    try {
      const client = await getClientById(client_id);
      if (!client) {
        return res.status(400).send("Cliente inválido");
      }

      const allowedRedirects = client.redirect_uris || [];
      if (!allowedRedirects.includes(redirect_uri)) {
        return res.status(400).send("redirect_uri não registrado para este cliente");
      }

      // Guardar estado do fluxo OAuth original (Claude/ChatGPT)
      const loginStateId = createLoginState({
        client_id,
        redirect_uri,
        scope,
        response_type,
        external_state: state || null,
        code_challenge,
        code_challenge_method
      });

      console.log(`   🔐 LoginState criado: ${loginStateId}`);

      const googleAuthUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      googleAuthUrl.searchParams.set("client_id", GOOGLE_CLIENT_ID);
      googleAuthUrl.searchParams.set("redirect_uri", GOOGLE_CALLBACK_URL);
      googleAuthUrl.searchParams.set("response_type", "code");
      googleAuthUrl.searchParams.set("scope", "openid email profile");
      googleAuthUrl.searchParams.set("state", loginStateId);
      googleAuthUrl.searchParams.set("access_type", "offline");
      googleAuthUrl.searchParams.set("prompt", "select_account");

      return res.redirect(googleAuthUrl.toString());
    } catch (error) {
      console.error("❌ Erro no GET /auth/google:", error.message);
      return res.status(500).send("Erro interno");
    }
  });

  app.get("/auth/google/callback", async (req, res) => {
    console.log("\n🔵 GET /auth/google/callback");

    const { code, state, error, error_description } = req.query;

    if (error) {
      console.error("❌ Erro retornado pelo Google:", error, error_description);
      return res.status(400).send("Erro ao autenticar com Google");
    }

    if (!code || !state) {
      console.error("❌ Falta code ou state no callback do Google");
      return res.status(400).send("Requisição inválida");
    }

    const loginState = consumeLoginState(state);

    if (!loginState) {
      console.error("❌ Parâmetros OAuth não encontrados ou expirados para state:", state);
      return res.status(400).send("Estado de login inválido ou expirado");
    }

    try {
      // 1) Trocar code por tokens no Google
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          code,
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          redirect_uri: GOOGLE_CALLBACK_URL,
          grant_type: "authorization_code"
        })
      });

      if (!tokenRes.ok) {
        const body = await tokenRes.text();
        console.error("❌ Erro ao trocar código por token no Google:", body);
        return res.status(500).send("Erro ao autenticar com Google");
      }

      const tokenJson = await tokenRes.json();
      const accessToken = tokenJson.access_token;

      // 2) Buscar dados do usuário (userinfo)
      const userInfoRes = await fetch(
        "https://www.googleapis.com/oauth2/v3/userinfo",
        {
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        }
      );

      if (!userInfoRes.ok) {
        const body = await userInfoRes.text();
        console.error("❌ Erro ao obter userinfo do Google:", body);
        return res.status(500).send("Erro ao autenticar com Google");
      }

      const profile = await userInfoRes.json();

      const googleId = profile.sub || profile.id;
      const email = profile.email || null;
      const name = profile.name || profile.given_name || "Google User";

      const user = await findOrCreateGoogleUser(
        { googleId, email, name },
        req,
        loginState.client_id
      );

      // 3) Gerar authorization code para o cliente MCP
      const authCode = crypto.randomBytes(32).toString("base64url");
      const expiresAt = Date.now() + config.CODE_EXPIRY;

      createAuthCode({
        code: authCode,
        client_id: loginState.client_id,
        user_id: user.id,
        redirect_uri: loginState.redirect_uri,
        scope: loginState.scope,
        code_challenge: loginState.code_challenge,
        code_challenge_method: loginState.code_challenge_method,
        expiresAt
      });

      console.log(
        `   ✅ Código de autorização gerado via Google para user_id=${user.id}`
      );

      const redirectUrl = new URL(loginState.redirect_uri);
      redirectUrl.searchParams.set("code", authCode);
      if (loginState.external_state) {
        redirectUrl.searchParams.set("state", loginState.external_state);
      }

      return res.redirect(redirectUrl.toString());
    } catch (error) {
      console.error("❌ Erro no callback do Google:", error);
      await AuditLogger.logError(null, loginState.client_id, null, error, {
        context: "google_callback"
      });
      return res.status(500).send("Erro interno");
    }
  });

  // -----------------------------------------------
  // TOKEN ENDPOINT
  // -----------------------------------------------

  app.post("/oauth/token", async (req, res) => {
    const {
      grant_type,
      code,
      redirect_uri,
      client_id,
      code_verifier,
      refresh_token
    } = req.body;

    console.log("\n🪙 POST /oauth/token");
    console.log(`   grant_type: ${grant_type}`);

    try {
      if (grant_type === "authorization_code") {
        if (!code || !client_id || !redirect_uri || !code_verifier) {
          return res.status(400).json({
            error: "invalid_request",
            error_description:
              "code, client_id, redirect_uri e code_verifier são obrigatórios"
          });
        }

        const storedCode = getAuthCode(code);
        if (!storedCode) {
          return res
            .status(400)
            .json({ error: "invalid_grant", error_description: "Código inválido" });
        }

        if (storedCode.client_id !== client_id) {
          return res
            .status(400)
            .json({ error: "invalid_grant", error_description: "Client mismatch" });
        }

        if (storedCode.redirect_uri !== redirect_uri) {
          return res.status(400).json({
            error: "invalid_grant",
            error_description: "redirect_uri não confere"
          });
        }

        if (
          !validatePKCE(
            code_verifier,
            storedCode.code_challenge,
            storedCode.code_challenge_method
          )
        ) {
          return res
            .status(400)
            .json({ error: "invalid_grant", error_description: "PKCE inválido" });
        }

        consumeAuthCode(code);

        const accessToken = crypto.randomBytes(32).toString("base64url");
        const refreshToken = crypto.randomBytes(32).toString("base64url");
        const expiresAt = new Date(Date.now() + config.TOKEN_EXPIRY);

        await createToken({
          token: accessToken,
          token_type: "access",
          client_id,
          user_id: storedCode.user_id,
          scope: storedCode.scope,
          expiresAt
        });

        await createToken({
          token: refreshToken,
          token_type: "refresh",
          client_id,
          user_id: storedCode.user_id,
          scope: storedCode.scope
        });

        console.log("   ✅ Tokens gerados (authorization_code)");

        return res.json({
          access_token: accessToken,
          token_type: "Bearer",
          expires_in: Math.floor(config.TOKEN_EXPIRY / 1000),
          refresh_token: refreshToken,
          scope: storedCode.scope
        });
      } else if (grant_type === "refresh_token") {
        if (!refresh_token) {
          return res.status(400).json({
            error: "invalid_request",
            error_description: "refresh_token é obrigatório"
          });
        }

        const stored = await getToken(refresh_token);
        if (!stored || stored.token_type !== "refresh") {
          return res.status(400).json({
            error: "invalid_grant",
            error_description: "Refresh token inválido"
          });
        }

        const newAccessToken = crypto.randomBytes(32).toString("base64url");
        const newRefreshToken = crypto.randomBytes(32).toString("base64url");
        const expiresAt = new Date(Date.now() + config.TOKEN_EXPIRY);

        await createToken({
          token: newAccessToken,
          token_type: "access",
          client_id: stored.client_id,
          user_id: stored.user_id,
          scope: stored.scope,
          expiresAt
        });

        await createToken({
          token: newRefreshToken,
          token_type: "refresh",
          client_id: stored.client_id,
          user_id: stored.user_id,
          scope: stored.scope
        });

        await revokeToken(refresh_token);

        await AuditLogger.logTokenRefresh(stored.user_id, stored.client_id, req);

        console.log("   ✅ Tokens gerados (refresh_token)");

        return res.json({
          access_token: newAccessToken,
          token_type: "Bearer",
          expires_in: Math.floor(config.TOKEN_EXPIRY / 1000),
          refresh_token: newRefreshToken,
          scope: stored.scope
        });
      }

      return res.status(400).json({
        error: "unsupported_grant_type",
        error_description: "grant_type não suportado"
      });
    } catch (error) {
      console.error("❌ Erro no POST /oauth/token:", error.message);
      return res.status(500).json({
        error: "server_error",
        error_description: "Erro interno"
      });
    }
  });

  // -----------------------------------------------
  // REVOGAÇÃO DE TOKEN
  // -----------------------------------------------

  app.post("/oauth/revoke", async (req, res) => {
    const { token } = req.body;

    console.log("\n🔴 POST /oauth/revoke");
    console.log(
      `   Token: ${token ? token.substring(0, 20) + "..." : "[AUSENTE]"}`
    );

    try {
      const tokenData = await getToken(token);

      if (tokenData) {
        await revokeToken(token);
        console.log("   ✅ Token revogado/deletado");
      } else {
        console.log(
          "   ⚠️  Token não encontrado (já deletado ou inválido)"
        );
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
    const auth = req.headers.authorization || "";

    if (!auth.startsWith("Bearer ")) {
      res.setHeader(
        "WWW-Authenticate",
        `Bearer realm="mcp", authorization_uri="${config.SERVER_URL}/.well-known/oauth-authorization-server"`
      );
      return res.status(401).json({
        error: "invalid_token",
        error_description: "Token ausente"
      });
    }

    const token = auth.substring("Bearer ".length);

    try {
      const tokenData = await getToken(token);

      if (!tokenData || tokenData.token_type !== "access") {
        res.setHeader(
          "WWW-Authenticate",
          "Bearer realm=\"mcp\", error=\"invalid_token\", error_description=\"Token inválido\""
        );
        return res.status(401).json({
          error: "invalid_token",
          error_description: "Token inválido"
        });
      }

      const now = new Date();
      if (tokenData.expires_at && tokenData.expires_at < now) {
        res.setHeader(
          "WWW-Authenticate",
          "Bearer realm=\"mcp\", error=\"invalid_token\", error_description=\"Token expirado\""
        );
        return res.status(401).json({
          error: "invalid_token",
          error_description: "Token expirado"
        });
      }

      // Anexar info do token na requisição para uso posterior
      req.oauth = {
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

  // -----------------------------------------------
  // DOCUMENTAÇÃO HTML
  // -----------------------------------------------

  app.get("/docs", (_req, res) => {
    res.send(getDocsPage());
  });

  return { validateToken };
}

module.exports = { setupOAuthEndpoints };