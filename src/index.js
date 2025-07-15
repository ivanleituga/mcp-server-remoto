const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();

// CORS configurado corretamente
app.use(cors({
  origin: '*',
  credentials: true
}));

app.use(express.json());

// Logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Store SSE connections and sessions
const sseConnections = {};
const sessions = {};

// Server info
const serverInfo = {
  name: 'mcp-server-remoto',
  version: '1.0.0'
};

// Tools
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

// Tool execution
function executeTool(toolName, args = {}) {
  switch (toolName) {
    case 'hello_world':
      return {
        content: [{
          type: 'text',
          text: `Olá, ${args.name || 'Mundo'}! 👋 Sou o MCP Server Remoto via SSE!`
        }]
      };
    
    case 'test_connection':
      return {
        content: [{
          type: 'text',
          text: `✅ Conexão SSE estabelecida!\nServidor: ${serverInfo.name}\nVersão: ${serverInfo.version}\nTimestamp: ${new Date().toISOString()}`
        }]
      };
    
    default:
      throw new Error(`Tool not found: ${toolName}`);
  }
}

// ===== IMPLEMENTAÇÃO SSE CORRETA =====

// Endpoint SSE principal - DEVE estar em /sse para compatibilidade com parceiros
app.get('/sse', (req, res) => {
  console.log('Nova conexão SSE estabelecida');
  
  // CRÍTICO: Headers corretos para SSE
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',  // OBRIGATÓRIO
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'  // Desabilita buffering no nginx/proxies
  });

  // Gerar session ID único
  const sessionId = uuidv4();
  
  // IMPORTANTE: Formato correto do evento endpoint
  res.write(`event: endpoint\n`);
  res.write(`data: /messages?sessionId=${sessionId}\n\n`);
  
  // Armazenar conexão
  sseConnections[sessionId] = res;
  sessions[sessionId] = {
    created: new Date(),
    lastAccess: new Date()
  };
  
  console.log(`SSE stream estabelecido - SessionId: ${sessionId}`);
  
  // Keep-alive para manter conexão ativa
  const keepAlive = setInterval(() => {
    res.write(':ping\n\n');
  }, 30000);
  
  // Cleanup quando a conexão fechar
  req.on('close', () => {
    console.log(`SSE conexão fechada - SessionId: ${sessionId}`);
    clearInterval(keepAlive);
    delete sseConnections[sessionId];
    delete sessions[sessionId];
  });
});

// Endpoint para receber mensagens do cliente
app.post('/messages', async (req, res) => {
  const sessionId = req.query.sessionId;
  
  if (!sessionId) {
    console.error('Nenhum sessionId fornecido');
    return res.status(400).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Missing sessionId parameter' },
      id: req.body.id
    });
  }
  
  if (!sessions[sessionId]) {
    console.error(`Sessão não encontrada: ${sessionId}`);
    return res.status(404).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Session not found' },
      id: req.body.id
    });
  }
  
  const { jsonrpc, method, params, id } = req.body;
  console.log(`[${sessionId}] Método: ${method}`);
  
  // Atualizar último acesso
  sessions[sessionId].lastAccess = new Date();
  
  try {
    let result;
    
    switch (method) {
      case 'initialize':
        result = {
          protocolVersion: '2024-11-05',  // Versão do protocolo SSE
          capabilities: {
            tools: {},
            logging: {}
          },
          serverInfo: {
            name: serverInfo.name,
            version: serverInfo.version
          }
        };
        break;
        
      case 'tools/list':
        result = { tools };
        break;
        
      case 'tools/call':
        result = executeTool(params.name, params.arguments);
        break;
        
      case 'logging/setLevel':
        result = {};
        break;
        
      case 'notifications/initialized':
        result = {};
        break;
        
      default:
        return res.json({
          jsonrpc: '2.0',
          error: { code: -32601, message: `Method not found: ${method}` },
          id
        });
    }
    
    res.json({
      jsonrpc: '2.0',
      result,
      id
    });
    
  } catch (error) {
    console.error(`Erro ao processar ${method}:`, error);
    res.status(500).json({
      jsonrpc: '2.0',
      error: { code: -32603, message: error.message },
      id
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    protocol: 'SSE',
    activeSessions: Object.keys(sessions).length
  });
});

// Raiz retorna informações do servidor
app.get('/', (req, res) => {
  res.json({
    name: serverInfo.name,
    version: serverInfo.version,
    protocol: 'SSE (Server-Sent Events)',
    endpoint: '/sse',
    documentation: 'Compatible with Anthropic MCP partners standard'
  });
});

// Limpeza de sessões antigas
setInterval(() => {
  const now = new Date();
  const timeout = 30 * 60 * 1000; // 30 minutos
  
  Object.entries(sessions).forEach(([id, session]) => {
    if (now - session.lastAccess > timeout) {
      console.log(`Sessão expirada: ${id}`);
      delete sessions[id];
      if (sseConnections[id]) {
        sseConnections[id].end();
        delete sseConnections[id];
      }
    }
  });
}, 5 * 60 * 1000);

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
===============================================
MCP Server SSE - Padrão Anthropic Partners
Port: ${PORT}
Endpoint: /sse (como Asana, Linear, etc.)
Protocol: SSE (Server-Sent Events)
===============================================
  `);
});