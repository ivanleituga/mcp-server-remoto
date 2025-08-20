const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { tools, executeTool } = require("./tools");

function createMcpServer(queryFunction) {
  const server = new Server(
    { name: "mcp-well-database", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );
  
  // Implementar TODOS os handlers manualmente
  server.setRequestHandler("initialize", async () => ({
    protocolVersion: "2024-11-05",
    serverInfo: { name: "mcp-well-database", version: "1.0.0" },
    capabilities: { tools: {} }
  }));
  
  server.setRequestHandler("tools/list", async () => ({
    tools: tools.map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema
    }))
  }));
  
  server.setRequestHandler("tools/call", async (request) => {
    return executeTool(request.params.name, request.params.arguments, queryFunction);
  });
  
  return server;
}

// Exportar função de criação e contador de tools
module.exports = { 
  createMcpServer,
  toolsCount: tools.length 
};