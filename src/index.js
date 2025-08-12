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
  exposedHeaders: ["Mcp-Session-Id", "WWW-Authenticate"],
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
// OAUTH SIMPLIFICADO (Mock para desenvolvimento)
// ===============================================

// Store de tokens (em produção, use um banco de dados)
const tokens = new Map();
const authCodes = new Map();

// OAuth Discovery Endpoint
app.get("/.well-known/oauth-authorization-server", (req, res) => {
  res.json({
    issuer: SERVER_URL,
    authorization_endpoint: `${SERVER_URL}/oauth/authorize`,
    token_endpoint: `${SERVER_URL}/oauth/token`,
    registration_endpoint: `${SERVER_URL}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"]
  });
});

// OAuth Client Registration
app.post("/oauth/register", (req, res) => {
  const clientId = `client_${uuidv4()}`;
  console.log("📝 Novo cliente OAuth registrado:", clientId);
  
  res.json({
    client_id: clientId,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    grant_types: ["authorization_code", "refresh_token"]
  });
});

// OAuth Authorization Endpoint
app.get("/oauth/authorize", (req, res) => {
  const { client_id, redirect_uri, state, code_challenge } = req.query;
  
  // Mock: Auto-aprovação (em produção, mostraria tela de consentimento)
  const authCode = `code_${uuidv4()}`;
  authCodes.set(authCode, {
    clientId: client_id,
    codeChallenge: code_challenge,
    createdAt: Date.now()
  });
  
  console.log("🔐 Código de autorização gerado:", authCode);
  
  // Redirecionar com o código
  const redirectUrl = new URL(redirect_uri);
  redirectUrl.searchParams.set("code", authCode);
  if (state) redirectUrl.searchParams.set("state", state);
  
  res.redirect(redirectUrl.toString());
});

// OAuth Token Endpoint
app.post("/oauth/token", (req, res) => {
  const { grant_type, code, code_verifier, refresh_token } = req.body;
  
  console.log("🎫 Token request:", { grant_type, hasCode: !!code, hasRefresh: !!refresh_token });
  
  if (grant_type === "authorization_code") {
    // Mock: Validação simplificada
    if (!code || !authCodes.has(code)) {
      return res.status(400).json({ error: "invalid_grant" });
    }
    
    const authData = authCodes.get(code);
    authCodes.delete(code); // Código só pode ser usado uma vez
    
    // Gerar tokens
    const accessToken = `access_${uuidv4()}`;
    const refreshToken = `refresh_${uuidv4()}`;
    
    tokens.set(accessToken, {
      clientId: authData.clientId,
      createdAt: Date.now(),
      expiresAt: Date.now() + 3600000 // 1 hora
    });
    
    tokens.set(refreshToken, {
      clientId: authData.clientId,
      createdAt: Date.now(),
      type: "refresh"
    });
    
    console.log("✅ Tokens gerados:", { accessToken, refreshToken });
    
    res.json({
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: 3600,
      refresh_token: refreshToken
    });
  } else if (grant_type === "refresh_token") {
    // Mock: Sempre renova o token
    const newAccessToken = `access_${uuidv4()}`;
    
    tokens.set(newAccessToken, {
      clientId: "refreshed_client",
      createdAt: Date.now(),
      expiresAt: Date.now() + 3600000
    });
    
    res.json({
      access_token: newAccessToken,
      token_type: "Bearer",
      expires_in: 3600,
      refresh_token: refresh_token // Mantém o mesmo refresh token
    });
  } else {
    res.status(400).json({ error: "unsupported_grant_type" });
  }
});

// Middleware de validação OAuth (flexível para desenvolvimento)
function validateOAuth(req, res, next) {
  // IMPORTANTE: Permitir initialize sem autenticação
  if (req.body?.method === "initialize") {
    console.log("🆓 Initialize request - bypass OAuth");
    return next();
  }
  
  const authHeader = req.headers.authorization;
  
  // Em desenvolvimento, permitir sem token
  if (!authHeader) {
    console.log("⚠️ No auth header - allowing for development");
    return next();
  }
  
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    
    if (tokens.has(token)) {
      const tokenData = tokens.get(token);
      
      // Verificar expiração
      if (tokenData.expiresAt && Date.now() > tokenData.expiresAt) {
        console.log("❌ Token expirado");
        return res.status(401).json({ error: "token_expired" });
      }
      
      console.log("✅ Token válido");
      req.oauth = tokenData;
      return next();
    }
    
    console.log("❌ Token inválido");
    return res.status(401).json({ error: "invalid_token" });
  }
  
  next();
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
  console.log(`  - ${tool.name}: ${tool.description.substring(0, 50)}...`);
  
  mcpServer.tool(
    tool.name,
    tool.inputSchema.properties || {}, // Usar properties do inputSchema
    async (params) => {
      console.log(`🔧 Executando ferramenta: ${tool.name}`);
      const result = await executeTool(tool.name, params, query);
      
      // Garantir que retornamos no formato correto
      if (result.isError) {
        throw new Error(result.content[0].text);
      }
      
      return result;
    }
  );
});

// ===============================================
// TRANSPORTS
// ===============================================

// Store transports by session ID
const transports = {};

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
      "/mcp": "Streamable HTTP endpoint for MCP connection"
    },
    oauth: {
      discovery: `${SERVER_URL}/.well-known/oauth-authorization-server`,
      authorize: `${SERVER_URL}/oauth/authorize`,
      token: `${SERVER_URL}/oauth/token`,
      register: `${SERVER_URL}/oauth/register`
    },
    customConnector: {
      url: `${SERVER_URL}/mcp`,
      instructions: "Add this URL as a Custom Connector in Claude"
    },
    tools: tools.map(t => ({ name: t.name, description: t.description.substring(0, 100) + "..." }))
  });
});

// ===============================================
// STREAMABLE HTTP ENDPOINT com OAuth Opcional
// ===============================================

const streamableHttpHandler = async (server, req, res) => {
  if (req.method === "POST") {
    const sessionId = req.headers["mcp-session-id"];
    
    try {
      // Check if this is an initialization request
      const isInit = req.body?.method === "initialize" || isInitializeRequest(req.body);
      
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

// Endpoint principal /mcp COM OAuth opcional
app.all("/mcp", validateOAuth, async (req, res) => {
  console.log(`📨 ${req.method} /mcp - OAuth: ${req.oauth ? "✅" : "❌"}`);
  await streamableHttpHandler(mcpServer, req, res);
});

// ===============================================
// LIMPEZA PERIÓDICA
// ===============================================

// Limpar tokens expirados
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [token, data] of tokens.entries()) {
    if (data.expiresAt && now > data.expiresAt) {
      tokens.delete(token);
      cleaned++;
    }
  }
  
  // Limpar códigos de autorização antigos (mais de 10 minutos)
  for (const [code, data] of authCodes.entries()) {
    if (now - data.createdAt > 600000) {
      authCodes.delete(code);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    console.log(`🧹 Limpeza: ${cleaned} tokens/códigos expirados removidos`);
  }
}, 60000); // A cada minuto

// ===============================================
// INICIALIZAÇÃO
// ===============================================

app.listen(PORT, () => {
  console.log(`
🚀 MCP Well Database Server (SDK + OAuth)
📡 Porta: ${PORT}
🔗 URL: ${SERVER_URL}
✅ Ferramentas: ${tools.length} registradas

🔌 Endpoints disponíveis:
- Streamable HTTP: ${SERVER_URL}/mcp
- OAuth Discovery: ${SERVER_URL}/.well-known/oauth-authorization-server

🧪 Para Custom Connector no Claude:
- Use: ${SERVER_URL}/mcp
- OAuth será solicitado automaticamente

📊 Status:
- Banco de dados: ${dbConnected ? "✅ Conectado" : "❌ Desconectado"}
- OAuth: Mock mode (auto-approval)
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