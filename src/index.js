const { tools, executeTool } = require("./tools");

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");
const { Pool } = require("pg");

const app = express();

// Middlewares
app.use(cors({ origin: "*", exposedHeaders: ["Mcp-Session-Id"] }));
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Adicionar para OAuth token endpoint

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

// Armazenamento temporário OAuth
const tempCodes = new Map();
const tempTokens = new Map();

// 1. Rota de autorização OAuth
app.get("/oauth/authorize", (req, res) => {
  const { client_id, redirect_uri, state } = req.query;
  
  console.log("OAuth authorize request:", { client_id, redirect_uri, state });
  
  // Gerar código temporário
  const code = uuidv4();
  tempCodes.set(code, { client_id, redirect_uri, created: Date.now() });
  
  // Limpar códigos antigos (mais de 10 minutos)
  for (const [key, value] of tempCodes.entries()) {
    if (Date.now() - value.created > 600000) {
      tempCodes.delete(key);
    }
  }
  
  // Redirecionar com o código
  const redirectUrl = `${redirect_uri}?code=${code}&state=${state}`;
  console.log("Redirecting to:", redirectUrl);
  
  res.redirect(redirectUrl);
});

// 2. Rota de token OAuth
app.post("/oauth/token", (req, res) => {
  const { code, client_id, grant_type } = req.body;
  // client_secret poderia ser validado aqui em produção
  // const { code, client_id, client_secret, grant_type } = req.body;
  
  console.log("Token request:", { code, client_id, grant_type });
  
  // Verificar o código
  const codeData = tempCodes.get(code);
  if (!codeData) {
    return res.status(400).json({ error: "invalid_code" });
  }
  
  // Em produção, você validaria:
  // - Se o client_id corresponde ao do código
  // - Se o client_secret está correto
  // - Se o grant_type é "authorization_code"
  
  // Gerar token
  const accessToken = uuidv4();
  tempTokens.set(accessToken, { client_id, created: Date.now() });
  
  // Limpar código usado
  tempCodes.delete(code);
  
  // Limpar tokens antigos (mais de 1 hora)
  for (const [key, value] of tempTokens.entries()) {
    if (Date.now() - value.created > 3600000) {
      tempTokens.delete(key);
    }
  }
  
  res.json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: 3600
  });
});

// 3. Rota de manifest MCP
app.get("/.well-known/mcp-manifest.json", (req, res) => {
  const serverUrl = process.env.SERVER_URL || "https://mcp-server-remoto.onrender.com";
  
  res.json({
    name: "Well Database MCP",
    description: "Query geological well and basin data",
    version: "1.0.0",
    auth: {
      type: "oauth2",
      authorization_url: `${serverUrl}/oauth/authorize`,
      token_url: `${serverUrl}/oauth/token`,
      client_id: "well-database-mcp",
      scope: "read"
    },
    capabilities: {
      tools: {},
      prompts: {},
      resources: {}
    }
  });
});

// Rota MCP principal
app.post("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"];
  const authHeader = req.headers["authorization"];
  const { method, params, id } = req.body;
  
  try {
    // Initialize
    if (method === "initialize") {
      // Verificar token para conexões remotas
      if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.substring(7);
        if (!tempTokens.has(token)) {
          return res.status(401).json({
            jsonrpc: "2.0",
            error: { code: -32000, message: "Invalid token" },
            id
          });
        }
        console.log("✅ Token OAuth válido");
      }
      
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

// Rota informativa
app.get("/", (_req, res) => {
  res.json({
    name: "mcp-well-database",
    version: "1.0.0",
    endpoint: "/mcp",
    status: "OK",
    database: dbConnected ? "Connected" : "Disconnected",
    oauth: {
      manifest: "/.well-known/mcp-manifest.json",
      authorize: "/oauth/authorize",
      token: "/oauth/token"
    }
  });
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 MCP Well Database Server - Port ${PORT}`);
  console.log("📋 OAuth endpoints habilitados");
  console.log("🔗 Manifest disponível em /.well-known/mcp-manifest.json");
});