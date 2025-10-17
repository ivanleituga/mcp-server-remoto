const { Pool } = require("pg");
require("dotenv").config();

// Pool de conexões PostgreSQL
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  connectionTimeoutMillis: 10000,
});

// Estado da conexão
let dbConnected = false;

// Testar conexão com o banco
async function testConnection() {
  try {
    const client = await pool.connect();
    client.release();
    dbConnected = true;
    console.log("✅ Banco de dados conectado");
    return true;
  } catch (err) {
    console.error("❌ Banco indisponível:", err.message);
    dbConnected = false;
    return false;
  }
}

// Executar query
async function query(sql) {
  if (!dbConnected) {
    throw new Error("Banco de dados não disponível");
  }
  
  const client = await pool.connect();
  try {
    const result = await client.query(sql);
    return result.rows;
  } finally {
    client.release();
  }
}

// Verificar se está conectado
function isConnected() {
  return dbConnected;
}

// Inicializar conexão quando o módulo for importado
(async () => {
  await testConnection();
})();

module.exports = {
  query,
  testConnection,
  isConnected,
  pool
};