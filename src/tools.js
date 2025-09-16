const { schema } = require("../utils/db_schema");

const tools = [
  {
    name: "fetch_well_database_schema",
    description: `Returns the full and authoritative schema of the well/basin database.
    
    Usage:
    - Only fetch the schema when you need to write SQL queries to search for specific data in the database tables.
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
    name: "get_well_curves",
    description: `Retrieves available curves for a specific well.
    Use this tool to check which curves are available for a well before generating a composite profile link.
    This tool should be called BEFORE generate_composite_profile_link to ensure the selected curves exist for the well.`,
    inputSchema: {
      type: "object",
      properties: {
        wellName: {
          type: "string",
          description: "ONLY the well name (e.g., 1-SL-1-RN, 2-RJ-3-BA)"
        }
      },
      required: ["wellName"]
    }
  },
  {
    name: "generate_composite_profile_link",
    description: `Generates a link to the Composite Profile Viewer application for a specific well with selected curves.
    Use this tool when the user wants to visualize a composite profile with specific curves.
    Maximum 3 curves can be selected at once (minimum 1 curve).
    Important: Call get_well_curves first to verify which curves are available for the well.
    CRITICAL: Use the EXACT curve names as returned by get_well_curves tool - do not abbreviate or translate them.
    NOTE: This tool does NOT require fetching database schema or querying well information - it only needs the well name and curve names.`,
    inputSchema: {
      type: "object",
      properties: {
        wellName: {
          type: "string",
          description: "The well name/ID (e.g., 1-SL-1-RN)"
        },
        curves: {
          type: "array",
          description: "Array of curve names to display (max 3). Must use EXACT names as returned by get_well_curves (e.g., 'Raios gama', 'Potencial espontâneo', 'Sônico', 'Caliper') - DO NOT use abbreviations like GR, SP, DT, CALI",
          items: {
            type: "string"
          },
          maxItems: 3,
          minItems: 1
        },
        includeLithology: {
          type: "boolean",
          description: "Whether to include lithology column in the profile (default: true)",
          default: true
        }
      },
      required: ["wellName", "curves"]
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
        
      const apiUrl = `http://swk2adm1-001.k2sistemas.com.br/k2sigaweb/api/PerfisPocos/Perfis?nomePoco=${encodeURIComponent(wellName)}`;
      
      console.log("   ✅ Link gerado:", apiUrl);
      
      const message = `🔗 **Perfil Litológico do Poço ${wellName}**

      Clique no link abaixo para visualizar o perfil litológico:
      ${apiUrl}

      ⚠️ **Nota:** O perfil será aberto em uma nova janela do navegador com a visualização completa do gráfico.`;
      
      return { 
        content: [{ type: "text", text: message }],
        isError: false
      };
    }

    case "get_well_curves": {
      console.log("   🔍 Buscando curvas disponíveis para o poço");
  
      const wellName = args.wellName;
  
      if (!wellName) {
        throw new Error("Nome do poço não fornecido");
      }
  
      try {
        // Chamar API real para buscar curvas
        const response = await fetch(`http://swk2adm1-001.k2sistemas.com.br:9095/curves?well=${wellName}`);
        
        if (!response.ok) {
          throw new Error(`API retornou erro: ${response.status}`);
        }
        
        const data = await response.json();
        
        const message = data.count > 0 
          ? `📊 **Curvas disponíveis para o poço ${wellName}:**\n\n${data.curves.join(", ")}\n\nVocê pode selecionar até 3 curvas para o perfil composto.`
          : `⚠️ Nenhuma curva encontrada para o poço ${wellName}`;
    
        return {
          content: [{ type: "text", text: message }],
          isError: false
        };
      } catch (error) {
        console.error("   ❌ Erro ao buscar curvas:", error.message);
        return {
          content: [{ type: "text", text: `Erro ao buscar curvas: ${error.message}` }],
          isError: true
        };
      }
    }

    case "generate_composite_profile_link": {
      console.log("   🎨 Gerando link para perfil composto");
  
      const { wellName, curves, includeLithology = true } = args;
  
      if (!wellName || !curves || curves.length === 0) {
        throw new Error("Nome do poço e curvas são obrigatórios");
      }
  
      if (curves.length > 3) {
        throw new Error("Máximo de 3 curvas permitidas");
      }
  
      // URL de produção ou localhost conforme ambiente
      const baseUrl = "http://localhost:3001";
      
      const params = new URLSearchParams({
        well: wellName,
        curves: curves.join(","),
        lito: includeLithology.toString()
      });
  
      const fullUrl = `${baseUrl}/?${params.toString()}`;
  
      console.log("   ✅ Link gerado:", fullUrl);
  
      const message = `🔗 **Perfil Composto do Poço ${wellName}**

      Curvas selecionadas: ${curves.join(", ")}
      Litologia: ${includeLithology ? "Incluída" : "Não incluída"}

      Clique no link abaixo para visualizar o perfil composto:
      ${fullUrl}

      ⚡ **Nota:** O perfil será gerado automaticamente ao abrir o link.`;
  
      return {
        content: [{ type: "text", text: message }],
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