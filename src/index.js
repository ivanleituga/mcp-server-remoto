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

// ===== LOGGING PARA DEBUG DO CLAUDE =====
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - Headers: ${JSON.stringify(req.headers)}`);
  
  // Log quando a conexão é fechada abruptamente
  req.on('close', () => {
    if (!res.headersSent) {
      console.log(`[CONNECTION CLOSED BEFORE RESPONSE] ${req.method} ${req.url}`);
    }
  });
  
  req.on('error', (err) => {
    console.log(`[REQUEST ERROR] ${req.method} ${req.url} - ${err.message}`);
  });
  
  next();
});

// Headers que o Claude pode esperar
app.use((req, res, next) => {
  res.header('X-MCP-Server', 'true');
  res.header('X-MCP-Version', '1.0.0');
  res.header('X-Content-Type-Options', 'nosniff');
  res.header('X-Frame-Options', 'DENY');
  next();
});

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

// Resposta rápida para OPTIONS
app.options('*', (req, res) => {
  res.status(200).end();
});

// Health check rápido
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Endpoint de teste rápido
app.all('/ping', (req, res) => {
  res.json({ pong: true, server: 'mcp-server-remoto' });
});

// GET raiz - resposta mínima e rápida
app.get('/', (req, res) => {
  res.status(200).json({ ok: true });
});

// Main endpoint POST - handles both root and /mcp
app.post(['/', '/mcp'], async (req, res) => {
  try {
    const sessionId = req.headers['mcp-session-id'];
    const { jsonrpc, method, params, id } = req.body;
    
    console.log(`[POST REQUEST] Method: ${method}, SessionId: ${sessionId || 'none'}`);
    
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
      
      console.log(`[SESSION CREATED] ${newSessionId}`);
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
        
    case 'notifications/initialized':
        // O Claude envia isso após inicializar
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
    console.error('[POST ERROR]:', error);
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
app.get(['/mcp'], async (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  
  console.log(`[GET SSE REQUEST] SessionId: ${sessionId || 'none'}`);
  
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
    console.log(`[SSE CLOSED] ${sessionId}`);
  });
});

// DELETE to close session
app.delete(['/', '/mcp'], (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  
  if (sessionId && sessions[sessionId]) {
    delete sessions[sessionId];
    console.log(`[SESSION DELETED] ${sessionId}`);
  }
  
  res.status(200).send('Session closed');
});

// Endpoint de capabilities
app.get('/capabilities', (req, res) => {
  res.json({
    mcp_version: '1.0.0',
    server_name: serverInfo.name,
    server_version: serverInfo.version,
    tools: tools.map(t => ({
      name: t.name,
      description: t.description
    })),
    protocol: 'streamable-http'
  });
});

// Endpoint de info
app.get('/info', (req, res) => {
  res.json({
    ...serverInfo,
    tools_count: tools.length,
    tools_available: true
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(`[ERROR HANDLER] ${req.method} ${req.url} - Error:`, err);
  res.status(500).json({ error: 'Internal server error' });
});

// Fallback para qualquer outra rota
app.all('*', (req, res) => {
  console.log(`[404] ${req.method} ${req.url}`);
  res.status(404).json({ error: 'Not found' });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
===============================================
MCP Server - Streamable HTTP Only (with Debug)
Port: ${PORT}
Protocol: Streamable HTTP (2025-03-26)
===============================================
Endpoints:
  POST / or /mcp - Initialize & Commands
  GET  /mcp - SSE Stream
  DELETE / or /mcp - Close Session
  GET /health - Health check
  GET /ping - Quick test
  GET /capabilities - Server capabilities
  GET /info - Server info
===============================================
  `);
});

// Keep server warm (para Render)
setInterval(() => {
  fetch('https://mcp-server-remoto.onrender.com/health')
    .catch(() => {}); // Ignora erros
}, 5 * 60 * 1000); // A cada 5 minutos

// Cleanup old sessions every 5 minutes
setInterval(() => {
  const now = new Date();
  const timeout = 30 * 60 * 1000; // 30 minutes
  
  Object.entries(sessions).forEach(([id, session]) => {
    if (now - session.lastAccess > timeout) {
      delete sessions[id];
      console.log(`[SESSION EXPIRED] ${id}`);
    }
  });
}, 5 * 60 * 1000);