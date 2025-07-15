const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();

// Configure CORS
app.use(cors({
  origin: '*',
  exposedHeaders: ['Mcp-Session-Id', 'anthropic-session-id']
}));

app.use(express.json());

// Logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log('Body:', JSON.stringify(req.body, null, 2));
  }
  next();
});

// Sessions
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

// Prompts
const prompts = [
  {
    name: "greeting_prompt",
    description: "Gera uma saudação personalizada",
    arguments: [
      {
        name: "name",
        description: "Nome da pessoa",
        required: true
      }
    ]
  }
];

// Resources
const resources = [];

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

// Prompt execution
function getPrompt(promptName, args = {}) {
  if (promptName === 'greeting_prompt') {
    return {
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: `Olá ${args.name || 'amigo'}! Como posso ajudá-lo hoje?`
        }
      }]
    };
  }
  throw new Error(`Prompt not found: ${promptName}`);
}

// ENDPOINT PRINCIPAL - HTTP Streamable Protocol
app.post(['/', '/mcp'], (req, res) => {
  try {
    const sessionId = req.headers['mcp-session-id'] || req.headers['anthropic-session-id'];
    const { jsonrpc, method, params, id } = req.body;
    
    console.log(`\n=== ${method} ===`);
    console.log(`Session: ${sessionId || 'new'}`);
    
    // Initialize
    if (method === 'initialize') {
      const newSessionId = uuidv4();
      
      sessions[newSessionId] = {
        createdAt: new Date(),
        lastAccess: new Date()
      };
      
      res.setHeader('Mcp-Session-Id', newSessionId);
      res.setHeader('anthropic-session-id', newSessionId);
      
      res.json({
        jsonrpc: '2.0',
        result: {
          protocolVersion: params?.protocolVersion || '2024-11-05',
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
      
      console.log(`✅ Session created: ${newSessionId}`);
      return;
    }
    
    // Validate session
    if (!sessionId || !sessions[sessionId]) {
      res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Invalid or missing session'
        },
        id
      });
      return;
    }
    
    sessions[sessionId].lastAccess = new Date();
    
    // Handle methods
    let result;
    switch (method) {
      case 'tools/list':
        result = { tools };
        break;
        
      case 'prompts/list':
        result = { prompts };
        break;
        
      case 'prompts/get':
        result = getPrompt(params.name, params.arguments);
        break;
        
      case 'resources/list':
        result = { resources };
        break;
        
      case 'tools/call':
        result = executeTool(params.name, params.arguments);
        break;
        
      case 'logging/setLevel':
        result = { level: params.level };
        break;
        
      case 'notifications/initialized':
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
    
    console.log('✅ Success');
    
  } catch (error) {
    console.error('❌ Error:', error);
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

// GET endpoint - apenas para informação
app.get(['/', '/mcp'], (req, res) => {
  res.json({ 
    server: 'mcp-server-remoto',
    protocol: 'HTTP Streamable',
    version: '1.0.0',
    status: 'ready'
  });
});

// DELETE session
app.delete(['/', '/mcp'], (req, res) => {
  const sessionId = req.headers['mcp-session-id'] || req.headers['anthropic-session-id'];
  
  if (sessionId && sessions[sessionId]) {
    delete sessions[sessionId];
    console.log(`🗑️ Session deleted: ${sessionId}`);
  }
  
  res.json({ result: "success" });
});

// Health check
app.get('/health', (req, res) => res.send('OK'));

// Cleanup old sessions
setInterval(() => {
  const now = new Date();
  Object.entries(sessions).forEach(([id, session]) => {
    if (now - session.lastAccess > 30 * 60 * 1000) {
      delete sessions[id];
      console.log(`♻️ Session expired: ${id}`);
    }
  });
}, 5 * 60 * 1000);

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
🚀 MCP Server - HTTP Streamable Protocol
📍 Port: ${PORT}
🔧 Tools: ${tools.length}
📝 Prompts: ${prompts.length}
📚 Resources: ${resources.length}
✅ Ready!
  `);
});