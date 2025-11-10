const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { ListToolsRequestSchema, CallToolRequestSchema } = require("@modelcontextprotocol/sdk/types.js");
const { tools, executeTool } = require("./tools");
const AuditLogger = require("./audit_logger");
const { requestContext } = require("./index");

// Criar instância do servidor MCP
function createMcpServer(queryFunction, getAccessTokenFn) {
  const server = new Server({
    name: "mcp-well-database",
    version: "1.0.0",
    description: `MCP Server for Well Database and Profile Visualization.

    WORKFLOW GUIDELINES:
    - If user asks for:

    1. Composite profile → get_well_curves → ask user for curves → generate_composite_profile_link
    2. Well data → fetch_well_database_schema → query_well_database
    3. Curve analysis → fetch_well_database_schema → query_well_database (dlis_metadata_view) → get_dlis_metadata

    RULES:
    - Fetch schema only ONCE per conversation.
    - NEVER query the database without first fetching the schema.
    - ALWAYS confirm curve selection before generating a profile link.
    - NEVER query the database for profile visualization.`
  }, {
    capabilities: {
      tools: {}
    }
  });

  // Registrar handler para listar tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    console.log("📋 Listando ferramentas...");
    
    return {
      tools: tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema
      }))
    };
  });

  // Registrar handler para executar tools
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    console.log("\n🔧 Tool Request:");
    console.log("   Method:", request.method);
    console.log("   Tool Name:", request.params.name);
    console.log("   Arguments:", JSON.stringify(request.params.arguments, null, 2));
    
    const toolName = request.params.name;
    const args = request.params.arguments || {};
    
    // Capturar tempo de início
    const startTime = Date.now();
    
    try {
      // Obter access token do contexto
      const accessToken = getAccessTokenFn ? getAccessTokenFn() : null;
      
      const result = await executeTool(toolName, args, queryFunction, accessToken);
      console.log("   ✅ Tool executada com sucesso");
      
      // Log de tool call bem-sucedida
      const ctx = requestContext.getStore();
      if (ctx?.userId) {
        await AuditLogger.logTool(
          ctx.userId,
          ctx.clientId,
          ctx.sessionId,
          toolName,
          args,
          result,
          ctx.req,
          startTime
        );
      }
      
      // Retornar no formato correto do MCP
      return {
        content: result.content,
        isError: result.isError || false
      };
    } catch (error) {
      console.error("   ❌ Erro na tool:", error.message);
      
      // Log de tool call com erro
      const ctx = requestContext.getStore();
      if (ctx?.userId) {
        await AuditLogger.logTool(
          ctx.userId,
          ctx.clientId,
          ctx.sessionId,
          toolName,
          args,
          { isError: true, content: [{ type: "text", text: error.message }] },
          ctx.req,
          startTime
        );
      }
      
      return {
        content: [{ 
          type: "text", 
          text: `Erro: ${error.message}` 
        }],
        isError: true
      };
    }
  });

  console.log("\n✅ MCP Server configurado com sucesso!");
  console.log(`📦 ${tools.length} ferramentas registradas`);
  
  return server;
}

module.exports = { 
  createMcpServer,
  toolsCount: tools.length 
};