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
    
    // VOLTAR AO MÉTODO ORIGINAL (que funciona)
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

  // HACK: Sobrescrever o método interno que lista as ferramentas
  // para incluir as descrições corretas
  const originalListTools = mcpServer.listTools?.bind(mcpServer);
  
  if (originalListTools) {
    mcpServer.listTools = function() {
      const result = originalListTools();
      // Adicionar descrições ao resultado
      if (result && result.tools) {
        result.tools = result.tools.map(t => {
          const fullTool = tools.find(tool => tool.name === t.name);
          if (fullTool) {
            return {
              ...t,
              description: fullTool.description
            };
          }
          return t;
        });
      }
      return result;
    };
  }

  // Alternativa: Interceptar o método _handleRequest se existir
  if (mcpServer._handleRequest) {
    const original = mcpServer._handleRequest.bind(mcpServer);
    
    mcpServer._handleRequest = async function(request) {
      if (request.method === "tools/list") {
        console.log("📋 Interceptando tools/list para adicionar descrições!");
        
        return {
          tools: tools.map(tool => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema
          }))
        };
      }
      
      return original(request);
    };
  }

  console.log("\n✅ Servidor configurado!");
  
  return mcpServer;
}

// Exportar função de criação e contador de tools
module.exports = { 
  createMcpServer,
  toolsCount: tools.length 
};