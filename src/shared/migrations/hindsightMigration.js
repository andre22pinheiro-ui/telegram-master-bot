// src/shared/migrations/hindsightMigration.js — Migração Biomimética Hindsight (Retain, Recall, Reflect)
import { createLogger } from '../../utils/logger.js';

const log = createLogger('HindsightMigration');

/**
 * Cria tabelas e bancos padrão para o motor Hindsight (ADR-044)
 * @param {import('better-sqlite3').Database} db
 */
export function applyHindsightMigration(db) {
  try {
    db.exec(`
      -- 1. hindsight_banks (Bancos de Memória Particionados)
      CREATE TABLE IF NOT EXISTS hindsight_banks (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        created_at TEXT NOT NULL
      );

      -- 2. hindsight_memories (Memórias Biomiméticas e Observações Aprendidas)
      CREATE TABLE IF NOT EXISTS hindsight_memories (
        id TEXT PRIMARY KEY,
        bank_id TEXT NOT NULL,
        content TEXT NOT NULL,
        category TEXT DEFAULT 'observacao',
        confidence REAL DEFAULT 1.0,
        metadata TEXT DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (bank_id) REFERENCES hindsight_banks(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_hindsight_bank_created ON hindsight_memories(bank_id, created_at DESC);
    `);

    // Inserir bancos canónicos iniciais se não existirem
    const count = db.prepare('SELECT COUNT(*) as c FROM hindsight_banks').get().c;
    if (count === 0) {
      const now = new Date().toISOString();
      const insert = db.prepare('INSERT INTO hindsight_banks (id, name, description, created_at) VALUES (?, ?, ?, ?)');
      insert.run('pessoal_andre', 'Pessoal & Hábitos André', 'Preferências diárias, rotinas, saúde e nutrição', now);
      insert.run('familia', 'Família & Carolina', 'Rotinas domésticas, desenvolvimento da bebé e compras partilhadas', now);
      insert.run('dev_cloud', 'DevOps & Engenharia Cloud', 'Projetos Vercel/Render, deploys, builds APK e absorção de ideias', now);
      insert.run('frota_municipal', 'Frota Municipal Amarante', 'Regras de tacógrafo CE 561/2006, manutenção de autocarros e auditoria', now);
    }

    log.info('Migração Hindsight aplicada com sucesso.');
  } catch (err) {
    log.error('Erro ao aplicar migração Hindsight:', err.message);
  }
}

export default {
  applyHindsightMigration
};
