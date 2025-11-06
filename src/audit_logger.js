const { pool } = require("./database");
const geoip = require("geoip-lite");

class AuditLogger {
  // Buffer para batch inserts (otimização)
  static buffer = [];
  static MAX_BUFFER = 50; // Flush a cada 50 eventos
  static flushTimer = null;
  static FLUSH_INTERVAL = 5000; // 5 segundos
  
  /**
   * Método genérico de log - Base para todos os outros
   */
  static async logEvent(event) {
    const record = {
      user_id: event.userId || null,
      client_id: event.clientId || null,
      session_id: event.sessionId || null,
      event_type: event.eventType,
      tool_name: event.toolName || null,
      ip_address: event.ip || null,
      user_agent: event.userAgent || null,
      country: null,
      city: null,
      duration_ms: event.durationMs || null,
      status: event.status || "success",
      error_message: event.errorMessage ? this.truncate(event.errorMessage, 1000) : null,
      metadata: null
    };
    
    // Geolocalização (se tiver IP)
    if (event.ip) {
      try {
        const geo = geoip.lookup(event.ip);
        if (geo) {
          record.country = geo.country;
          record.city = geo.city;
        }
      } catch (error) {
        // Falha silenciosa na geolocalização
        console.error("⚠️  Erro ao obter geolocalização:", error.message);
      }
    }
    
    // Metadata (JSON)
    if (event.metadata) {
      try {
        record.metadata = JSON.stringify(event.metadata);
      } catch (error) {
        console.error("⚠️  Erro ao serializar metadata:", error.message);
      }
    }
    
    // Adicionar ao buffer
    this.buffer.push(record);
    
    // Flush se buffer cheio
    if (this.buffer.length >= this.MAX_BUFFER) {
      await this.flush();
    } else {
      this.scheduleFlush();
    }
  }
  
  /**
   * Agenda flush automático (se não tiver agendado)
   */
  static scheduleFlush() {
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flush();
      }, this.FLUSH_INTERVAL);
    }
  }
  
  /**
   * Grava buffer no banco de dados
   */
  static async flush() {
    if (this.buffer.length === 0) return;
    
    const records = [...this.buffer];
    this.buffer = [];
    
    // Limpar timer
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    
    try {
      // Construir query com múltiplos VALUES
      const placeholders = records.map((_, i) => {
        const base = i * 13;
        return `($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},$${base+6},$${base+7},$${base+8},$${base+9},$${base+10},$${base+11},$${base+12},$${base+13})`;
      }).join(",");
      
      const params = records.flatMap(r => [
        r.user_id,
        r.client_id,
        r.session_id,
        r.event_type,
        r.tool_name,
        r.ip_address,
        r.user_agent,
        r.country,
        r.city,
        r.duration_ms,
        r.status,
        r.error_message,
        r.metadata
      ]);
      
      await pool.query(`
        INSERT INTO mcp_audit_log (
          user_id, client_id, session_id, event_type, tool_name,
          ip_address, user_agent, country, city, duration_ms,
          status, error_message, metadata
        ) VALUES ${placeholders}
      `, params);
      
      console.log(`📊 Audit log: ${records.length} eventos registrados`);
      
    } catch (error) {
      console.error("❌ Erro ao salvar audit log:", error.message);
      
      // Re-adicionar ao buffer para retry (evita perda de dados)
      this.buffer.unshift(...records);
    }
  }
  
  /**
   * Extrai IP real da requisição (considera proxies)
   */
  static getIP(req) {
    return req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
           req.headers["x-real-ip"] ||
           req.ip ||
           req.connection?.remoteAddress ||
           req.socket?.remoteAddress ||
           "unknown";
  }
  
  /**
   * Sanitiza dados sensíveis (remove/mascara)
   */
  static sanitize(obj) {
    if (!obj || typeof obj !== "object") return obj;
    
    const sensitive = ["password", "token", "secret", "apikey", "authorization", "bearer"];
    const clean = Array.isArray(obj) ? [...obj] : { ...obj };
    
    for (const key in clean) {
      const keyLower = key.toLowerCase();
      
      if (sensitive.some(s => keyLower.includes(s))) {
        clean[key] = "[REDACTED]";
      } else if (typeof clean[key] === "object" && clean[key] !== null) {
        // Recursivo para objetos aninhados
        clean[key] = this.sanitize(clean[key]);
      }
    }
    
    return clean;
  }
  
  /**
   * Trunca string longa
   */
  static truncate(str, maxLength) {
    if (!str) return str;
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength) + "... [truncated]";
  }
  
  // =============================================
  // MÉTODOS ESPECÍFICOS (Interface Simplificada)
  // =============================================
  
  /**
   * Registra login bem-sucedido
   */
  static async logLogin(userId, clientId, req) {
    await this.logEvent({
      userId,
      clientId,
      eventType: "login",
      status: "success",
      ip: this.getIP(req),
      userAgent: req.headers["user-agent"]
    });
  }
  
  /**
   * Registra tentativa de login falha
   */
  static async logLoginFailure(username, req, reason) {
    await this.logEvent({
      eventType: "login",
      status: "error",
      errorMessage: reason,
      ip: this.getIP(req),
      userAgent: req.headers["user-agent"],
      metadata: { attempted_username: username }
    });
  }
  
  /**
   * Registra execução de ferramenta (tool)
   */
  static async logToolCall(userId, clientId, sessionId, toolName, args, result, req, startTime) {
    const durationMs = Date.now() - startTime;
    
    // Resumo do resultado (não o resultado completo)
    let resultSummary = null;
    if (result.isError) {
      resultSummary = result.content?.[0]?.text?.substring(0, 500);
    } else {
      const itemCount = result.content?.length || 0;
      resultSummary = `Success - ${itemCount} items returned`;
    }
    
    // Sanitizar argumentos
    const safeArgs = this.sanitize(args);
    
    await this.logEvent({
      userId,
      clientId,
      sessionId,
      eventType: "tool_call",
      toolName,
      ip: this.getIP(req),
      userAgent: req.headers["user-agent"],
      durationMs,
      status: result.isError ? "error" : "success",
      errorMessage: result.isError ? resultSummary : null,
      metadata: {
        args: safeArgs,
        result_items: result.content?.length || 0
      }
    });
  }
  
  /**
   * Registra refresh de token
   */
  static async logTokenRefresh(userId, clientId, req) {
    await this.logEvent({
      userId,
      clientId,
      eventType: "token_refresh",
      status: "success",
      ip: this.getIP(req),
      userAgent: req.headers["user-agent"]
    });
  }
  
  /**
   * Registra erro genérico do sistema
   */
  static async logError(error, req, context = {}) {
    await this.logEvent({
      userId: context.userId || null,
      clientId: context.clientId || null,
      sessionId: context.sessionId || null,
      eventType: "error",
      status: "error",
      errorMessage: error.message || String(error),
      ip: this.getIP(req),
      userAgent: req.headers["user-agent"],
      metadata: {
        stack: error.stack?.substring(0, 500),
        context
      }
    });
  }
}

// =============================================
// GRACEFUL SHUTDOWN (Flush ao encerrar)
// =============================================

process.on("SIGTERM", async () => {
  console.log("📊 Flushing audit logs antes de encerrar...");
  await AuditLogger.flush();
});

process.on("SIGINT", async () => {
  console.log("📊 Flushing audit logs antes de encerrar...");
  await AuditLogger.flush();
});

// =============================================
// EXPORTS
// =============================================

module.exports = AuditLogger;