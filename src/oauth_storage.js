const { pool } = require("./database");

// ===============================================
// CLIENTS (Clientes OAuth Registrados)
// ===============================================

/**
 * Criar novo cliente OAuth
 */
async function createClient(clientData) {
  const {
    client_id,
    client_secret,
    client_name,
    redirect_uris,
    grant_types = ["authorization_code", "refresh_token"],
    response_types = ["code"],
    scope = "mcp"
  } = clientData;

  const query = `
    INSERT INTO mcp_clients (
      client_id, 
      client_secret, 
      client_name, 
      redirect_uris, 
      grant_types, 
      response_types, 
      scope
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
  `;

  const result = await pool.query(query, [
    client_id,
    client_secret,
    client_name,
    redirect_uris,
    grant_types,
    response_types,
    scope
  ]);

  return result.rows[0];
}

/**
 * Buscar cliente por client_id
 */
async function getClientById(client_id) {
  const query = "SELECT * FROM mcp_clients WHERE client_id = $1";
  const result = await pool.query(query, [client_id]);
  return result.rows[0] || null;
}

// ===============================================
// AUTH CODES (Códigos de Autorização Temporários)
// ===============================================

/**
 * Criar código de autorização
 */
async function createAuthCode(codeData) {
  const {
    code,
    client_id,
    user_id,
    redirect_uri,
    scope = "mcp",
    code_challenge,
    code_challenge_method,
    expiresAt
  } = codeData;

  const query = `
    INSERT INTO mcp_auth_codes (
      code, 
      client_id, 
      user_id, 
      redirect_uri, 
      scope, 
      code_challenge, 
      code_challenge_method,
      expires_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
  `;

  const result = await pool.query(query, [
    code,
    client_id,
    user_id,
    redirect_uri,
    scope,
    code_challenge,
    code_challenge_method,
    new Date(expiresAt)
  ]);

  return result.rows[0];
}

/**
 * Buscar código de autorização
 */
async function getAuthCode(code) {
  const query = `
    SELECT 
      ac.*,
      u.username as user_username
    FROM mcp_auth_codes ac
    JOIN mcp_users u ON ac.user_id = u.id
    WHERE ac.code = $1 
      AND ac.used = false
      AND ac.expires_at > CURRENT_TIMESTAMP
  `;

  const result = await pool.query(query, [code]);
  return result.rows[0] || null;
}

/**
 * Marcar código como usado (para evitar reuso)
 */
async function markAuthCodeAsUsed(code) {
  const query = "UPDATE mcp_auth_codes SET used = true WHERE code = $1";
  await pool.query(query, [code]);
}

/**
 * Deletar código de autorização
 */
async function deleteAuthCode(code) {
  const query = "DELETE FROM mcp_auth_codes WHERE code = $1";
  await pool.query(query, [code]);
}

// ===============================================
// TOKENS (Access e Refresh Tokens)
// ===============================================

/**
 * Criar token (access ou refresh)
 */
async function createToken(tokenData) {
  const {
    token,
    token_type, // 'access' ou 'refresh'
    client_id,
    user_id,
    scope = "mcp",
    expiresAt // null para refresh tokens
  } = tokenData;

  const query = `
    INSERT INTO mcp_tokens (
      token, 
      token_type, 
      client_id, 
      user_id, 
      scope, 
      expires_at
    )
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `;

  const result = await pool.query(query, [
    token,
    token_type,
    client_id,
    user_id,
    scope,
    expiresAt ? new Date(expiresAt) : null
  ]);

  return result.rows[0];
}

/**
 * Buscar token válido
 */
async function getToken(token) {
  const query = `
    SELECT 
      t.*,
      u.username as user_username
    FROM mcp_tokens t
    JOIN mcp_users u ON t.user_id = u.id
    WHERE t.token = $1 
      AND t.revoked = false
      AND (t.expires_at IS NULL OR t.expires_at > CURRENT_TIMESTAMP)
  `;

  const result = await pool.query(query, [token]);
  return result.rows[0] || null;
}

/**
 * Revogar token
 */
async function revokeToken(token) {
  const query = "UPDATE mcp_tokens SET revoked = true WHERE token = $1";
  await pool.query(query, [token]);
}

/**
 * Deletar token
 */
async function deleteToken(token) {
  const query = "DELETE FROM mcp_tokens WHERE token = $1";
  await pool.query(query, [token]);
}

// ===============================================
// SESSIONS (Sessões de Usuários)
// ===============================================

/**
 * Criar sessão
 */
async function createSession(sessionData) {
  const {
    session_id,
    user_id,
    expiresAt
  } = sessionData;

  const query = `
    INSERT INTO mcp_sessions (session_id, user_id, expires_at)
    VALUES ($1, $2, $3)
    RETURNING *
  `;

  const result = await pool.query(query, [
    session_id,
    user_id,
    new Date(expiresAt)
  ]);

  return result.rows[0];
}

/**
 * Buscar sessão válida
 */
async function getSession(session_id) {
  const query = `
    SELECT 
      s.*,
      u.username as user_username
    FROM mcp_sessions s
    JOIN mcp_users u ON s.user_id = u.id
    WHERE s.session_id = $1 
      AND s.expires_at > CURRENT_TIMESTAMP
  `;

  const result = await pool.query(query, [session_id]);
  return result.rows[0] || null;
}

/**
 * Deletar sessão
 */
async function deleteSession(session_id) {
  const query = "DELETE FROM mcp_sessions WHERE session_id = $1";
  await pool.query(query, [session_id]);
}

// ===============================================
// CLEANUP (Limpeza Periódica)
// ===============================================

/**
 * Limpar registros expirados (rodar via setInterval)
 */
async function cleanupExpired() {
  console.log("\n🧹 Iniciando limpeza OAuth...");

  try {
    // Limpar códigos expirados ou usados
    const codesResult = await pool.query(`
      DELETE FROM mcp_auth_codes 
      WHERE expires_at < CURRENT_TIMESTAMP OR used = true
      RETURNING code
    `);

    // Limpar tokens expirados (access tokens)
    const tokensResult = await pool.query(`
      DELETE FROM mcp_tokens 
      WHERE expires_at IS NOT NULL 
        AND expires_at < CURRENT_TIMESTAMP
      RETURNING token
    `);

    // Limpar sessões expiradas
    const sessionsResult = await pool.query(`
      DELETE FROM mcp_sessions 
      WHERE expires_at < CURRENT_TIMESTAMP
      RETURNING session_id
    `);

    console.log(`   🗑️  Códigos removidos: ${codesResult.rowCount}`);
    console.log(`   🗑️  Tokens removidos: ${tokensResult.rowCount}`);
    console.log(`   🗑️  Sessões removidas: ${sessionsResult.rowCount}`);
    console.log("   ✅ Limpeza concluída\n");

  } catch (error) {
    console.error("   ❌ Erro na limpeza:", error.message);
  }
}

// ===============================================
// EXPORTAR FUNÇÕES
// ===============================================

module.exports = {
  // Clients
  createClient,
  getClientById,

  // Auth Codes
  createAuthCode,
  getAuthCode,
  markAuthCodeAsUsed,
  deleteAuthCode,

  // Tokens
  createToken,
  getToken,
  revokeToken,
  deleteToken,

  // Sessions
  createSession,
  getSession,
  deleteSession,

  // Cleanup
  cleanupExpired
};