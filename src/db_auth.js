const { pool } = require("./database");

// ===============================================
// AUTENTICAÇÃO VIA BANCO DE DADOS
// ===============================================

/**
 * Valida credenciais do usuário no banco de dados
 * @param {string} username - Nome de usuário
 * @param {string} password - Senha em texto plano
 * @returns {Promise<Object>} { valid: boolean, username?: string, error?: string }
 */

async function validateUser(username, password) {
  console.log("\n🔐 Validando usuário no banco...");
  console.log(`   Username: ${username}`);
  console.log(`   Password: ${password ? "[PRESENTE]" : "[AUSENTE]"}`);
  
  // Validação básica
  if (!username || !password) {
    console.log("   ❌ Username ou password ausente");
    return { valid: false, error: "Username e password são obrigatórios" };
  }
  
  try {
    // Buscar usuário no banco
    const query = `
      SELECT 
        id,
        username,
        password_hash,
        is_active
      FROM mcp_users 
      WHERE username = $1
    `;
    
    const result = await pool.query(query, [username]);
    
    // Usuário não encontrado
    if (result.rows.length === 0) {
      console.log(`   ❌ Usuário "${username}" não encontrado no banco`);
      return { valid: false, error: `Usuário "${username}" não cadastrado` };
    }
    
    const user = result.rows[0];
    
    // Usuário inativo
    if (!user.is_active) {
      console.log(`   ❌ Usuário "${username}" está inativo`);
      return { valid: false, error: "Usuário inativo" };
    }
    
    // Verificar senha (comparação direta - texto plano)
    if (password !== user.password_hash) {
      console.log(`   ❌ Senha incorreta para "${username}"`);
      return { valid: false, error: "Senha incorreta" };
    }
    
    // Atualizar last_login_at
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

/**
 * Listar todos os usuários ativos
 * @returns {Promise<Array>} Lista de usuários
 */
async function listActiveUsers() {
  try {
    const result = await pool.query(`
      SELECT 
        username, 
        is_active, 
        created_at, 
        last_login_at 
      FROM mcp_users 
      WHERE is_active = true
      ORDER BY username
    `);
    
    return result.rows;
  } catch (error) {
    console.error("Erro ao listar usuários:", error.message);
    return [];
  }
}

/**
 * Criar novo usuário (para testes)
 * @param {string} username - Nome de usuário
 * @param {string} password - Senha em texto plano
 * @returns {Promise<Object>} { success: boolean, error?: string }
 */
async function createUser(username, password) {
  console.log(`\n➕ Criando usuário: ${username}`);
  
  if (!username || !password) {
    return { success: false, error: "Username e password são obrigatórios" };
  }
  
  try {
    await pool.query(
      "INSERT INTO mcp_users (username, password_hash, is_active) VALUES ($1, $2, true)",
      [username, password]
    );
    
    console.log(`   ✅ Usuário "${username}" criado com sucesso`);
    return { success: true };
    
  } catch (error) {
    if (error.code === "23505") { // Unique violation
      console.log(`   ❌ Usuário "${username}" já existe`);
      return { success: false, error: "Usuário já existe" };
    }
    
    console.error("   ❌ Erro ao criar usuário:", error.message);
    return { success: false, error: "Erro ao criar usuário" };
  }
}

/**
 * Desativar usuário
 * @param {string} username - Nome de usuário
 * @returns {Promise<Object>} { success: boolean, error?: string }
 */
async function deactivateUser(username) {
  try {
    const result = await pool.query(
      "UPDATE mcp_users SET is_active = false WHERE username = $1",
      [username]
    );
    
    if (result.rowCount === 0) {
      return { success: false, error: "Usuário não encontrado" };
    }
    
    console.log(`🔒 Usuário "${username}" desativado`);
    return { success: true };
    
  } catch (error) {
    console.error("Erro ao desativar usuário:", error.message);
    return { success: false, error: "Erro ao desativar usuário" };
  }
}

module.exports = {
  validateUser,
  listActiveUsers,
  createUser,
  deactivateUser
};