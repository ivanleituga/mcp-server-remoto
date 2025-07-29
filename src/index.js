const { tools, executeTool } = require("./tools");
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");
const { Pool } = require("pg");

const app = express();

// Configuração do servidor
const SERVER_URL = "https://mcp-server-remoto.onrender.com";

// Middlewares
app.use(cors({ origin: "*", exposedHeaders: ["Mcp-Session-Id"] }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// OAuth - Armazenamento temporário
const tempCodes = new Map();
const tempTokens = new Map();

// 1. Protected Resource Metadata (necessário para OAuth)
app.get("/.well-known/oauth-protected-resource", (req, res) => {
  res.json({
    resource: SERVER_URL,
    authorization_servers: [SERVER_URL],
    scopes_supported: ["mcp:read", "mcp:write", "tools:execute"],
    bearer_methods_supported: ["header"]
  });
});

// 2. OAuth Authorization Server Metadata
app.get("/.well-known/oauth-authorization-server", (req, res) => {
  res.json({
    issuer: SERVER_URL,
    authorization_endpoint: `${SERVER_URL}/authorize`,
    token_endpoint: `${SERVER_URL}/token`,
    registration_endpoint: `${SERVER_URL}/register`,
    scopes_supported: ["mcp:read", "mcp:write", "tools:execute"],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"]
  });
});

// 3. OAuth Endpoints (simplificados)
app.get("/authorize", (req, res) => {
  const { client_id, redirect_uri, state } = req.query;
  const code = uuidv4();
  tempCodes.set(code, { client_id, redirect_uri, created: Date.now() });
  res.redirect(`${redirect_uri}?code=${code}&state=${state}`);
});

app.post("/token", (req, res) => {
  const { code, client_id } = req.body;
  const codeData = tempCodes.get(code);
  
  if (!codeData || codeData.client_id !== client_id) {
    return res.status(400).json({ error: "invalid_grant" });
  }
  
  const token = `token_${uuidv4()}`;
  tempTokens.set(token, { client_id, created: Date.now() });
  tempCodes.delete(code);
  
  res.json({
    access_token: token,
    token_type: "Bearer",
    expires_in: 3600
  });
});

app.post("/register", (req, res) => {
  const { client_name } = req.body;
  console.log("Client registration:", client_name);
  
  res.status(201).json({
    client_id: `client_${uuidv4()}`,
    client_secret: uuidv4(),
    client_name
  });
});

// Middleware de autenticação opcional
function checkAuth(req) {
  const authHeader = req.headers.authorization;
  
  // Se tem Bearer token, validar
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    // Por enquanto, aceitar qualquer token
    return true;
  }
  
  // Se não tem token, permitir também (para manter compatibilidade)
  return true;
}

// Rota MCP principal (mantida do código original)
app.post("/mcp", async (req, res) => {
  // Verificar autenticação se presente
  if (!checkAuth(req)) {
    return res.status(401).json({
      error: "unauthorized",
      error_description: "Invalid token"
    });
  }
  
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
          protocolVersion: "2024-11-05",
          capabilities: { tools: {}, prompts: {}, resources: {} },
          serverInfo: { name: "mcp-well-database", version: "1.0.0" }
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

// Rota alternativa para Streamable HTTP (Inspector/Claude Web)
app.post("/", async (req, res) => {
  // Reutilizar a mesma lógica do /mcp
  req.url = "/mcp";
  return app._router.handle(req, res);
});

// Rota informativa
app.get("/", (_req, res) => {
  res.json({
    name: "mcp-well-database",
    version: "1.0.0",
    endpoint: "/mcp",
    status: "OK",
    database: dbConnected ? "Connected" : "Disconnected"
  });
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 MCP Well Database Server - Port ${PORT}`);
  console.log("📋 OAuth Metadata disponível");
  console.log("🔐 Funciona com e sem autenticação");
});