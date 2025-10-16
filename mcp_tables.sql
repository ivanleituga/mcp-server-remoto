-- =====================================================
-- TABELA DE USUÁRIOS
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
-- TABELA DE CLIENTES OAuth
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
-- TABELA DE TOKENS (Access e Refresh)
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