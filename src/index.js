const { tools, executeTool } = require("./tools");

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");
const { Pool } = require("pg");

const app = express();

// Configuração do servidor
const SERVER_URL = process.env.SERVER_URL || "https://mcp-server-remoto.onrender.com";
const AUTH_SERVER_URL = process.env.AUTH_SERVER_URL || "https://auth.mcp-well-database.com";

// Middlewares
app.use(cors({ origin: "*", exposedHeaders: ["Mcp-Session-Id"] }));
app.use(express.json());

// Logging MCP
app.use((req, _res, next) => {
  if (req.body?.method) {
    console.log(`[${new Date().toISOString()}] ${req.body.method}`);
  }
  next();
});

// Pool PostgreSQL
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  connectionTimeoutMillis: 10000,
});

let dbConnected = false;

// Testar conexão na inicialização
(async () => {
  try {
    const client = await pool.connect();
    client.release();
    dbConnected = true;
    console.log("✅ Banco de dados conectado");
  } catch (err) {
    console.error("❌ Banco indisponível:", err.message);
  }
})();

// Executar query
async function query(sql) {
  if (!dbConnected) {
    throw new Error("Banco de dados não disponível");
  }
  
  const client = await pool.connect();
  try {
    const result = await client.query(sql);
    return result.rows;
  } finally {
    client.release();
  }
}

// Sessões MCP
const sessions = {};

// Middleware de autenticação
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  
  // Se não tem token, retorna 401 com WWW-Authenticate
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401)
      .header("WWW-Authenticate", `Bearer resource_metadata="${SERVER_URL}/.well-known/oauth-protected-resource"`)
      .json({
        error: "unauthorized",
        error_description: "Authentication required"
      });
  }
  
  // Em produção, você validaria o JWT aqui
  // Por enquanto, vamos aceitar qualquer token Bearer
  const token = authHeader.substring(7);
  
  // Simulação de validação de token
  if (!token || token.length < 10) {
    return res.status(401)
      .header("WWW-Authenticate", `Bearer resource_metadata="${SERVER_URL}/.well-known/oauth-protected-resource", error="invalid_token"`)
      .json({
        error: "invalid_token",
        error_description: "The access token is invalid"
      });
  }
  
  next();
}

// 1. Protected Resource Metadata (RFC 9728)
app.get("/.well-known/oauth-protected-resource", (req, res) => {
  res.json({
    resource: SERVER_URL,
    authorization_servers: [AUTH_SERVER_URL],
    scopes_supported: [
      "mcp:read",
      "mcp:write",
      "tools:execute"
    ],
    bearer_methods_supported: ["header"],
    resource_documentation: "https://github.com/seu-usuario/mcp-well-database",
    resource_policy_uri: "https://seu-site.com/privacy",
    resource_contact: ["admin@seu-site.com"]
  });
});

// 2. Rota MCP principal com autenticação
app.post("/mcp", requireAuth, async (req, res) => {
  const sessionId = req.headers["mcp-session-id"];
  const { method, params, id } = req.body;
  
  try {
    // Initialize
    if (method === "initialize") {
      const newSessionId = uuidv4();
      sessions[newSessionId] = { created: new Date() };
      
      res.setHeader("Mcp-Session-Id", newSessionId);
      return res.json({
        jsonrpc: "2.0",
        result: {
          protocolVersion: "2025-11-05",
          capabilities: { 
            tools: {},
            prompts: {},
            resources: {}
          },
          serverInfo: { 
            name: "mcp-well-database",
            version: "1.0.0"
          }
        },
        id
      });
    }
    
    // Validar sessão
    if (!sessionId || !sessions[sessionId]) {
      return res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Session required" },
        id
      });
    }
    
    // Processar métodos
    let result;
    switch (method) {
    case "tools/list":
      result = { tools };
      break;
    case "prompts/list":
      result = { prompts: [] };
      break;
    case "resources/list":
      result = { resources: [] };
      break;
    case "tools/call":
      result = await executeTool(params.name, params.arguments, query);
      break;
    case "notifications/initialized":
      result = {};
      break;
    default:
      return res.status(404).json({
        jsonrpc: "2.0",
        error: { code: -32601, message: `Method not found: ${method}` },
        id
      });
    }
    
    res.json({ jsonrpc: "2.0", result, id });
    
  } catch (error) {
    res.status(500).json({
      jsonrpc: "2.0",
      error: { code: -32603, message: error.message },
      id
    });
  }
});

// 3. Simulação de Authorization Server (APENAS PARA TESTE)
// Em produção, você usaria um servidor OAuth real como Auth0, Okta, etc.
const tempCodes = new Map();
const tempTokens = new Map();

// Metadata do Authorization Server
app.get("/.well-known/oauth-authorization-server", (req, res) => {
  res.json({
    issuer: AUTH_SERVER_URL,
    authorization_endpoint: `${AUTH_SERVER_URL}/authorize`,
    token_endpoint: `${AUTH_SERVER_URL}/token`,
    registration_endpoint: `${AUTH_SERVER_URL}/register`,
    scopes_supported: ["mcp:read", "mcp:write", "tools:execute"],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post"]
  });
});

// Endpoint de autorização (simulado)
app.get("/authorize", (req, res) => {
  const { client_id, redirect_uri, state, scope, code_challenge, code_challenge_method } = req.query;
  
  console.log("Authorization request:", { client_id, redirect_uri, state, scope });
  
  // Gerar código
  const code = uuidv4();
  tempCodes.set(code, { 
    client_id, 
    redirect_uri,
    scope,
    code_challenge,
    created: Date.now() 
  });
  
  // Redirecionar com código
  const redirectUrl = `${redirect_uri}?code=${code}&state=${state}`;
  res.redirect(redirectUrl);
});

// Endpoint de token (simulado)
app.post("/token", express.urlencoded({ extended: true }), (req, res) => {
  const { grant_type, code, client_id, redirect_uri, code_verifier } = req.body;
  
  console.log("Token request:", { grant_type, code, client_id });
  
  if (grant_type !== "authorization_code") {
    return res.status(400).json({ error: "unsupported_grant_type" });
  }
  
  const codeData = tempCodes.get(code);
  if (!codeData || codeData.client_id !== client_id) {
    return res.status(400).json({ error: "invalid_grant" });
  }
  
  // Em produção, validaria o code_verifier com code_challenge
  
  // Gerar token JWT simulado
  const accessToken = `eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.${Buffer.from(JSON.stringify({
    sub: "user123",
    aud: SERVER_URL,
    scope: codeData.scope || "mcp:read",
    exp: Math.floor(Date.now() / 1000) + 3600
  })).toString("base64")}.signature`;
  
  tempCodes.delete(code);
  
  res.json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: 3600,
    scope: codeData.scope || "mcp:read"
  });
});

// Endpoint de registro dinâmico (simulado)
app.post("/register", (req, res) => {
  const { client_name, redirect_uris, grant_types, response_types, scope } = req.body;
  
  console.log("Client registration:", { client_name, redirect_uris });
  
  const client_id = `client_${uuidv4()}`;
  
  res.status(201).json({
    client_id,
    client_secret: uuidv4(),
    client_name,
    redirect_uris,
    grant_types: grant_types || ["authorization_code"],
    response_types: response_types || ["code"],
    scope: scope || "mcp:read"
  });
});

// Rota informativa
app.get("/", (_req, res) => {
  res.json({
    name: "mcp-well-database",
    version: "1.0.0",
    endpoint: "/mcp",
    status: "OK",
    database: dbConnected ? "Connected" : "Disconnected",
    protected_resource_metadata: "/.well-known/oauth-protected-resource",
    authorization_server_metadata: "/.well-known/oauth-authorization-server"
  });
});

// Configurar authorization server URL baseado no ambiente
if (process.env.NODE_ENV === "production" && !process.env.AUTH_SERVER_URL) {
  console.warn("⚠️  AUTH_SERVER_URL não configurado. Usando servidor de autorização embutido para testes.");
  // Em produção, você deve configurar um servidor OAuth real
}

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 MCP Well Database Server - Port ${PORT}`);
  console.log(`📋 Protected Resource Metadata: ${SERVER_URL}/.well-known/oauth-protected-resource`);
  console.log(`🔐 Authorization Server: ${AUTH_SERVER_URL}`);
  if (!process.env.AUTH_SERVER_URL) {
    console.log("⚠️  Usando authorization server embutido para testes");
  }
});