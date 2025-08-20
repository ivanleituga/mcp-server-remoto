const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { tools, executeTool } = require("./tools");

// Criar instância do servidor MCP usando Server (não McpServer)
function createMcpServer(queryFunction) {
  const server = new Server({
    name: "mcp-well-database",
    version: "1.0.0",
  }, {
    capabilities: {
      tools: {}
    }
  });

  // Importar os schemas necessários
  const { ListToolsRequestSchema, CallToolRequestSchema } = require("@modelcontextprotocol/sdk/types.js");

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
    
    try {
      const result = await executeTool(toolName, args, queryFunction);
      console.log("   ✅ Tool executada com sucesso");
      
      // Retornar no formato correto do MCP
      return {
        content: result.content,
        isError: result.isError || false
      };
    } catch (error) {
      console.error("   ❌ Erro na tool:", error.message);
      
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

// Exportar função de criação e contador de tools
module.exports = { 
  createMcpServer,
  toolsCount: tools.length 
};