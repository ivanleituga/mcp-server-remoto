const { pool } = require("./database");
const geoip = require("geoip-lite");

class AuditLogger {
  // Buffer para batch inserts (otimização)
  static buffer = [];
  static MAX_BUFFER = 50;              // Flush a cada 50 eventos
  static flushTimer = null;
  static FLUSH_INTERVAL = 5000;        // 5 segundos

  /**
   * Limita o tamanho de strings para evitar explosão de log
   */
  static truncate(str, maxLength) {
    if (!str) return null;
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength) + "...[truncated]";
  }

  /**
   * Obtém IP "real" do request (considerando proxy)
   */
  static getIP(req) {
    if (!req) return null;
    const header = req.headers["x-forwarded-for"];
    if (header) {
      return header.split(",")[0].trim();
    }
    return req.ip || req.connection?.remoteAddress || null;
  }

  /**
   * Sanitiza objetos para remover campos sensíveis (senha, token, etc.)
   */
  static sanitize(obj) {
    if (!obj || typeof obj !== "object") return obj;

    // Clonar objeto superficialmente
    const clean = Array.isArray(obj) ? [...obj] : { ...obj };

    const sensitive = [
      "password",
      "senha",
      "token",
      "secret",
      "authorization",
      "cookie",
      "set-cookie"
    ];

    for (const key of Object.keys(clean)) {
      const keyLower = key.toLowerCase();

      if (sensitive.some((s) => keyLower.includes(s))) {
        clean[key] = "[REDACTED]";
      } else if (typeof clean[key] === "object" && clean[key] !== null) {
        clean[key] = this.sanitize(clean[key]); // Recursivo
      }
    }

    return clean;
  }

  /**
   * Método genérico de log - Base para todos os outros
   */
  static async logEvent(event) {
    const record = {
      user_id: event.userId || null,
      client_id: event.clientId || null,
      session_id: event.sessionId || null,
      event_type: event.eventType,
      auth_method: event.authMethod || null,
      tool_name: event.toolName || null,
      ip_address: event.ip || null,
      user_agent: event.userAgent || null,
      country: null,
      city: null,
      duration_ms: event.durationMs || null,
      status: event.status || "success",
      error_message: event.errorMessage
        ? this.truncate(event.errorMessage, 1000)
        : null,
      metadata: null
    };

    // GeoIP se tivermos IP
    if (record.ip_address) {
      try {
        const geo = geoip.lookup(record.ip_address);
        if (geo) {
          record.country = geo.country || null;
          record.city = geo.city || null;
        }
      } catch (err) {
        console.warn("⚠️  Falha ao resolver geoip:", err.message);
      }
    }

    // Metadata sanitizada (se houver)
    if (event.metadata) {
      record.metadata = JSON.stringify(this.sanitize(event.metadata));
    }

    // Adicionar ao buffer
    this.buffer.push(record);

    // Se buffer grande o suficiente, flush imediato
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
      const placeholders = records
        .map((_, i) => {
          const base = i * 14;
          return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10},$${base + 11},$${base + 12},$${base + 13},$${base + 14})`;
        })
        .join(",");

      const params = records.flatMap((r) => [
        r.user_id,
        r.client_id,
        r.session_id,
        r.event_type,
        r.auth_method,
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

      await pool.query(
        `
        INSERT INTO mcp_audit_log (
          user_id, client_id, session_id, event_type, auth_method, tool_name,
          ip_address, user_agent, country, city, duration_ms,
          status, error_message, metadata
        ) VALUES ${placeholders}
      `,
        params
      );
    } catch (error) {
      console.error("❌ Erro ao gravar audit log:", error.message);
      // Em caso de falha, não relança para não quebrar fluxo principal
    }
  }

  // ======================================================
  // MÉTODOS ESPECÍFICOS DE LOG
  // ======================================================

  /**
   * Registra login bem-sucedido
   */
  static async logLogin(userId, clientId, req, authMethod = null) {
    await this.logEvent({
      userId,
      clientId,
      eventType: "login",
      authMethod,
      status: "success",
      ip: this.getIP(req),
      userAgent: req.headers["user-agent"]
    });
  }

  /**
   * Registra tentativa de login falha
   */
  static async logLoginFailure(
    username,
    clientId,
    req,
    reason,
    authMethod = null
  ) {
    await this.logEvent({
      clientId,
      eventType: "login",
      authMethod,
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
  static async logToolCall(
    userId,
    clientId,
    sessionId,
    toolName,
    args,
    result,
    durationMs,
    req
  ) {
    let resultSummary = null;

    
    if (result && typeof result === "object") {
      if (result.isError) {
        const text = result.content?.[0]?.text || JSON.stringify(result);
        resultSummary = this.truncate(text, 500);
      } else {
        const itemCount = result.content?.length || 0;
        resultSummary = `Success - ${itemCount} items returned`;
      }
    } 
    resultSummary = "Success";

    const safeArgs = this.sanitize(args);

    await this.logEvent({
      userId,
      clientId,
      sessionId,
      eventType: "tool_call",
      toolName,
      durationMs,
      status: result?.isError ? "error" : "success",
      errorMessage: result?.isError ? result?.content?.[0]?.text : null,
      ip: this.getIP(req),
      userAgent: req.headers["user-agent"],
      metadata: {
        args: safeArgs,
        resultSummary
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
   * Registra erro genérico
   */
  static async logError(userId, clientId, sessionId, error, metadata = {}) {
    await this.logEvent({
      userId,
      clientId,
      sessionId,
      eventType: "error",
      status: "error",
      errorMessage: error?.message || String(error),
      metadata
    });
  }
}

// Flush ao encerrar o processo
process.on("SIGTERM", () => {
  AuditLogger.flush().finally(() => process.exit(0));
});

process.on("SIGINT", () => {
  AuditLogger.flush().finally(() => process.exit(0));
});

module.exports = AuditLogger;