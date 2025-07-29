const { tools, executeTool } = require("./tools");
require("dotenv").config();

const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { Pool } = require("pg");

const app = express();

// Configuração
const PORT = process.env.PORT || 3000;
// No Render, detectamos automaticamente a URL
const SERVER_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS configurado para MCP
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, DELETE");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, Mcp-Session-Id, Accept");
  res.header("Access-Control-Expose-Headers", "Mcp-Session-Id");
  
  if (req.method === "OPTIONS") {
    return res.status(200).end();
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

// Sessões MCP em memória
const sessions = {};

// ===============================================
// STREAMABLE HTTP ENDPOINT (2025-03-26 spec)
// ===============================================

// POST /mcp - Endpoint principal do Streamable HTTP
app.post("/mcp", async (req, res) => {
  const { method, params, id } = req.body;
  const sessionId = req.headers["mcp-session-id"];
  const acceptHeader = req.headers.accept || "";
  
  console.log(`📨 ${method} - Session: ${sessionId || "new"} - Accept: ${acceptHeader}`);
  
  try {
    // Handle initialize
    if (method === "initialize") {
      const newSessionId = uuidv4();
      sessions[newSessionId] = { 
        created: new Date(),
        protocolVersion: params?.protocolVersion || "2025-03-26",
        clientInfo: params?.clientInfo || {}
      };
      
      // IMPORTANTE: Definir o header Mcp-Session-Id na resposta
      res.setHeader("Mcp-Session-Id", newSessionId);
      
      // Resposta JSON padrão (não streaming)
      return res.json({
        jsonrpc: "2.0",
        result: {
          protocolVersion: "2025-03-26",
          capabilities: {
            tools: {},
            prompts: {},
            resources: {}
          },
          serverInfo: {
            name: "mcp-well-database",
            version: "1.0.0",
            protocolVersions: ["2025-03-26", "2024-11-05"] // Suportamos ambas versões
          }
        },
        id
      });
    }
    
    // Validar sessão para outros métodos
    if (!sessionId || !sessions[sessionId]) {
      return res.status(400).json({
        jsonrpc: "2.0",
        error: { 
          code: -32000, 
          message: "Bad Request: Session required. Call initialize first."
        },
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
      // Executar ferramenta SEM autenticação
      result = await executeTool(params.name, params.arguments, query);
      break;
        
    case "notifications/initialized":
      // Cliente notificando que inicializou
      result = {};
      break;
        
    case "notifications/cancelled":
      // Cliente cancelando uma requisição
      console.log(`🚫 Requisição ${params.requestId} cancelada: ${params.reason}`);
      result = {};
      break;
        
    default:
      return res.status(404).json({
        jsonrpc: "2.0",
        error: { 
          code: -32601, 
          message: `Method not found: ${method}`
        },
        id
      });
    }
    
    // Resposta JSON padrão
    res.json({
      jsonrpc: "2.0",
      result,
      id
    });
    
  } catch (error) {
    console.error(`❌ Erro processando ${method}:`, error);
    res.status(500).json({
      jsonrpc: "2.0",
      error: { 
        code: -32603, 
        message: `Internal error: ${error.message}`
      },
      id
    });
  }
});

// GET /mcp - Para clientes que querem abrir stream SSE passivo
app.get("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"];
  const acceptHeader = req.headers.accept || "";
  
  console.log(`🔌 GET /mcp - Session: ${sessionId} - Accept: ${acceptHeader}`);
  
  // Verificar se cliente aceita SSE
  if (!acceptHeader.includes("text/event-stream")) {
    return res.status(406).json({
      error: "Not Acceptable: Client must accept text/event-stream"
    });
  }
  
  // Verificar sessão
  if (!sessionId || !sessions[sessionId]) {
    return res.status(400).json({
      error: "Bad Request: Valid session required for SSE stream"
    });
  }
  
  // Configurar SSE
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no"
  });
  
  // Enviar heartbeat inicial
  res.write(":ok\n\n");
  
  // Armazenar stream para possíveis notificações futuras
  sessions[sessionId].stream = res;
  
  // Heartbeat para manter conexão viva
  const heartbeat = setInterval(() => {
    res.write(":ping\n\n");
  }, 30000);
  
  // Cleanup ao desconectar
  req.on("close", () => {
    console.log(`🔌 SSE stream fechado para sessão ${sessionId}`);
    clearInterval(heartbeat);
    if (sessions[sessionId]) {
      delete sessions[sessionId].stream;
    }
  });
});

// DELETE /mcp - Terminar sessão
app.delete("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"];
  
  console.log(`🗑️ DELETE /mcp - Session: ${sessionId}`);
  
  if (sessionId && sessions[sessionId]) {
    // Fechar stream SSE se existir
    if (sessions[sessionId].stream) {
      sessions[sessionId].stream.end();
    }
    delete sessions[sessionId];
    res.status(204).end();
  } else {
    res.status(404).json({ 
      error: "Session not found" 
    });
  }
});

// ===============================================
// ENDPOINTS AUXILIARES
// ===============================================

// Status e informações do servidor
app.get("/", (req, res) => {
  const activeSessions = Object.keys(sessions).length;
  const sessionsWithStreams = Object.values(sessions).filter(s => s.stream).length;
  
  res.json({
    name: "mcp-well-database",
    version: "1.0.0",
    status: "OK",
    database: dbConnected ? "Connected" : "Disconnected",
    transport: "streamable-http",
    protocolVersion: "2025-03-26",
    endpoint: "/mcp",
    authentication: "none",
    sessions: {
      active: activeSessions,
      withStreams: sessionsWithStreams
    },
    instructions: {
      claude: `Add as Custom Connector with URL: ${SERVER_URL}/mcp`,
      inspector: `npx @modelcontextprotocol/inspector -y --url ${SERVER_URL}/mcp`,
      curl: {
        initialize: `curl -X POST ${SERVER_URL}/mcp -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26"}}'`,
        listTools: `curl -X POST ${SERVER_URL}/mcp -H "Content-Type: application/json" -H "Mcp-Session-Id: YOUR_SESSION_ID" -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'`
      }
    }
  });
});

// ===============================================
// LIMPEZA E INICIALIZAÇÃO
// ===============================================

// Limpar sessões antigas periodicamente
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [id, session] of Object.entries(sessions)) {
    if (now - session.created.getTime() > 3600000) { // 1 hora
      if (session.stream) {
        session.stream.end();
      }
      delete sessions[id];
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    console.log(`🧹 Limpeza: ${cleaned} sessões antigas removidas`);
  }
}, 300000); // 5 minutos

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`
🚀 MCP Well Database Server
📡 Porta: ${PORT}
🔗 URL: ${SERVER_URL}
📋 Transport: Streamable HTTP (2025-03-26)
🔓 Autenticação: NENHUMA

✨ Endpoint único: ${SERVER_URL}/mcp
  - POST: Enviar mensagens JSON-RPC
  - GET: Abrir stream SSE passivo (opcional)
  - DELETE: Terminar sessão

🧪 Como testar:
1. Inspector: npx @modelcontextprotocol/inspector -y --url ${SERVER_URL}/mcp
2. Claude: Settings > Connectors > Add > ${SERVER_URL}/mcp
3. Curl: Veja exemplos em ${SERVER_URL}/

📊 Status:
- Banco de dados: ${dbConnected ? "✅ Conectado" : "❌ Desconectado"}
- Sessões ativas: 0
  `);
});