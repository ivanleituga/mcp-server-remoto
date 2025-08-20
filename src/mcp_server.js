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
  
  // Armazenar handlers para uso posterior
  const toolHandlers = {};
  
  tools.forEach(tool => {
    console.log(`  - ${tool.name}`);
    
    // Guardar o handler
    const handler = async (params) => {
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
    };
    
    toolHandlers[tool.name] = handler;
    
    // Registrar a ferramenta (mantém funcionando)
    mcpServer.tool(
      tool.name,
      tool.inputSchema.properties || {},
      handler
    );
  });

  // HACK CRÍTICO: Sobrescrever o método interno após o registro
  const originalConnect = mcpServer.connect.bind(mcpServer);
  
  mcpServer.connect = async function(transport) {
    const result = await originalConnect(transport);
    
    // Após conectar, interceptar as requisições
    if (mcpServer.server && mcpServer.server._handleRequest) {
      const originalHandle = mcpServer.server._handleRequest.bind(mcpServer.server);
      
      mcpServer.server._handleRequest = async function(request) {
        // Interceptar tools/list
        if (request.method === "tools/list") {
          console.log("📋 Interceptando tools/list - retornando com descriptions!");
          
          return {
            tools: tools.map(tool => ({
              name: tool.name,
              description: tool.description,  // ← No nível raiz!
              inputSchema: tool.inputSchema
            }))
          };
        }
        
        // Interceptar tools/call
        if (request.method === "tools/call") {
          const { name, arguments: args } = request.params;
          console.log(`🔧 Interceptando tools/call: ${name}`);
          
          const handler = toolHandlers[name];
          if (handler) {
            return await handler(args);
          }
        }
        
        // Outros requests passam normalmente
        return originalHandle(request);
      };
    }
    
    return result;
  };

  console.log("\n✅ Servidor configurado com interceptação de requests!");
  
  return mcpServer;
}

// Exportar função de criação e contador de tools
module.exports = { 
  createMcpServer,
  toolsCount: tools.length 
};