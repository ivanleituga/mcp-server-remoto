const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { tools, executeTool } = require("./tools");

// Criar instância do servidor MCP
function createMcpServer(queryFunction) {
  const mcpServer = new McpServer({
    name: "mcp-well-database",
    version: "1.0.0",
  });

  // Registrar as ferramentas USANDO O MÉTODO CORRETO
  console.log(`📦 Registrando ${tools.length} ferramentas...`);
  
  tools.forEach(tool => {
    console.log(`  - ${tool.name}`);
    
    // MÉTODO 1: Usar registerTool (3 parâmetros)
    try {
      mcpServer.registerTool(
        tool.name,
        tool.description,  // ← DESCRIPTION AQUI!
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
    } catch (err) {
      console.log("  ⚠️ registerTool falhou, tentando método alternativo...");
      
      // MÉTODO 2: Usar tool() com objeto completo (1 parâmetro)
      mcpServer.tool({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        handler: async (params) => {
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
      });
    }
  });

  // Verificar o que foi registrado
  console.log("\n🔍 Verificando ferramentas registradas:");
  if (mcpServer._registeredTools) {
    Object.keys(mcpServer._registeredTools).forEach(name => {
      const tool = mcpServer._registeredTools[name];
      console.log(`  ${name}:`);
      console.log(`    - Tem description? ${!!tool.description}`);
      if (tool.description) {
        console.log(`    - Description: ${tool.description.substring(0, 50)}...`);
      }
    });
  }

  console.log("\n✅ Servidor configurado!");
  
  return mcpServer;
}

// Exportar função de criação e contador de tools
module.exports = { 
  createMcpServer,
  toolsCount: tools.length 
};