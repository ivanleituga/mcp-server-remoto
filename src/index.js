const { getHomePage } = require("../utils/templates");
const { setupOAuthEndpoints } = require("./oauth_endpoints");
const { query, isConnected } = require("./database");
const sessionManager = require("./session_manager");
const { createMcpServer, toolsCount } = require("./mcp_server");
const { cleanupExpired } = require("./oauth_storage");
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

app.use("/utils", express.static("utils"));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(cors({
  origin: true,
  credentials: true
}));

// Log de todas as requisições
app.use((req, _res, next) => {
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
// ROTAS BÁSICAS
// ===============================================

app.get("/", (_req, res) => {
  res.send(getHomePage(
    SERVER_URL, 
    isConnected(),
    sessionManager.count(),
    toolsCount
  ));
});

app.get("/health", async (_req, res) => {
  const dbStatus = isConnected();
  
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    database: dbStatus ? "connected" : "disconnected",
    tools: toolsCount,
    server: SERVER_URL
  });
});

// ===============================================
// ENDPOINT MCP
// ===============================================

app.post("/mcp", validateToken, async (req, res) => {
  const sessionId = req.headers["mcp-session-id"];
  const isInit = req.body?.method === "initialize";
  
  console.log("\n🔄 MCP Request:");
  console.log(`   Method: ${req.body?.method || "unknown"}`);
  console.log(`   Session: ${sessionId || "new"}`);
  
  if (req.body?.method === "tools/call") {
    console.log("   🔧 Tool Call Details:");
    console.log(`      Name: ${req.body?.params?.name}`);
    console.log("      Arguments:", req.body?.params?.arguments);
  }
  
  try {
    if (!sessionId || !sessionManager.exists(sessionId) || isInit) {
      const newSessionId = sessionId || crypto.randomUUID();
      
      console.log(`🆕 Criando nova sessão: ${newSessionId}`);
      
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => newSessionId,
        onsessioninitialized: (sid) => {
          console.log(`✅ Sessão inicializada: ${sid}`);
          sessionManager.add(sid, transport);
        }
      });
      
      await mcpServer.connect(transport);
      
      res.setHeader("Mcp-Session-Id", newSessionId);
      
      await transport.handleRequest(req, res, req.body);
      return;
    }
    
    const transport = sessionManager.get(sessionId);
    if (transport) {
      console.log(`♻️ Reusando sessão: ${sessionId}`);
      
      await transport.handleRequest(req, res, req.body);
      return;
    }
    
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
// DELETE /mcp - Cleanup de Sessão
// ===============================================

app.delete("/mcp", validateToken, async (req, res) => {
  const sessionId = req.headers["mcp-session-id"];
  
  console.log("\n🗑️  DELETE /mcp");
  console.log(`   Session: ${sessionId || "none"}`);
  
  if (!sessionId) {
    console.log("   ⚠️  Nenhuma sessão especificada");
    return res.status(400).json({
      error: "missing_session_id",
      message: "Header Mcp-Session-Id required"
    });
  }
  
  try {
    if (sessionManager.exists(sessionId)) {
      const transport = sessionManager.get(sessionId);
      if (transport) {
        await transport.close();
        console.log(`   ✅ Transport fechado: ${sessionId}`);
      }
      
      sessionManager.remove(sessionId);
      console.log(`   ✅ Sessão removida: ${sessionId}`);
      
      res.status(200).json({ 
        message: "Session deleted successfully",
        session_id: sessionId 
      });
    } else {
      console.log(`   ⚠️  Sessão não encontrada: ${sessionId}`);
      res.status(200).json({ 
        message: "Session not found or already deleted",
        session_id: sessionId 
      });
    }
    
  } catch (error) {
    console.error("   ❌ Erro ao deletar sessão:", error.message);
    res.status(500).json({
      error: "internal_error",
      message: error.message
    });
  }
});

// ===============================================
// INICIALIZAÇÃO
// ===============================================

app.listen(PORT, () => {
  console.log("\n🚀 MCP Well Database Server");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`📡 Port: ${PORT}`);
  console.log(`🔗 URL: ${SERVER_URL}`);
  console.log(`🔧 Tools: ${toolsCount} registered`);
  console.log("🔐 OAuth: Enabled (DCR + PKCE)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`🔌 Connect: ${SERVER_URL}/mcp`);
  
  if (isConnected()) {
    console.log("✅ Banco de dados conectado");
  }
  
  // Limpeza periódica de tokens expirados (a cada 1 hora)
  setInterval(() => {
    cleanupExpired();
  }, 3600000);
});