const { schema } = require("../utils/db_schema");

const tools = [
  {
    name: "fetch_well_database_schema",
    description: `Returns the complete and authoritative schema of the geological well/basin database.

    Usage Rules:
    - This tool MUST be called before any database query using 'query_well_database'.
    - Fetch the schema once per conversation, and reuse it for subsequent queries.
    - The schema it returns is the ONLY valid source of table and column names.

    Output:
    - The schema is provided in PostgreSQL 'CREATE TABLE' syntax for clarity.
    - Treat the response as canonical and read-only.`,
    inputSchema: {
      type: "object",
      properties: {},
      required: []
    }
  },
  {
    name: "query_well_database",
    description: `Executes read-only PostgreSQL queries on the geological well/basin database based on the user's natural language prompt.

    Critical Usage Requirements:
    - This tool MAY ONLY be used after 'fetch_well_database_schema' has been successfully called in the current conversation.
    - Only SELECT queries are permitted — never use DDL or DML (CREATE, UPDATE, DELETE, INSERT, DROP).

    Query Construction Rules:
    - Use only the tables and columns provided by 'fetch_well_database_schema'.
    - Do not infer or invent additional structures.
    - Use ILIKE and unaccent() for string comparisons (case-insensitive, accent-insensitive).
    - Do not include semicolons.
    - Use fully qualified or quoted column names where ambiguity is possible.

    Behavior:
    - Attempts to execute a query without schema context must be rejected.
    - Results are returned as JSON arrays representing table rows.`,
    inputSchema: {
      type: "object",
      properties: {
        sql: {
          type: "string",
          description: "PostgreSQL SELECT query text (no semicolons, no DDL/DML, must conform to schema)."
        }
      },
      required: ["sql"]
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
  },
  {
    name: "get_dlis_metadata",
    description: `Retrieves DLIS metadata and curve data for specific well measurements.
    
    This tool fetches detailed curve data from DLIS files for a specific well, including depth-value pairs.
    Use this when you need to analyze specific curves like gamma rays, resistivity, or time measurements.
    
    Important:
    - You must know the exact run, frame, and curve names (use the dlis_metadata_view table to find these)
    - Each item in the request represents a specific curve to retrieve
    - The response includes both metadata and actual measurement points`,
    inputSchema: {
      type: "object",
      properties: {
        wellName: {
          type: "string",
          description: "Well name exactly as it appears in the database (e.g., '1-COST-1P-PR')"
        },
        items: {
          type: "array",
          description: "Array of curve specifications to retrieve. Each must have run, frame, and curve.",
          items: {
            type: "object",
            properties: {
              run: {
                type: "string",
                description: "Run identifier (e.g., '1cost1ppr_mdt_101PUP')"
              },
              frame: {
                type: "string",
                description: "Frame identifier (e.g., '35:0:'60B'')"
              },
              curve: {
                type: "string",
                description: "Curve name (e.g., 'Raios gama', 'Tempo')"
              }
            },
            required: ["run", "frame", "curve"]
          },
          minItems: 1
        }
      },
      required: ["wellName", "items"]
    }
  }
];

// ===============================================
// VALIDAÇÃO DE SQL - ACEITA APENAS SELECT
// ===============================================

function validateSelectQuery(sql) {
  // Remove comentários SQL
  const cleanSql = sql
    .replace(/--.*$/gm, "")  // Comentários de linha
    .replace(/\/\*[\s\S]*?\*\//g, "")  // Comentários de bloco
    .trim();

  // Verifica se está vazio após limpeza
  if (!cleanSql) {
    throw new Error("Query SQL vazia após remover comentários");
  }

  // Normaliza para uppercase (mantém strings entre aspas intactas)
  const upperSql = cleanSql.toUpperCase();

  // WHITELIST: Aceita apenas queries que começam com SELECT ou WITH
  const startsWithSelect = upperSql.startsWith("SELECT");
  const startsWithWith = upperSql.startsWith("WITH");

  if (!startsWithSelect && !startsWithWith) {
    throw new Error("BLOQUEADO: Apenas queries SELECT (ou WITH...SELECT) são permitidas");
  }

  // Bloqueia múltiplos comandos separados por ponto-e-vírgula
  if (cleanSql.includes(";")) {
    throw new Error("BLOQUEADO: Múltiplas queries não são permitidas (remova o ponto-e-vírgula)");
  }

  return true;
}

module.exports = { validateSelectQuery };

// ===============================================
// EXECUÇÃO DE TOOLS
// ===============================================

async function executeTool(toolName, args, queryFn, accessToken) {
  // 1) Normaliza args
  let normalized = args;

  // Trata undefined/null e string vazia/branca
  if (normalized == null || (typeof normalized === "string" && normalized.trim() === "")) {
    normalized = {};
  }

  // 2) Gera string JSON sem duplo-stringify
  const argsStr = typeof normalized === "string"
    ? normalized // já é JSON em string (ex: "{}")
    : JSON.stringify(normalized); // objeto -> string


  console.log("\n🔨 executeTool chamado:");
  console.log("   Tool:", toolName);
  console.log("   Args (string p/ envio):", argsStr);
  console.log(`   Access Token: ${accessToken ? accessToken.substring(0, 20) + "..." : "[AUSENTE]"}`);
  
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
        // ==========================================
        // VALIDAÇÃO DE SEGURANÇA - APENAS SELECT
        // ==========================================
        console.log("   🛡️  Validando query SQL...");
        validateSelectQuery(sql);
        console.log("   ✅ Query validada: SELECT permitido");
        
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

    case "get_well_curves": {
      console.log("   🔍 Buscando curvas disponíveis para o poço");
  
      const wellName = args.wellName;
  
      if (!wellName) {
        throw new Error("Nome do poço não fornecido");
      }

      if (!accessToken) {
        throw new Error("Access token não disponível. Autenticação OAuth necessária.");
      }
  
      try {
        console.log("   🔐 Enviando requisição com Bearer token");
        
        // ==========================================
        // CHAMADA À API EXTERNA COM BEARER TOKEN
        // ==========================================
        const response = await fetch(
          `http://swk2adm1-001.k2sistemas.com.br:9095/curves?well=${wellName}`,
          {
            headers: {
              "Authorization": `Bearer ${accessToken}`,
              "Content-Type": "application/json"
            }
          }
        );
        
        if (!response.ok) {
          throw new Error(`API retornou erro: ${response.status}`);
        }
        
        const data = await response.json();
        
        console.log(`   ✅ ${data.count} curvas encontradas`);
        
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

      if (!accessToken) {
        throw new Error("Access token não disponível. Autenticação OAuth necessária.");
      }
  
      // URL de produção
      const baseUrl = "https://curves.k2sistemas.com.br/";
      
      const params = new URLSearchParams({
        well: wellName,
        curves: curves.join(","),
        lito: includeLithology.toString()
      });
  
      // ==========================================
      // ADICIONAR TOKEN VIA HASH FRAGMENT (#)
      // ==========================================
      const fullUrl = `${baseUrl}?${params.toString()}#token=${accessToken}`;
  
      console.log("   ✅ Link gerado com token em hash fragment");
      console.log(`   🔐 Token: ${accessToken.substring(0, 20)}...`);
  
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

    case "get_dlis_metadata": {
      console.log("   📊 Buscando metadados DLIS");
  
      const { wellName, items } = args;
  
      if (!wellName || !items || items.length === 0) {
        throw new Error("Nome do poço e itens são obrigatórios");
      }

      // Validar estrutura dos itens
      for (const item of items) {
        if (!item.run || !item.frame || !item.curve) {
          throw new Error("Cada item deve ter run, frame e curve");
        }
      }

      if (!accessToken) {
        throw new Error("Access token não disponível. Autenticação OAuth necessária.");
      }
  
      try {
        console.log("   📡 Requisitando dados DLIS...");
        console.log("   🔐 Enviando requisição com Bearer token");
        
        const requestBody = {
          well: wellName,
          items: items
        };
        
        console.log("   Request body:", JSON.stringify(requestBody, null, 2));
        
        // ==========================================
        // CHAMADA À API EXTERNA COM BEARER TOKEN
        // ==========================================
        const response = await fetch(
          "http://swk2adm1-001.k2sistemas.com.br:9095/dlis/data/by-keys",
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${accessToken}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify(requestBody)
          }
        );
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`API retornou erro ${response.status}: ${errorText}`);
        }
        
        const data = await response.json();
        
        console.log(`   ✅ Dados DLIS recebidos: ${data.data?.length || 0} pontos`);
        
        // Retornar dados brutos para o Claude interpretar
        return {
          content: [{ 
            type: "text", 
            text: JSON.stringify(data, null, 2) 
          }],
          isError: false
        };
      } catch (error) {
        console.error("   ❌ Erro ao buscar metadados DLIS:", error.message);
        return {
          content: [{ type: "text", text: `Erro ao buscar metadados DLIS: ${error.message}` }],
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