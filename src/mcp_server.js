const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { tools, executeTool } = require("./tools");

// Criar instância do servidor MCP
function createMcpServer(queryFunction) {
  const mcpServer = new McpServer({
    name: "mcp-well-database",
    version: "1.0.0",
  });

  // Registrar as ferramentas
  console.log(`📦 Registrando ${tools.length} ferramentas...`);
  
  tools.forEach(tool => {
    console.log(`  - ${tool.name}`);
    
    mcpServer.tool(
      tool.name,
      tool.inputSchema.properties || {},
      async (params) => {
        console.log(`\n🔧 Executando: ${tool.name}`);
        console.log("   Params:", JSON.stringify(params, null, 2));
        
        try {
          const result = await executeTool(tool.name, params, queryFunction);
          console.log("   ✅ Sucesso");
          return result;
        } catch (error) {
          console.error("   ❌ Erro:", error.message);
          throw error;
        }
      }
    );
  });

  return mcpServer;
}

// Exportar função de criação e contador de tools
module.exports = { 
  createMcpServer,
  toolsCount: tools.length 
};