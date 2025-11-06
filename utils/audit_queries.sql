-- =============================================
-- QUERIES ÚTEIS PARA ANÁLISE DE LOGS
-- =============================================

-- 1. Últimas atividades de um usuário
SELECT 
  created_at,
  event_type,
  tool_name,
  status,
  duration_ms,
  ip_address,
  country,
  city
FROM mcp_audit_log
WHERE user_id = 5  -- TROCAR pelo ID desejado
ORDER BY created_at DESC
LIMIT 50;

-- 2. Estatísticas de um usuário (30 dias)
SELECT 
  COUNT(*) FILTER (WHERE event_type = 'tool_call') as tool_calls,
  COUNT(*) FILTER (WHERE event_type = 'login') as logins,
  AVG(duration_ms) FILTER (WHERE event_type = 'tool_call') as avg_tool_time,
  COUNT(*) FILTER (WHERE status = 'error') as errors,
  MAX(created_at) as last_activity
FROM mcp_audit_log
WHERE user_id = 5  -- TROCAR pelo ID desejado
  AND created_at > NOW() - INTERVAL '30 days';

-- 3. Top 10 ferramentas mais usadas (30 dias)
SELECT 
  tool_name,
  COUNT(*) as uses,
  ROUND(AVG(duration_ms)::numeric, 2) as avg_duration_ms,
  COUNT(*) FILTER (WHERE status = 'error') as errors,
  ROUND(COUNT(*) FILTER (WHERE status = 'error') * 100.0 / COUNT(*), 2) as error_rate_pct
FROM mcp_audit_log
WHERE event_type = 'tool_call'
  AND created_at > NOW() - INTERVAL '30 days'
GROUP BY tool_name
ORDER BY uses DESC
LIMIT 10;

-- 4. Logins por país (últimos 7 dias)
SELECT 
  country,
  COUNT(*) as logins,
  COUNT(DISTINCT user_id) as unique_users
FROM mcp_audit_log
WHERE event_type = 'login'
  AND created_at > NOW() - INTERVAL '7 days'
  AND country IS NOT NULL
GROUP BY country
ORDER BY logins DESC;

-- 5. Usuários mais ativos (último mês)
SELECT 
  u.username,
  COUNT(*) FILTER (WHERE a.event_type = 'tool_call') as tool_calls,
  COUNT(*) FILTER (WHERE a.event_type = 'login') as logins,
  MAX(a.created_at) as last_activity
FROM mcp_audit_log a
JOIN mcp_users u ON a.user_id = u.id
WHERE a.created_at > NOW() - INTERVAL '30 days'
GROUP BY u.username
ORDER BY tool_calls DESC
LIMIT 10;

-- 6. Erros mais comuns (última semana)
SELECT 
  error_message,
  COUNT(*) as occurrences,
  MAX(created_at) as last_occurrence
FROM mcp_audit_log
WHERE status = 'error'
  AND created_at > NOW() - INTERVAL '7 days'
  AND error_message IS NOT NULL
GROUP BY error_message
ORDER BY occurrences DESC
LIMIT 20;

-- 7. Performance por ferramenta (ordenado por mais lento)
SELECT 
  tool_name,
  COUNT(*) as executions,
  ROUND(AVG(duration_ms)::numeric, 2) as avg_ms,
  ROUND(MAX(duration_ms)::numeric, 2) as max_ms,
  ROUND(MIN(duration_ms)::numeric, 2) as min_ms
FROM mcp_audit_log
WHERE event_type = 'tool_call'
  AND duration_ms IS NOT NULL
  AND created_at > NOW() - INTERVAL '30 days'
GROUP BY tool_name
ORDER BY avg_ms DESC;

-- 8. Acessos por IP (detectar possível ataque)
SELECT 
  ip_address,
  country,
  COUNT(*) as requests,
  COUNT(*) FILTER (WHERE status = 'error') as errors,
  MIN(created_at) as first_seen,
  MAX(created_at) as last_seen
FROM mcp_audit_log
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY ip_address, country
HAVING COUNT(*) > 10  -- Só IPs com mais de 10 requisições
ORDER BY requests DESC;

-- 9. Último login de cada usuário
SELECT 
  u.username,
  u.last_login_at as last_login_mcp_users,
  MAX(a.created_at) as last_login_audit_log,
  COUNT(a.id) as total_logins
FROM mcp_users u
LEFT JOIN mcp_audit_log a ON u.id = a.user_id AND a.event_type = 'login'
GROUP BY u.id, u.username, u.last_login_at
ORDER BY last_login_audit_log DESC NULLS LAST;