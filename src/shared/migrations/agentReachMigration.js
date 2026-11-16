// src/shared/migrations/agentReachMigration.js — Migração Agent-Reach (Zero-API-Fee Web Intelligence)
import { createLogger } from '../../utils/logger.js';

const log = createLogger('AgentReachMigration');

/**
 * Cria tabelas de cache e auditoria de pesquisas para o motor Agent-Reach (ADR-044)
 * @param {import('better-sqlite3').Database} db
 */
export function applyAgentReachMigration(db) {
  try {
    db.exec(`
      -- 1. agent_reach_cache: Cache persistente com TTL de pesquisas e leituras de páginas
      CREATE TABLE IF NOT EXISTS agent_reach_cache (
        id TEXT PRIMARY KEY,
        platform TEXT NOT NULL,
        query_or_url TEXT NOT NULL,
        title TEXT,
        author TEXT,
        url TEXT,
        snippet TEXT,
        envelope_json TEXT NOT NULL,
        cached_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_reach_cache_lookup ON agent_reach_cache(platform, query_or_url);
      CREATE INDEX IF NOT EXISTS idx_reach_cache_expires ON agent_reach_cache(expires_at);

      -- 2. agent_reach_logs: Registo de consultas e telemetria de latência
      CREATE TABLE IF NOT EXISTS agent_reach_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        platform TEXT NOT NULL,
        query_or_url TEXT NOT NULL,
        results_count INTEGER DEFAULT 0,
        latency_ms INTEGER DEFAULT 0,
        status TEXT DEFAULT 'ok',
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_reach_logs_created ON agent_reach_logs(created_at DESC);
    `);

    log.info('Migração Agent-Reach aplicada com sucesso.');
  } catch (err) {
    log.error('Erro ao aplicar migração Agent-Reach:', err.message);
  }
}

export default {
  applyAgentReachMigration
};
