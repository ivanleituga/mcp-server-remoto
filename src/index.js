const { tools, executeTool } = require("./tools");
const { getHomePage } = require("../utils/templates");
const { setupOAuthEndpoints } = require("./oauth");
const { query, isConnected } = require("./database");
const sessionManager = require("./session_manager");
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");

// IMPORTANTE: Importar do SDK MCP
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StreamableHTTPServerTransport } = require("@modelcontextprotocol/sdk/server/streamableHttp.js");

const app = express();

// Configuração
const PORT = process.env.PORT || 3000;
const SERVER_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS simples e direto
app.use(cors({
  origin: true,
  credentials: true
}));

// ===============================================
// CONFIGURAR OAUTH
// ===============================================

const { validateToken } = setupOAuthEndpoints(app);

// ===============================================
// CRIAR MCP SERVER
// ===============================================

const mcpServer = new McpServer({
  name: "mcp-well-database",
  version: "1.0.0",
});

// Registrar as ferramentas
console.log(`📦 Registrando ${tools.length} ferramentas...`);
tools.forEach(tool => {
  console.log(`  - ${tool.name}`);
  
  mcpServer.tool(
    tool.name,
    tool.inputSchema.properties || {},
    async (params) => {
      console.log(`\n🔧 Executando: ${tool.name}`);
      console.log("   Params:", JSON.stringify(params, null, 2));
      
      try {
        const result = await executeTool(tool.name, params, query);
        console.log("   ✅ Sucesso");
        return result;
      } catch (error) {
        console.error("   ❌ Erro:", error.message);
        throw error;
      }
    }
  );
});

// ===============================================
// ENDPOINT MCP ÚNICO E SIMPLES
// ===============================================

app.post("/mcp", validateToken, async (req, res) => {
  const sessionId = req.headers["mcp-session-id"];
  const isInit = req.body?.method === "initialize";
  
  console.log(`\n📨 ${req.body?.method || "unknown"} - Session: ${sessionId || "new"}`);
  
  try {
    // Criar novo transport se necessário
    if (!sessionId || !sessionManager.exists(sessionId) || isInit) {
      const newSessionId = sessionId || crypto.randomUUID();
      
      console.log(`🆕 Nova sessão: ${newSessionId}`);
      
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => newSessionId,
        onsessioninitialized: (sid) => {
          sessionManager.add(sid, transport); // MUDANÇA: usar sessionManager
        }
      });
      
      await mcpServer.connect(transport);
      res.setHeader("Mcp-Session-Id", newSessionId);
      await transport.handleRequest(req, res, req.body);
      return;
    }
    
    // Usar transport existente
    const transport = sessionManager.get(sessionId);
    if (transport) {
      console.log(`♻️ Reusando sessão: ${sessionId}`);
      await transport.handleRequest(req, res, req.body);
      return;
    }
    
    // Erro: sessão inválida
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
    console.error("❌ Erro:", error.message);
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
// ENDPOINTS AUXILIARES
// ===============================================

// Health check
app.get("/health", (req, res) => {
  res.json({ 
    status: "healthy",
    database: isConnected(),
    sessions: sessionManager.count(),
  });
});

// Página inicial
app.get("/", (req, res) => {
  res.send(getHomePage(
    SERVER_URL, 
    isConnected(),
    sessionManager.count(),
    tools.length
  ));
});

// ===============================================
// LIMPEZA PERIÓDICA
// ===============================================

setInterval(() => {
  sessionManager.cleanup();
}, 300000); // A cada 5 minutos

// ===============================================
// INICIALIZAÇÃO
// ===============================================

app.listen(PORT, () => {
  console.log("\n🚀 MCP Well Database Server");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`📡 Port: ${PORT}`);
  console.log(`🔗 URL: ${SERVER_URL}`);
  console.log(`📊 Database: ${isConnected() ? "Connected" : "Disconnected"}`);
  console.log(`🔧 Tools: ${tools.length} registered`);
  console.log("🔐 OAuth: Enabled (auto-approve)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`🔌 Connect: ${SERVER_URL}/mcp`);
  console.log("");
});

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n🛑 Shutting down...");
  
  await sessionManager.closeAll();
  
  console.log("✅ Server stopped");
  process.exit(0);
});