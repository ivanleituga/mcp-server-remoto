-- =====================================================
-- Setup MCP OAuth Tables - PostgreSQL
-- Arquivo: setup_mcp_oauth_tables.sql
-- Executar manualmente no banco de dados
-- =====================================================

-- =====================================================
-- 1. TABELA DE USUÁRIOS (já deve existir)
-- =====================================================
CREATE TABLE IF NOT EXISTS mcp_users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login_at TIMESTAMP,
  
  CONSTRAINT username_not_empty CHECK (username <> '')
);

CREATE INDEX IF NOT EXISTS idx_mcp_users_username ON mcp_users(username);
CREATE INDEX IF NOT EXISTS idx_mcp_users_active ON mcp_users(is_active);

COMMENT ON TABLE mcp_users IS 'Usuários para autenticação OAuth do MCP Server';
COMMENT ON COLUMN mcp_users.username IS 'Nome de usuário (login)';
COMMENT ON COLUMN mcp_users.password IS 'Senha em texto plano (fase de testes)';

-- =====================================================
-- 2. TABELA DE CLIENTES OAuth
-- =====================================================
CREATE TABLE IF NOT EXISTS mcp_clients (
  id SERIAL PRIMARY KEY,
  client_id VARCHAR(100) UNIQUE NOT NULL,
  client_secret VARCHAR(100) NOT NULL,
  client_name VARCHAR(255) NOT NULL,
  redirect_uris TEXT[] NOT NULL,
  grant_types TEXT[] DEFAULT ARRAY['authorization_code', 'refresh_token'],
  response_types TEXT[] DEFAULT ARRAY['code'],
  scope VARCHAR(255) DEFAULT 'mcp',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT client_id_not_empty CHECK (client_id <> ''),
  CONSTRAINT client_name_not_empty CHECK (client_name <> ''),
  CONSTRAINT redirect_uris_not_empty CHECK (array_length(redirect_uris, 1) > 0)
);

CREATE INDEX IF NOT EXISTS idx_mcp_clients_client_id ON mcp_clients(client_id);

COMMENT ON TABLE mcp_clients IS 'Clientes OAuth registrados dinamicamente';
COMMENT ON COLUMN mcp_clients.client_id IS 'ID único do cliente (gerado automaticamente)';
COMMENT ON COLUMN mcp_clients.client_secret IS 'Secret do cliente (gerado automaticamente)';
COMMENT ON COLUMN mcp_clients.redirect_uris IS 'URIs permitidas para redirecionamento';

-- =====================================================
-- 3. TABELA DE CÓDIGOS DE AUTORIZAÇÃO
-- =====================================================
CREATE TABLE IF NOT EXISTS mcp_auth_codes (
  id SERIAL PRIMARY KEY,
  code VARCHAR(100) UNIQUE NOT NULL,
  client_id VARCHAR(100) NOT NULL REFERENCES mcp_clients(client_id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES mcp_users(id) ON DELETE CASCADE,
  redirect_uri TEXT NOT NULL,
  scope VARCHAR(255) DEFAULT 'mcp',
  code_challenge TEXT,
  code_challenge_method VARCHAR(10),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  used BOOLEAN DEFAULT false,
  
  CONSTRAINT code_not_empty CHECK (code <> ''),
  CONSTRAINT valid_challenge_method CHECK (
    code_challenge_method IS NULL OR 
    code_challenge_method IN ('S256', 'plain')
  )
);

CREATE INDEX IF NOT EXISTS idx_mcp_auth_codes_code ON mcp_auth_codes(code);
CREATE INDEX IF NOT EXISTS idx_mcp_auth_codes_client_id ON mcp_auth_codes(client_id);
CREATE INDEX IF NOT EXISTS idx_mcp_auth_codes_expires_at ON mcp_auth_codes(expires_at);

COMMENT ON TABLE mcp_auth_codes IS 'Códigos de autorização OAuth temporários (10 min)';
COMMENT ON COLUMN mcp_auth_codes.code IS 'Código de autorização único';
COMMENT ON COLUMN mcp_auth_codes.code_challenge IS 'PKCE challenge para segurança adicional';
COMMENT ON COLUMN mcp_auth_codes.used IS 'Marca se o código já foi trocado por token';

-- =====================================================
-- 4. TABELA DE TOKENS (Access e Refresh)
-- =====================================================
CREATE TABLE IF NOT EXISTS mcp_tokens (
  id SERIAL PRIMARY KEY,
  token VARCHAR(100) UNIQUE NOT NULL,
  token_type VARCHAR(20) NOT NULL,
  client_id VARCHAR(100) NOT NULL REFERENCES mcp_clients(client_id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES mcp_users(id) ON DELETE CASCADE,
  scope VARCHAR(255) DEFAULT 'mcp',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP,
  revoked BOOLEAN DEFAULT false,
  
  CONSTRAINT token_not_empty CHECK (token <> ''),
  CONSTRAINT valid_token_type CHECK (token_type IN ('access', 'refresh'))
);

CREATE INDEX IF NOT EXISTS idx_mcp_tokens_token ON mcp_tokens(token);
CREATE INDEX IF NOT EXISTS idx_mcp_tokens_client_id ON mcp_tokens(client_id);
CREATE INDEX IF NOT EXISTS idx_mcp_tokens_user_id ON mcp_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_mcp_tokens_expires_at ON mcp_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_mcp_tokens_revoked ON mcp_tokens(revoked);

COMMENT ON TABLE mcp_tokens IS 'Tokens OAuth (access e refresh)';
COMMENT ON COLUMN mcp_tokens.token_type IS 'Tipo: access (expira em 1h) ou refresh (não expira)';
COMMENT ON COLUMN mcp_tokens.expires_at IS 'NULL para refresh tokens (não expiram)';
COMMENT ON COLUMN mcp_tokens.revoked IS 'Token foi revogado manualmente';

-- =====================================================
-- 5. TABELA DE SESSÕES DE USUÁRIOS
-- =====================================================
CREATE TABLE IF NOT EXISTS mcp_sessions (
  id SERIAL PRIMARY KEY,
  session_id VARCHAR(100) UNIQUE NOT NULL,
  user_id INTEGER NOT NULL REFERENCES mcp_users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  
  CONSTRAINT session_id_not_empty CHECK (session_id <> '')
);

CREATE INDEX IF NOT EXISTS idx_mcp_sessions_session_id ON mcp_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_mcp_sessions_user_id ON mcp_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_mcp_sessions_expires_at ON mcp_sessions(expires_at);

COMMENT ON TABLE mcp_sessions IS 'Sessões de usuários autenticados (cookies)';
COMMENT ON COLUMN mcp_sessions.session_id IS 'UUID da sessão (armazenado em cookie httpOnly)';
COMMENT ON COLUMN mcp_sessions.expires_at IS 'Sessão expira em 1 hora';

-- =====================================================
-- INSERIR USUÁRIOS DE TESTE (se ainda não existirem)
-- =====================================================
INSERT INTO mcp_users (username, password, is_active) 
VALUES 
  ('gabriel', 'gabrielk2', true),
  ('vinicius', 'viniciusk2', true),
  ('bruno', 'brunok2', true),
  ('ivan', 'ivank2', true),
  ('levy', 'levyk2', true)
ON CONFLICT (username) DO NOTHING;

-- =====================================================
-- VERIFICAÇÃO: Listar estrutura criada
-- =====================================================
SELECT 
  'mcp_users' AS tabela,
  COUNT(*) AS registros
FROM mcp_users
UNION ALL
SELECT 
  'mcp_clients' AS tabela,
  COUNT(*) AS registros
FROM mcp_clients
UNION ALL
SELECT 
  'mcp_auth_codes' AS tabela,
  COUNT(*) AS registros
FROM mcp_auth_codes
UNION ALL
SELECT 
  'mcp_tokens' AS tabela,
  COUNT(*) AS registros
FROM mcp_tokens
UNION ALL
SELECT 
  'mcp_sessions' AS tabela,
  COUNT(*) AS registros
FROM mcp_sessions
ORDER BY tabela;

-- =====================================================
-- FIM DO SCRIPT
-- =====================================================