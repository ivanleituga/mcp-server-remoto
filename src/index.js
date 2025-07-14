const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();

// Configure CORS to expose Mcp-Session-Id header
app.use(cors({
  origin: '*',
  exposedHeaders: ['Mcp-Session-Id']
}));

app.use(express.json());

// Store transports by session ID
const transports = {};

// Store server data
const serverInfo = {
  name: 'mcp-server-remoto',
  version: '1.0.0',
  protocolVersion: '2024-11-05',
  capabilities: {
    tools: {},
    logging: {}
  }
};

// Tools definition
const tools = [
  {
    name: 'hello_world',
    description: 'Retorna uma mensagem de boas-vindas',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Nome para cumprimentar'
        }
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
async function executeTool(toolName, args = {}) {
  switch (toolName) {
    case 'hello_world':
      return {
        content: [{
          type: 'text',
          text: `Olá, ${args.name || 'Mundo'}! 👋 Sou o MCP Server Remoto!`
        }]
      };
    
    case 'test_connection':
      return {
        content: [{
          type: 'text',
          text: `✅ Conexão estabelecida com sucesso!\nServidor: ${serverInfo.name}\nVersão: ${serverInfo.version}\nTimestamp: ${new Date().toISOString()}`
        }]
      };
    
    default:
      throw new Error(`Ferramenta não encontrada: ${toolName}`);
  }
}

// ===== STREAMABLE HTTP TRANSPORT (NEW PROTOCOL) =====
app.all('/mcp', async (req, res) => {
  console.log(`[Streamable] ${req.method} /mcp - Session: ${req.headers['mcp-session-id'] || 'none'}`);
  
  try {
    const sessionId = req.headers['mcp-session-id'];
    
    // Handle different methods
    if (req.method === 'POST') {
      const { jsonrpc, method, params, id } = req.body;
      
      // Initialize request
      if (method === 'initialize' && !sessionId) {
        const newSessionId = uuidv4();
        res.setHeader('Mcp-Session-Id', newSessionId);
        
        res.json({
          jsonrpc: '2.0',
          result: {
            protocolVersion: serverInfo.protocolVersion,
            capabilities: serverInfo.capabilities,
            serverInfo: {
              name: serverInfo.name,
              version: serverInfo.version
            }
          },
          id
        });
        
        transports[newSessionId] = {
          type: 'streamable',
          sessionId: newSessionId,
          createdAt: new Date()
        };
        
        console.log(`[Streamable] Nova sessão criada: ${newSessionId}`);
        return;
      }
      
      // Require session for other methods
      if (!sessionId || !transports[sessionId]) {
        res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Bad Request: No valid session ID provided'
          },
          id: null
        });
        return;
      }
      
      // Handle other methods
      let result;
      switch (method) {
        case 'tools/list':
          result = { tools };
          break;
          
        case 'tools/call':
          result = await executeTool(params.name, params.arguments);
          break;
          
        case 'logging/setLevel':
          result = {};
          break;
          
        default:
          res.json({
            jsonrpc: '2.0',
            error: {
              code: -32601,
              message: `Method not found: ${method}`
            },
            id
          });
          return;
      }
      
      res.json({
        jsonrpc: '2.0',
        result,
        id
      });
      
    } else if (req.method === 'GET') {
      // SSE stream for notifications
      if (!sessionId || !transports[sessionId]) {
        res.status(400).send('Invalid or missing session ID');
        return;
      }
      
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });
      
      // Keep connection alive
      const keepAlive = setInterval(() => {
        res.write(':keepalive\n\n');
      }, 30000);
      
      req.on('close', () => {
        clearInterval(keepAlive);
        console.log(`[Streamable] SSE stream fechado: ${sessionId}`);
      });
      
    } else if (req.method === 'DELETE') {
      // Close session
      if (sessionId && transports[sessionId]) {
        delete transports[sessionId];
        console.log(`[Streamable] Sessão encerrada: ${sessionId}`);
      }
      res.status(200).send('Session closed');
      
    } else {
      res.status(405).set('Allow', 'GET, POST, DELETE').send('Method Not Allowed');
    }
    
  } catch (error) {
    console.error('[Streamable] Erro:', error);
    res.status(500).json({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: 'Internal server error'
      },
      id: req.body?.id || null
    });
  }
});

// ===== SSE TRANSPORT (OLD PROTOCOL) =====
app.get('/sse', (req, res) => {
  console.log('[SSE] Nova conexão SSE');
  
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  
  const sessionId = uuidv4();
  const endpoint = `/messages?sessionId=${sessionId}`;
  
  // Send endpoint event
  res.write(`event: endpoint\n`);
  res.write(`data: "${endpoint}"\n\n`);
  
  transports[sessionId] = {
    type: 'sse',
    sessionId,
    response: res,
    createdAt: new Date()
  };
  
  // Keep alive
  const keepAlive = setInterval(() => {
    res.write(':keepalive\n\n');
  }, 30000);
  
  req.on('close', () => {
    clearInterval(keepAlive);
    delete transports[sessionId];
    console.log(`[SSE] Conexão fechada: ${sessionId}`);
  });
});

app.post('/messages', async (req, res) => {
  const sessionId = req.query.sessionId;
  
  if (!sessionId || !transports[sessionId] || transports[sessionId].type !== 'sse') {
    res.status(404).send('Session not found');
    return;
  }
  
  console.log(`[SSE] Mensagem recebida - Sessão: ${sessionId}, Método: ${req.body.method}`);
  
  try {
    const { jsonrpc, method, params, id } = req.body;
    let result;
    
    switch (method) {
      case 'initialize':
        result = {
          protocolVersion: serverInfo.protocolVersion,
          capabilities: serverInfo.capabilities,
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
        result = await executeTool(params.name, params.arguments);
        break;
        
      case 'logging/setLevel':
        result = {};
        break;
        
      default:
        res.json({
          jsonrpc: '2.0',
          error: {
            code: -32601,
            message: `Method not found: ${method}`
          },
          id
        });
        return;
    }
    
    res.json({
      jsonrpc: '2.0',
      result,
      id
    });
    
  } catch (error) {
    console.error('[SSE] Erro:', error);
    res.json({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: error.message
      },
      id: req.body.id
    });
  }
});

// ===== AUXILIARY ENDPOINTS =====
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    server: serverInfo.name,
    version: serverInfo.version,
    protocols: ['streamable-http', 'sse'],
    activeSessions: Object.keys(transports).length,
    timestamp: new Date().toISOString()
  });
});

app.get('/', (req, res) => {
  res.json({
    name: serverInfo.name,
    version: serverInfo.version,
    protocols: {
      'streamable-http': {
        endpoint: '/mcp',
        protocolVersion: '2025-03-26'
      },
      'sse': {
        endpoint: '/sse',
        messagesEndpoint: '/messages',
        protocolVersion: '2024-11-05'
      }
    }
  });
});

// ===== START SERVER =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
===============================================
MCP Server Remoto - Backwards Compatible
Port: ${PORT}
===============================================
Supported protocols:

1. Streamable HTTP (2025-03-26) - NEW
   POST /mcp - Initialize session
   GET  /mcp - SSE stream (with session)
   POST /mcp - Send requests (with session)
   DELETE /mcp - Close session

2. HTTP+SSE (2024-11-05) - LEGACY
   GET  /sse - Establish SSE connection
   POST /messages?sessionId=xxx - Send requests
===============================================
  `);
});

process.on('SIGINT', () => {
  console.log('\nShutting down...');
  // Close all SSE connections
  Object.values(transports).forEach(transport => {
    if (transport.type === 'sse' && transport.response) {
      transport.response.end();
    }
  });
  process.exit(0);
});