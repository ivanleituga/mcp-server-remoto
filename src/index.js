const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();

// Configuração crítica de CORS
app.use(cors({
  origin: '*',
  exposedHeaders: ['Mcp-Session-Id', 'anthropic-session-id']
}));

app.use(express.json());

// Logging aprimorado
app.use((req, res, next) => {
  const logId = Math.random().toString(36).substring(2, 8);
  console.log(`[${logId}] ${new Date().toISOString()} ${req.method} ${req.url}`);
  
  if (req.body && Object.keys(req.body).length > 0) {
    console.log(`[${logId}] Body:`, JSON.stringify(req.body));
  }
  
  res.on('finish', () => {
    console.log(`[${logId}] Response: ${res.statusCode}`);
  });
  
  next();
});

// Armazenamento de sessões
const sessions = {};

// Informações do servidor (compatível com ambos)
const serverInfo = {
  name: 'mcp-server-remoto',
  version: '1.0.0',
  protocolVersion: '2025-03-26',
  capabilities: {
    tools: {}
  }
};

// Ferramentas
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

// Execução de ferramentas
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
          text: `✅ Conexão estabelecida!\nServidor: ${serverInfo.name}\nVersão: ${serverInfo.version}`
        }]
      };
    
    default:
      throw new Error(`Ferramenta não encontrada: ${toolName}`);
  }
}

// Endpoint de descoberta (Obrigatório para Claude)
app.get('/.well-known/mcp', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
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

// Listagem de ferramentas (Obrigatório para Claude)
app.get('/mcp/tools', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('anthropic-mcp-version', '2025-03-26');
  
  res.json({
    tools: tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema
    }))
  });
});

// Endpoint principal (compatível com ambos)
app.post(['/', '/mcp'], (req, res) => {
  try {
    const sessionId = req.headers['mcp-session-id'] || req.headers['anthropic-session-id'];
    const { method, params, id } = req.body;
    
    console.log(`Método: ${method}, Sessão: ${sessionId || 'nova'}`);
    
    // Inicialização (FORMATO CRÍTICO)
    if (method === 'initialize' && !sessionId) {
      const newSessionId = uuidv4();
      sessions[newSessionId] = {
        createdAt: new Date(),
        lastAccess: new Date()
      };
      
      // Headers obrigatórios para ambos
      res.setHeader('Mcp-Session-Id', newSessionId);
      res.setHeader('anthropic-session-id', newSessionId);
      res.setHeader('anthropic-mcp-version', '2025-03-26');
      
      // Resposta compatível com Inspector e Claude
      res.json({
        jsonrpc: '2.0',
        result: {
          protocolVersion: serverInfo.protocolVersion,
          capabilities: {
            tools: tools.map(t => t.name)
          },
          serverInfo: {
            name: serverInfo.name,
            version: serverInfo.version
          },
          // Campos adicionais exigidos pelo Claude
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
    
    // Validação de sessão
    if (!sessionId || !sessions[sessionId]) {
      return res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'ID de sessão inválido'
        },
        id: id || null
      });
    }
    
    // Atualiza último acesso
    sessions[sessionId].lastAccess = new Date();
    
    // Processamento dos métodos
    let result;
    switch (method) {
      case 'tools/list':
        result = { tools };
        break;
        
      case 'tools/call':
        if (!params || !params.name) {
          throw new Error('Parâmetros inválidos');
        }
        result = executeTool(params.name, params.arguments || {});
        break;
        
      case 'logging/setLevel':
      case 'notifications/initialized':
        result = {};
        break;
        
      default:
        return res.status(404).json({
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
    console.error('Erro no endpoint principal:', error);
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

// Endpoint SSE (para Inspector)
app.get('/mcp', (req, res) => {
  const sessionId = req.headers['mcp-session-id'] || req.headers['anthropic-session-id'];
  
  if (!sessionId || !sessions[sessionId]) {
    return res.status(400).send('ID de sessão inválido');
  }
  
  // Configura headers SSE
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  
  // Envia evento de conexão
  res.write('event: connected\ndata: {}\n\n');
  
  // Mantém a conexão ativa
  const keepAlive = setInterval(() => {
    res.write(':keepalive\n\n');
  }, 30000);
  
  // Trata fechamento da conexão
  req.on('close', () => {
    clearInterval(keepAlive);
    console.log(`Conexão SSE fechada para sessão: ${sessionId}`);
  });
});

// Fechamento de sessão
app.delete(['/', '/mcp'], (req, res) => {
  const sessionId = req.headers['mcp-session-id'] || req.headers['anthropic-session-id'];
  
  if (sessionId && sessions[sessionId]) {
    delete sessions[sessionId];
    console.log(`Sessão finalizada: ${sessionId}`);
    return res.status(200).json({ result: "success" });
  }
  
  res.status(404).json({ error: 'Sessão não encontrada' });
});

// Health check
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Endpoint raiz
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    server: serverInfo.name,
    version: serverInfo.version,
    protocol: 'streamable_http'
  });
});

// Limpeza de sessões inativas
setInterval(() => {
  const now = new Date();
  Object.keys(sessions).forEach(id => {
    if (now - sessions[id].lastAccess > 30 * 60 * 1000) {
      delete sessions[id];
      console.log(`Sessão expirada: ${id}`);
    }
  });
}, 5 * 60 * 1000);

// Inicialização do servidor
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`
███████╗███████╗██████╗ ██╗   ██╗███████╗██████╗ 
██╔════╝██╔════╝██╔══██╗██║   ██║██╔════╝██╔══██╗
███████╗█████╗  ██████╔╝██║   ██║█████╗  ██████╔╝
╚════██║██╔══╝  ██╔══██╗╚██╗ ██╔╝██╔══╝  ██╔══██╗
███████║███████╗██║  ██║ ╚████╔╝ ███████╗██║  ██║
╚══════╝╚══════╝╚═╝  ╚═╝  ╚═══╝  ╚══════╝╚═╝  ╚═╝
                                                  
==================================================
  Servidor MCP Remoto (Claude + Inspector)
  Porta: ${PORT}
  Protocolo: Streamable HTTP (2025-03-26)
==================================================
Endpoints críticos:
  GET  /.well-known/mcp
  GET  /mcp/tools
  POST /mcp
  GET  /mcp (SSE)
  DELETE /mcp
==================================================
`);
});

// Configurações para evitar timeout
server.keepAliveTimeout = 30000;
server.headersTimeout = 35000;