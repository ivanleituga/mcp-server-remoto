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
        password,
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
    if (password !== user.password) {
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

module.exports = {
  validateUser,
};