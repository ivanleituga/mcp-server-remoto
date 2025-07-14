const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// ===== IMPLEMENTAÇÃO PARA CONECTOR PERSONALIZADO DO CLAUDE =====

// Endpoint principal que o Claude chama
app.post('/', async (req, res) => {
  try {
    console.log('Requisição recebida:', JSON.stringify(req.body, null, 2));
    
    const { method, params, id } = req.body;
    
    // Roteamento baseado no método JSON-RPC
    switch (method) {
      case 'initialize':
        res.json({
          jsonrpc: '2.0',
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {}
            },
            serverInfo: {
              name: 'mcp-server-remoto',
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
                  properties: {},
                  required: []
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
        
        console.log(`Chamando ferramenta: ${toolName}`, args);
        
        let content;
        
        switch (toolName) {
          case 'hello_world':
            content = [{
              type: 'text',
              text: `Olá, ${args.name || 'Mundo'}! 👋 Sou o MCP Server Remoto e estou funcionando perfeitamente!`
            }];
            break;
            
          case 'test_connection':
            content = [{
              type: 'text',
              text: '✅ Conexão estabelecida com sucesso! Servidor MCP Remoto está online e pronto para uso.'
            }];
            break;
            
          default:
            res.json({
              jsonrpc: '2.0',
              error: {
                code: -32601,
                message: `Ferramenta desconhecida: ${toolName}`
              },
              id
            });
            return;
        }
        
        res.json({
          jsonrpc: '2.0',
          result: {
            content,
            isError: false
          },
          id
        });
        break;
        
      default:
        console.log(`Método não implementado: ${method}`);
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
    console.error('Erro no processamento:', error);
    res.json({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: error.message
      },
      id: req.body.id
    });
  }
});

// Endpoint OPTIONS para CORS
app.options('/', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.sendStatus(200);
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    server: 'mcp-server-remoto',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    protocol: 'jsonrpc'
  });
});

// Informações na raiz (GET)
app.get('/', (req, res) => {
  res.json({
    message: 'MCP Server Remoto - Conector Personalizado',
    version: '1.0.0',
    status: 'online',
    usage: 'POST / com JSON-RPC 2.0',
    methods: ['initialize', 'tools/list', 'tools/call']
  });
});

// Log de todas as requisições para debug
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`, req.body);
  next();
});

// ===== INICIALIZAÇÃO =====

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`MCP Server Remoto rodando na porta ${PORT}`);
  console.log(`Protocolo: JSON-RPC 2.0`);
  console.log(`Health: http://localhost:${PORT}/health`);
});