const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();

// CORS com keep-alive
app.use(cors({
  origin: '*',
  credentials: true,
  exposedHeaders: ['Mcp-Session-Id', 'Connection']
}));

app.use(express.json());

// Importante: Configurar keep-alive globalmente
app.use((req, res, next) => {
  // Forçar keep-alive em todas as respostas
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Keep-Alive', 'timeout=120, max=1000');
  next();
});

// Logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - ${req.headers['mcp-session-id'] || 'no-session'}`);
  if (req.body?.method) {
    console.log(`  Method: ${req.body.method}`);
  }
  next();
});

// Sessions com mais informações
const sessions = {};

// Tools
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
      properties: {},
      required: []
    }
  }
];

const prompts = [];
const resources = [];

// Tool execution
function executeTool(toolName, args = {}) {
  switch (toolName) {
    case 'hello_world':
      return {
        content: [{
          type: 'text',
          text: `Olá, ${args.name || 'Mundo'}! 👋 Sou o MCP Server Remoto!`
        }],
        isError: false
      };
    
    case 'test_connection':
      return {
        content: [{
          type: 'text',
          text: `✅ Conexão estabelecida!\nServidor: mcp-server-remoto\nTimestamp: ${new Date().toISOString()}`
        }],
        isError: false
      };
    
    default:
      throw new Error(`Tool not found: ${toolName}`);
  }
}

// ENDPOINT PRINCIPAL - Com keep-alive forçado
app.post('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  const { jsonrpc, method, params, id } = req.body;
  
  // Garantir que a conexão não seja fechada
  req.socket.setKeepAlive(true, 60000); // 60 segundos
  req.socket.setTimeout(0); // Sem timeout
  
  try {
    // Initialize
    if (method === 'initialize') {
      const newSessionId = uuidv4();
      
      sessions[newSessionId] = {
        id: newSessionId,
        created: new Date(),
        lastAccess: new Date(),
        protocolVersion: params?.protocolVersion || '2024-11-05',
        active: true
      };
      
      console.log(`✅ New session created: ${newSessionId}`);
      
      // Headers importantes
      res.setHeader('Mcp-Session-Id', newSessionId);
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Keep-Alive', 'timeout=120');
      
      return res.json({
        jsonrpc: '2.0',
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {},
            prompts: {},
            resources: {},
            logging: {}
          },
          serverInfo: {
            name: 'mcp-server-remoto',
            version: '1.0.0'
          }
        },
        id
      });
    }
    
    // Validar sessão
    if (!sessionId || !sessions[sessionId]) {
      console.log(`❌ Invalid session: ${sessionId}`);
      return res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Invalid or expired session'
        },
        id
      });
    }
    
    // Atualizar último acesso
    sessions[sessionId].lastAccess = new Date();
    
    // Processar métodos
    let result;
    switch (method) {
      case 'tools/list':
        console.log(`📋 Listing ${tools.length} tools for session ${sessionId}`);
        result = { tools };
        break;
        
      case 'prompts/list':
        console.log(`📝 Listing ${prompts.length} prompts for session ${sessionId}`);
        result = { prompts };
        break;
        
      case 'resources/list':
        console.log(`📚 Listing ${resources.length} resources for session ${sessionId}`);
        result = { resources };
        break;
        
      case 'tools/call':
        console.log(`🔧 Calling tool: ${params.name}`);
        result = executeTool(params.name, params.arguments);
        break;
        
      case 'notifications/initialized':
        console.log(`🔔 Client initialized for session ${sessionId}`);
        result = {};
        break;
        
      case 'logging/setLevel':
        result = { level: params.level || 'info' };
        break;
        
      default:
        console.log(`❓ Unknown method: ${method}`);
        return res.status(404).json({
          jsonrpc: '2.0',
          error: {
            code: -32601,
            message: `Method not found: ${method}`
          },
          id
        });
    }
    
    // Enviar resposta com keep-alive
    res.setHeader('Connection', 'keep-alive');
    res.json({
      jsonrpc: '2.0',
      result,
      id
    });
    
    console.log(`✅ Response sent for ${method}`);
    
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: error.message
      },
      id
    });
  }
});

// GET /mcp - Manter compatibilidade
app.get('/mcp', (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  
  if (!sessionId || !sessions[sessionId]) {
    return res.status(400).json({
      error: 'Session required'
    });
  }
  
  // Para GET, retornar info da sessão
  res.json({
    session: sessionId,
    active: true,
    server: 'mcp-server-remoto'
  });
});

// DELETE com cleanup
app.delete('/mcp', (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  
  if (sessionId && sessions[sessionId]) {
    sessions[sessionId].active = false;
    console.log(`🗑️ Session marked for deletion: ${sessionId}`);
    
    // Deletar após um delay para permitir reconexão
    setTimeout(() => {
      if (sessions[sessionId] && !sessions[sessionId].active) {
        delete sessions[sessionId];
        console.log(`🗑️ Session deleted: ${sessionId}`);
      }
    }, 5000);
  }
  
  res.json({ result: 'success' });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'mcp-server-remoto',
    version: '1.0.0',
    status: 'running',
    endpoint: '/mcp',
    sessions: Object.keys(sessions).length
  });
});

// Health check
app.get('/health', (req, res) => {
  res.setHeader('Connection', 'keep-alive');
  res.send('OK');
});

// Configurar servidor com keep-alive
const server = app.listen(process.env.PORT || 3000, () => {
  console.log(`
🚀 MCP Server - Fixed Connection Issues
📍 Port: ${process.env.PORT || 3000}
🔗 Endpoint: /mcp
📋 Keep-Alive: Enabled
✅ Ready for Claude Desktop!
  `);
});

// Configurar keep-alive no servidor
server.keepAliveTimeout = 120000; // 2 minutos
server.headersTimeout = 125000; // Slightly higher than keepAliveTimeout

// Cleanup de sessões antigas
setInterval(() => {
  const now = new Date();
  Object.entries(sessions).forEach(([id, session]) => {
    if (now - session.lastAccess > 30 * 60 * 1000) { // 30 minutos
      delete sessions[id];
      console.log(`♻️ Session expired: ${id}`);
    }
  });
}, 5 * 60 * 1000);