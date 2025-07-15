const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();

// Configure CORS
app.use(cors({
  origin: '*',
  exposedHeaders: ['Mcp-Session-Id', 'anthropic-session-id', 'anthropic-mcp-version']
}));

app.use(express.json());

// Logging detalhado
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  if (req.body && Object.keys(req.body).length > 0) {
    console.log('Body:', JSON.stringify(req.body, null, 2));
  }
  next();
});

// Store sessions
const sessions = {};

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
          text: `Olá, ${args.name || 'Mundo'}! 👋 Sou o MCP Server Remoto!`
        }]
      };
    
    case 'test_connection':
      return {
        content: [{
          type: 'text',
          text: `✅ Conexão estabelecida!\nServidor: mcp-server-remoto\nVersão: 1.0.0\nTimestamp: ${new Date().toISOString()}`
        }]
      };
    
    default:
      throw new Error(`Tool not found: ${toolName}`);
  }
}

// ENDPOINT PRINCIPAL
app.post(['/', '/mcp'], (req, res) => {
  try {
    const sessionId = req.headers['mcp-session-id'] || req.headers['anthropic-session-id'];
    const { jsonrpc, method, params, id } = req.body;
    
    console.log(`\n=== PROCESSANDO ${method} ===`);
    console.log(`SessionId: ${sessionId || 'nova'}`);
    
    // Initialize
    if (method === 'initialize') {
      const newSessionId = uuidv4();
      
      // IMPORTANTE: Detectar a versão do protocolo solicitada
      const requestedVersion = params?.protocolVersion || '2024-11-05';
      const clientName = params?.clientInfo?.name || 'unknown';
      
      console.log(`Cliente: ${clientName}, Versão solicitada: ${requestedVersion}`);
      
      sessions[newSessionId] = {
        createdAt: new Date(),
        lastAccess: new Date(),
        protocolVersion: requestedVersion,
        clientName: clientName
      };
      
      // Headers de sessão
      res.setHeader('Mcp-Session-Id', newSessionId);
      res.setHeader('anthropic-session-id', newSessionId);
      
      // RESPOSTA ADAPTADA À VERSÃO DO PROTOCOLO
      if (requestedVersion === '2024-11-05') {
        // Formato para Claude Desktop (versão antiga)
        res.json({
          jsonrpc: '2.0',
          result: {
            protocolVersion: '2024-11-05',  // ← Mesma versão que foi solicitada
            capabilities: {
              tools: {},
              logging: {}
            },
            serverInfo: {
              name: 'mcp-server-remoto',
              version: '1.0.0'
            }
          },
          id
        });
      } else {
        // Formato para versões mais novas (Inspector, etc)
        res.json({
          jsonrpc: '2.0',
          result: {
            protocolVersion: requestedVersion,
            capabilities: {
              tools: {}
            },
            serverInfo: {
              name: 'mcp-server-remoto',
              version: '1.0.0'
            }
          },
          id
        });
      }
      
      console.log(`✅ Sessão criada: ${newSessionId}`);
      return;
    }
    
    // Validate session para outros métodos
    if (!sessionId || !sessions[sessionId]) {
      console.log('❌ Sessão inválida ou ausente');
      res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Session required. Call initialize first.'
        },
        id: id || null
      });
      return;
    }
    
    // Update last access
    sessions[sessionId].lastAccess = new Date();
    
    // Handle methods
    let result;
    switch (method) {
      case 'tools/list':
        console.log('📋 Listando ferramentas...');
        result = { tools };
        break;
        
      case 'tools/call':
        console.log(`🔧 Executando ferramenta: ${params.name}`);
        result = executeTool(params.name, params.arguments);
        break;
        
      case 'logging/setLevel':
        result = { level: params.level };
        break;
        
      case 'notifications/initialized':
        result = {};
        break;
        
      default:
        console.log(`❓ Método desconhecido: ${method}`);
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
    
    console.log('✅ Resposta enviada com sucesso');
    res.json({
      jsonrpc: '2.0',
      result,
      id
    });
    
  } catch (error) {
    console.error('❌ Erro:', error);
    res.status(500).json({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: error.message
      },
      id: req.body?.id || null
    });
  }
});

// SSE endpoint (mantido para compatibilidade)
app.get('/sse', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  
  res.write(':connected\n\n');
  
  const keepAlive = setInterval(() => {
    res.write(':keepalive\n\n');
  }, 15000);
  
  req.on('close', () => {
    clearInterval(keepAlive);
  });
});

// DELETE session
app.delete(['/', '/mcp'], (req, res) => {
  const sessionId = req.headers['mcp-session-id'] || req.headers['anthropic-session-id'];
  
  if (sessionId && sessions[sessionId]) {
    delete sessions[sessionId];
    console.log(`🗑️ Sessão encerrada: ${sessionId}`);
  }
  
  res.status(200).json({ result: "success" });
});

// Health & Info
app.get('/health', (req, res) => res.status(200).send('OK'));
app.get('/', (req, res) => res.json({ 
  status: 'ok', 
  server: 'mcp-server-remoto',
  endpoints: ['POST /', 'GET /sse', 'DELETE /', 'GET /health']
}));

// Cleanup de sessões antigas
setInterval(() => {
  const now = new Date();
  Object.entries(sessions).forEach(([id, session]) => {
    if (now - session.lastAccess > 30 * 60 * 1000) {
      delete sessions[id];
      console.log(`♻️ Sessão expirada: ${id}`);
    }
  });
}, 5 * 60 * 1000);

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
🚀 MCP Server Remoto - Multi-Protocol
📍 Port: ${PORT}
📋 Endpoints:
   - POST / ou /mcp (initialize, tools/list, tools/call)
   - GET /sse (Server-Sent Events)
   - DELETE / ou /mcp (close session)
   - GET /health
🔧 Ferramentas: hello_world, test_connection
✅ Pronto para conexões!
  `);
});