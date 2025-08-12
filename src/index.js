const { tools, executeTool } = require("./tools");
require("dotenv").config();

const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { Pool } = require("pg");
const cors = require("cors");
const crypto = require("crypto");

// IMPORTANTE: Importar do SDK MCP
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StreamableHTTPServerTransport } = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const { SSEServerTransport } = require("@modelcontextprotocol/sdk/server/sse.js");
const { isInitializeRequest } = require("@modelcontextprotocol/sdk/types.js");

const app = express();

// Configuração
const PORT = process.env.PORT || 3000;
const SERVER_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS configurado
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Mcp-Session-Id", "Accept", "Last-Event-ID", "Authorization"],
  exposedHeaders: ["Mcp-Session-Id"],
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
// CRIAR MCP SERVER
// ===============================================

const mcpServer = new McpServer({
  name: "mcp-well-database",
  version: "1.0.0",
});

// Registrar as ferramentas no MCP Server
console.log(`📦 Registrando ${tools.length} ferramentas...`);
tools.forEach(tool => {
  console.log(`  - ${tool.name}: ${tool.description}`);
  
  // Converter inputSchema para o formato do SDK
  const schemaProperties = {};
  if (tool.inputSchema && tool.inputSchema.properties) {
    Object.entries(tool.inputSchema.properties).forEach(([key, value]) => {
      // Aqui você precisa converter seu schema para Zod se necessário
      // Por enquanto, vamos assumir que é compatível
      schemaProperties[key] = value;
    });
  }
  
  mcpServer.tool(
    tool.name,
    schemaProperties,
    async (params) => {
      console.log(`🔧 Executando ferramenta: ${tool.name}`);
      return await executeTool(tool.name, params, query);
    }
  );
});

// ===============================================
// TRANSPORTS
// ===============================================

// Store transports by session ID
const transports = {};

// SSE transport (para compatibilidade)
let sseTransport;

// ===============================================
// ENDPOINTS
// ===============================================

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    name: "mcp-well-database",
    version: "1.0.0",
    status: "OK",
    database: dbConnected ? "Connected" : "Disconnected",
    endpoints: {
      "/": "Server information (this response)",
      "/sse": "Server-Sent Events endpoint for MCP connection",
      "/messages": "POST endpoint for MCP messages (SSE)",
      "/mcp": "Streamable HTTP endpoint for MCP connection"
    },
    customConnector: {
      preferred: `${SERVER_URL}/mcp`,
      alternative: `${SERVER_URL}/sse`,
      instructions: "Use /mcp for modern clients, /sse for legacy"
    },
    tools: tools.map(t => ({ name: t.name, description: t.description }))
  });
});

// ===============================================
// SSE ENDPOINTS (Legacy support)
// ===============================================

app.get("/sse", async (req, res) => {
  console.log("🔌 Nova conexão SSE");
  try {
    sseTransport = new SSEServerTransport("/messages", res);
    await mcpServer.connect(sseTransport);
    console.log("✅ SSE transport conectado");
  } catch (error) {
    console.error("❌ Erro ao conectar SSE:", error);
  }
});

app.post("/messages", async (req, res) => {
  console.log("📨 Mensagem SSE recebida");
  try {
    if (!sseTransport) {
      return res.status(400).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "SSE transport not initialized"
        },
        id: req.body?.id
      });
    }
    await sseTransport.handlePostMessage(req, res);
  } catch (error) {
    console.error("❌ Erro ao processar mensagem SSE:", error);
    res.status(500).json({
      jsonrpc: "2.0",
      error: {
        code: -32603,
        message: error.message
      },
      id: req.body?.id
    });
  }
});

// ===============================================
// STREAMABLE HTTP ENDPOINT (Moderno)
// ===============================================

const streamableHttpHandler = async (server, req, res) => {
  if (req.method === "POST") {
    const sessionId = req.headers["mcp-session-id"];
    
    try {
      // Check if this is an initialization request
      const isInit = isInitializeRequest(req.body);
      
      // Create a new transport for this session if needed
      if (!sessionId || !transports[sessionId] || isInit) {
        console.log(`🆕 Criando novo transport para ${isInit ? "initialize" : "request sem sessão"}`);
        
        const newSessionId = sessionId || crypto.randomUUID();
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => newSessionId,
          onsessioninitialized: (sid) => {
            console.log(`✅ Transport inicializado com session ID: ${sid}`);
            transports[sid] = transport;
          }
        });
        
        // Connect the transport to the server
        await server.connect(transport);
        console.log("🔗 Transport conectado ao servidor");
        
        // Set session ID header in response
        res.setHeader("Mcp-Session-Id", newSessionId);
        
        // CRUCIAL: Pass req.body as third parameter!
        await transport.handleRequest(req, res, req.body);
        return;
      }
      
      // Use existing transport
      if (sessionId && transports[sessionId]) {
        console.log(`♻️ Usando transport existente para sessão ${sessionId}`);
        await transports[sessionId].handleRequest(req, res, req.body);
        return;
      }
      
      // Error: no valid transport
      console.error(`❌ Nenhum transport válido para sessão ${sessionId}`);
      res.status(400).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Invalid session or transport not available"
        },
        id: null
      });
    } catch (error) {
      console.error("❌ Erro processando request:", error);
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal server error",
          data: String(error)
        },
        id: null
      });
    }
  } 
  else if (req.method === "GET") {
    // Handle SSE stream request
    const sessionId = req.headers["mcp-session-id"];
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send("Invalid or missing session ID");
      return;
    }
    
    console.log(`🔄 Estabelecendo stream SSE para sessão ${sessionId}`);
    await transports[sessionId].handleRequest(req, res);
  }
  else if (req.method === "DELETE") {
    // Handle session termination
    const sessionId = req.headers["mcp-session-id"];
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send("Invalid or missing session ID");
      return;
    }
    
    console.log(`🗑️ Terminando sessão ${sessionId}`);
    await transports[sessionId].handleRequest(req, res);
    delete transports[sessionId];
  }
  else {
    res.status(405).send("Method not allowed");
  }
};

// Endpoint principal /mcp
app.all("/mcp", async (req, res) => {
  await streamableHttpHandler(mcpServer, req, res);
});

// ===============================================
// INICIALIZAÇÃO
// ===============================================

app.listen(PORT, () => {
  console.log(`
🚀 MCP Well Database Server
📡 Porta: ${PORT}
🔗 URL: ${SERVER_URL}
✅ Ferramentas: ${tools.length} registradas

🔌 Endpoints disponíveis:
- Streamable HTTP: ${SERVER_URL}/mcp (recomendado)
- SSE Legacy: ${SERVER_URL}/sse + /messages

🧪 Para Custom Connector no Claude:
- Use: ${SERVER_URL}/mcp

📊 Status:
- Banco de dados: ${dbConnected ? "✅ Conectado" : "❌ Desconectado"}
  `);
});

// Handle server shutdown
process.on("SIGINT", async () => {
  console.log("🛑 Desligando servidor...");
  for (const sessionId in transports) {
    try {
      console.log(`Fechando transport para sessão ${sessionId}`);
      await transports[sessionId].close();
      delete transports[sessionId];
    } catch (error) {
      console.error("Erro ao fechar transport:", error);
    }
  }
  console.log("✅ Servidor desligado");
  process.exit(0);
});