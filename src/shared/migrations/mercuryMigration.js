// src/shared/migrations/mercuryMigration.js — Padrões Mercury (Second Brain FTS5 + Token Budget ADR-044)
import { createLogger } from '../../utils/logger.js';

const log = createLogger('MercuryMigration');

/**
 * Cria tabelas e índices para Second Brain (FTS5) e Orçamento de Tokens (ADR-044)
 * @param {import('better-sqlite3').Database} db
 */
export function applyMercuryMigration(db) {
  try {
    db.exec(`
      -- 1. memory_facts (Fatos duráveis do utilizador com pontuação de confiança)
      CREATE TABLE IF NOT EXISTS memory_facts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        category TEXT DEFAULT 'geral',
        fact TEXT NOT NULL,
        confidence_score REAL DEFAULT 1.0,
        source TEXT DEFAULT 'chat',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_memory_facts_user ON memory_facts(user_id);
      CREATE INDEX IF NOT EXISTS idx_memory_facts_category ON memory_facts(category);

      -- 2. Tabela Virtual FTS5 para pesquisa textual ultra-rápida (Second Brain)
      CREATE VIRTUAL TABLE IF NOT EXISTS memory_facts_fts USING fts5(
        fact,
        category,
        content='memory_facts',
        content_rowid='rowid'
      );

      -- Triggers para manter FTS5 perfeitamente sincronizado com memory_facts
      CREATE TRIGGER IF NOT EXISTS trg_memory_facts_ai AFTER INSERT ON memory_facts BEGIN
        INSERT INTO memory_facts_fts(rowid, fact, category) VALUES (new.rowid, new.fact, new.category);
      END;

      CREATE TRIGGER IF NOT EXISTS trg_memory_facts_ad AFTER DELETE ON memory_facts BEGIN
        INSERT INTO memory_facts_fts(memory_facts_fts, rowid, fact, category) VALUES('delete', old.rowid, old.fact, old.category);
      END;

      CREATE TRIGGER IF NOT EXISTS trg_memory_facts_au AFTER UPDATE ON memory_facts BEGIN
        INSERT INTO memory_facts_fts(memory_facts_fts, rowid, fact, category) VALUES('delete', old.rowid, old.fact, old.category);
        INSERT INTO memory_facts_fts(rowid, fact, category) VALUES (new.rowid, new.fact, new.category);
      END;

      -- 3. token_budget (ADR-044 — Orçamento e controlo de consumo diário de tokens)
      CREATE TABLE IF NOT EXISTS token_budget (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        model TEXT NOT NULL,
        tokens_used INTEGER DEFAULT 0,
        token_limit INTEGER DEFAULT 100000,
        cost_estimate_eur REAL DEFAULT 0.0,
        requests_count INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(date, model)
      );
      CREATE INDEX IF NOT EXISTS idx_token_budget_date ON token_budget(date);

      -- 4. idea_radar (Motor Cloud-Native de Absorção e Adaptação de Ideias Open-Source)
      CREATE TABLE IF NOT EXISTS idea_radar (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_url TEXT NOT NULL,
        repo_name TEXT,
        target_project TEXT NOT NULL,
        user_notes TEXT,
        extracted_summary TEXT,
        cloud_adaptation_plan TEXT,
        ide_prompt TEXT,
        status TEXT DEFAULT 'pending',
        created_at TEXT,
        updated_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_idea_radar_target ON idea_radar(target_project);
      CREATE INDEX IF NOT EXISTS idx_idea_radar_status ON idea_radar(status);
    `);
    log.info('Migração Mercury (Second Brain FTS5 + Token Budget ADR-044) aplicada com sucesso.');
  } catch (err) {
    log.error('Erro ao aplicar migração Mercury:', err.message);
    throw err;
  }
}

