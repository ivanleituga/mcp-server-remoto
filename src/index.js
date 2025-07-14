const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Configuração do servidor
const SERVER_INFO = {
  name: 'mcp-server-remoto',
  version: '1.0.0',
  description: 'Servidor MCP remoto para ferramentas ANP'
};

// ===== ENDPOINTS NECESSÁRIOS PARA O CLAUDE =====

// 1. Endpoint de descoberta (OBRIGATÓRIO)
app.get('/.well-known/mcp/manifest.json', (req, res) => {
  res.json({
    name: SERVER_INFO.name,
    version: SERVER_INFO.version,
    description: SERVER_INFO.description,
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
  });
});

// 2. Endpoint principal do MCP (OBRIGATÓRIO)
app.post('/mcp/v1/invoke', async (req, res) => {
  try {
    const { tool, arguments: args } = req.body;
    
    console.log(`Ferramenta chamada: ${tool}`, args);
    
    let result;
    
    switch (tool) {
      case 'hello_world':
        const name = args?.name || 'Mundo';
        result = {
          content: [
            {
              type: 'text',
              text: `Olá, ${name}! 👋 Sou o MCP Server Remoto e estou funcionando perfeitamente!`
            }
          ]
        };
        break;
        
      case 'test_connection':
        result = {
          content: [
            {
              type: 'text',
              text: '✅ Conexão estabelecida com sucesso! Servidor MCP Remoto está online e pronto para uso.'
            }
          ]
        };
        break;
        
      default:
        return res.status(404).json({
          error: `Ferramenta desconhecida: ${tool}`
        });
    }
    
    res.json(result);
  } catch (error) {
    console.error('Erro ao executar ferramenta:', error);
    res.status(500).json({ 
      error: error.message 
    });
  }
});

// 3. Listar ferramentas (OBRIGATÓRIO)
app.get('/mcp/v1/tools', (req, res) => {
  res.json({
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
  });
});

// ===== ENDPOINTS AUXILIARES =====

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    server: SERVER_INFO.name,
    version: SERVER_INFO.version,
    timestamp: new Date().toISOString()
  });
});

// Raiz - retorna informações básicas
app.get('/', (req, res) => {
  res.json({
    message: 'MCP Server Remoto está funcionando!',
    version: SERVER_INFO.version,
    endpoints: {
      manifest: '/.well-known/mcp/manifest.json',
      tools: '/mcp/v1/tools',
      invoke: '/mcp/v1/invoke',
      health: '/health'
    }
  });
});

// ===== INICIALIZAÇÃO =====

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`MCP Server Remoto v${SERVER_INFO.version}`);
  console.log(`Rodando na porta ${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health`);
  console.log(`Manifest: http://localhost:${PORT}/.well-known/mcp/manifest.json`);
});

// Tratamento de erros
process.on('unhandledRejection', (error) => {
  console.error('Erro não tratado:', error);
});