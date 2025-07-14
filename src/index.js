const express = require('express');
const cors = require('cors');
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');

// Criar servidor Express para manter o processo vivo no Render
const app = express();
app.use(cors());
app.use(express.json());

// Criar o servidor MCP
const mcpServer = new Server(
  {
    name: 'mcp-server-remoto',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Registrar ferramentas no MCP
mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'hello_world',
        description: 'Retorna uma mensagem de boas-vindas',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Nome para cumprimentar',
            },
          },
          required: ['name'],
        },
      },
      {
        name: 'test_connection',
        description: 'Testa a conexão com o servidor MCP',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ],
  };
});

// Implementar as ferramentas no MCP
mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'hello_world':
      const userName = args.name || 'Mundo';
      return {
        content: [
          {
            type: 'text',
            text: `Olá, ${userName}! 👋 Sou o MCP Server Remoto e estou funcionando!`,
          },
        ],
      };

    case 'test_connection':
      return {
        content: [
          {
            type: 'text',
            text: `✅ Conexão estabelecida com sucesso! Servidor MCP Remoto está online.`,
          },
        ],
      };

    default:
      throw new Error(`Ferramenta desconhecida: ${name}`);
  }
});

// ===== ENDPOINTS HTTP PARA COMPATIBILIDADE =====

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    server: 'mcp-server-remoto',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    mode: process.argv.includes('--stdio') ? 'stdio' : 'http'
  });
});

// Listar ferramentas via HTTP (para debug)
app.get('/mcp/tools', (req, res) => {
  res.json({
    version: '1.0.0',
    tools: [
      {
        name: 'hello_world',
        description: 'Retorna uma mensagem de Hello World',
        parameters: {
          name: 'string (opcional) - Nome para cumprimentar'
        }
      },
      {
        name: 'test_connection',
        description: 'Testa a conexão com o servidor',
        parameters: {}
      }
    ]
  });
});

// Executar ferramenta via HTTP (para testes)
app.post('/mcp/execute', async (req, res) => {
  try {
    const { tool, arguments: args } = req.body;
    
    let result;
    
    switch (tool) {
      case 'hello_world':
        result = {
          success: true,
          data: `Olá, ${args?.name || 'Mundo'}! Este é o MCP Server via HTTP!`
        };
        break;
        
      case 'test_connection':
        result = {
          success: true,
          data: 'Conexão HTTP funcionando!'
        };
        break;
        
      default:
        throw new Error(`Ferramenta desconhecida: ${tool}`);
    }
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message
    });
  }
});

// Endpoint para simular MCP sobre HTTP (experimental)
app.post('/mcp', async (req, res) => {
  try {
    const { method, params, id } = req.body;
    
    // Simular protocolo JSON-RPC
    if (method === 'tools/list') {
      const tools = await mcpServer.handleRequest(ListToolsRequestSchema, params || {});
      res.json({
        jsonrpc: '2.0',
        result: tools,
        id: id || 1
      });
    } else if (method === 'tools/call') {
      const result = await mcpServer.handleRequest(CallToolRequestSchema, params);
      res.json({
        jsonrpc: '2.0',
        result: result,
        id: id || 1
      });
    } else {
      res.json({
        jsonrpc: '2.0',
        error: {
          code: -32601,
          message: 'Method not found'
        },
        id: id || 1
      });
    }
  } catch (error) {
    res.json({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: error.message
      },
      id: req.body.id || 1
    });
  }
});

// ===== INICIALIZAÇÃO =====

// Se executado com --stdio, conectar via stdio (para uso local)
if (process.argv.includes('--stdio')) {
  console.error('Iniciando em modo stdio...');
  const transport = new StdioServerTransport();
  mcpServer.connect(transport).then(() => {
    console.error('Servidor MCP conectado via stdio');
  }).catch(console.error);
} else {
  // Caso contrário, iniciar servidor HTTP (para Render)
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Servidor HTTP rodando na porta ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
    console.log(`Ferramentas: http://localhost:${PORT}/mcp/tools`);
  });
}

// Manter o processo vivo
process.on('SIGINT', () => {
  console.log('Servidor finalizado');
  process.exit(0);
});