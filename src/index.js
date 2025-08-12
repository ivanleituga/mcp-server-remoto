const { tools, executeTool } = require("./tools");
require("dotenv").config();

const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");
const crypto = require("crypto");

// SDK MCP
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StreamableHTTPServerTransport } = require("@modelcontextprotocol/sdk/server/streamableHttp.js");

const app = express();

// Configuração
const PORT = process.env.PORT || 3000;
const SERVER_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Mcp-Session-Id", "Accept"],
  exposedHeaders: ["Mcp-Session-Id"],
  credentials: true
}));

// PostgreSQL
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  connectionTimeoutMillis: 10000,
});

let dbConnected = false;

// Testar conexão
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

// Query helper
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

// ===============================================
// MCP SERVER
// ===============================================

const mcpServer = new McpServer({
  name: "mcp-well-database",
  version: "1.0.0",
});

// Registrar ferramentas
console.log(`📦 Registrando ${tools.length} ferramentas...`);
tools.forEach(tool => {
  console.log(`  - ${tool.name}`);
  
  mcpServer.tool(
    tool.name,
    tool.inputSchema.properties || {},
    async (params) => {
      console.log(`🔧 Executando: ${tool.name}`);
      return await executeTool(tool.name, params, query);
    }
  );
});

// ===============================================
// TRANSPORTS (Sessões)
// ===============================================

const transports = {};

// ===============================================
// ENDPOINT ÚNICO: POST /mcp
// ===============================================

app.post("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"];
  
  try {
    // Check if this is an initialization request
    const isInit = req.body?.method === "initialize";
    
    // Create new transport if needed
    if (!sessionId || !transports[sessionId] || isInit) {
      console.log(`🆕 Novo transport (${isInit ? "initialize" : "nova sessão"})`);
      
      const newSessionId = sessionId || crypto.randomUUID();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => newSessionId,
        onsessioninitialized: (sid) => {
          console.log(`✅ Sessão criada: ${sid}`);
          transports[sid] = transport;
        }
      });
      
      // Connect transport to server
      await mcpServer.connect(transport);
      
      // Set session ID header
      res.setHeader("Mcp-Session-Id", newSessionId);
      
      // Handle request
      await transport.handleRequest(req, res, req.body);
      return;
    }
    
    // Use existing transport
    if (transports[sessionId]) {
      console.log(`♻️ Reusando sessão ${sessionId}`);
      await transports[sessionId].handleRequest(req, res, req.body);
      return;
    }
    
    // Error: no valid transport
    console.error(`❌ Sessão inválida: ${sessionId}`);
    res.status(400).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Invalid session"
      },
      id: req.body?.id || null
    });
    
  } catch (error) {
    console.error("❌ Erro:", error);
    res.status(500).json({
      jsonrpc: "2.0",
      error: {
        code: -32603,
        message: error.message
      },
      id: req.body?.id || null
    });
  }
});

// ===============================================
// PÁGINA INICIAL
// ===============================================

app.get("/", (req, res) => {
  res.json({
    name: "mcp-well-database",
    version: "1.0.0",
    status: "OK",
    database: dbConnected ? "Connected" : "Disconnected",
    transport: "Streamable HTTP",
    endpoint: `${SERVER_URL}/mcp`,
    tools: tools.map(t => ({ 
      name: t.name, 
      description: t.description.substring(0, 100) + "..." 
    })),
    instructions: {
      claude: `Add as Custom Connector: ${SERVER_URL}/mcp`,
      inspector: `npx @modelcontextprotocol/inspector -y --url ${SERVER_URL}/mcp`
    }
  });
});

// Health check
app.get("/health", (req, res) => {
  res.json({ 
    status: "healthy",
    database: dbConnected,
    sessions: Object.keys(transports).length
  });
});

// ===============================================
// START SERVER
// ===============================================

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════╗
║         MCP WELL DATABASE SERVER              ║
╠════════════════════════════════════════════════╣
║                                                ║
║  🚀 Status: ONLINE                            ║
║  📡 Port: ${PORT}                             ║
║  🔗 URL: ${SERVER_URL}                        ║
║                                                ║
║  📊 Database: ${dbConnected ? "✅ Connected" : "❌ Disconnected"}                     ║
║  🔧 Tools: ${tools.length} registered                        ║
║                                                ║
╠════════════════════════════════════════════════╣
║                                                ║
║  ENDPOINT ÚNICO:                              ║
║  POST ${SERVER_URL}/mcp                       ║
║                                                ║
║  TESTE COM INSPECTOR:                         ║
║  npx @modelcontextprotocol/inspector -y \\     ║
║    --url ${SERVER_URL}/mcp                    ║
║                                                ║
╚════════════════════════════════════════════════╝
`);
});

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n🛑 Desligando servidor...");
  
  for (const sessionId in transports) {
    try {
      await transports[sessionId].close();
      delete transports[sessionId];
    } catch (error) {
      // Ignore errors
    }
  }
  
  console.log("✅ Servidor desligado");
  process.exit(0);
});