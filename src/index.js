const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid'); // Precisamos instalar isso

const app = express();
app.use(cors());
app.use(express.json());

// Armazenar conexões SSE por sessionId
const sseConnections = new Map();
const sessionData = new Map();

// Função para enviar eventos SSE
function sendSSE(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// ===== ENDPOINT SSE PRINCIPAL =====
app.get('/sse', (req, res) => {
  console.log('Nova conexão SSE estabelecida');
  
  // Configurar headers para SSE
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  // Gerar sessionId único
  const sessionId = uuidv4();
  
  // Enviar evento endpoint com sessionId
  sendSSE(res, 'endpoint', `/messages?sessionId=${sessionId}`);
  
  // Armazenar conexão
  sseConnections.set(sessionId, res);
  sessionData.set(sessionId, {
    connected: true,
    startTime: new Date()
  });

  // Manter conexão viva
  const keepAlive = setInterval(() => {
    res.write(':keepalive\n\n');
  }, 30000);

  // Limpar quando a conexão fechar
  req.on('close', () => {
    console.log(`Conexão SSE fechada: ${sessionId}`);
    clearInterval(keepAlive);
    sseConnections.delete(sessionId);
    sessionData.delete(sessionId);
  });
});

// ===== ENDPOINT PARA MENSAGENS =====
app.post('/messages', async (req, res) => {
  const sessionId = req.query.sessionId;
  
  if (!sessionId || !sseConnections.has(sessionId)) {
    return res.status(404).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Session not found'
      },
      id: req.body.id
    });
  }

  const sseRes = sseConnections.get(sessionId);
  const { jsonrpc, method, params, id } = req.body;

  console.log(`Mensagem recebida [${sessionId}]: ${method}`);

  try {
    let result;

    switch (method) {
      case 'initialize':
        result = {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {},
            logging: {}
          },
          serverInfo: {
            name: 'mcp-server-remoto',
            version: '1.0.0'
          }
        };
        break;

      case 'tools/list':
        result = {
          tools: [
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
          ]
        };
        break;

      case 'tools/call':
        const toolName = params.name;
        const args = params.arguments || {};
        
        console.log(`Executando ferramenta: ${toolName}`);
        
        switch (toolName) {
          case 'hello_world':
            result = {
              content: [{
                type: 'text',
                text: `Olá, ${args.name || 'Mundo'}! 👋 Sou o MCP Server Remoto funcionando via SSE!`
              }]
            };
            break;
            
          case 'test_connection':
            result = {
              content: [{
                type: 'text',
                text: `✅ Conexão SSE estabelecida com sucesso!\nServidor: MCP-server-remoto\nProtocolo: SSE (2024-11-05)\nSessionId: ${sessionId}\nTimestamp: ${new Date().toISOString()}`
              }]
            };
            break;
            
          default:
            return res.json({
              jsonrpc: '2.0',
              error: {
                code: -32601,
                message: `Ferramenta não encontrada: ${toolName}`
              },
              id
            });
        }
        break;

      case 'logging/setLevel':
        // Implementar se necessário
        result = {};
        break;

      default:
        return res.json({
          jsonrpc: '2.0',
          error: {
            code: -32601,
            message: `Método não encontrado: ${method}`
          },
          id
        });
    }

    // Enviar resposta de sucesso
    res.json({
      jsonrpc: '2.0',
      result,
      id
    });

    // Se for uma ferramenta que pode enviar notificações
    if (method === 'tools/call' && params.name === 'test_connection') {
      // Exemplo de como enviar uma notificação via SSE
      setTimeout(() => {
        if (sseConnections.has(sessionId)) {
          sendSSE(sseRes, 'message', {
            jsonrpc: '2.0',
            method: 'notifications/message',
            params: {
              level: 'info',
              message: 'Notificação de teste enviada 2 segundos após a execução'
            }
          });
        }
      }, 2000);
    }

  } catch (error) {
    console.error('Erro ao processar mensagem:', error);
    res.json({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: error.message
      },
      id
    });
  }
});

// ===== ENDPOINTS AUXILIARES =====

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    protocol: 'SSE',
    protocolVersion: '2024-11-05',
    server: 'mcp-server-remoto',
    version: '1.0.0',
    activeSessions: sseConnections.size,
    timestamp: new Date().toISOString()
  });
});

// Página principal
app.get('/', (req, res) => {
  res.json({
    name: 'MCP-server-remoto',
    protocol: 'SSE (Server-Sent Events)',
    protocolVersion: '2024-11-05',
    endpoints: {
      sse: '/sse',
      messages: '/messages?sessionId={sessionId}',
      health: '/health',
      test: '/test'
    }
  });
});

// Página de teste
app.get('/test', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>MCP SSE Server Test</title>
      <style>
        body { font-family: Arial; margin: 20px; max-width: 1000px; }
        .section { margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
        button { margin: 5px; padding: 10px 20px; cursor: pointer; }
        button:hover { background: #e0e0e0; }
        pre { background: #f5f5f5; padding: 15px; border-radius: 5px; overflow-x: auto; }
        .connected { color: green; }
        .disconnected { color: red; }
        #events { max-height: 300px; overflow-y: auto; }
        .event { margin: 5px 0; padding: 5px; background: #f0f0f0; }
      </style>
    </head>
    <body>
      <h1>MCP SSE Server - Teste</h1>
      
      <div class="section">
        <h3>Status da Conexão SSE</h3>
        <p>Status: <span id="status" class="disconnected">Desconectado</span></p>
        <p>Session ID: <span id="sessionId">-</span></p>
        <p>Endpoint: <span id="endpoint">-</span></p>
        <button onclick="connect()">Conectar SSE</button>
        <button onclick="disconnect()">Desconectar</button>
      </div>

      <div class="section">
        <h3>Testar Protocolo MCP</h3>
        <button onclick="initialize()" disabled>Initialize</button>
        <button onclick="listTools()" disabled>Listar Ferramentas</button>
        <button onclick="testHelloWorld()" disabled>Hello World</button>
        <button onclick="testConnection()" disabled>Test Connection</button>
      </div>

      <div class="section">
        <h3>Eventos SSE Recebidos</h3>
        <div id="events"></div>
      </div>

      <div class="section">
        <h3>Última Resposta</h3>
        <pre id="response">Conecte-se primeiro...</pre>
      </div>

      <script>
        let eventSource = null;
        let currentEndpoint = null;
        let currentSessionId = null;

        function connect() {
          if (eventSource) {
            eventSource.close();
          }

          eventSource = new EventSource('/sse');
          
          eventSource.addEventListener('endpoint', (e) => {
            const endpoint = JSON.parse(e.data);
            currentEndpoint = endpoint;
            currentSessionId = endpoint.split('sessionId=')[1];
            document.getElementById('endpoint').textContent = endpoint;
            document.getElementById('sessionId').textContent = currentSessionId;
            addEvent('Endpoint recebido: ' + endpoint);
            
            // Habilitar botões
            document.querySelectorAll('button[disabled]').forEach(btn => btn.disabled = false);
          });

          eventSource.addEventListener('message', (e) => {
            const data = JSON.parse(e.data);
            addEvent('Mensagem: ' + JSON.stringify(data));
          });

          eventSource.onopen = () => {
            document.getElementById('status').textContent = 'Conectado';
            document.getElementById('status').className = 'connected';
            addEvent('Conexão SSE estabelecida');
          };

          eventSource.onerror = (e) => {
            document.getElementById('status').textContent = 'Erro/Desconectado';
            document.getElementById('status').className = 'disconnected';
            addEvent('Erro na conexão SSE');
          };
        }

        function disconnect() {
          if (eventSource) {
            eventSource.close();
            eventSource = null;
          }
          document.getElementById('status').textContent = 'Desconectado';
          document.getElementById('status').className = 'disconnected';
          document.querySelectorAll('button:not(:first-child)').forEach(btn => btn.disabled = true);
          addEvent('Desconectado');
        }

        function addEvent(message) {
          const events = document.getElementById('events');
          const event = document.createElement('div');
          event.className = 'event';
          event.textContent = new Date().toLocaleTimeString() + ' - ' + message;
          events.appendChild(event);
          events.scrollTop = events.scrollHeight;
        }

        async function sendMessage(method, params = {}) {
          if (!currentEndpoint) {
            alert('Não conectado!');
            return;
          }

          try {
            const response = await fetch(currentEndpoint, {
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
            document.getElementById('response').textContent = JSON.stringify(data, null, 2);
            return data;
          } catch (error) {
            document.getElementById('response').textContent = 'Erro: ' + error.message;
          }
        }

        function initialize() { sendMessage('initialize'); }
        function listTools() { sendMessage('tools/list'); }
        function testHelloWorld() {
          const name = prompt('Digite seu nome:') || 'Teste';
          sendMessage('tools/call', { name: 'hello_world', arguments: { name } });
        }
        function testConnection() { sendMessage('tools/call', { name: 'test_connection' }); }
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
MCP SSE Server Remoto
Protocolo: Server-Sent Events (2024-11-05)
Porta: ${PORT}
===============================================
Endpoints:
- GET  /sse      (conexão SSE)
- POST /messages (mensagens JSON-RPC)
- GET  /health   (health check)
- GET  /test     (página de teste)
===============================================
  `);
});

// Limpar conexões ao desligar
process.on('SIGINT', () => {
  console.log('\nDesligando servidor...');
  sseConnections.forEach((res, sessionId) => {
    console.log(`Fechando conexão: ${sessionId}`);
    res.end();
  });
  process.exit(0);
});