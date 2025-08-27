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
    description: `Generates a link to view the lithological profile visualization for a specific well. 
    This tool should be used when the user asks for a "lithological profile" or "perfil litológico" of a well.
    The tool returns a direct link to the API that the user can click to view the profile externally.
    The visualization will open in the user's browser showing the lithological profile chart.`,
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
  },
  {
    name: "simple_image_test",
    description: `Tool de teste que retorna uma imagem em base64.
      
      Esta é uma ferramenta de desenvolvimento para testar como o Claude
      exibe imagens retornadas pelas tools do MCP.`,
    inputSchema: {
      type: "object",
      properties: {},
      required: []
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
      console.log("   🎨 Gerando link para perfil litológico");
        
      const wellName = args.wellName;
        
      if (!wellName) {
        throw new Error("Nome do poço não fornecido");
      }
        
      console.log("   Poço:", wellName);
        
      // Gerar o link direto para a API
      const apiUrl = `http://swk2adm1-001.k2sistemas.com.br/k2sigaweb/api/PerfisPocos/Perfis?nomePoco=${encodeURIComponent(wellName)}`;
      
      console.log("   ✅ Link gerado:", apiUrl);
      
      // Retornar uma mensagem amigável com o link
      const message = `🔗 **Perfil Litológico do Poço ${wellName}**

      Clique no link abaixo para visualizar o perfil litológico:
      ${apiUrl}

      ⚠️ **Nota:** O perfil será aberto em uma nova janela do navegador com a visualização completa do gráfico.`;
      
      return { 
        content: [{ type: "text", text: message }],
        isError: false
      };
    }

    case "simple_image_test": {
      // Quadrado azul 5x5 pixels - menor base64 possível
      const tinyBlueSquare = "iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAIAAADTED8xAAADMElEQVR4nOzVwQnAIBQFQYXff81RUkQCOyDj1YOPnbXWPmeTRef+/3O/OyBjzh3CD95BfqICMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMK0CMO0TAAD//2Anhf4QtqobAAAAAElFTkSuQmCC";
  
      return {
        content: [{
          type: "image",
          data: tinyBlueSquare,
          mimeType: "image/png"
        }],
        isError: false
      };
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