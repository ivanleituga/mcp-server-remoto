const { schema } = require("../utils/db_schema");

const tools = [
  {
    name: "fetch_well_database_schema",
    description: `Returns the full and authoritative schema of the well/basin database.
    
    Usage:
    - This tool must always be called before using the 'query_well_database' tool.
    - The returned schema should be treated as the only valid source of table and column names.
    - Do not assume or infer any additional structures not explicitly listed here.
    
    Tables are provided in PostgreSQL 'CREATE TABLE' syntax for clarity.`,
    inputSchema: {
      type: "object",
      properties: {},
      required: []
    }
  },
  {
    name: "query_well_database",
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
      type: "object",
      properties: {
        sql: {
          type: "string",
          description: "SQL SELECT query, no semicolons, no DDL/DML."
        }
      },
      required: ["sql"]
    }
  },
  {
    name: "generate_lithological_profile",
    description: `Generates a lithological profile visualization for a specific well. 
    This tool should be used DIRECTLY when the user asks for a "lithological profile" or "perfil litológico" of a well.
    DO NOT query the database first - this tool handles everything internally.
    The tool identifies the requested well name and sends it to the API which returns an HTML with the chart. 
    IMPORTANT: The assistant must ALWAYS automatically create an artifact of type 'text/html' 
    with the HTML content returned by the API, allowing direct rendered visualization in the interface.
    IMPORTANT: Create the artifact with the HTML content EXACTLY as returned by the API,
    without adding, removing, or modifying ANYTHING.`,
    inputSchema: {
      type: "object",
      properties: {
        wellName: {
          type: "string",
          description: "ONLY the well name (e.g., 2-AA-2-SP, 1-BAR-2-AL, 3-BRSA-123-RJS, etc)"
        }
      },
      required: ["wellName"]
    }
  }
];

async function executeTool(toolName, args = {}, queryFn) {
  console.log("\n🔨 executeTool chamado:");
  console.log("   Tool:", toolName);
  console.log("   Args recebidos:", JSON.stringify(args, null, 2));
  
  try {
    switch (toolName) {
    case "fetch_well_database_schema":
      console.log("   ✅ Retornando schema");
      return { 
        content: [{ type: "text", text: schema }],
        isError: false
      };
      
    case "query_well_database": {
      console.log("   🔍 Executando query_well_database");
        
      // O SDK já passa os argumentos desempacotados
      const sql = args.sql;
        
      console.log("   SQL extraído:", sql);
        
      if (!sql) {
        throw new Error(`SQL query não fornecida. Recebido: ${JSON.stringify(args)}`);
      }
        
      try {
        console.log("   📊 Executando query no banco...");
        const data = await queryFn(sql);
        console.log(`   ✅ Query executada: ${data.length} registros`);
          
        return { 
          content: [{ 
            type: "text", 
            text: JSON.stringify(data, null, 2) 
          }],
          isError: false
        };
      } catch (err) {
        console.error("   ❌ Erro na query:", err.message);
        return { 
          content: [{ 
            type: "text", 
            text: `Erro na query: ${err.message}` 
          }],
          isError: true
        };
      }
    }
      
    case "generate_lithological_profile": {
      console.log("   🎨 Gerando perfil litológico");
        
      const wellName = args.wellName;
        
      if (!wellName) {
        throw new Error("Nome do poço não fornecido");
      }
        
      console.log("   Poço:", wellName);
        
      try {
        const url = `http://swk2adm1-001.k2sistemas.com.br/k2sigaweb/api/PerfisPocos/Perfis?nomePoco=${encodeURIComponent(wellName)}`;
        console.log("   Fazendo request para:", url);
          
        const response = await fetch(url, {
          headers: { "Accept": "text/html" },
          signal: AbortSignal.timeout(30000)
        });
          
        if (!response.ok) {
          throw new Error(`API retornou erro: ${response.status}`);
        }
          
        const html = await response.text();
        console.log("   ✅ HTML recebido:", html.length, "caracteres");
          
        return { 
          content: [{ type: "text", text: html }],
          isError: false
        };
      } catch (err) {
        console.error("   ❌ Erro ao gerar perfil:", err.message);
        return { 
          content: [{ 
            type: "text", 
            text: `Erro ao gerar perfil: ${err.message}` 
          }],
          isError: true
        };
      }
    }
      
    default:
      throw new Error(`Ferramenta não encontrada: ${toolName}`);
    }
  } catch (error) {
    console.error("   ❌ Erro geral:", error.message);
    return {
      content: [{ 
        type: "text", 
        text: `Erro: ${error.message}` 
      }],
      isError: true
    };
  }
}

module.exports = { tools, executeTool };