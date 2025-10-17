const { pool } = require("./database");

// ===============================================
// AUTENTICAÇÃO DE USUÁRIOS
// ===============================================

async function validateUser(username, password) {
  console.log("\n🔐 Validando usuário no banco...");
  console.log(`   Username: ${username}`);
  console.log(`   Password: ${password ? "[PRESENTE]" : "[AUSENTE]"}`);
  
  if (!username || !password) {
    console.log("   ❌ Username ou password ausente");
    return { valid: false, error: "Username e password são obrigatórios" };
  }
  
  try {
    const query = `
      SELECT 
        id,
        username,
        password,
        is_active
      FROM mcp_users 
      WHERE username = $1
    `;
    
    const result = await pool.query(query, [username]);
    
    if (result.rows.length === 0) {
      console.log(`   ❌ Usuário "${username}" não encontrado no banco`);
      return { valid: false, error: `Usuário "${username}" não cadastrado` };
    }
    
    const user = result.rows[0];
    
    if (!user.is_active) {
      console.log(`   ❌ Usuário "${username}" está inativo`);
      return { valid: false, error: "Usuário inativo" };
    }
    
    if (password !== user.password) {
      console.log(`   ❌ Senha incorreta para "${username}"`);
      return { valid: false, error: "Senha incorreta" };
    }
    
    await pool.query(
      "UPDATE mcp_users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1",
      [user.id]
    );
    
    console.log(`   ✅ Credenciais válidas para "${username}"!`);
    console.log("   📅 Last login atualizado");
    
    return { 
      valid: true, 
      username: user.username,
      userId: user.id
    };
    
  } catch (error) {
    console.error("   ❌ Erro ao validar usuário:", error.message);
    return { 
      valid: false, 
      error: "Erro interno ao validar credenciais" 
    };
  }
}

// ===============================================
// CLIENTS (Clientes OAuth Registrados)
// ===============================================

async function createClient(clientData) {
  const {
    client_id,
    client_name,
    redirect_uris,
    grant_types = ["authorization_code", "refresh_token"],
    response_types = ["code"],
    scope = "mcp"
  } = clientData;

  const query = `
    INSERT INTO mcp_clients (
      client_id, 
      client_name, 
      redirect_uris, 
      grant_types, 
      response_types, 
      scope
    )
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `;

  const result = await pool.query(query, [
    client_id,
    client_name,
    redirect_uris,
    grant_types,
    response_types,
    scope
  ]);

  return result.rows[0];
}

async function getClientById(client_id) {
  const query = "SELECT * FROM mcp_clients WHERE client_id = $1";
  const result = await pool.query(query, [client_id]);
  return result.rows[0] || null;
}

// ===============================================
// TOKENS (Access e Refresh Tokens)
// ===============================================

async function createToken(tokenData) {
  const {
    token,
    token_type,
    client_id,
    user_id,
    scope = "mcp",
    expiresAt
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

async function revokeToken(token) {
  const query = "DELETE FROM mcp_tokens WHERE token = $1";
  await pool.query(query, [token]);
}

async function deleteToken(token) {
  const query = "DELETE FROM mcp_tokens WHERE token = $1";
  await pool.query(query, [token]);
}

// ===============================================
// CLEANUP (Limpeza Periódica)
// ===============================================

async function cleanupExpired() {
  console.log("\n🧹 Iniciando limpeza OAuth...");

  try {
    // 1. Access tokens expirados
    const expiredTokens = await pool.query(`
      DELETE FROM mcp_tokens 
      WHERE expires_at IS NOT NULL 
        AND expires_at < CURRENT_TIMESTAMP
      RETURNING token
    `);
    
    // 2. Refresh tokens nunca usados após 24h
    const unusedRefresh = await pool.query(`
      DELETE FROM mcp_tokens 
      WHERE token_type = 'refresh'
        AND revoked = false
        AND created_at < CURRENT_TIMESTAMP - INTERVAL '1 day'
        AND NOT EXISTS (
          SELECT 1 FROM mcp_tokens t2 
          WHERE t2.client_id = mcp_tokens.client_id 
            AND t2.user_id = mcp_tokens.user_id
            AND t2.token_type = 'access'
            AND t2.created_at > mcp_tokens.created_at
        )
      RETURNING token
    `);

    console.log(`   🗑️  Access tokens expirados: ${expiredTokens.rowCount}`);
    console.log(`   🗑️  Refresh tokens nunca usados (>24h): ${unusedRefresh.rowCount}`);
    console.log("   ✅ Limpeza concluída\n");

  } catch (error) {
    console.error("   ❌ Erro na limpeza:", error.message);
  }
}

// ===============================================
// EXPORTAR FUNÇÕES
// ===============================================

module.exports = {
  // Autenticação
  validateUser,
  
  // Clients
  createClient,
  getClientById,

  // Tokens
  createToken,
  getToken,
  revokeToken,
  deleteToken,

  // Cleanup
  cleanupExpired
};