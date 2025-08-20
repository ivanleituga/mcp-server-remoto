const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { tools, executeTool } = require("./tools");

// Criar instância do servidor MCP
function createMcpServer(queryFunction) {
  const mcpServer = new McpServer({
    name: "mcp-well-database",
    version: "1.0.0",
  });

  // Registrar as ferramentas normalmente
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

  // Interceptar no nível do transport (mais baixo)
  const originalConnect = mcpServer.connect.bind(mcpServer);
  
  mcpServer.connect = async function(transport) {
    console.log("🔌 Conectando e configurando interceptação...");
    
    // Interceptar o método send do transport
    if (transport && transport.send) {
      const originalSend = transport.send.bind(transport);
      
      transport.send = function(message) {
        // Se for resposta de tools/list, modificar
        if (message.result && message.result.tools) {
          console.log("📤 Modificando resposta tools/list");
          
          message.result.tools = tools.map(tool => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema
          }));
        }
        
        return originalSend(message);
      };
    }
    
    // Conectar normalmente
    return await originalConnect(transport);
  };

  console.log("\n✅ Servidor configurado!");
  
  return mcpServer;
}

// Exportar função de criação e contador de tools
module.exports = { 
  createMcpServer,
  toolsCount: tools.length 
};