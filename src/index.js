const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const { Pool } = require('pg');

const app = express();

// CORS atualizado
app.use(cors({
  origin: '*',
  exposedHeaders: ['Mcp-Session-Id']
}));

app.use(express.json());

// Logging melhorado
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  if (req.body?.method) {
    console.log(`[${timestamp}] ${req.method} ${req.url} - Method: ${req.body.method}`);
  }
  next();
});

// Configuração do banco de dados
const pool = new Pool({
  user: process.env.DB_USER || "postgres",
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_NAME || "DEBUG_REATE",
  password: process.env.DB_PASSWORD || "k2123",
  port: process.env.DB_PORT || 5432,
});

// Schema do banco
const schema = `
-- Tabela contendo informações sobre litologia
CREATE TABLE welllithology_view (
  "ID" INT,
  "Poço" TEXT,
  "Bacia" TEXT,
  "Categoria do Poço" TEXT,
  "Topo" REAL,
  "Cota Topo" REAL,
  "Verticalizado?" BOOL,
  "Base" REAL,
  "Cota Base" REAL,
  "Rocha" TEXT,
  "Cor" TEXT,
  "Tonalidade" TEXT,
  "Granulometria" TEXT,
  "Arredondamento" TEXT
);

-- Tabela contendo informações sobre unidades medidas
CREATE TABLE wellmeasuredunits_view (
  "ID" INT,
  "Poço" TEXT,
  "Bacia" TEXT,
  "Categoria do Poço" TEXT,
  "Tipo" TEXT,
  "Qualidade" TEXT,
  "Método" TEXT,
  "Nome" TEXT,
  "Código" INT,
  "Topo" REAL,
  "Descrição do Topo" TEXT,
  "Base" REAL,
  "Descrição da Base" TEXT,
  "E/W" TEXT,
  "N/S" TEXT,
  "Fonte da Interpretação" TEXT,
  "Data" DATE
);`;

// Função para executar queries
async function query(sql) {
  const client = await pool.connect();
  try {
    const result = await client.query(sql);
    return result.rows;
  } finally {
    client.release();
  }
}

// Armazenamento de sessões
const sessions = {};

// Definição das ferramentas - ATUALIZADO com title e outputSchema
const tools = [
  {
    name: 'fetch_well_database_schema',
    title: 'Buscar Schema do Banco', // NOVO: title adicionado
    description: `Returns the full and authoritative schema of the well/basin database.
    
    Usage:
    - This tool must always be called before using the 'query_well_database' tool.
    - The returned schema should be treated as the only valid source of table and column names.
    - Do not assume or infer any additional structures not explicitly listed here.
    
    Tables are provided in PostgreSQL 'CREATE TABLE' syntax for clarity.`,
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    },
    // NOVO: outputSchema para validação
    outputSchema: {
      type: 'object',
      properties: {
        content: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['text'] },
              text: { type: 'string' }
            }
          }
        }
      }
    }
  },
  {
    name: 'query_well_database',
    title: 'Consultar Banco de Dados', // NOVO: title
    description: `You are a PostgreSQL assistant specialized in querying geological well and basin data.

    You will receive natural language questions and must respond by generating only valid SELECT statements.

    Schema Reference:
    - Only use tables and columns from the tool 'fetch_well_database_schema'.
    - Do not infer or invent any tables or columns.

    Formatting Rules:
    - Use ILIKE and unaccent() for any string comparisons (case-insensitive, accent-insensitive).
    - Do not include semicolons.
    - Do not generate DDL or DML statements (e.g., CREATE, UPDATE, DELETE, INSERT).`,
    inputSchema: {
      type: 'object',
      properties: {
        sql: {
          type: 'string',
          description: 'SQL SELECT query, no semicolons, no DDL/DML.'
        }
      },
      required: ['sql']
    }
  },
  {
    name: 'generate_lithological_profile',
    title: 'Gerar Perfil Litológico', // NOVO: title
    description: `Generates a lithological profile visualization for a specific well. 
    This tool should be used DIRECTLY when the user asks for a "lithological profile" or "perfil litológico" of a well.
    DO NOT query the database first - this tool handles everything internally.
    The tool identifies the requested well name and sends it to the API which returns an HTML with the chart. 
    IMPORTANT: The assistant must ALWAYS automatically create an artifact of type 'text/html' 
    with the HTML content returned by the API, allowing direct rendered visualization in the interface.
    IMPORTANT: Create the artifact with the HTML content EXACTLY as returned by the API,
    without adding, removing, or modifying ANYTHING.`,
    inputSchema: {
      type: 'object',
      properties: {
        wellName: {
          type: 'string',
          description: 'ONLY the well name (e.g., 2-AA-2-SP, 1-BAR-2-AL, 3-BRSA-123-RJS, etc)'
        }
      },
      required: ['wellName']
    },
    // NOVO: annotations para comportamento da ferramenta
    annotations: {
      audience: ['user', 'assistant'],
      priority: 1.0
    }
  }
];

// Execução das ferramentas - ATUALIZADO com isError e structuredContent
async function executeTool(toolName, args = {}) {
  try {
    switch (toolName) {
      case 'fetch_well_database_schema':
        return {
          content: [{
            type: 'text',
            text: schema
          }],
          isError: false // NOVO: indicador de erro
        };
      
      case 'query_well_database':
        try {
          const data = await query(args.sql);
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(data, null, 2)
            }],
            // NOVO: structuredContent para dados estruturados
            structuredContent: data,
            isError: false
          };
        } catch (err) {
          return {
            content: [{
              type: 'text',
              text: `Erro ao executar consulta: ${err.message}`
            }],
            isError: true // NOVO: marcando como erro
          };
        }
      
      case 'generate_lithological_profile':
        try {
          const encodedWellName = encodeURIComponent(args.wellName);
          const url = `http://swk2adm1-001.k2sistemas.com.br/k2sigaweb/api/PerfisPocos/Perfis?nomePoco=${encodedWellName}`;
          
          const response = await fetch(url, {
            method: "GET",
            headers: {
              "Accept": "text/html"
            }
          });
          
          if (!response.ok) {
            throw new Error(`API returned error: ${response.status} ${response.statusText}`);
          }
          
          const html = await response.text();
          
          return {
            content: [{
              type: 'text',
              text: html,
              // NOVO: annotations para conteúdo
              annotations: {
                audience: ['user'],
                priority: 1.0
              }
            }],
            isError: false
          };
        } catch (err) {
          return {
            content: [{
              type: 'text',
              text: `Error generating lithological profile: ${err.message}`
            }],
            isError: true
          };
        }
      
      default:
        throw new Error(`Tool not found: ${toolName}`);
    }
  } catch (error) {
    // NOVO: tratamento de erro padrão
    return {
      content: [{
        type: 'text',
        text: `Unexpected error: ${error.message}`
      }],
      isError: true
    };
  }
}

// ENDPOINT PRINCIPAL - ATUALIZADO
app.post('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  const { jsonrpc, method, params, id } = req.body;
  
  try {
    // Initialize - ATUALIZADO com listChanged
    if (method === 'initialize') {
      const newSessionId = uuidv4();
      sessions[newSessionId] = { 
        created: new Date(),
        protocolVersion: '2025-06-18' // NOVO: versão do protocolo
      };
      
      res.setHeader('Mcp-Session-Id', newSessionId);
      
      return res.json({
        jsonrpc: '2.0',
        result: {
          protocolVersion: '2025-06-18', // ATUALIZADO
          capabilities: {
            tools: {
              listChanged: false // NOVO: indicador de mudança na lista
            },
            prompts: {},
            resources: {}
          },
          serverInfo: {
            name: 'mcp-well-database',
            version: '1.0.0'
          }
        },
        id
      });
    }
    
    // Validar sessão
    if (!sessionId || !sessions[sessionId]) {
      return res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Session required'
        },
        id
      });
    }
    
    // Atualizar último acesso
    sessions[sessionId].lastAccess = new Date();
    
    // Processar métodos
    let result;
    switch (method) {
      case 'tools/list':
        // NOVO: suporte a paginação
        const cursor = params?.cursor;
        // Por enquanto, retornamos todas as ferramentas
        result = { 
          tools,
          nextCursor: null // Sem paginação por enquanto
        };
        break;
        
      case 'prompts/list':
        result = { 
          prompts: [],
          nextCursor: null
        };
        break;
        
      case 'resources/list':
        result = { 
          resources: [],
          nextCursor: null
        };
        break;
        
      case 'tools/call':
        result = await executeTool(params.name, params.arguments);
        break;
        
      case 'notifications/initialized':
        result = {};
        break;
        
      default:
        return res.status(404).json({
          jsonrpc: '2.0',
          error: {
            code: -32601,
            message: `Method not found: ${method}`
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
    console.error('Error:', error);
    res.status(500).json({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: error.message,
        data: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      id
    });
  }
});

// Health check com mais informações
app.get('/health', async (req, res) => {
  try {
    // Testar conexão com banco
    await pool.query('SELECT 1');
    res.json({ 
      status: 'healthy',
      database: 'connected',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({ 
      status: 'unhealthy',
      database: 'disconnected',
      error: error.message
    });
  }
});

// Informações do servidor - ATUALIZADO
app.get('/', (req, res) => {
  res.json({
    name: 'mcp-well-database',
    version: '1.0.0',
    protocolVersion: '2025-06-18',
    endpoint: '/mcp',
    capabilities: ['tools', 'prompts', 'resources'],
    tools: tools.map(t => ({ name: t.name, title: t.title }))
  });
});

// Cleanup de sessões antigas
setInterval(() => {
  const now = new Date();
  const timeout = 30 * 60 * 1000; // 30 minutos
  
  Object.entries(sessions).forEach(([id, session]) => {
    const lastActivity = session.lastAccess || session.created;
    if (now - lastActivity > timeout) {
      delete sessions[id];
      console.log(`Session ${id} expired and removed`);
    }
  });
}, 5 * 60 * 1000); // Executar a cada 5 minutos

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 MCP Well Database Server`);
  console.log(`📍 Port: ${PORT}`);
  console.log(`🔗 Endpoint: /mcp`);
  console.log(`📋 Protocol: 2025-06-18`);
  console.log(`📊 Database: ${process.env.DB_NAME || 'DEBUG_REATE'}`);
  console.log(`🔧 Tools: ${tools.length}`);
});