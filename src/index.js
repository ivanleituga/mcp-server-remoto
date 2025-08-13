const { getHomePage } = require("../utils/templates");
const { setupOAuthEndpoints } = require("./oauth");
const { query, isConnected } = require("./database");
const sessionManager = require("./session_manager");
const { createMcpServer, toolsCount } = require("./mcp_server");
const { StreamableHTTPServerTransport } = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");

// ===============================================
// CONFIGURAÇÃO
// ===============================================

const app = express();
const PORT = process.env.PORT || 3000;
const SERVER_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;

// ===============================================
// MIDDLEWARES
// ===============================================

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
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

const mcpServer = createMcpServer(query);

// ===============================================
// ENDPOINT MCP
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
          sessionManager.add(sid, transport);
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
    sessions: sessionManager.count()
  });
});

// Página inicial
app.get("/", (req, res) => {
  res.send(getHomePage(
    SERVER_URL, 
    isConnected(),
    sessionManager.count(),
    toolsCount
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
  console.log(`🔧 Tools: ${toolsCount} registered`);
  console.log("🔐 OAuth: Enabled (auto-approve)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`🔌 Connect: ${SERVER_URL}/mcp`);
  console.log("");
});

// ===============================================
// GRACEFUL SHUTDOWN
// ===============================================

process.on("SIGINT", async () => {
  console.log("\n🛑 Shutting down...");
  await sessionManager.closeAll();
  console.log("✅ Server stopped");
  process.exit(0);
});