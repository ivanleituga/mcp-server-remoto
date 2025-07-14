const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Versão do servidor - você pode incrementar isso a cada atualização
const SERVER_VERSION = '1.0.0';

// Ferramenta Hello World simples
async function helloWorld(args) {
  const name = args.name || 'Mundo';
  return {
    success: true,
    data: `Olá, ${name}! Este é um MCP Server remoto!`,
    version: SERVER_VERSION
  };
}

// Endpoint principal
app.post('/mcp/execute', async (req, res) => {
  try {
    const { tool, arguments: args } = req.body;
    
    let result;
    
    switch (tool) {
      case 'hello_world':
        result = await helloWorld(args || {});
        break;
        
      default:
        throw new Error(`Ferramenta desconhecida: ${tool}`);
    }
    
    res.json(result);
  } catch (error) {
    console.error('Erro:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      version: SERVER_VERSION
    });
  }
});

// Listar ferramentas disponíveis
app.get('/mcp/tools', (req, res) => {
  res.json({
    version: SERVER_VERSION,
    tools: [
      {
        name: 'hello_world',
        description: 'Retorna uma mensagem de Hello World',
        parameters: {
          name: 'string (opcional) - Nome para cumprimentar'
        }
      }
    ]
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    server: 'mcp-hello-world',
    version: SERVER_VERSION,
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`MCP Server v${SERVER_VERSION} rodando na porta ${PORT}`);
});