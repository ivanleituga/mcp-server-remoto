const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');

// Criar o servidor MCP
const server = new Server(
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

// Registrar a ferramenta hello_world
server.setRequestHandler(ListToolsRequestSchema, async () => {
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

// Implementar as ferramentas
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'hello_world':
      const userName = args.name || 'Mundo';
      return {
        content: [
          {
            type: 'text',
            text: `Olá, ${userName}! 👋 Sou o MCP Server Remoto e estou funcionando perfeitamente!`,
          },
        ],
      };

    case 'test_connection':
      return {
        content: [
          {
            type: 'text',
            text: `✅ Conexão estabelecida com sucesso! Servidor MCP Remoto está online e pronto para uso.`,
          },
        ],
      };

    default:
      throw new Error(`Ferramenta desconhecida: ${name}`);
  }
});

// Função principal assíncrona
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('MCP Server Remoto iniciado via stdio');
}

// Tratamento de erros
main().catch((error) => {
  console.error('Erro ao iniciar servidor:', error);
  process.exit(1);
});