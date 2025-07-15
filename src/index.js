const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();

app.use(cors({
  origin: '*',
  exposedHeaders: ['Mcp-Session-Id', 'anthropic-session-id', 'anthropic-mcp-version']
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

// Tools - Formato completo
const tools = [
  {
    name: 'hello_world',
    description: 'Retorna uma mensagem de boas-vindas personalizada',
    inputSchema: {
      type: 'object',
      properties: {
        name: { 
          type: 'string', 
          description: 'Nome para cumprimentar',
          default: 'Mundo'
        }
      },
      required: []  // Nenhum campo obrigatório
    }
  },
  {
    name: 'test_connection',
    description: 'Testa a conexão com o servidor MCP',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  }
];

// Prompts
const prompts = [
  {
    name: "greeting_prompt",
    description: "Gera uma saudação personalizada em múltiplos idiomas",
    arguments: [
      {
        name: "name",
        description: "Nome da pessoa para cumprimentar",
        required: true
      },
      {
        name: "language",
        description: "Idioma da saudação (pt, en, es)",
        required: false,
        default: "pt"
      }
    ]
  }
];

// Resources
const resources = [];

// Executar ferramenta
function executeTool(toolName, args = {}) {
  console.log(`🔧 Executando: ${toolName}`, args);
  
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
          text: `✅ Conexão estabelecida com sucesso!\n\n` +
                `Servidor: mcp-server-remoto\n` +
                `Versão: 1.0.0\n` +
                `Protocolo: MCP 2024-11-05\n` +
                `Timestamp: ${new Date().toISOString()}\n` +
                `Status: Operacional`
        }],
        isError: false
      };
    
    default:
      return {
        content: [{
          type: 'text',
          text: `Erro: Ferramenta '${toolName}' não encontrada`
        }],
        isError: true
      };
  }
}

// Obter prompt
function getPrompt(promptName, args = {}) {
  if (promptName === 'greeting_prompt') {
    const name = args.name || 'amigo';
    const language = args.language || 'pt';
    
    const greetings = {
      pt: `Olá ${name}! Como posso ajudá-lo hoje?`,
      en: `Hello ${name}! How can I help you today?`,
      es: `¡Hola ${name}! ¿Cómo puedo ayudarte hoy?`
    };
    
    return {
      description: `Saudação personalizada para ${name}`,
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: greetings[language] || greetings.pt
          }
        }
      ]
    };
  }
  
  throw new Error(`Prompt '${promptName}' não encontrado`);
}

// Enviar evento SSE
function sendSSEEvent(sessionId, event, data) {
  if (!sessions[sessionId] || !sessions[sessionId].sseClients) return;
  
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  
  sessions[sessionId].sseClients.forEach((client, index) => {
    try {
      client.write(message);
    } catch (e) {
      console.log(`❌ Erro ao enviar SSE para cliente ${index}`);
    }
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
        sseClients: [],
        deleted: false,
        deleteTimeout: null,
        initialized: false
      };
      
      res.setHeader('Mcp-Session-Id', newSessionId);
      res.setHeader('anthropic-session-id', newSessionId);
      
      const response = {
        jsonrpc: '2.0',
        result: {
          protocolVersion: requestedVersion,
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
    
    // Reativar se necessário
    if (sessions[sessionId].deleted) {
      console.log('♻️ Reativando sessão');
      sessions[sessionId].deleted = false;
      if (sessions[sessionId].deleteTimeout) {
        clearTimeout(sessions[sessionId].deleteTimeout);
        sessions[sessionId].deleteTimeout = null;
      }
    }
    
    sessions[sessionId].lastAccess = new Date();
    
    // Processar métodos
    let result;
    
    switch (method) {
      case 'tools/list':
        console.log('🔧 Listando ferramentas');
        result = { 
          tools: tools.map(tool => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema
          }))
        };
        
        // Notificar via SSE que as ferramentas estão disponíveis
        sendSSEEvent(sessionId, 'tools_ready', {
          count: tools.length,
          tools: tools.map(t => t.name)
        });
        break;
        
      case 'prompts/list':
        console.log('📝 Listando prompts');
        result = { 
          prompts: prompts.map(prompt => ({
            name: prompt.name,
            description: prompt.description,
            arguments: prompt.arguments
          }))
        };
        
        // Notificar via SSE que os prompts estão disponíveis
        sendSSEEvent(sessionId, 'prompts_ready', {
          count: prompts.length,
          prompts: prompts.map(p => p.name)
        });
        break;
        
      case 'prompts/get':
        console.log(`📝 Obtendo prompt: ${params.name}`);
        result = getPrompt(params.name, params.arguments);
        break;
        
      case 'resources/list':
        console.log('📚 Listando resources');
        result = { resources };
        
        sendSSEEvent(sessionId, 'resources_ready', {
          count: resources.length
        });
        break;
        
      case 'tools/call':
        console.log(`🔧 Chamando tool: ${params.name}`);
        result = executeTool(params.name, params.arguments);
        
        // Notificar execução via SSE
        sendSSEEvent(sessionId, 'tool_executed', {
          tool: params.name,
          success: !result.isError
        });
        break;
        
      case 'logging/setLevel':
        result = { level: params.level || 'info' };
        break;
        
      case 'notifications/initialized':
        console.log('🔔 Cliente inicializado');
        sessions[sessionId].initialized = true;
        result = {};
        
        // Notificar que o servidor está pronto
        sendSSEEvent(sessionId, 'server_ready', {
          tools: tools.length,
          prompts: prompts.length,
          resources: resources.length
        });
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
    
    console.log('📤 Resposta:', JSON.stringify(result, null, 2));
    
    res.json({
      jsonrpc: '2.0',
      result,
      id
    });
    
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

// SSE Endpoint
app.get(['/', '/mcp', '/sse'], (req, res) => {
  const sessionId = req.headers['mcp-session-id'] || req.headers['anthropic-session-id'];
  
  if (!sessionId) {
    return res.json({ 
      status: 'ok', 
      server: 'mcp-server-remoto',
      version: '1.0.0',
      capabilities: ['tools', 'prompts', 'sse']
    });
  }
  
  if (!sessions[sessionId]) {
    console.log(`❌ SSE: Sessão não existe ${sessionId}`);
    return res.status(400).send('Invalid session');
  }
  
  if (sessions[sessionId].deleted) {
    console.log('♻️ SSE: Reativando sessão');
    sessions[sessionId].deleted = false;
    if (sessions[sessionId].deleteTimeout) {
      clearTimeout(sessions[sessionId].deleteTimeout);
      sessions[sessionId].deleteTimeout = null;
    }
  }
  
  console.log(`📡 SSE conectado: ${sessionId}`);
  
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
    'Access-Control-Allow-Origin': '*'
  });
  
  sessions[sessionId].sseClients.push(res);
  
  // Evento de conexão
  res.write('event: open\n');
  res.write(`data: {"type":"connected","sessionId":"${sessionId}"}\n\n`);
  
  // Se já inicializado, enviar status
  if (sessions[sessionId].initialized) {
    setTimeout(() => {
      res.write('event: status\n');
      res.write(`data: {"initialized":true,"tools":${tools.length},"prompts":${prompts.length}}\n\n`);
    }, 100);
  }
  
  // Heartbeat
  const heartbeat = setInterval(() => {
    try {
      res.write(':heartbeat\n\n');
    } catch (e) {
      clearInterval(heartbeat);
    }
  }, 15000);
  
  req.on('close', () => {
    clearInterval(heartbeat);
    
    if (sessions[sessionId]) {
      sessions[sessionId].sseClients = sessions[sessionId].sseClients.filter(c => c !== res);
      console.log(`📡 SSE desconectado: ${sessionId} (${sessions[sessionId].sseClients.length} ativos)`);
    }
  });
});

// DELETE - Soft delete
app.delete(['/', '/mcp'], (req, res) => {
  const sessionId = req.headers['mcp-session-id'] || req.headers['anthropic-session-id'];
  
  if (sessionId && sessions[sessionId]) {
    console.log(`🗑️ Soft delete: ${sessionId}`);
    
    sessions[sessionId].deleted = true;
    sessions[sessionId].deleteTimeout = setTimeout(() => {
      if (sessions[sessionId] && sessions[sessionId].deleted) {
        sessions[sessionId].sseClients.forEach(client => {
          try { client.end(); } catch (e) {}
        });
        
        delete sessions[sessionId];
        console.log(`🗑️ Sessão deletada permanentemente: ${sessionId}`);
      }
    }, 10000); // 10 segundos de grace period
  }
  
  res.json({ result: "success" });
});

// Health
app.get('/health', (req, res) => res.send('OK'));

// Cleanup
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
🚀 MCP Server Remoto v5.0
📍 Port: ${PORT}
🔧 ${tools.length} ferramentas
📝 ${prompts.length} prompts
📚 ${resources.length} resources
📡 SSE com notificações
🗑️ Soft delete: 10s
✅ Otimizado para Claude Desktop!
  `);
});