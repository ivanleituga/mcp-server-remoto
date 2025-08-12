const { tools, executeTool } = require("./tools");
const { setupOAuthEndpoints } = require("./oauth");
require("dotenv").config();

const express = require("express");
const { Pool } = require("pg");
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

// Testar conexão com o banco
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
// TRANSPORTS (Sessões)
// ===============================================

const transports = {};

// ===============================================
// ENDPOINT MCP ÚNICO E SIMPLES
// ===============================================

app.post("/mcp", validateToken, async (req, res) => {
  const sessionId = req.headers["mcp-session-id"];
  const isInit = req.body?.method === "initialize";
  
  console.log(`\n📨 ${req.body?.method || "unknown"} - Session: ${sessionId || "new"}`);
  
  try {
    // Criar novo transport se necessário
    if (!sessionId || !transports[sessionId] || isInit) {
      const newSessionId = sessionId || crypto.randomUUID();
      
      console.log(`🆕 Nova sessão: ${newSessionId}`);
      
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => newSessionId,
        onsessioninitialized: (sid) => {
          console.log(`✅ Sessão inicializada: ${sid}`);
          transports[sid] = transport;
        }
      });
      
      await mcpServer.connect(transport);
      res.setHeader("Mcp-Session-Id", newSessionId);
      await transport.handleRequest(req, res, req.body);
      return;
    }
    
    // Usar transport existente
    if (transports[sessionId]) {
      console.log(`♻️ Reusando sessão: ${sessionId}`);
      await transports[sessionId].handleRequest(req, res, req.body);
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
    database: dbConnected,
    sessions: Object.keys(transports).length
  });
});

// Página inicial
app.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>MCP Well Database</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { 
            font-family: -apple-system, system-ui, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
          }
          .container {
            max-width: 800px;
            margin: 0 auto;
            background: white;
            border-radius: 16px;
            padding: 40px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
          }
          h1 { 
            font-size: 2.5rem;
            margin-bottom: 1rem;
            color: #1a202c;
          }
          .status {
            display: inline-flex;
            align-items: center;
            padding: 6px 12px;
            border-radius: 100px;
            font-size: 0.875rem;
            font-weight: 600;
            margin-left: 1rem;
          }
          .status.online {
            background: #10b981;
            color: white;
          }
          .status.offline {
            background: #ef4444;
            color: white;
          }
          .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 1rem;
            margin: 2rem 0;
          }
          .card {
            background: #f9fafb;
            padding: 1.5rem;
            border-radius: 8px;
            border: 1px solid #e5e7eb;
          }
          .card h3 {
            font-size: 0.875rem;
            color: #6b7280;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-bottom: 0.5rem;
          }
          .card p {
            font-size: 1.5rem;
            font-weight: 700;
            color: #1f2937;
          }
          .tools {
            margin: 2rem 0;
          }
          .tool {
            background: #fef3c7;
            border-left: 4px solid #f59e0b;
            padding: 1rem;
            margin: 0.5rem 0;
            border-radius: 4px;
          }
          .tool strong {
            color: #92400e;
          }
          .instructions {
            background: #dbeafe;
            border: 2px solid #3b82f6;
            border-radius: 8px;
            padding: 1.5rem;
            margin: 2rem 0;
          }
          code {
            background: #1f2937;
            color: #f3f4f6;
            padding: 2px 6px;
            border-radius: 4px;
            font-family: 'Monaco', 'Courier New', monospace;
          }
          .button {
            display: inline-block;
            background: #3b82f6;
            color: white;
            padding: 0.75rem 1.5rem;
            border-radius: 8px;
            text-decoration: none;
            font-weight: 600;
            margin: 0.5rem;
            transition: all 0.2s;
          }
          .button:hover {
            background: #2563eb;
            transform: translateY(-2px);
          }
          .footer {
            text-align: center;
            margin-top: 3rem;
            padding-top: 2rem;
            border-top: 1px solid #e5e7eb;
            color: #6b7280;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>
            🚀 MCP Well Database
            <span class="status online">ONLINE</span>
          </h1>
          
          <div class="grid">
            <div class="card">
              <h3>Database</h3>
              <p>${dbConnected ? "✅ Connected" : "❌ Offline"}</p>
            </div>
            <div class="card">
              <h3>Active Sessions</h3>
              <p>${Object.keys(transports).length}</p>
            </div>
            <div class="card">
              <h3>Tools Available</h3>
              <p>${tools.length}</p>
            </div>
            <div class="card">
              <h3>OAuth Status</h3>
              <p>✅ Enabled</p>
            </div>
          </div>

          <div class="tools">
            <h2>🔧 Available Tools</h2>
            ${tools.map(tool => `
              <div class="tool">
                <strong>${tool.name}</strong>
                <br>
                <small>${tool.description.substring(0, 100)}...</small>
              </div>
            `).join("")}
          </div>

          <div class="instructions">
            <h2>📱 Connect with Claude</h2>
            <ol style="margin: 1rem 0 1rem 2rem;">
              <li>Open Claude Desktop or Web</li>
              <li>Go to Settings → Connectors</li>
              <li>Click "Add Custom Connector"</li>
              <li>Enter: <code>${SERVER_URL}/mcp</code></li>
              <li>Complete OAuth (auto-approves)</li>
            </ol>
          </div>

          <div style="text-align: center; margin: 2rem 0;">
            <a href="/oauth/status" class="button">OAuth Status</a>
            <a href="/docs" class="button">Documentation</a>
            <a href="/health" class="button">Health Check</a>
          </div>

          <div class="footer">
            <p>MCP Well Database Server v1.0.0</p>
            <p style="margin-top: 0.5rem;">
              <small>Streamable HTTP Protocol 2025-03-26</small>
            </p>
          </div>
        </div>
      </body>
    </html>
  `);
});

// ===============================================
// LIMPEZA PERIÓDICA
// ===============================================

setInterval(() => {
  // Limpar sessões antigas (mais de 1 hora)
  const now = Date.now();
  const timeout = 3600000; // 1 hora
  
  for (const [sessionId, transport] of Object.entries(transports)) {
    // Aqui você poderia adicionar timestamp nas sessões
    // Por ora, apenas logamos
  }
  
  console.log(`🧹 Sessões ativas: ${Object.keys(transports).length}`);
}, 300000); // A cada 5 minutos

// ===============================================
// INICIALIZAÇÃO
// ===============================================

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════╗
║           MCP WELL DATABASE SERVER             ║
╠════════════════════════════════════════════════╣
║                                                 ║
║  🚀 Status: ONLINE                             ║
║  📡 Port: ${PORT}                              ║
║  🔗 URL: ${SERVER_URL}                         ║
║                                                 ║
║  📊 Database: ${dbConnected ? "✅ Connected" : "❌ Disconnected"}    ║
║  🔧 Tools: ${tools.length} registered          ║
║  🔐 OAuth: Enabled (auto-approve)              ║
║                                                 ║
╠════════════════════════════════════════════════╣
║                                                 ║
║  CONNECT WITH CLAUDE:                          ║
║  ${SERVER_URL}/mcp                             ║
║                                                 ║
╚════════════════════════════════════════════════╝
`);
});

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n🛑 Shutting down...");
  
  for (const sessionId in transports) {
    try {
      await transports[sessionId].close();
    } catch (error) {
      // Ignore errors during shutdown
    }
  }
  
  console.log("✅ Server stopped");
  process.exit(0);
});