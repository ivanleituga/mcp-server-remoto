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

// Logging simplificado
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Armazenamento de sessões
const sessions = {};

// Ferramentas (mantenha simples)
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
  }
];

// Prompts (obrigatório para o Claude)
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

// Execução de ferramentas
function executeTool(toolName, args = {}) {
  if (toolName === 'hello_world') {
    return {
      content: [{
        type: 'text',
        text: `Olá, ${args.name || 'Mundo'}! 👋 Sou o MCP Server Remoto!`
      }]
    };
  }
  throw new Error(`Ferramenta não encontrada: ${toolName}`);
}

// Handler de prompts
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
  throw new Error(`Prompt não encontrado: ${promptName}`);
}

// Endpoint principal
app.post(['/', '/mcp'], (req, res) => {
  const sessionId = req.headers['mcp-session-id'] || req.headers['anthropic-session-id'];
  const { method, params, id } = req.body;
  
  console.log(`Método: ${method}, Sessão: ${sessionId || 'nova'}`);
  
  try {
    // Inicialização
    if (method === 'initialize' && !sessionId) {
      const newSessionId = uuidv4();
      sessions[newSessionId] = {
        createdAt: new Date(),
        lastAccess: new Date()
      };
      
      res.setHeader('Mcp-Session-Id', newSessionId);
      res.setHeader('anthropic-session-id', newSessionId);
      res.setHeader('anthropic-mcp-version', '2024-11-05');
      
      res.json({
        jsonrpc: '2.0',
        result: {
          protocolVersion: '2024-11-05',
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
      });
      
      console.log(`Sessão criada: ${newSessionId}`);
      return;
    }
    
    // Validar sessão
    if (!sessionId || !sessions[sessionId]) {
      return res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Sessão inválida'
        },
        id: id || null
      });
    }
    
    // Atualizar acesso
    sessions[sessionId].lastAccess = new Date();
    
    // Processar métodos
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
        
      case 'tools/call':
        result = executeTool(params.name, params.arguments);
        break;
        
      case 'notifications/initialized':
        result = {};
        break;
        
      default:
        return res.json({
          jsonrpc: '2.0',
          error: {
            code: -32601,
            message: `Método não suportado: ${method}`
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

// SSE Endpoint (simplificado mas funcional)
app.get(['/', '/mcp'], (req, res) => {
  const sessionId = req.headers['mcp-session-id'] || req.headers['anthropic-session-id'];
  
  if (!sessionId) {
    return res.json({ 
      status: 'online',
      server: 'mcp-server-remoto',
      version: '1.0.0'
    });
  }
  
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  
  // Evento inicial
  res.write('event: connected\n');
  res.write('data: {}\n\n');
  
  // Heartbeat
  const heartbeat = setInterval(() => {
    res.write(':heartbeat\n\n');
  }, 15000);
  
  // Fechar ao desconectar
  req.on('close', () => {
    clearInterval(heartbeat);
  });
});

// DELETE session (imediato)
app.delete(['/', '/mcp'], (req, res) => {
  const sessionId = req.headers['mcp-session-id'] || req.headers['anthropic-session-id'];
  
  if (sessionId && sessions[sessionId]) {
    delete sessions[sessionId];
    console.log(`Sessão encerrada: ${sessionId}`);
  }
  
  res.status(200).json({ result: "success" });
});

// Health check
app.get('/health', (req, res) => res.send('OK'));

// Limpeza de sessões inativas
setInterval(() => {
  const now = new Date();
  Object.keys(sessions).forEach(id => {
    if (now - sessions[id].lastAccess > 5 * 60 * 1000) { // 5 minutos
      delete sessions[id];
    }
  });
}, 60 * 1000); // A cada minuto

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
==========================================
MCP Server - Claude Desktop Optimized
Porta: ${PORT}
Protocolo: 2024-11-05
Endpoints:
  POST /       : Métodos MCP
  GET  /       : SSE e informações
  DELETE /     : Encerrar sessão
==========================================
`);
});