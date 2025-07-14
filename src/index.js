const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();

// Configuração de CORS para compatibilidade
app.use(cors({
  origin: '*',
  exposedHeaders: ['Mcp-Session-Id', 'anthropic-session-id', 'anthropic-mcp-version']
}));

app.use(express.json());

// Logging detalhado
app.use((req, res, next) => {
  const logId = Math.random().toString(36).substring(2, 8);
  console.log(`[${logId}] ${new Date().toISOString()} ${req.method} ${req.url}`);
  
  if (req.body && Object.keys(req.body).length > 0) {
    console.log(`[${logId}] Body: ${JSON.stringify(req.body)}`);
  }
  
  // Log de fechamento de conexão
  req.on('close', () => {
    if (!res.headersSent) {
      console.log(`[${logId}] Conexão fechada antes do envio da resposta`);
    }
  });
  
  next();
});

// Armazenamento de sessões
const sessions = {};

// Informações do servidor
const serverInfo = {
  name: 'mcp-server-remoto',
  version: '1.0.0',
  protocolVersion: '2025-03-26'
};

// Ferramentas disponíveis
const tools = [
  {
    name: 'hello_world',
    description: 'Retorna uma mensagem de boas-vindas personalizada',
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
    description: 'Testa a conexão com o servidor remoto',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  }
];

// Execução de ferramentas
function executeTool(toolName, args = {}) {
  console.log(`Executando ferramenta: ${toolName} com argumentos:`, args);
  
  switch (toolName) {
    case 'hello_world':
      return {
        content: [{
          type: 'text',
          text: `👋 Olá, ${args.name || 'Mundo'}! Sou o MCP Server Remoto!`
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

// ===== ENDPOINTS CRÍTICOS =====

// 1. Endpoint de descoberta (para Claude)
app.get('/.well-known/mcp', (req, res) => {
  console.log('Endpoint de descoberta solicitado');
  res.setHeader('anthropic-mcp-version', serverInfo.protocolVersion);
  res.json({
    version: serverInfo.protocolVersion,
    capabilities: {
      protocols: ["streamable_http"],
      methods: ["initialize", "tools/list", "tools/call", "close"],
      features: ["tool_use"]
    }
  });
});

// 2. Listagem de ferramentas (para Claude)
app.get('/mcp/tools', (req, res) => {
  console.log('Listagem de ferramentas solicitada');
  res.setHeader('anthropic-mcp-version', serverInfo.protocolVersion);
  res.json({
    tools: tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema
    }))
  });
});

// 3. Endpoint principal (compatível com Inspector e Claude)
app.post(['/', '/mcp'], (req, res) => {
  try {
    // Suporta ambos os headers de sessão
    const sessionId = req.headers['mcp-session-id'] || req.headers['anthropic-session-id'];
    const { method, params, id } = req.body;
    
    console.log(`Método: ${method}, Sessão: ${sessionId || 'nova'}`);
    
    // Inicialização de sessão
    if (method === 'initialize' && !sessionId) {
      const newSessionId = uuidv4();
      sessions[newSessionId] = {
        createdAt: new Date(),
        lastAccess: new Date(),
        status: 'active'
      };
      
      // Configura headers para compatibilidade
      res.setHeader('Mcp-Session-Id', newSessionId);
      res.setHeader('anthropic-session-id', newSessionId);
      res.setHeader('anthropic-mcp-version', serverInfo.protocolVersion);
      
      // Resposta híbrida que funciona para ambos
      const response = {
        jsonrpc: '2.0',
        result: {
          // Para o Inspector
          protocolVersion: serverInfo.protocolVersion,
          capabilities: {
            tools: tools.map(t => t.name)
          },
          serverInfo: {
            name: serverInfo.name,
            version: serverInfo.version
          },
          // Para o Claude
          result: "success",
          server_id: serverInfo.name,
          session_id: newSessionId,
          protocol: "streamable_http"
        },
        id
      };
      
      console.log(`Sessão criada: ${newSessionId}`);
      return res.json(response);
    }
    
    // Validação de sessão
    if (!sessionId || !sessions[sessionId]) {
      return res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'ID de sessão inválido ou expirado'
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
          throw new Error('Parâmetros inválidos para execução da ferramenta');
        }
        result = executeTool(params.name, params.arguments || {});
        break;
        
      case 'logging/setLevel':
      case 'notifications/initialized':
        // Métodos ignorados mas necessários para compatibilidade
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

// 4. Endpoint SSE (para Inspector)
app.get('/mcp', (req, res) => {
  const sessionId = req.headers['mcp-session-id'] || req.headers['anthropic-session-id'];
  
  if (!sessionId || !sessions[sessionId]) {
    return res.status(400).send('ID de sessão inválido ou ausente');
  }
  
  // Configura headers SSE
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  
  // Envia evento de conexão
  res.write('event: connected\ndata: {}\n\n');
  
  // Mantém a conexão ativa
  const keepAlive = setInterval(() => {
    res.write(':keepalive\n\n');
  }, 30000);
  
  // Armazena a conexão SSE
  sessions[sessionId].sseConnection = res;
  
  // Trata fechamento da conexão
  req.on('close', () => {
    clearInterval(keepAlive);
    if (sessions[sessionId]) {
      delete sessions[sessionId].sseConnection;
    }
    console.log(`Conexão SSE fechada para sessão: ${sessionId}`);
  });
});

// 5. Fechamento de sessão
app.delete(['/', '/mcp'], (req, res) => {
  const sessionId = req.headers['mcp-session-id'] || req.headers['anthropic-session-id'];
  
  if (sessionId && sessions[sessionId]) {
    delete sessions[sessionId];
    console.log(`Sessão finalizada: ${sessionId}`);
    return res.status(200).json({ result: "success" });
  }
  
  res.status(404).json({ error: 'Sessão não encontrada' });
});

// ===== ENDPOINTS ADICIONAIS =====

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    server: serverInfo.name,
    version: serverInfo.version,
    activeSessions: Object.keys(sessions).length
  });
});

// Informações do servidor
app.get('/info', (req, res) => {
  res.json({
    server: serverInfo.name,
    version: serverInfo.version,
    protocol: 'streamable_http',
    tools: tools.map(t => t.name),
    sessions: Object.keys(sessions).length
  });
});

// Endpoint raiz
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>MCP Server Remoto</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 800px; margin: 40px auto; }
          .container { background: #f8f9fa; padding: 30px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
          h1 { color: #2c3e50; }
          .status { padding: 10px; background: #2ecc71; color: white; border-radius: 5px; }
          .endpoints { margin-top: 20px; }
          .endpoint { background: white; padding: 10px; margin: 10px 0; border-radius: 5px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Servidor MCP Remoto</h1>
          <div class="status">Status: Online ✅</div>
          
          <div class="info">
            <p><strong>Servidor:</strong> ${serverInfo.name}</p>
            <p><strong>Versão:</strong> ${serverInfo.version}</p>
            <p><strong>Protocolo:</strong> ${serverInfo.protocolVersion}</p>
            <p><strong>Sessões ativas:</strong> ${Object.keys(sessions).length}</p>
          </div>
          
          <div class="endpoints">
            <h3>Endpoints Disponíveis:</h3>
            <div class="endpoint"><strong>GET</strong> /.well-known/mcp - Endpoint de descoberta</div>
            <div class="endpoint"><strong>GET</strong> /mcp/tools - Lista de ferramentas</div>
            <div class="endpoint"><strong>POST</strong> /mcp - Endpoint principal</div>
            <div class="endpoint"><strong>GET</strong> /mcp - Conexão SSE</div>
            <div class="endpoint"><strong>DELETE</strong> /mcp - Fechar sessão</div>
            <div class="endpoint"><strong>GET</strong> /health - Health check</div>
            <div class="endpoint"><strong>GET</strong> /info - Informações do servidor</div>
          </div>
        </div>
      </body>
    </html>
  `);
});

// ===== MANUTENÇÃO DO SERVIDOR =====

// Limpeza de sessões inativas
setInterval(() => {
  const now = new Date();
  const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutos
  
  Object.entries(sessions).forEach(([id, session]) => {
    if (now - session.lastAccess > SESSION_TIMEOUT) {
      delete sessions[id];
      console.log(`Sessão expirada: ${id}`);
    }
  });
}, 5 * 60 * 1000); // Verifica a cada 5 minutos

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
  Servidor MCP Híbrido (Inspector + Claude)
  Porta: ${PORT}
  URL: http://localhost:${PORT}
  Protocolo: Streamable HTTP (${serverInfo.protocolVersion})
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
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;