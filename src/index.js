const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();

// CORS configurado corretamente
app.use(cors({
  origin: '*',
  credentials: true,
  exposedHeaders: ['Mcp-Session-Id']
}));

app.use(express.json());

// Armazenamento
const sessions = {};

// Tools definidas corretamente
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

// Prompts vazios mas presentes
const prompts = [];
const resources = [];

// Tool execution
function executeTool(toolName, args = {}) {
  switch (toolName) {
    case 'hello_world':
      return {
        content: [{
          type: 'text',
          text: `Olá, ${args.name || 'Mundo'}! 👋`
        }]
      };
    
    case 'test_connection':
      return {
        content: [{
          type: 'text',
          text: `✅ Conexão estabelecida! Timestamp: ${new Date().toISOString()}`
        }]
      };
    
    default:
      throw new Error(`Tool not found: ${toolName}`);
  }
}

// ENDPOINT ÚNICO - Streamable HTTP
app.post('/mcp', (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  const { jsonrpc, method, params, id } = req.body;
  
  console.log(`[${new Date().toISOString()}] ${method} - Session: ${sessionId || 'new'}`);
  
  try {
    // Initialize
    if (method === 'initialize') {
      if (sessionId) {
        // Já tem sessão, erro
        return res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Already initialized'
          },
          id
        });
      }
      
      const newSessionId = uuidv4();
      sessions[newSessionId] = {
        created: new Date(),
        protocolVersion: params?.protocolVersion || '2024-11-05'
      };
      
      // IMPORTANTE: Incluir o Session ID no header
      res.setHeader('Mcp-Session-Id', newSessionId);
      
      return res.json({
        jsonrpc: '2.0',
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {},
            prompts: {},
            resources: {}
          },
          serverInfo: {
            name: 'mcp-server-remoto',
            version: '1.0.0'
          }
        },
        id
      });
    }
    
    // Validar sessão para outros métodos
    if (!sessionId || !sessions[sessionId]) {
      return res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Session required. Call initialize first.'
        },
        id
      });
    }
    
    // Processar métodos
    let result;
    switch (method) {
      case 'tools/list':
        result = { tools };
        break;
        
      case 'prompts/list':
        result = { prompts };
        break;
        
      case 'resources/list':
        result = { resources };
        break;
        
      case 'tools/call':
        const tool = tools.find(t => t.name === params.name);
        if (!tool) {
          return res.status(404).json({
            jsonrpc: '2.0',
            error: {
              code: -32601,
              message: `Tool not found: ${params.name}`
            },
            id
          });
        }
        result = executeTool(params.name, params.arguments);
        break;
        
      case 'notifications/initialized':
        result = {};
        break;
        
      default:
        return res.status(404).json({
          jsonrpc: '2.0',
          error: {
            code: -32601,
            message: `Method not found: ${method}`
          },
          id
        });
    }
    
    res.json({
      jsonrpc: '2.0',
      result,
      id
    });
    
  } catch (error) {
    console.error('Error:', error);
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

// GET /mcp - Para SSE (opcional no Streamable HTTP)
app.get('/mcp', (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  
  // Se não tem session, retornar erro
  if (!sessionId || !sessions[sessionId]) {
    return res.status(400).json({
      error: 'Session required'
    });
  }
  
  // Configurar SSE
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  
  // Enviar heartbeat periodicamente
  const interval = setInterval(() => {
    res.write(':heartbeat\n\n');
  }, 30000);
  
  req.on('close', () => {
    clearInterval(interval);
    console.log(`SSE closed for session: ${sessionId}`);
  });
});

// DELETE /mcp - Para encerrar sessão
app.delete('/mcp', (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  
  if (sessionId && sessions[sessionId]) {
    delete sessions[sessionId];
    console.log(`Session terminated: ${sessionId}`);
  }
  
  res.json({ result: 'success' });
});

// Raiz para informação
app.get('/', (req, res) => {
  res.json({
    name: 'mcp-server-remoto',
    version: '1.0.0',
    mcp_endpoint: '/mcp',
    protocol: 'Streamable HTTP'
  });
});

// Health check
app.get('/health', (req, res) => res.send('OK'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
🚀 MCP Server - Streamable HTTP
📍 Port: ${PORT}
🔗 Endpoint: /mcp
📋 Protocol: 2024-11-05
✅ Ready for Claude Desktop!
  `);
});