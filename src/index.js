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

// Prompts - IMPORTANTE: Ter pelo menos um
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

// Prompt handler
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

// Função para enviar eventos SSE
function sendSSEEvent(sessionId, event, data) {
  if (!sessions[sessionId] || !sessions[sessionId].sseClients) return;
  
  const deadClients = [];
  sessions[sessionId].sseClients.forEach((client, index) => {
    try {
      client.write(`event: ${event}\n`);
      client.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (e) {
      deadClients.push(index);
    }
  });
  
  // Remover clientes mortos
  deadClients.reverse().forEach(index => {
    sessions[sessionId].sseClients.splice(index, 1);
  });
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
      const requestedVersion = params?.protocolVersion || '2024-11-05';
      const clientName = params?.clientInfo?.name || 'unknown';
      
      console.log(`Cliente: ${clientName}, Versão: ${requestedVersion}`);
      
      sessions[newSessionId] = {
        createdAt: new Date(),
        lastAccess: new Date(),
        protocolVersion: requestedVersion,
        clientName: clientName,
        sseClients: []
      };
      
      res.setHeader('Mcp-Session-Id', newSessionId);
      res.setHeader('anthropic-session-id', newSessionId);
      
      // IMPORTANTE: Resposta no formato esperado pelo Claude
      const response = {
        jsonrpc: '2.0',
        result: {
          protocolVersion: requestedVersion, // Usar a versão solicitada
          capabilities: {
            tools: {},     // Formato objeto vazio
            prompts: {},   // Formato objeto vazio
            resources: {}, // Formato objeto vazio
            logging: {}    // Formato objeto vazio
          },
          serverInfo: {
            name: 'mcp-server-remoto',
            version: '1.0.0'
          }
        },
        id
      };
      
      res.json(response);
      console.log(`✅ Sessão criada: ${newSessionId}`);
      return;
    }
    
    // Validar sessão
    if (!sessionId || !sessions[sessionId]) {
      console.log('❌ Sessão inválida');
      res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Session required'
        },
        id: id || null
      });
      return;
    }
    
    sessions[sessionId].lastAccess = new Date();
    
    // Processar métodos
    let result;
    let notifySSE = true;
    
    switch (method) {
      case 'tools/list':
        console.log('🔧 Listando ferramentas');
        result = { tools };
        break;
        
      case 'prompts/list':
        console.log('📝 Listando prompts');
        result = { prompts };
        break;
        
      case 'prompts/get':
        console.log(`📝 Obtendo prompt: ${params.name}`);
        result = getPrompt(params.name, params.arguments);
        break;
        
      case 'resources/list':
        console.log('📚 Listando resources');
        result = { resources };
        break;
        
      case 'tools/call':
        console.log(`🔧 Chamando tool: ${params.name}`);
        result = executeTool(params.name, params.arguments);
        break;
        
      case 'logging/setLevel':
        result = { level: params.level };
        break;
        
      case 'notifications/initialized':
        console.log('🔔 Cliente inicializado');
        result = {};
        notifySSE = false; // Não precisa notificar via SSE
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
    
    // Enviar resposta HTTP
    res.json({
      jsonrpc: '2.0',
      result,
      id
    });
    
    // Notificar via SSE se necessário
    if (notifySSE && sessions[sessionId].sseClients.length > 0) {
      sendSSEEvent(sessionId, 'result', {
        method,
        result,
        timestamp: new Date().toISOString()
      });
    }
    
    console.log('✅ Processado com sucesso');
    
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

// SSE Endpoint - Crítico para o Claude
app.get(['/', '/mcp', '/sse'], (req, res) => {
  const sessionId = req.headers['mcp-session-id'] || req.headers['anthropic-session-id'];
  
  // Se não tem session, retorna info
  if (!sessionId) {
    return res.json({ 
      status: 'ok', 
      server: 'mcp-server-remoto',
      version: '1.0.0'
    });
  }
  
  // Verificar sessão
  if (!sessions[sessionId]) {
    console.log(`❌ SSE: Sessão inválida ${sessionId}`);
    return res.status(400).send('Invalid session');
  }
  
  console.log(`📡 SSE conectado: ${sessionId}`);
  
  // Configurar SSE
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // Importante para proxies
    'Mcp-Session-Id': sessionId,
    'anthropic-session-id': sessionId
  });
  
  // Adicionar cliente
  sessions[sessionId].sseClients.push(res);
  
  // Evento inicial
  res.write('event: open\n');
  res.write(`data: {"type":"connected","sessionId":"${sessionId}"}\n\n`);
  
  // Heartbeat
  const heartbeat = setInterval(() => {
    try {
      res.write(':ping\n\n');
    } catch (e) {
      clearInterval(heartbeat);
    }
  }, 15000);
  
  // Cleanup ao desconectar
  req.on('close', () => {
    clearInterval(heartbeat);
    
    if (sessions[sessionId]) {
      sessions[sessionId].sseClients = sessions[sessionId].sseClients.filter(c => c !== res);
      console.log(`📡 SSE desconectado: ${sessionId} (${sessions[sessionId].sseClients.length} ativos)`);
    }
  });
});

// DELETE session
app.delete(['/', '/mcp'], (req, res) => {
  const sessionId = req.headers['mcp-session-id'] || req.headers['anthropic-session-id'];
  
  if (sessionId && sessions[sessionId]) {
    // Fechar todos os SSE
    sessions[sessionId].sseClients.forEach(client => {
      try {
        client.end();
      } catch (e) {}
    });
    
    delete sessions[sessionId];
    console.log(`🗑️ Sessão deletada: ${sessionId}`);
  }
  
  res.json({ result: "success" });
});

// Health
app.get('/health', (req, res) => res.send('OK'));

// Cleanup automático
setInterval(() => {
  const now = new Date();
  Object.entries(sessions).forEach(([id, session]) => {
    if (now - session.lastAccess > 30 * 60 * 1000) {
      session.sseClients.forEach(client => {
        try { client.end(); } catch (e) {}
      });
      delete sessions[id];
      console.log(`♻️ Sessão expirada: ${id}`);
    }
  });
}, 5 * 60 * 1000);

// Start
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
🚀 MCP Server Remoto v3.0
📍 Port: ${PORT}
🔧 Tools: ${tools.length}
📝 Prompts: ${prompts.length}
📚 Resources: ${resources.length}
✅ Pronto para Claude Desktop!
  `);
});