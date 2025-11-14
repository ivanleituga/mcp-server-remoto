const { getHomePage, getMcpTutorialPage } = require("../utils/templates");
const { setupOAuthEndpoints } = require("./oauth_endpoints");
const { query, isConnected } = require("./database");
const sessionManager = require("./session_manager");
const { createMcpServer, toolsCount } = require("./mcp_server");
const { cleanupExpired } = require("./oauth_storage");
const AuditLogger = require("./audit_logger");
const { StreamableHTTPServerTransport } = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const { requestContext, getAccessToken } = require("./context");

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");

// ===============================================
// CONFIG BÁSICA
// ===============================================

const app = express();
const PORT = process.env.PORT || 3000;
const SERVER_URL =
  process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;

// ===============================================
// MIDDLEWARES
// ===============================================

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir assets estáticos (logo etc.)
app.use("/utils", express.static("utils"));

// Log básico de requisições
app.use((req, _res, next) => {
  console.log(`\n📨 ${req.method} ${req.path}`);
  next();
});

// ===============================================
// CONFIGURAR OAUTH
// ===============================================

const { validateToken } = setupOAuthEndpoints(app);

// ===============================================
// CRIAR MCP SERVER
// ===============================================

const mcpServer = createMcpServer(query, getAccessToken);

// ===============================================
// ROTAS BÁSICAS
// ===============================================

app.get("/", (_req, res) => {
  const dbStatus = isConnected();
  const sessionCount = sessionManager.count();

  res.send(getHomePage(SERVER_URL, dbStatus, sessionCount, toolsCount));
});

app.get("/health", (_req, res) => {
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
// TUTORIAL MCP (GET /mcp)
// ===============================================

app.get("/mcp", (_req, res) => {
  res.send(getMcpTutorialPage());
});

// ===============================================
// POST /mcp - JSON-RPC MCP COM SESSÕES HTTP
// ===============================================

app.post("/mcp", validateToken, async (req, res) => {
  const sessionIdHeader = req.headers["mcp-session-id"];
  const isInit = req.body?.method === "initialize";

  console.log("\n🔄 MCP Request:");
  console.log(`   Method: ${req.body?.method || "unknown"}`);
  console.log(`   Session: ${sessionIdHeader || "new"}`);

  if (req.body?.method === "tools/call") {
    console.log("   🔧 Tool Call Details:");
    console.log(`      Name: ${req.body?.params?.name}`);
    console.log("      Arguments:", req.body?.params?.arguments);
  }

  // Access token atual, usado pelas tools (curves/dlis)
  const authHeader = req.headers.authorization || "";
  const accessToken = authHeader.startsWith("Bearer ")
    ? authHeader.substring("Bearer ".length)
    : null;

  const effectiveSessionId = sessionIdHeader || crypto.randomUUID();

  await requestContext.run(
    {
      accessToken,
      userId: req.oauth.user_id, // user_id para o logger
      clientId: req.oauth.client_id, // client_id para o logger
      sessionId: effectiveSessionId, // sessionId para o logger
      req // req completo para extrair IP, user-agent, etc
    },
    async () => {
      try {
        // Nova sessão ou re-inicialização
        if (
          !sessionIdHeader ||
          !sessionManager.exists(sessionIdHeader) ||
          isInit
        ) {
          const newSessionId = effectiveSessionId;

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

        // Sessão já existente
        if (!sessionManager.exists(sessionIdHeader)) {
          console.log(
            "   ⚠️  Sessão informada não existe mais. Cliente deve reinicializar."
          );
          return res.status(400).json({
            error: "invalid_session",
            message: "Sessão não encontrada. Reinicie a conexão MCP."
          });
        }

        const transport = sessionManager.get(sessionIdHeader);
        if (!transport) {
          console.log("   ⚠️  Transport não encontrado para sessão");
          return res.status(400).json({
            error: "invalid_session",
            message: "Transport não encontrado para sessão MCP."
          });
        }

        await transport.handleRequest(req, res, req.body);
      } catch (error) {
        console.error("❌ Erro ao processar /mcp:", error);
        await AuditLogger.logError(
          req.oauth.user_id,
          req.oauth.client_id,
          effectiveSessionId,
          error,
          {
            path: "/mcp",
            method: req.body?.method
          }
        );
        res.status(500).json({
          error: "internal_error",
          message: "Erro interno ao processar requisição MCP"
        });
      }
    }
  );
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
        status: "ok",
        message: "Sessão encerrada com sucesso"
      });
    } else {
      console.log("   ⚠️  Sessão não encontrada");
      res.status(404).json({
        error: "session_not_found",
        message: "Sessão não encontrada"
      });
    }
  } catch (error) {
    console.error("❌ Erro ao encerrar sessão MCP:", error);
    await AuditLogger.logError(null, null, sessionId, error, {
      path: "/mcp",
      operation: "delete_session"
    });
    res.status(500).json({
      error: "internal_error",
      message: "Erro interno ao encerrar sessão"
    });
  }
});

// ===============================================
// INICIAR SERVIDOR
// ===============================================

const server = app.listen(PORT, () => {
  console.log(`\n🚀 MCP Well Database Server rodando na porta ${PORT}`);
  console.log(`   URL base: ${SERVER_URL}`);
  console.log(`   Ferramentas MCP disponíveis: ${toolsCount}`);

  // Limpeza de tokens expirados (a cada 6 horas)
  setInterval(() => {
    console.log("🧹 Limpando tokens OAuth expirados...");
    cleanupExpired();
  }, 6 * 60 * 60 * 1000);

  // Limpeza de sessões MCP inativas (a cada 30 minutos)
  setInterval(() => {
    console.log("🧹 Limpando sessões MCP inativas...");
    sessionManager.cleanup(60 * 60 * 1000); // Remove sessões inativas há mais de 1 hora
  }, 30 * 60 * 1000);

  // Flush do AuditLogger a cada 5 minutos (caso o buffer não encha)
  setInterval(() => {
    console.log("🧾 Flush periódico do AuditLogger...");
    AuditLogger.flush();
  }, 5 * 60 * 1000);
});

// Encerramento gracioso
function shutdown(signal) {
  console.log(`\n${signal} recebido. Encerrando servidor...`);
  server.close(async () => {
    await AuditLogger.flush();
    await sessionManager.closeAll();
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
