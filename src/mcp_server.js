const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { tools, executeTool } = require("./tools");

// Criar instância do servidor MCP
function createMcpServer(queryFunction) {
  const mcpServer = new McpServer({
    name: "mcp-well-database",
    version: "1.0.0",
  });

  // ========== SUPER DEBUG ==========
  console.log("\n🔍 INVESTIGANDO McpServer:");
  console.log("===================================");
  
  // 1. Propriedades diretas
  console.log("Propriedades diretas do mcpServer:");
  Object.keys(mcpServer).forEach(key => {
    console.log(`  - ${key}: ${typeof mcpServer[key]}`);
  });
  
  // 2. Métodos do protótipo
  console.log("\nMétodos do protótipo:");
  const proto = Object.getPrototypeOf(mcpServer);
  Object.getOwnPropertyNames(proto).forEach(method => {
    if (typeof mcpServer[method] === "function") {
      console.log(`  - ${method}() [${mcpServer[method].length} params]`);
    }
  });
  
  // 3. Verificar estrutura interna
  console.log("\nEstrutura interna:");
  if (mcpServer.tools) console.log("  - mcpServer.tools existe:", typeof mcpServer.tools);
  if (mcpServer._tools) console.log("  - mcpServer._tools existe:", typeof mcpServer._tools);
  if (mcpServer.handlers) console.log("  - mcpServer.handlers existe:", typeof mcpServer.handlers);
  if (mcpServer._handlers) console.log("  - mcpServer._handlers existe:", typeof mcpServer._handlers);
  
  // 4. Testar diferentes formas de registrar
  console.log("\n🧪 TESTANDO REGISTRO DE FERRAMENTAS:");
  console.log("===================================");
  
  // Teste 1: Método original
  console.log("\nTeste 1: Método original (3 params)");
  const testTool = tools[0];
  
  mcpServer.tool(
    testTool.name,
    testTool.inputSchema.properties || {},
    async (params) => { return { content: [{ type: "text", text: "test" }] }; }
  );
  
  // Verificar como foi armazenado
  console.log("Após registro, verificando armazenamento:");
  if (mcpServer.tools) {
    console.log("  mcpServer.tools:", mcpServer.tools);
    if (mcpServer.tools.get) {
      console.log("  Ferramenta armazenada:", mcpServer.tools.get(testTool.name));
    }
  }
  if (mcpServer._tools) {
    console.log("  mcpServer._tools:", mcpServer._tools);
  }
  
  // 5. Procurar onde as ferramentas são realmente armazenadas
  console.log("\n🔍 PROCURANDO ARMAZENAMENTO DE TOOLS:");
  for (const key in mcpServer) {
    const value = mcpServer[key];
    if (value && typeof value === "object") {
      if (value.has && value.has(testTool.name)) {
        console.log(`  ✅ Ferramentas encontradas em: mcpServer.${key}`);
        console.log(`     Tipo: ${value.constructor.name}`);
        console.log("     Conteúdo:", value.get(testTool.name));
      }
    }
  }
  
  console.log("===================================\n");
  // ========== FIM DO DEBUG ==========

  // Limpar e registrar todas as ferramentas normalmente
  if (mcpServer.tools && mcpServer.tools.clear) {
    mcpServer.tools.clear();
  }
  
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

  // TENTATIVA DE HACK: Após registrar, modificar as ferramentas armazenadas
  console.log("\n🔧 Tentando adicionar descriptions...");
  
  if (mcpServer.tools && mcpServer.tools instanceof Map) {
    tools.forEach(tool => {
      const stored = mcpServer.tools.get(tool.name);
      if (stored) {
        console.log(`  Modificando ${tool.name}...`);
        
        // Tentar adicionar description de várias formas
        if (stored.definition) {
          stored.definition.description = tool.description;
        } else if (stored.schema) {
          stored.schema.description = tool.description;
        } else {
          stored.description = tool.description;
        }
        
        // Também tentar criar uma nova estrutura
        mcpServer.tools.set(tool.name, {
          ...stored,
          definition: {
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema
          }
        });
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