const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();

// Configuração essencial
app.use(cors({
  origin: '*',
  exposedHeaders: ['anthropic-session-id', 'anthropic-mcp-version']
}));

app.use(express.json());

// Logging simplificado
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Armazenamento de sessões
const sessions = {};

// Informações do servidor
const serverInfo = {
  name: 'mcp-server-remoto',
  version: '1.0.0',
  protocolVersion: '2025-03-26'
};

// Ferramentas disponíveis
const tools = [
  {
    name: 'hello_world',
    description: 'Retorna uma mensagem de boas-vindas',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Nome para cumprimentar' }
      },
      required: ['name']
    }
  },
  {
    name: 'test_connection',
    description: 'Testa a conexão com o servidor',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  }
];

// Execução de ferramentas
function executeTool(toolName, args = {}) {
  switch (toolName) {
    case 'hello_world':
      return {
        content: [{ type: 'text', text: `Olá, ${args.name || 'Mundo'}! 👋 Sou o MCP Server Remoto!` }]
      };
    
    case 'test_connection':
      return {
        content: [{
          type: 'text',
          text: `✅ Conexão estabelecida!\nServidor: ${serverInfo.name}\nVersão: ${serverInfo.version}`
        }]
      };
    
    default:
      throw new Error(`Ferramenta não encontrada: ${toolName}`);
  }
}

// --- Endpoints críticos para o Claude ---

// 1. Endpoint obrigatório de capabilities
app.get('/.well-known/mcp', (req, res) => {
  res.setHeader('anthropic-mcp-version', '2025-03-26');
  res.json({
    version: '2025-03-26',
    capabilities: {
      protocols: ["streamable_http"],
      methods: ["initialize", "tools/list", "tools/call", "close"],
      features: ["tool_use"]
    }
  });
});

// 2. Listagem de ferramentas (requerido pelo Claude)
app.get('/mcp/tools', (req, res) => {
  res.setHeader('anthropic-mcp-version', '2025-03-26');
  res.json({
    tools: tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema
    }))
  });
});

// 3. Endpoint principal
app.post(['/', '/mcp'], (req, res) => {
  // Headers obrigatórios em todas as respostas
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  
  const sessionId = req.headers['anthropic-session-id'];
  const { method, id } = req.body;
  
  console.log(`Método: ${method}, Sessão: ${sessionId || 'nova'}`);

  // Inicialização da sessão
  if (method === 'initialize' && !sessionId) {
    const newSessionId = uuidv4();
    sessions[newSessionId] = { createdAt: new Date(), lastAccess: new Date() };
    
    res.setHeader('anthropic-session-id', newSessionId);
    res.setHeader('anthropic-mcp-version', '2025-03-26');
    
    return res.json({
      jsonrpc: '2.0',
      result: {
        result: "success",
        server_id: serverInfo.name,
        session_id: newSessionId,
        protocol: "streamable_http",
        capabilities: { tools: tools.map(t => t.name) }
      },
      id
    });
  }

  // Validação de sessão
  if (!sessionId || !sessions[sessionId]) {
    return res.status(400).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'ID de sessão inválido' },
      id
    });
  }

  // Atualiza último acesso
  sessions[sessionId].lastAccess = new Date();

  // Processamento dos métodos
  try {
    let result;
    switch (method) {
      case 'tools/list':
        result = { tools };
        break;
        
      case 'tools/call':
        result = executeTool(req.body.params.name, req.body.params.arguments);
        break;
        
      default:
        return res.json({
          jsonrpc: '2.0',
          error: { code: -32601, message: `Método não suportado: ${method}` },
          id
        });
    }

    res.json({ jsonrpc: '2.0', result, id });
    
  } catch (error) {
    res.status(500).json({
      jsonrpc: '2.0',
      error: { code: -32603, message: error.message },
      id
    });
  }
});

// 4. Fechamento de sessão
app.delete(['/', '/mcp'], (req, res) => {
  const sessionId = req.headers['anthropic-session-id'];
  
  if (sessionId && sessions[sessionId]) {
    delete sessions[sessionId];
    console.log(`Sessão finalizada: ${sessionId}`);
  }
  
  res.status(200).json({ result: "success" });
});

// Health check
app.get('/health', (req, res) => res.status(200).send('OK'));

// Limpeza de sessões inativas
setInterval(() => {
  const now = new Date();
  Object.keys(sessions).forEach(id => {
    if (now - sessions[id].lastAccess > 30 * 60 * 1000) {
      delete sessions[id];
      console.log(`Sessão expirada: ${id}`);
    }
  });
}, 5 * 60 * 1000);

// Inicialização do servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
=======================================
Servidor MCP Remoto (Claude-compatible)
Porta: ${PORT}
Endpoint principal: / ou /mcp
=======================================
`);
});