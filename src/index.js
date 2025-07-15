const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();

// CORS simples
app.use(cors({
  origin: '*',
  exposedHeaders: ['Mcp-Session-Id']
}));

app.use(express.json());

// Logging básico
app.use((req, res, next) => {
  if (req.body?.method) {
    console.log(`[${new Date().toISOString()}] ${req.body.method}`);
  }
  next();
});

// Armazenamento de sessões
const sessions = {};

// Definição das ferramentas
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

// Execução das ferramentas
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
app.post('/mcp', (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  const { jsonrpc, method, params, id } = req.body;
  
  try {
    // Initialize
    if (method === 'initialize') {
      const newSessionId = uuidv4();
      sessions[newSessionId] = { created: new Date() };
      
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
          message: 'Session required'
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
        result = { prompts: [] };
        break;
        
      case 'resources/list':
        result = { resources: [] };
        break;
        
      case 'tools/call':
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
    console.error('Error:', error.message);
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

// Health check
app.get('/health', (req, res) => res.send('OK'));

// Informações do servidor
app.get('/', (req, res) => {
  res.json({
    name: 'mcp-server-remoto',
    version: '1.0.0',
    endpoint: '/mcp'
  });
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 MCP Server Remoto`);
  console.log(`📍 Port: ${PORT}`);
  console.log(`🔗 Endpoint: /mcp`);
});