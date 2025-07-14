const express = require('express');
const cors = require('cors');

const app = express();

// Configuração CORS mais permissiva
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', '*');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  
  next();
});

app.use(express.json());

// Log detalhado de todas as requisições para debug
app.use((req, res, next) => {
  console.log(`
=== Requisição Recebida ===
Timestamp: ${new Date().toISOString()}
Method: ${req.method}
Path: ${req.path}
Headers: ${JSON.stringify(req.headers, null, 2)}
Body: ${JSON.stringify(req.body, null, 2)}
===========================
  `);
  next();
});

// ===== ENDPOINTS DE ATIVAÇÃO E STATUS =====

// Endpoint de status - CRÍTICO para mostrar como "Ativado"
app.get('/status', (req, res) => {
  res.json({
    status: 'active',
    ready: true,
    version: '1.0.0',
    capabilities: {
      tools: true
    }
  });
});

// Endpoint de ativação
app.post('/activate', (req, res) => {
  console.log('Servidor sendo ativado pelo Claude');
  res.json({
    status: 'activated',
    message: 'MCP-server-remoto ativado com sucesso'
  });
});

// Endpoint de capabilities
app.get('/capabilities', (req, res) => {
  res.json({
    version: '1.0.0',
    tools: {
      supported: true,
      count: 2
    },
    protocol: {
      json_rpc: '2.0',
      mcp: '1.0'
    }
  });
});

// Endpoint alternativo de manifesto
app.get('/manifest', (req, res) => {
  res.json({
    name: 'MCP-server-remoto',
    version: '1.0.0',
    status: 'active',
    tools: [
      {
        name: 'hello_world',
        enabled: true
      },
      {
        name: 'test_connection',
        enabled: true
      }
    ]
  });
});

// WebSocket fallback (alguns conectores esperam isso)
app.get('/ws', (req, res) => {
  res.status(426).json({
    error: 'WebSocket not implemented',
    message: 'Use JSON-RPC over HTTP instead'
  });
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

// Health check atualizado
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    active: true,  // Importante para ativação
    ready: true,   // Importante para ativação
    server: 'MCP-server-remoto',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    endpoints: {
      discovery: '/.well-known/mcp.json',
      jsonrpc: '/',
      health: '/health',
      status: '/status'
    }
  });
});

// Página inicial atualizada
app.get('/', (req, res) => {
  res.json({
    name: 'MCP-server-remoto',
    status: 'active',  // IMPORTANTE: status como 'active'
    version: '1.0.0',
    ready: true,       // IMPORTANTE: ready como true
    message: 'Servidor MCP ativo e pronto',
    endpoints: {
      discovery: '/.well-known/mcp.json',
      jsonrpc: 'POST /',
      status: '/status',
      health: '/health',
      capabilities: '/capabilities'
    }
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
        .section { margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
      </style>
    </head>
    <body>
      <h1>MCP-server-remoto - Teste Interativo</h1>
      
      <div class="section">
        <h3>1. Status e Ativação</h3>
        <button onclick="testStatus()">Status</button>
        <button onclick="testActivate()">Activate</button>
        <button onclick="testCapabilities()">Capabilities</button>
        <button onclick="testManifest()">Manifest</button>
      </div>
      
      <div class="section">
        <h3>2. Descoberta</h3>
        <button onclick="testDiscovery()">Discovery (.well-known)</button>
        <button onclick="testHealth()">Health Check</button>
      </div>
      
      <div class="section">
        <h3>3. Protocolo JSON-RPC</h3>
        <button onclick="testInitialize()">Initialize</button>
        <button onclick="testListTools()">Listar Ferramentas</button>
        <button onclick="testPing()">Ping</button>
      </div>
      
      <div class="section">
        <h3>4. Ferramentas</h3>
        <div>
          <input type="text" id="nameInput" placeholder="Seu nome" value="Teste">
          <button onclick="testHelloWorld()">Hello World</button>
        </div>
        <button onclick="testConnection()">Test Connection</button>
      </div>
      
      <h3>Resposta:</h3>
      <pre id="response">Clique em um botão para testar...</pre>
      
      <script>
        async function testEndpoint(url, method = 'GET', body = null) {
          try {
            const options = {
              method: method,
              headers: { 'Content-Type': 'application/json' }
            };
            if (body) options.body = JSON.stringify(body);
            
            const response = await fetch(url, options);
            const data = await response.json();
            showResponse(data, response.ok);
          } catch (error) {
            showResponse({ error: error.message }, false);
          }
        }
        
        function testStatus() { testEndpoint('/status'); }
        function testActivate() { testEndpoint('/activate', 'POST'); }
        function testCapabilities() { testEndpoint('/capabilities'); }
        function testManifest() { testEndpoint('/manifest'); }
        function testDiscovery() { testEndpoint('/.well-known/mcp.json'); }
        function testHealth() { testEndpoint('/health'); }
        
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
Status: ATIVO
===============================================
Endpoints disponíveis:
- GET  /                     (informações)
- GET  /status              (status do servidor)
- POST /activate            (ativação)
- GET  /capabilities        (capacidades)
- GET  /manifest            (manifesto)
- GET  /.well-known/mcp.json (descoberta)
- POST /                    (JSON-RPC)
- GET  /health              (health check)
- GET  /test                (página de teste)
===============================================
  `);
});

// Manter o processo vivo
process.on('SIGINT', () => {
  console.log('Servidor finalizado');
  process.exit(0);
});