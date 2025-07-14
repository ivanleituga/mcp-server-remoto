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

// ===== LOGGING PARA DEBUG =====
app.use((req, res, next) => {
  const logId = Math.random().toString(36).substring(7);
  req.logId = logId;
  
  console.log(`[${logId}] ${new Date().toISOString()} ${req.method} ${req.url}`);
  
  // Log quando a conexão é fechada abruptamente
  req.on('close', () => {
    if (!res.headersSent) {
      console.log(`[${logId}] CONNECTION CLOSED BEFORE RESPONSE`);
    }
  });
  
  req.on('error', (err) => {
    console.log(`[${logId}] REQUEST ERROR: ${err.message}`);
  });
  
  // Log quando a resposta é enviada com sucesso
  res.on('finish', () => {
    console.log(`[${logId}] Response sent successfully - Status: ${res.statusCode}`);
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

// Tool execution - SIMPLIFICADA
function executeTool(toolName, args = {}) {
  console.log(`[EXECUTE TOOL] Name: ${toolName}, Args:`, JSON.stringify(args));
  
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
      throw new Error(`Tool not found: ${toolName}`);
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
  const logId = req.logId;
  
  try {
    const sessionId = req.headers['mcp-session-id'];
    const { jsonrpc, method, params, id } = req.body;
    
    console.log(`[${logId}] Method: ${method}, SessionId: ${sessionId || 'none'}`);
    
    // Initialize request
    if (method === 'initialize' && !sessionId) {
      const newSessionId = uuidv4();
      sessions[newSessionId] = {
        createdAt: new Date(),
        lastAccess: new Date()
      };
      
      res.setHeader('Mcp-Session-Id', newSessionId);
      
      const response = {
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
      };
      
      res.json(response);
      console.log(`[${logId}] Session created: ${newSessionId}`);
      return;
    }
    
    // Validate session for other requests
    if (!sessionId || !sessions[sessionId]) {
      console.error(`[${logId}] No valid session for method: ${method}`);
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
        // Sincronizar para evitar problemas de async
        try {
          result = executeTool(params.name, params.arguments);
        } catch (error) {
          console.error(`[${logId}] Tool execution error:`, error.message);
          res.json({
            jsonrpc: '2.0',
            error: {
              code: -32603,
              message: error.message
            },
            id
          });
          return;
        }
        break;
        
      case 'logging/setLevel':
        result = {};
        break;
        
      case 'notifications/initialized':
        result = {};
        break;
        
      default:
        console.error(`[${logId}] Method not found: ${method}`);
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
    
    // Send successful response
    const response = {
      jsonrpc: '2.0',
      result,
      id
    };
    
    res.json(response);
    console.log(`[${logId}] Response sent for method: ${method}`);
    
  } catch (error) {
    console.error(`[${logId}] Unexpected error:`, error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: error.message
        },
        id: req.body?.id || null
      });
    }
  }
});

// GET for SSE stream
app.get(['/mcp'], async (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  
  console.log(`[SSE] GET request, SessionId: ${sessionId || 'none'}`);
  
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
    console.log(`[SSE] Connection closed for session: ${sessionId}`);
  });
});

// DELETE to close session
app.delete(['/', '/mcp'], (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  
  if (sessionId && sessions[sessionId]) {
    delete sessions[sessionId];
    console.log(`[DELETE] Session closed: ${sessionId}`);
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
  console.error(`[ERROR HANDLER] Error:`, err);
  if (!res.headersSent) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Fallback para qualquer outra rota
app.all('*', (req, res) => {
  console.log(`[404] ${req.method} ${req.url}`);
  res.status(404).json({ error: 'Not found' });
});

// Start server
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`
===============================================
MCP Server - Streamable HTTP (Production Ready)
Port: ${PORT}
Protocol: Streamable HTTP (2025-03-26)
===============================================
Endpoints:
  POST / or /mcp - Initialize & Commands
  GET  /mcp - SSE Stream  
  DELETE / or /mcp - Close Session
  GET /health - Health check
  GET /info - Server info
===============================================
  `);
});

// Configurações do servidor para evitar timeouts
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;

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
      console.log(`[CLEANUP] Session expired: ${id}`);
    }
  });
}, 5 * 60 * 1000);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});