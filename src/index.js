require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const { Pool } = require('pg');

const app = express();

// CORS simples
app.use(cors({
  origin: '*',
  exposedHeaders: ['Mcp-Session-Id']
}));

app.use(express.json());

// Logging básico
app.use((req, res, next) => {
  if (req.body?.method) {
    console.log(`[${new Date().toISOString()}] ${req.body.method}`);
  }
  next();
});

// Configuração do banco de dados
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  // Adicionar timeouts e configurações de reconexão
  connectionTimeoutMillis: 10000, // 10 segundos para timeout de conexão
  idleTimeoutMillis: 30000, // 30 segundos idle timeout
  max: 20, // máximo de conexões no pool
  allowExitOnIdle: true,
  // Tentar com e sem SSL
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

// Debug das variáveis
console.log('🔍 Configuração do banco:');
console.log('Host:', process.env.DB_HOST || 'NÃO DEFINIDO');
console.log('Port:', process.env.DB_PORT || 'NÃO DEFINIDO');
console.log('Database:', process.env.DB_NAME || 'NÃO DEFINIDO');
console.log('User:', process.env.DB_USER || 'NÃO DEFINIDO');

// Estado da conexão
let dbConnected = false;

// Testar conexão
async function testConnection() {
  try {
    console.log(`🔌 Tentando conectar em ${process.env.DB_HOST}:${process.env.DB_PORT}...`);
    const startTime = Date.now();
    
    const client = await pool.connect();
    const elapsed = Date.now() - startTime;
    
    console.log(`✅ Banco de dados conectado com sucesso em ${elapsed}ms!`);
    
    // Testar uma query simples
    const result = await client.query('SELECT current_database(), current_user, version()');
    console.log('📊 Informações do banco:', result.rows[0]);
    
    dbConnected = true;
    client.release();
  } catch (err) {
    console.error('❌ Falha na conexão com o banco:');
    console.error('Mensagem:', err.message);
    if (err.code) console.error('Código:', err.code);
    console.error('Stack:', err.stack);
    dbConnected = false;
  }
}

// Testar conexão na inicialização
testConnection();

// Tentar reconectar a cada 30 segundos se desconectado
setInterval(() => {
  if (!dbConnected) {
    console.log('🔄 Tentando reconectar ao banco...');
    testConnection();
  }
}, 30000);

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

// Função para executar queries com melhor tratamento de erro
async function query(sql) {
  if (!dbConnected) {
    throw new Error('Banco de dados não está conectado. Verifique se o servidor PostgreSQL está acessível e as credenciais estão corretas.');
  }
  
  let client;
  try {
    // Timeout de 30 segundos para a query
    client = await pool.connect();
    const result = await client.query({
      text: sql,
      rowMode: 'array',
      timeout: 30000 // 30 segundos
    });
    
    // Converter de volta para objetos
    const rows = result.rows.map(row => {
      const obj = {};
      result.fields.forEach((field, i) => {
        obj[field.name] = row[i];
      });
      return obj;
    });
    
    return rows;
  } catch (err) {
    console.error('Erro na query:', err.message);
    throw err;
  } finally {
    if (client) {
      client.release();
    }
  }
}

// Armazenamento de sessões
const sessions = {};

// Definição das ferramentas
const tools = [
  {
    name: 'fetch_well_database_schema',
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
    }
  },
  {
    name: 'query_well_database',
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
    }
  }
];

// Execução das ferramentas
async function executeTool(toolName, args = {}) {
  switch (toolName) {
    case 'fetch_well_database_schema':
      return {
        content: [{
          type: 'text',
          text: schema
        }]
      };
    
    case 'query_well_database':
      try {
        console.log('🔍 Executando query:', args.sql);
        const startTime = Date.now();
        
        const data = await query(args.sql);
        
        const duration = Date.now() - startTime;
        console.log(`✅ Query executada em ${duration}ms, ${data.length} linhas retornadas`);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(data, null, 2)
          }]
        };
      } catch (err) {
        console.error('❌ Erro na query:', err);
        return {
          content: [{
            type: 'text',
            text: `Erro ao executar consulta: ${err.message}\n\nVerifique se:\n1. O banco de dados está acessível\n2. As credenciais estão corretas\n3. O servidor permite conexões externas\n4. A porta ${process.env.DB_PORT} está aberta`
          }]
        };
      }
    
    case 'generate_lithological_profile':
      try {
        const encodedWellName = encodeURIComponent(args.wellName);
        const url = `http://swk2adm1-001.k2sistemas.com.br/k2sigaweb/api/PerfisPocos/Perfis?nomePoco=${encodedWellName}`;
        
        console.log('🔍 Buscando perfil litológico:', url);
        
        const response = await fetch(url, {
          method: "GET",
          headers: {
            "Accept": "text/html"
          },
          signal: AbortSignal.timeout(30000) // 30 segundos timeout
        });
        
        if (!response.ok) {
          throw new Error(`API returned error: ${response.status} ${response.statusText}`);
        }
        
        const html = await response.text();
        console.log('✅ Perfil litológico recebido com sucesso');
        
        return {
          content: [{
            type: 'text',
            text: html
          }]
        };
      } catch (err) {
        console.error('❌ Erro ao gerar perfil:', err);
        return {
          content: [{
            type: 'text',
            text: `Error generating lithological profile: ${err.message}`
          }]
        };
      }
    
    default:
      throw new Error(`Tool not found: ${toolName}`);
  }
}

// ENDPOINT PRINCIPAL
app.post('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  const { jsonrpc, method, params, id } = req.body;
  
  try {
    // Initialize
    if (method === 'initialize') {
      const newSessionId = uuidv4();
      sessions[newSessionId] = { created: new Date() };
      
      res.setHeader('Mcp-Session-Id', newSessionId);
      
      return res.json({
        jsonrpc: '2.0',
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {},
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
    
    // Validar sessão para outros métodos
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
    
    // Processar métodos
    let result;
    switch (method) {
      case 'tools/list':
        result = { tools };
        break;
        
      case 'prompts/list':
        result = { prompts: [] };
        break;
        
      case 'resources/list':
        result = { resources: [] };
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
    console.error('Error:', error.message);
    res.status(500).json({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: error.message
      },
      id
    });
  }
});

// Health check com status do banco
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    database: dbConnected ? 'Connected' : 'Disconnected'
  });
});

// Informações do servidor
app.get('/', (req, res) => {
  res.json({
    name: 'mcp-well-database',
    version: '1.0.0',
    endpoint: '/mcp',
    database: {
      connected: dbConnected,
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      database: process.env.DB_NAME
    }
  });
});

// Endpoint de teste de conexão manual
app.get('/test-connection', async (req, res) => {
  console.log('🧪 Teste manual de conexão iniciado...');
  
  const testPool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    connectionTimeoutMillis: 5000, // 5 segundos apenas para o teste
    max: 1
  });
  
  try {
    const startTime = Date.now();
    const client = await testPool.connect();
    const connectTime = Date.now() - startTime;
    
    const result = await client.query('SELECT NOW() as current_time');
    client.release();
    await testPool.end();
    
    res.json({
      success: true,
      connectTime: `${connectTime}ms`,
      serverTime: result.rows[0].current_time,
      config: {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        database: process.env.DB_NAME,
        user: process.env.DB_USER
      }
    });
  } catch (err) {
    await testPool.end();
    res.status(500).json({
      success: false,
      error: err.message,
      code: err.code,
      config: {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        database: process.env.DB_NAME,
        user: process.env.DB_USER
      }
    });
  }
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 MCP Well Database Server`);
  console.log(`📍 Port: ${PORT}`);
  console.log(`🔗 Endpoint: /mcp`);
});