const { tools, executeTool } = require("./tools");

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");
const { Pool } = require("pg");

const app = express();

// Configuração do servidor
const SERVER_URL = "https://mcp-server-remoto.onrender.com";
const AUTH_SERVER_URL = "https://mcp-server-remoto.onrender.com";

// Middlewares
app.use(cors({ origin: "*", exposedHeaders: ["Mcp-Session-Id"] }));
app.use(express.json());
app.use((req, res, next) => {
  console.log(`🔍 ${req.method} ${req.url} - Headers:`, {
    authorization: req.headers.authorization ? "Bearer ***" : "none",
    accept: req.headers.accept
  });
  next();
});

app.use(express.urlencoded({ extended: true }));

// Logging MCP
app.use((req, _res, next) => {
  if (req.body?.method) {
    console.log(`[${new Date().toISOString()}] ${req.body.method}`);
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

// Testar conexão na inicialização
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

// Executar query
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

// Sessões MCP
const sessions = {};

// Middleware de autenticação
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  
  // Se não tem token, retorna 401 com WWW-Authenticate
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.log("❌ Sem token de autorização");
    return res.status(401)
      .header("WWW-Authenticate", `Bearer resource_metadata="${SERVER_URL}/.well-known/oauth-protected-resource"`)
      .json({
        error: "unauthorized",
        error_description: "Authentication required"
      });
  }
  
  const token = authHeader.substring(7);
  
  // Por enquanto, vamos aceitar qualquer token que pareça JWT
  // Em produção, você validaria a assinatura e claims
  if (!token || !token.includes(".")) {
    console.log("❌ Token inválido");
    return res.status(401)
      .header("WWW-Authenticate", `Bearer resource_metadata="${SERVER_URL}/.well-known/oauth-protected-resource", error="invalid_token"`)
      .json({
        error: "invalid_token",
        error_description: "The access token is invalid"
      });
  }
  
  console.log("✅ Token válido recebido");
  next();
}

// Função para processar requisições MCP (compartilhada entre endpoints)
async function processMcpRequest(req, res) {
  console.log(`📨 MCP Request - Method: ${req.body?.method}`);
  console.log("Headers:", {
    authorization: req.headers.authorization ? "Bearer ***" : "none",
    "mcp-session-id": req.headers["mcp-session-id"] || "none"
  });
  
  const sessionId = req.headers["mcp-session-id"];
  const { method, params, id } = req.body;
  
  try {
    // Initialize
    if (method === "initialize") {
      console.log("✅ Initialize chamado com sucesso");
      const newSessionId = uuidv4();
      sessions[newSessionId] = { created: new Date() };
      
      res.setHeader("Mcp-Session-Id", newSessionId);
      return res.json({
        jsonrpc: "2.0",
        result: {
          protocolVersion: "2025-11-05",
          capabilities: { 
            tools: {},
            prompts: {},
            resources: {}
          },
          serverInfo: { 
            name: "mcp-well-database",
            version: "1.0.0"
          }
        },
        id
      });
    }
    
    // Validar sessão (exceto para initialize)
    if (method !== "initialize" && (!sessionId || !sessions[sessionId])) {
      console.log("❌ Sessão inválida ou não encontrada");
      return res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Session required" },
        id
      });
    }
    
    // Processar métodos
    let result;
    switch (method) {
    case "tools/list":
      console.log("📋 Listando ferramentas");
      result = { tools };
      break;
    case "prompts/list":
      console.log("📋 Listando prompts");
      result = { prompts: [] };
      break;
    case "resources/list":
      console.log("📋 Listando recursos");
      result = { resources: [] };
      break;
    case "tools/call":
      console.log(`🔧 Executando ferramenta: ${params?.name}`);
      result = await executeTool(params.name, params.arguments, query);
      break;
    case "notifications/initialized":
      console.log("📬 Notificação: initialized");
      result = {};
      break;
    default:
      console.log(`❌ Método não encontrado: ${method}`);
      return res.status(404).json({
        jsonrpc: "2.0",
        error: { code: -32601, message: `Method not found: ${method}` },
        id
      });
    }
    
    res.json({ jsonrpc: "2.0", result, id });
    
  } catch (error) {
    console.error(`❌ Erro ao processar ${method}:`, error.message);
    res.status(500).json({
      jsonrpc: "2.0",
      error: { code: -32603, message: error.message },
      id
    });
  }
}

// 1. Protected Resource Metadata (RFC 9728)
app.get("/.well-known/oauth-protected-resource", (req, res) => {
  res.json({
    resource: SERVER_URL,
    authorization_servers: [AUTH_SERVER_URL],
    scopes_supported: [
      "mcp:read",
      "mcp:write",
      "tools:execute"
    ],
    bearer_methods_supported: ["header"],
    resource_documentation: "https://github.com/seu-usuario/mcp-well-database",
    resource_policy_uri: "https://seu-site.com/privacy",
    resource_contact: ["admin@seu-site.com"]
  });
});

// 2. Suporte para Streamable HTTP (MCP Inspector)
app.get("/mcp/messages", requireAuth, async (req, res) => {
  console.log("🔌 Conexão Streamable HTTP estabelecida");
  
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no"
  });
  
  // O Streamable HTTP espera um formato específico
  res.write("\n");
  
  // Manter conexão viva
  const keepAlive = setInterval(() => {
    res.write("\n");
  }, 30000);
  
  req.on("close", () => {
    console.log("🔌 Conexão Streamable HTTP fechada");
    clearInterval(keepAlive);
  });
});

// Endpoint para receber mensagens do Streamable HTTP
app.post("/mcp/messages", requireAuth, async (req, res) => {
  console.log("📨 Streamable HTTP Message:", JSON.stringify(req.body));
  
  // O Streamable HTTP espera a resposta em um formato específico
  const { jsonrpc, method, params, id } = req.body;
  
  // Criar um objeto de requisição compatível
  const mockReq = {
    body: { method, params, id, jsonrpc },
    headers: req.headers
  };
  
  // Criar um objeto de resposta que captura o resultado
  let responseData = null;
  const mockRes = {
    setHeader: () => {},
    json: (data) => {
      responseData = data;
    },
    status: () => mockRes
  };
  
  // Processar usando a função existente
  await processMcpRequest(mockReq, mockRes);
  
  // Enviar a resposta
  if (responseData) {
    res.json(responseData);
  } else {
    res.status(500).json({ error: "Processing failed" });
  }
});

// 3. Rota MCP principal com autenticação (para Claude)
app.post("/mcp", requireAuth, processMcpRequest);

// 4. Simulação de Authorization Server (APENAS PARA TESTE)
const tempCodes = new Map();
const tempTokens = new Map();

// Metadata do Authorization Server
app.get("/.well-known/oauth-authorization-server", (req, res) => {
  res.json({
    issuer: AUTH_SERVER_URL,
    authorization_endpoint: `${AUTH_SERVER_URL}/authorize`,
    token_endpoint: `${AUTH_SERVER_URL}/token`,
    registration_endpoint: `${AUTH_SERVER_URL}/register`,
    scopes_supported: ["mcp:read", "mcp:write", "tools:execute"],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post"]
  });
});

// Endpoint de autorização (simulado)
app.get("/authorize", (req, res) => {
  const { client_id, redirect_uri, state, scope, code_challenge, code_challenge_method } = req.query;
  
  console.log("Authorization request:", { client_id, redirect_uri, state, scope });
  
  // Gerar código
  const code = uuidv4();
  tempCodes.set(code, { 
    client_id, 
    redirect_uri,
    scope,
    code_challenge,
    created: Date.now() 
  });
  
  // Limpar códigos antigos
  for (const [key, value] of tempCodes.entries()) {
    if (Date.now() - value.created > 600000) { // 10 minutos
      tempCodes.delete(key);
    }
  }
  
  // Redirecionar com código
  const redirectUrl = `${redirect_uri}?code=${code}&state=${state}`;
  res.redirect(redirectUrl);
});

// Endpoint de token (simulado)
app.post("/token", (req, res) => {
  const { grant_type, code, client_id, redirect_uri, code_verifier } = req.body;
  
  console.log("Token request:", { grant_type, code, client_id });
  
  if (grant_type !== "authorization_code") {
    return res.status(400).json({ error: "unsupported_grant_type" });
  }
  
  const codeData = tempCodes.get(code);
  if (!codeData || codeData.client_id !== client_id) {
    return res.status(400).json({ error: "invalid_grant" });
  }
  
  // Gerar token JWT simulado com formato mais completo
  const payload = {
    sub: "user123",
    aud: SERVER_URL,
    iss: AUTH_SERVER_URL,
    scope: codeData.scope || "mcp:read",
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
    client_id: client_id
  };
  
  // Simular JWT (header.payload.signature)
  const header = Buffer.from(JSON.stringify({ typ: "JWT", alg: "RS256" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const accessToken = `${header}.${body}.fake-signature`;
  
  tempCodes.delete(code);
  
  res.json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: 3600,
    scope: codeData.scope || "mcp:read"
  });
});

// Endpoint de registro dinâmico (simulado)
app.post("/register", (req, res) => {
  const { client_name, redirect_uris, grant_types, response_types, scope } = req.body;
  
  console.log("Client registration:", { client_name, redirect_uris });
  
  const client_id = `client_${uuidv4()}`;
  
  res.status(201).json({
    client_id,
    client_secret: uuidv4(),
    client_name,
    redirect_uris,
    grant_types: grant_types || ["authorization_code"],
    response_types: response_types || ["code"],
    scope: scope || "mcp:read",
    client_id_issued_at: Math.floor(Date.now() / 1000),
    client_secret_expires_at: 0 // não expira
  });
});

// Rota informativa
app.get("/", (_req, res) => {
  res.json({
    name: "mcp-well-database",
    version: "1.0.0",
    endpoint: "/mcp",
    streamable_http_endpoint: "/mcp/messages",
    status: "OK",
    database: dbConnected ? "Connected" : "Disconnected",
    protected_resource_metadata: "/.well-known/oauth-protected-resource",
    authorization_server_metadata: "/.well-known/oauth-authorization-server",
    sessions_active: Object.keys(sessions).length
  });
});

// Rota POST / para Streamable HTTP
app.post("/", requireAuth, async (req, res) => {
  console.log("📨 Streamable HTTP na raiz - processando como MCP");
  return processMcpRequest(req, res);
});

// Catch-all 404 - adicione ANTES do app.listen()
app.use((req, res) => {
  console.log(`❌ 404 - Rota não encontrada: ${req.method} ${req.url}`);
  res.status(404).json({ error: "Not found", path: req.url });
});

// Limpar sessões antigas a cada 5 minutos
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of Object.entries(sessions)) {
    if (now - session.created.getTime() > 3600000) { // 1 hora
      delete sessions[id];
    }
  }
}, 300000);

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 MCP Well Database Server - Port ${PORT}`);
  console.log(`📋 Protected Resource Metadata: ${SERVER_URL}/.well-known/oauth-protected-resource`);
  console.log(`🔐 Authorization Server: ${AUTH_SERVER_URL}`);
  console.log("📡 Streamable HTTP: /mcp/messages (para MCP Inspector)");
  console.log("⚠️  Usando authorization server embutido para testes");
});