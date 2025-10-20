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
    sessions: sessionManager.count()
  });
});

// ===============================================
// MCP ENDPOINTS
// ===============================================

app.post("/mcp", validateToken, async (req, res) => {
  try {
    const sessionId = req.headers["x-session-id"] || crypto.randomUUID();
    
    console.log(`\n📡 POST /mcp - Session: ${sessionId}`);
    console.log(`   User: ${req.oauth.user}`);
    console.log(`   Client: ${req.oauth.client_id}`);
    
    let transport = sessionManager.get(sessionId);
    
    if (!transport) {
      console.log(`   🆕 Criando nova sessão: ${sessionId}`);
      
      transport = new StreamableHTTPServerTransport({
        request: req,
        response: res,
        sessionId
      });
      
      sessionManager.add(sessionId, transport);
      
      await mcpServer.connect(transport);
      
      console.log(`   ✅ Sessão conectada: ${sessionId}`);
      console.log(`   📊 Total de sessões ativas: ${sessionManager.count()}`);
    } else {
      console.log(`   🔄 Reutilizando sessão existente: ${sessionId}`);
      
      await transport.handleRequest(req, res);
    }
    
  } catch (error) {
    console.error("   ❌ Erro no MCP endpoint:", error.message);
    if (!res.headersSent) {
      res.status(500).json({
        error: "internal_error",
        message: error.message
      });
    }
  }
});

app.delete("/mcp", validateToken, async (req, res) => {
  const sessionId = req.headers["x-session-id"];
  
  console.log(`\n🗑️  DELETE /mcp - Session: ${sessionId || "[SEM SESSION-ID]"}`);
  console.log(`   User: ${req.oauth.user}`);
  
  try {
    if (sessionId && sessionManager.exists(sessionId)) {
      const transport = sessionManager.get(sessionId);
      
      if (transport && transport.close) {
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
  
  // Limpeza periódica de tokens expirados (a cada 6 horas)
  setInterval(() => {
    cleanupExpired();
  }, 6 * 60 * 60 * 1000);
  
  // Limpeza de sessões MCP inativas (a cada 30 minutos)
  setInterval(() => {
    sessionManager.cleanup(3600000); // Remove sessões inativas há mais de 1 hora
  }, 1800000);
});

// ===============================================
// GRACEFUL SHUTDOWN
// ===============================================

// Graceful shutdown ao receber SIGTERM (Render, Docker, etc)
process.on("SIGTERM", async () => {
  console.log("\n⚠️  SIGTERM recebido. Encerrando servidor...");
  
  try {
    await sessionManager.closeAll();
    console.log("✅ Todas as sessões MCP fechadas");
    
    process.exit(0);
  } catch (error) {
    console.error("❌ Erro ao fechar sessões:", error.message);
    process.exit(1);
  }
});

// Graceful shutdown ao receber SIGINT (Ctrl+C local)
process.on("SIGINT", async () => {
  console.log("\n⚠️  SIGINT recebido (Ctrl+C). Encerrando servidor...");
  
  try {
    await sessionManager.closeAll();
    console.log("✅ Todas as sessões MCP fechadas");
    
    process.exit(0);
  } catch (error) {
    console.error("❌ Erro ao fechar sessões:", error.message);
    process.exit(1);
  }
});