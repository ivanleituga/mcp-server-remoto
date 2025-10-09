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
const cookieParser = require("cookie-parser");

// ===============================================
// CONFIGURAÇÃO
// ===============================================

const app = express();
const PORT = process.env.PORT || 3000;
const SERVER_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;

// ===============================================
// MIDDLEWARES
// ===============================================

// IMPORTANTE: Aumentar limite para requisições grandes
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(cookieParser());

// Log de todas as requisições
app.use((req, res, next) => {
  console.log(`📨 ${req.method} ${req.path}`);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log("   Body keys:", Object.keys(req.body));
  }
  next();
});

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
  
  console.log("\n🔄 MCP Request:");
  console.log(`   Method: ${req.body?.method || "unknown"}`);
  console.log(`   Session: ${sessionId || "new"}`);
  
  // Log detalhado para requests de tools
  if (req.body?.method === "tools/call") {
    console.log("   🔧 Tool Call Details:");
    console.log(`      Name: ${req.body?.params?.name}`);
    console.log("      Arguments:", req.body?.params?.arguments);
  }
  
  try {
    // Verificar se é uma requisição inicial ou sem sessão
    if (!sessionId || !sessionManager.exists(sessionId) || isInit) {
      const newSessionId = sessionId || crypto.randomUUID();
      
      console.log(`🆕 Criando nova sessão: ${newSessionId}`);
      
      // Criar novo transport com configurações corretas
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => newSessionId,
        onsessioninitialized: (sid) => {
          console.log(`✅ Sessão inicializada: ${sid}`);
          sessionManager.add(sid, transport);
        }
      });
      
      // Conectar o servidor ao transport
      await mcpServer.connect(transport);
      
      // Definir header de sessão
      res.setHeader("Mcp-Session-Id", newSessionId);
      
      // Processar a requisição
      await transport.handleRequest(req, res, req.body);
      return;
    }
    
    // Usar transport existente
    const transport = sessionManager.get(sessionId);
    if (transport) {
      console.log(`♻️ Reusando sessão: ${sessionId}`);
      
      // Processar a requisição com o transport existente
      await transport.handleRequest(req, res, req.body);
      return;
    }
    
    // Erro: sessão inválida
    console.error(`❌ Sessão inválida: ${sessionId}`);
    res.status(400).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Invalid session - please reinitialize"
      },
      id: req.body?.id || null
    });
    
  } catch (error) {
    console.error("❌ Erro no MCP:", error);
    console.error("   Stack:", error.stack);
    
    res.status(500).json({
      jsonrpc: "2.0",
      error: {
        code: -32603,
        message: `Internal error: ${error.message}`
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
    tools: toolsCount
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