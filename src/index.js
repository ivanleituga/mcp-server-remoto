const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();

// Configure CORS - suporta ambos os headers
app.use(cors({
  origin: '*',
  exposedHeaders: ['Mcp-Session-Id', 'anthropic-session-id', 'anthropic-mcp-version']
}));

app.use(express.json());

// Logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log('Body:', JSON.stringify(req.body));
  }
  next();
});

// Store sessions
const sessions = {};

// Server info
const serverInfo = {
  name: 'mcp-server-remoto',
  version: '1.0.0',
  protocolVersion: '2025-03-26'
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
          text: `Olá, ${args.name || 'Mundo'}! 👋 Sou o MCP Server Remoto!`
        }]
      };
    
    case 'test_connection':
      return {
        content: [{
          type: 'text',
          text: `✅ Conexão estabelecida!\nServidor: ${serverInfo.name}\nVersão: ${serverInfo.version}\nTimestamp: ${new Date().toISOString()}`
        }]
      };
    
    default:
      throw new Error(`Tool not found: ${toolName}`);
  }
}

// ===== ENDPOINTS PARA O CLAUDE (sugestões do DeepSeek) =====

// Endpoint de descoberta para o Claude
app.get('/.well-known/mcp', (req, res) => {
  res.setHeader('anthropic-mcp-version', '2025-03-26');
  res.json({
    version: '2025-03-26',
    capabilities: {
      protocols: ["streamable_http"],
      methods: ["initialize", "tools/list", "tools/call", "close"],
      features: ["tool_use"]
    }
  });
});

// Endpoint GET para listar ferramentas (Claude)
app.get('/mcp/tools', (req, res) => {
  res.setHeader('anthropic-mcp-version', '2025-03-26');
  res.json({
    tools: tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema
    }))
  });
});

// ===== ENDPOINT PRINCIPAL - Suporta Inspector e Claude =====

app.post(['/', '/mcp'], (req, res) => {
  try {
    // Suporta ambos os headers de sessão
    const sessionId = req.headers['mcp-session-id'] || req.headers['anthropic-session-id'];
    const { jsonrpc, method, params, id } = req.body;
    
    console.log(`Método: ${method}, Sessão: ${sessionId || 'nova'}`);
    
    // Initialize
    if (method === 'initialize' && !sessionId) {
      const newSessionId = uuidv4();
      sessions[newSessionId] = {
        createdAt: new Date(),
        lastAccess: new Date()
      };
      
      // Envia ambos os headers para compatibilidade
      res.setHeader('Mcp-Session-Id', newSessionId);
      res.setHeader('anthropic-session-id', newSessionId);
      res.setHeader('anthropic-mcp-version', '2025-03-26');
      
      // Resposta híbrida - funciona para ambos
      res.json({
        jsonrpc: '2.0',
        result: {
          // Para o Inspector
          protocolVersion: serverInfo.protocolVersion,
          capabilities: {
            tools: {}
          },
          serverInfo: {
            name: serverInfo.name,
            version: serverInfo.version
          },
          // Para o Claude (adicionais)
          result: "success",
          server_id: serverInfo.name,
          session_id: newSessionId,
          protocol: "streamable_http"
        },
        id
      });
      
      console.log(`Sessão criada: ${newSessionId}`);
      return;
    }
    
    // Validate session
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
        result = executeTool(params.name, params.arguments);
        break;
        
      case 'logging/setLevel':
        result = {};
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
    
  } catch (error) {
    console.error('Erro:', error);
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

// SSE endpoint (se necessário)
app.get(['/mcp'], (req, res) => {
  const sessionId = req.headers['mcp-session-id'] || req.headers['anthropic-session-id'];
  
  if (!sessionId || !sessions[sessionId]) {
    res.status(400).send('Invalid or missing session ID');
    return;
  }
  
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  
  res.write(':connected\n\n');
  
  const keepAlive = setInterval(() => {
    res.write(':keepalive\n\n');
  }, 30000);
  
  req.on('close', () => {
    clearInterval(keepAlive);
    console.log(`SSE closed: ${sessionId}`);
  });
});

// DELETE session
app.delete(['/', '/mcp'], (req, res) => {
  const sessionId = req.headers['mcp-session-id'] || req.headers['anthropic-session-id'];
  
  if (sessionId && sessions[sessionId]) {
    delete sessions[sessionId];
    console.log(`Sessão encerrada: ${sessionId}`);
  }
  
  res.status(200).json({ result: "success" });
});

// Outros endpoints
app.get('/health', (req, res) => res.status(200).send('OK'));
app.get('/', (req, res) => res.json({ status: 'ok', server: serverInfo.name }));

// Cleanup
setInterval(() => {
  const now = new Date();
  Object.entries(sessions).forEach(([id, session]) => {
    if (now - session.lastAccess > 30 * 60 * 1000) {
      delete sessions[id];
      console.log(`Sessão expirada: ${id}`);
    }
  });
}, 5 * 60 * 1000);

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
===============================================
MCP Server - Híbrido (Inspector + Claude)
Port: ${PORT}
===============================================
Suporta:
- MCP Inspector (testado e funcionando)
- Claude Desktop (com melhorias do DeepSeek)
===============================================
  `);
});