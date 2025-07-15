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

// Logging aprimorado
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
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

// Prompts - Implementação aprimorada
const prompts = [
  {
    name: "greeting_prompt",
    description: "Gera uma saudação personalizada",
    arguments: [
      {
        name: "name",
        description: "Nome da pessoa para cumprimentar",
        required: true
      },
      {
        name: "language",
        description: "Idioma da saudação (pt, en, es)",
        required: false
      }
    ]
  }
];

// Tool execution
function executeTool(toolName, args = {}) {
  console.log(`🔧 Executando tool: ${toolName} com args:`, args);
  
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
  console.log(`📝 Obtendo prompt: ${promptName} com args:`, args);
  
  if (promptName === 'greeting_prompt') {
    const name = args.name || 'amigo';
    const language = args.language || 'pt';
    
    const greetings = {
      pt: `Olá ${name}! Como posso ajudá-lo hoje?`,
      en: `Hello ${name}! How can I help you today?`,
      es: `¡Hola ${name}! ¿Cómo puedo ayudarte hoy?`
    };
    
    return {
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
  
  throw new Error(`Prompt not found: ${promptName}`);
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
      
      console.log(`Cliente: ${clientName}, Versão solicitada: ${requestedVersion}`);
      
      sessions[newSessionId] = {
        createdAt: new Date(),
        lastAccess: new Date(),
        protocolVersion: requestedVersion,
        clientName: clientName,
        sseClients: [] // Array para múltiplos clientes SSE
      };
      
      // Headers de sessão
      res.setHeader('Mcp-Session-Id', newSessionId);
      res.setHeader('anthropic-session-id', newSessionId);
      res.setHeader('anthropic-mcp-version', requestedVersion);
      
      // Resposta para Claude Desktop
      const response = {
        jsonrpc: '2.0',
        result: {
          protocolVersion: requestedVersion,
          capabilities: {
            tools: tools.map(t => t.name),
            prompts: prompts.map(p => p.name),
            resources: [],
            logging: ['setLevel']
          },
          serverInfo: {
            name: 'mcp-server-remoto',
            version: '1.0.0'
          }
        },
        id
      };
      
      console.log('📤 Enviando resposta de inicialização:', JSON.stringify(response, null, 2));
      res.json(response);
      
      console.log(`✅ Sessão criada: ${newSessionId}`);
      return;
    }
    
    // Validate session
    if (!sessionId || !sessions[sessionId]) {
      console.log('❌ Sessão inválida ou ausente');
      res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Session required. Call initialize first.'
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
        console.log('🔧 Listando ferramentas...');
        result = { tools };
        break;
        
      case 'prompts/list':
        console.log('📝 Listando prompts...');
        result = { prompts };
        break;
        
      case 'prompts/get':
        console.log(`📝 Obtendo prompt: ${params.name}`);
        result = getPrompt(params.name, params.arguments);
        break;
        
      case 'tools/call':
        console.log(`🔧 Executando ferramenta: ${params.name}`);
        result = executeTool(params.name, params.arguments);
        break;
        
      case 'logging/setLevel':
        console.log(`📊 Definindo nível de log: ${params.level}`);
        result = { level: params.level };
        break;
        
      case 'notifications/initialized':
        console.log('🔔 Notificação: initialized');
        result = {};
        // Enviar notificação via SSE
        sendSSEEvent(sessionId, 'notification', {
          type: 'initialized',
          timestamp: new Date().toISOString()
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
    
    console.log('✅ Resposta enviada com sucesso');
    res.json({
      jsonrpc: '2.0',
      result,
      id
    });
    
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

// SSE endpoint - Implementação robusta
app.get(['/', '/mcp', '/sse'], (req, res) => {
  const sessionId = req.headers['mcp-session-id'] || req.headers['anthropic-session-id'];
  
  if (!sessionId) {
    return res.json({ 
      status: 'ok', 
      server: 'mcp-server-remoto',
      endpoints: ['POST /', 'GET / (SSE)', 'DELETE /']
    });
  }
  
  if (!sessions[sessionId]) {
    console.log(`❌ SSE: Sessão ${sessionId} não encontrada`);
    return res.status(400).send('Invalid session ID');
  }
  
  console.log(`📡 Iniciando SSE para sessão: ${sessionId}`);
  
  // Configurar headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'Mcp-Session-Id': sessionId,
    'anthropic-session-id': sessionId,
    'X-Accel-Buffering': 'no'
  });
  
  // Adicionar cliente à sessão
  sessions[sessionId].sseClients.push(res);
  
  // Enviar evento de abertura
  res.write('event: session_open\n');
  res.write(`data: ${JSON.stringify({
    sessionId,
    timestamp: new Date().toISOString()
  })}\n\n`);
  
  // Enviar informações sobre capacidades
  res.write('event: capabilities\n');
  res.write(`data: ${JSON.stringify({
    tools: tools.length,
    prompts: prompts.length
  })}\n\n`);
  
  // Enviar heartbeat a cada 15 segundos
  const heartbeat = setInterval(() => {
    try {
      res.write(':heartbeat\n\n');
    } catch (e) {
      // Cliente desconectado
      clearInterval(heartbeat);
    }
  }, 15000);
  
  // Tratar desconexão
  req.on('close', () => {
    console.log(`📡 Cliente SSE desconectado: ${sessionId}`);
    clearInterval(heartbeat);
    
    // Remover cliente da sessão
    if (sessions[sessionId]) {
      sessions[sessionId].sseClients = sessions[sessionId].sseClients.filter(client => client !== res);
    }
  });
});

// Função para enviar eventos SSE para todos os clientes de uma sessão
function sendSSEEvent(sessionId, event, data) {
  if (!sessions[sessionId] || !sessions[sessionId].sseClients) return;
  
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  
  sessions[sessionId].sseClients.forEach(client => {
    try {
      client.write(payload);
    } catch (e) {
      console.error(`❌ Erro ao enviar evento SSE para sessão ${sessionId}:`, e);
    }
  });
}

// DELETE session
app.delete(['/', '/mcp'], (req, res) => {
  const sessionId = req.headers['mcp-session-id'] || req.headers['anthropic-session-id'];
  
  if (sessionId && sessions[sessionId]) {
    // Fechar todas as conexões SSE
    sessions[sessionId].sseClients.forEach(client => {
      try {
        client.end();
      } catch (e) {
        console.error('Erro ao fechar conexão SSE:', e);
      }
    });
    
    delete sessions[sessionId];
    console.log(`🗑️ Sessão encerrada: ${sessionId}`);
  }
  
  res.status(200).json({ result: "success" });
});

// Health check
app.get('/health', (req, res) => res.status(200).send('OK'));

// Cleanup de sessões inativas
setInterval(() => {
  const now = new Date();
  const expirationTime = 30 * 60 * 1000; // 30 minutos
  
  Object.entries(sessions).forEach(([id, session]) => {
    if (now - session.lastAccess > expirationTime) {
      // Fechar conexões SSE
      session.sseClients.forEach(client => {
        try {
          client.end();
        } catch (e) {
          console.error('Erro ao fechar SSE:', e);
        }
      });
      
      delete sessions[id];
      console.log(`♻️ Sessão expirada: ${id}`);
    }
  });
}, 5 * 60 * 1000); // Verificar a cada 5 minutos

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
==================================================
🚀 MCP Server Remoto - Claude Desktop Ready (PRO)
📍 Porta: ${PORT}
⚙️  Protocolo: 2024-11-05 (Claude Desktop)
🔧 Ferramentas: ${tools.map(t => t.name).join(', ')}
📝 Prompts: ${prompts.map(p => p.name).join(', ')}
📡 SSE: Suporte a múltiplos clientes
==================================================
✅ Pronto para integrar com Claude Desktop!
==================================================
`);
});