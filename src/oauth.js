const { v4: uuidv4 } = require("uuid");

// Armazenamento em memória para desenvolvimento
const clients = {};
const authCodes = {};
const tokens = {};

// Configuração do servidor OAuth
const SERVER_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 3000}`;

// Token especial para desenvolvimento/inspector
const DEV_TOKEN = "dev_token_inspector";
tokens[DEV_TOKEN] = {
  client_id: "inspector",
  created_at: new Date().toISOString(),
  expires_at: new Date(Date.now() + 365 * 24 * 3600000).toISOString() // 1 ano
};

// Funções auxiliares
function generateAuthCode() {
  return uuidv4();
}

function generateAccessToken() {
  return `mcp_token_${uuidv4()}`;
}

// Endpoints OAuth
function setupOAuthEndpoints(app) {
  
  // 1. Discovery endpoint - Authorization Server Metadata
  app.get("/.well-known/oauth-authorization-server", (req, res) => {
    console.log("📋 OAuth Discovery requested");
    res.json({
      issuer: SERVER_URL,
      authorization_endpoint: `${SERVER_URL}/oauth/authorize`,
      token_endpoint: `${SERVER_URL}/oauth/token`,
      registration_endpoint: `${SERVER_URL}/oauth/register`,
      grant_types_supported: ["authorization_code"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      response_types_supported: ["code"],
      scopes_supported: ["mcp"]
    });
  });

  // 2. Discovery endpoint - Protected Resource Metadata
  app.get("/.well-known/oauth-protected-resource", (req, res) => {
    console.log("📋 Protected Resource Discovery requested");
    res.json({
      resource: SERVER_URL,
      authorization_servers: [SERVER_URL],
      bearer_methods_supported: ["header"],
      resource_documentation: `${SERVER_URL}/docs`,
      resource_signing_alg_values_supported: ["none"]
    });
  });

  // 3. Dynamic Client Registration
  app.post("/oauth/register", (req, res) => {
    console.log("🔐 Client Registration:", JSON.stringify(req.body, null, 2));
    
    const clientId = `client_${uuidv4()}`;
    const clientSecret = `secret_${uuidv4()}`;
    
    // Armazenar cliente
    clients[clientId] = {
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uris: req.body.redirect_uris || [],
      client_name: req.body.client_name || "MCP Client",
      created_at: new Date().toISOString()
    };
    
    console.log("✅ Client registered:", clientId);
    
    res.json({
      client_id: clientId,
      client_secret: clientSecret,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      grant_types: ["authorization_code"],
      redirect_uris: req.body.redirect_uris || [],
      token_endpoint_auth_method: "none"
    });
  });

  // 4. Authorization Endpoint (GET para exibir página)
  app.get("/oauth/authorize", (req, res) => {
    const { 
      client_id, 
      redirect_uri, 
      state, 
      code_challenge,
      code_challenge_method 
    } = req.query;
    
    console.log("🔐 Authorization requested:", { 
      client_id, 
      redirect_uri,
      state: state ? "present" : "missing",
      code_challenge: code_challenge ? "present" : "missing"
    });
    
    // Para desenvolvimento, auto-aprovar
    const code = generateAuthCode();
    
    // Armazenar código de autorização
    authCodes[code] = {
      client_id,
      redirect_uri,
      code_challenge,
      code_challenge_method,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 600000).toISOString() // 10 minutos
    };
    
    console.log("✅ Auth code generated:", code);
    
    // Página HTML simples de autorização
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>MCP Server Authorization</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          }
          .card {
            background: white;
            padding: 2rem;
            border-radius: 8px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            max-width: 400px;
            width: 100%;
          }
          h2 {
            margin-top: 0;
            color: #333;
          }
          .info {
            background: #f7fafc;
            padding: 1rem;
            border-radius: 4px;
            margin: 1rem 0;
          }
          button {
            width: 100%;
            padding: 0.75rem;
            background: #667eea;
            color: white;
            border: none;
            border-radius: 4px;
            font-size: 1rem;
            cursor: pointer;
            transition: background 0.2s;
          }
          button:hover {
            background: #5a67d8;
          }
          .auto-approve {
            text-align: center;
            margin-top: 1rem;
            color: #666;
            font-size: 0.9rem;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>🔐 MCP Server Authorization</h2>
          <div class="info">
            <p><strong>Client:</strong> ${client_id || "Unknown"}</p>
            <p><strong>Scope:</strong> Full MCP Access</p>
          </div>
          <p>Do you authorize this application to access your MCP server?</p>
          <button onclick="authorize()">Authorize Access</button>
          <div class="auto-approve">Auto-approving in <span id="countdown">3</span> seconds...</div>
        </div>
        <script>
          function authorize() {
            const redirectUrl = '${redirect_uri}?code=${code}&state=${encodeURIComponent(state || "")}';
            console.log('Redirecting to:', redirectUrl);
            window.location.href = redirectUrl;
          }
          
          // Countdown
          let seconds = 3;
          const countdown = setInterval(() => {
            seconds--;
            document.getElementById('countdown').textContent = seconds;
            if (seconds <= 0) {
              clearInterval(countdown);
              authorize();
            }
          }, 1000);
        </script>
      </body>
      </html>
    `);
  });

  // 5. Token Endpoint
  app.post("/oauth/token", (req, res) => {
    const { grant_type, code } = req.body;
    
    console.log("🎫 Token exchange requested:", { 
      grant_type, 
      code: code ? code.substring(0, 8) + "..." : "missing",
      body: JSON.stringify(req.body, null, 2)
    });
    
    if (grant_type !== "authorization_code") {
      console.log("❌ Invalid grant type:", grant_type);
      return res.status(400).json({
        error: "unsupported_grant_type"
      });
    }
    
    // Verificar código
    const authCode = authCodes[code];
    if (!authCode) {
      console.log("❌ Invalid auth code:", code);
      return res.status(400).json({
        error: "invalid_grant",
        error_description: "Invalid authorization code"
      });
    }
    
    // Gerar token
    const accessToken = generateAccessToken();
    tokens[accessToken] = {
      client_id: authCode.client_id,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 3600000).toISOString() // 1 hora
    };
    
    // Limpar código usado
    delete authCodes[code];
    
    console.log("✅ Token generated:", accessToken);
    
    res.json({
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: 3600,
      scope: "mcp"
    });
  });

  // Middleware para validar token
  function validateToken(req, res, next) {
    const authHeader = req.headers.authorization;
    const userAgent = req.headers["user-agent"] || "";
    const acceptHeader = req.headers.accept || "";
    
    // Detectar se é o Inspector (permite sem auth para facilitar testes)
    const isInspector = userAgent.includes("inspector") || 
                       acceptHeader.includes("application/json") && !acceptHeader.includes("text/event-stream");
    
    // Se não tem header de autorização
    if (!authHeader) {
      // Inspector pode passar sem auth
      if (isInspector) {
        console.log("🔧 Inspector detected, allowing without auth");
        return next();
      }
      
      // Claude PRECISA de auth
      console.log("❌ No authorization header - sending 401");
      res.setHeader("WWW-Authenticate", `Bearer realm="${SERVER_URL}", authorization_uri="${SERVER_URL}/oauth/authorize"`);
      return res.status(401).json({
        error: "unauthorized",
        error_description: "Bearer token required"
      });
    }
    
    // Extrair token
    const token = authHeader.replace("Bearer ", "");
    const tokenData = tokens[token];
    
    if (!tokenData) {
      console.log("❌ Invalid token:", token.substring(0, 10) + "...");
      return res.status(401).json({
        error: "invalid_token"
      });
    }
    
    // Verificar expiração
    if (new Date(tokenData.expires_at) < new Date()) {
      delete tokens[token];
      console.log("❌ Token expired");
      return res.status(401).json({
        error: "token_expired"
      });
    }
    
    console.log("✅ Valid token for client:", tokenData.client_id);
    req.authInfo = tokenData;
    next();
  }

  // Limpar tokens expirados periodicamente
  setInterval(() => {
    const now = new Date();
    let cleaned = 0;
    for (const [token, data] of Object.entries(tokens)) {
      if (token !== DEV_TOKEN && new Date(data.expires_at) < now) {
        delete tokens[token];
        cleaned++;
      }
    }
    if (cleaned > 0) {
      console.log("🧹 Cleaned expired tokens:", cleaned);
    }
  }, 60000); // A cada minuto

  // Endpoint de debug para ver estado
  app.get("/oauth/debug", (req, res) => {
    res.json({
      clients: Object.keys(clients).length,
      authCodes: Object.keys(authCodes).length,
      tokens: Object.keys(tokens).length - 1, // -1 para não contar dev_token
      tokensList: Object.keys(tokens).map(t => t.substring(0, 20) + "...")
    });
  });

  return { validateToken };
}

module.exports = { setupOAuthEndpoints };