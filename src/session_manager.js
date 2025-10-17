class SessionManager {
  constructor() {
    this.transports = {};
    this.lastActivity = {};
  }

  // Adicionar nova sessão
  add(sessionId, transport) {
    this.transports[sessionId] = transport;
    this.lastActivity[sessionId] = Date.now();
    console.log(`✅ Sessão inicializada: ${sessionId}`);
  }

  // Obter transport de uma sessão
  get(sessionId) {
    if (sessionId && this.transports[sessionId]) {
      this.lastActivity[sessionId] = Date.now();
      return this.transports[sessionId];
    }
    return null;
  }

  // Verificar se sessão existe
  exists(sessionId) {
    return sessionId in this.transports;
  }

  // Contar sessões ativas
  count() {
    return Object.keys(this.transports).length;
  }

  // Listar todas as sessões
  getAll() {
    return Object.keys(this.transports);
  }

  // Remover uma sessão
  remove(sessionId) {
    if (this.transports[sessionId]) {
      delete this.transports[sessionId];
      delete this.lastActivity[sessionId];
      console.log(`🗑️ Sessão removida: ${sessionId}`);
    }
  }

  // Limpar sessões inativas
  cleanup(maxAge = 3600000) { // 1 hora por padrão
    const now = Date.now();
    let cleaned = 0;
    
    for (const [sessionId, lastActive] of Object.entries(this.lastActivity)) {
      if (now - lastActive > maxAge) {
        this.remove(sessionId);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`🧹 Limpeza de sessões MCP: ${cleaned} removidas, ${this.count()} restantes`);
    }
  }

  async closeAll() {
    const promises = [];
  
    // Tentar fechar todas em paralelo
    for (const sessionId in this.transports) {
      if (this.transports[sessionId]?.close) {
        promises.push(
          this.transports[sessionId].close()
            .then(() => console.log(`✅ Sessão fechada: ${sessionId}`))
            .catch(err => console.error(`⚠️ Erro ao fechar ${sessionId}:`, err.message))
        );
      }
    }
  
    // Aguardar todas (sucesso ou falha)
    await Promise.allSettled(promises);
  
    // Limpar tudo
    this.transports = {};
    this.lastActivity = {};
  
    console.log("🧹 Todas as sessões processadas");
  }
}

module.exports = new SessionManager();