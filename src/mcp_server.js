const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { tools, executeTool } = require("./tools");

// Criar instância do servidor MCP
function createMcpServer(queryFunction) {
  // Opção 1: Tentar criar Server diretamente
  let server;
  
  try {
    // Criar um Server básico primeiro
    server = new Server({
      name: "mcp-well-database",
      version: "1.0.0"
    }, {
      capabilities: {
        tools: {}
      }
    });
    
    // Registrar ferramentas no Server
    tools.forEach(tool => {
      server.setRequestHandler(`tools/${tool.name}`, async (request) => {
        const result = await executeTool(tool.name, request.params, queryFunction);
        return result;
      });
    });
    
    // Handler para listar ferramentas
    server.setRequestHandler("tools/list", async () => {
      return {
        tools: tools.map(tool => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema
        }))
      };
    });
    
    // Handler para chamar ferramentas
    server.setRequestHandler("tools/call", async (request) => {
      const { name, arguments: args } = request.params;
      const result = await executeTool(name, args, queryFunction);
      return result;
    });
    
    console.log("✅ Usando Server direto com handlers customizados");
    return server;
    
  } catch (err) {
    console.log("⚠️ Server direto falhou, usando McpServer...");
  }
  
  // Opção 2: McpServer padrão mas com hack
  const mcpServer = new McpServer({
    name: "mcp-well-database",
    version: "1.0.0",
  });

  // Registrar ferramentas
  console.log(`📦 Registrando ${tools.length} ferramentas...`);
  
  tools.forEach(tool => {
    console.log(`  - ${tool.name}`);
    
    // Registrar com método padrão
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

  // HACK FINAL: Interceptar o server interno
  if (mcpServer.server) {
    console.log("🔧 Interceptando server interno...");
    
    const originalHandler = mcpServer.server.setRequestHandler;
    
    // Sobrescrever o handler de tools/list
    mcpServer.server.setRequestHandler = function(method, handler) {
      if (method === "tools/list") {
        // Substituir por nosso handler
        return originalHandler.call(this, method, async () => {
          console.log("📋 Retornando tools com descriptions!");
          return {
            tools: tools.map(tool => ({
              name: tool.name,
              description: tool.description,
              inputSchema: tool.inputSchema
            }))
          };
        });
      }
      return originalHandler.call(this, method, handler);
    };
    
    // Forçar re-registro dos handlers
    if (mcpServer.setToolRequestHandlers) {
      mcpServer.setToolRequestHandlers();
    }
  }

  console.log("\n✅ Servidor configurado!");
  
  return mcpServer;
}

// Exportar função de criação e contador de tools
module.exports = { 
  createMcpServer,
  toolsCount: tools.length 
};