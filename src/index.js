const express = require('express');
const cors = require('cors');

const app = express();

// Configuração CORS mais permissiva
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(express.json());

// Log de todas as requisições para debug
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log('Body:', JSON.stringify(req.body, null, 2));
  }
  next();
});

// ===== PROTOCOLO DE DESCOBERTA =====

// Manifesto de descoberta - CRÍTICO para o Claude
app.get('/.well-known/mcp.json', (req, res) => {
  res.json({
    "mcpVersion": "1.0",
    "name": "MCP-server-remoto",
    "description": "Servidor MCP remoto para testes",
    "iconUrl": null,
    "capabilities": {
      "tools": true,
      "prompts": false,
      "resources": false
    },
    "tools": [
      {
        "name": "mcp-server-remoto__hello_world",
        "description": "Retorna uma mensagem de boas-vindas",
        "inputSchema": {
          "type": "object",
          "properties": {
            "name": {
              "type": "string",
              "description": "Nome para cumprimentar"
            }
          },
          "required": ["name"]
        }
      },
      {
        "name": "mcp-server-remoto__test_connection",
        "description": "Testa a conexão com o servidor",
        "inputSchema": {
          "type": "object",
          "properties": {}
        }
      }
    ]
  });
});

// ===== ENDPOINTS JSON-RPC =====

// Endpoint principal JSON-RPC
app.post('/', async (req, res) => {
  try {
    const { jsonrpc, method, params, id } = req.body;
    
    // Validar JSON-RPC
    if (jsonrpc !== '2.0') {
      return res.json({
        jsonrpc: '2.0',
        error: {
          code: -32600,
          message: 'Invalid Request: must be JSON-RPC 2.0'
        },
        id: id || null
      });
    }
    
    console.log(`Método chamado: ${method}`);
    
    switch (method) {
      case 'initialize':
        res.json({
          jsonrpc: '2.0',
          result: {
            protocolVersion: '1.0',
            capabilities: {
              tools: {
                listChanged: false
              }
            },
            serverInfo: {
              name: 'MCP-server-remoto',
              version: '1.0.0'
            }
          },
          id
        });
        break;
        
      case 'tools/list':
        res.json({
          jsonrpc: '2.0',
          result: {
            tools: [
              {
                name: 'mcp-server-remoto__hello_world',
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
                name: 'mcp-server-remoto__test_connection',
                description: 'Testa a conexão com o servidor',
                inputSchema: {
                  type: 'object',
                  properties: {}
                }
              }
            ]
          },
          id
        });
        break;
        
      case 'tools/call':
        const toolName = params.name;
        const args = params.arguments || {};
        
        console.log(`Executando ferramenta: ${toolName}`);
        
        let result;
        
        // Aceitar tanto com quanto sem prefixo
        const normalizedToolName = toolName.replace('mcp-server-remoto__', '');
        
        switch (normalizedToolName) {
          case 'hello_world':
            result = {
              content: [{
                type: 'text',
                text: `Olá, ${args.name || 'Mundo'}! 👋 Sou o MCP Server Remoto e estou funcionando perfeitamente!`
              }]
            };
            break;
            
          case 'test_connection':
            result = {
              content: [{
                type: 'text',
                text: `✅ Conexão estabelecida com sucesso! 
Servidor: MCP-server-remoto
Status: Online
Timestamp: ${new Date().toISOString()}`
              }]
            };
            break;
            
          default:
            return res.json({
              jsonrpc: '2.0',
              error: {
                code: -32602,
                message: `Ferramenta não encontrada: ${toolName}`
              },
              id
            });
        }
        
        res.json({
          jsonrpc: '2.0',
          result,
          id
        });
        break;
        
      case 'ping':
        res.json({
          jsonrpc: '2.0',
          result: { status: 'pong' },
          id
        });
        break;
        
      default:
        res.json({
          jsonrpc: '2.0',
          error: {
            code: -32601,
            message: `Método não encontrado: ${method}`
          },
          id
        });
    }
  } catch (error) {
    console.error('Erro:', error);
    res.json({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: error.message
      },
      id: req.body.id || null
    });
  }
});

// ===== ENDPOINTS AUXILIARES =====

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    server: 'MCP-server-remoto',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    endpoints: {
      discovery: '/.well-known/mcp.json',
      jsonrpc: '/',
      health: '/health'
    }
  });
});

// Página inicial
app.get('/', (req, res) => {
  res.json({
    name: 'MCP-server-remoto',
    status: 'online',
    message: 'Use POST / para chamadas JSON-RPC',
    discovery: '/.well-known/mcp.json'
  });
});

// Página de teste
app.get('/test', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>MCP Server Test</title>
      <style>
        body { font-family: Arial; margin: 20px; max-width: 800px; }
        button { margin: 5px; padding: 10px 20px; cursor: pointer; }
        button:hover { background: #e0e0e0; }
        pre { background: #f5f5f5; padding: 15px; border-radius: 5px; overflow-x: auto; }
        .success { color: green; }
        .error { color: red; }
        input { margin: 5px; padding: 5px; }
      </style>
    </head>
    <body>
      <h1>MCP-server-remoto - Teste Interativo</h1>
      
      <h3>1. Descoberta</h3>
      <button onclick="testDiscovery()">Testar Discovery</button>
      
      <h3>2. Protocolo JSON-RPC</h3>
      <button onclick="testInitialize()">Initialize</button>
      <button onclick="testListTools()">Listar Ferramentas</button>
      <button onclick="testPing()">Ping</button>
      
      <h3>3. Ferramentas</h3>
      <div>
        <input type="text" id="nameInput" placeholder="Seu nome" value="Teste">
        <button onclick="testHelloWorld()">Hello World</button>
      </div>
      <button onclick="testConnection()">Test Connection</button>
      
      <h3>Resposta:</h3>
      <pre id="response">Clique em um botão para testar...</pre>
      
      <script>
        async function testDiscovery() {
          try {
            const response = await fetch('/.well-known/mcp.json');
            const data = await response.json();
            showResponse(data, response.ok);
          } catch (error) {
            showResponse({ error: error.message }, false);
          }
        }
        
        async function sendRPC(method, params = {}) {
          try {
            const response = await fetch('/', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jsonrpc: '2.0',
                method: method,
                params: params,
                id: Date.now()
              })
            });
            const data = await response.json();
            showResponse(data, !data.error);
          } catch (error) {
            showResponse({ error: error.message }, false);
          }
        }
        
        function showResponse(data, success) {
          const pre = document.getElementById('response');
          pre.textContent = JSON.stringify(data, null, 2);
          pre.className = success ? 'success' : 'error';
        }
        
        function testInitialize() { sendRPC('initialize'); }
        function testListTools() { sendRPC('tools/list'); }
        function testPing() { sendRPC('ping'); }
        
        function testHelloWorld() {
          const name = document.getElementById('nameInput').value;
          sendRPC('tools/call', {
            name: 'mcp-server-remoto__hello_world',
            arguments: { name }
          });
        }
        
        function testConnection() {
          sendRPC('tools/call', {
            name: 'mcp-server-remoto__test_connection',
            arguments: {}
          });
        }
      </script>
    </body>
    </html>
  `);
});

// ===== INICIALIZAÇÃO =====

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
===============================================
MCP-server-remoto v1.0.0
Porta: ${PORT}
===============================================
Endpoints disponíveis:
- GET  /                    (informações)
- GET  /.well-known/mcp.json (descoberta)
- POST /                    (JSON-RPC)
- GET  /health             (health check)
- GET  /test               (página de teste)
===============================================
  `);
});