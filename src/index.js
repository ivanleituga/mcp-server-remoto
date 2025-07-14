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

// Store sessions
const sessions = {};

// Server info
const serverInfo = {
  name: 'mcp-server-remoto',
  version: '1.0.0',
  protocolVersion: '2025-03-26',
  capabilities: {
    tools: {}
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

// Main endpoint - handles both root and /mcp
app.post(['/', '/mcp'], async (req, res) => {
  try {
    const sessionId = req.headers['mcp-session-id'];
    const { jsonrpc, method, params, id } = req.body;
    
    // Initialize request
    if (method === 'initialize' && !sessionId) {
      const newSessionId = uuidv4();
      sessions[newSessionId] = {
        createdAt: new Date(),
        lastAccess: new Date()
      };
      
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
      
      console.log(`Session created: ${newSessionId}`);
      return;
    }
    
    // Validate session for other requests
    if (!sessionId || !sessions[sessionId]) {
      res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Bad Request: No valid session ID provided'
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
    console.error('Error:', error);
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

// GET for SSE stream
app.get(['/', '/mcp'], async (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  
  if (!sessionId || !sessions[sessionId]) {
    res.status(400).send('Invalid or missing session ID');
    return;
  }
  
  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  
  // Send initial connection event
  res.write(':connected\n\n');
  
  // Keep alive
  const keepAlive = setInterval(() => {
    res.write(':keepalive\n\n');
  }, 30000);
  
  // Store SSE connection
  sessions[sessionId].sseConnection = res;
  
  req.on('close', () => {
    clearInterval(keepAlive);
    if (sessions[sessionId]) {
      delete sessions[sessionId].sseConnection;
    }
    console.log(`SSE connection closed: ${sessionId}`);
  });
});

// DELETE to close session
app.delete(['/', '/mcp'], (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  
  if (sessionId && sessions[sessionId]) {
    delete sessions[sessionId];
    console.log(`Session closed: ${sessionId}`);
  }
  
  res.status(200).send('Session closed');
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    server: serverInfo.name,
    version: serverInfo.version,
    protocol: 'streamable-http',
    protocolVersion: serverInfo.protocolVersion,
    activeSessions: Object.keys(sessions).length,
    timestamp: new Date().toISOString()
  });
});

// Info endpoint - return JSON for all requests
app.all('*', (req, res) => {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  res.json({
    name: serverInfo.name,
    version: serverInfo.version,
    protocol: 'streamable-http',
    endpoints: {
      primary: '/',
      alternate: '/mcp',
      health: '/health'
    }
  });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
===============================================
MCP Server - Streamable HTTP Only
Port: ${PORT}
Protocol: Streamable HTTP (2025-03-26)
===============================================
Endpoints:
  POST / or /mcp - Initialize & Commands
  GET  / or /mcp - SSE Stream
  DELETE / or /mcp - Close Session
===============================================
  `);
});

// Cleanup old sessions every 5 minutes
setInterval(() => {
  const now = new Date();
  const timeout = 30 * 60 * 1000; // 30 minutes
  
  Object.entries(sessions).forEach(([id, session]) => {
    if (now - session.lastAccess > timeout) {
      delete sessions[id];
      console.log(`Session expired: ${id}`);
    }
  });
}, 5 * 60 * 1000);