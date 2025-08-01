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

// Rota MCP principal
app.post("/mcp", async (req, res) => {
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
});