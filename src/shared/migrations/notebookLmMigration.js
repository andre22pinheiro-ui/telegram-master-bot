// src/shared/migrations/notebookLmMigration.js — Migração NotebookLM Cloud-Native (Cadernos & Fontes FTS5)
import { createLogger } from '../../utils/logger.js';

const log = createLogger('NotebookLmMigration');

/**
 * Cria tabelas e índices para o motor NotebookLM (Cadernos, Fontes e FTS5)
 * @param {import('better-sqlite3').Database} db
 */
export function applyNotebookLmMigration(db) {
  try {
    db.exec(`
      -- 1. notebooks: Cadernos de Conhecimento temáticos
      CREATE TABLE IF NOT EXISTS notebooks (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(user_id, title)
      );

      CREATE INDEX IF NOT EXISTS idx_notebooks_user ON notebooks(user_id);
      CREATE INDEX IF NOT EXISTS idx_notebooks_title ON notebooks(title);

      -- 2. notebook_sources: Fontes de verdade anexadas a cada caderno (Texto, URLs, Docs)
      CREATE TABLE IF NOT EXISTS notebook_sources (
        id TEXT PRIMARY KEY,
        notebook_id TEXT NOT NULL,
        title TEXT NOT NULL,
        source_type TEXT NOT NULL DEFAULT 'text',
        content TEXT NOT NULL,
        url TEXT,
        word_count INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (notebook_id) REFERENCES notebooks(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_notebook_sources_notebook ON notebook_sources(notebook_id);

      -- 3. Tabela Virtual FTS5 para pesquisa semântica/textual ultra-rápida nas fontes
      CREATE VIRTUAL TABLE IF NOT EXISTS notebook_sources_fts USING fts5(
        notebook_id UNINDEXED,
        title,
        content,
        content='notebook_sources',
        content_rowid='rowid'
      );

      -- Triggers para manter o índice FTS5 sincronizado em tempo real
      CREATE TRIGGER IF NOT EXISTS trg_nb_sources_ai AFTER INSERT ON notebook_sources BEGIN
        INSERT INTO notebook_sources_fts(rowid, notebook_id, title, content)
        VALUES (new.rowid, new.notebook_id, new.title, new.content);
      END;

      CREATE TRIGGER IF NOT EXISTS trg_nb_sources_ad AFTER DELETE ON notebook_sources BEGIN
        INSERT INTO notebook_sources_fts(notebook_sources_fts, rowid, notebook_id, title, content)
        VALUES('delete', old.rowid, old.notebook_id, old.title, old.content);
      END;

      CREATE TRIGGER IF NOT EXISTS trg_nb_sources_au AFTER UPDATE ON notebook_sources BEGIN
        INSERT INTO notebook_sources_fts(notebook_sources_fts, rowid, notebook_id, title, content)
        VALUES('delete', old.rowid, old.notebook_id, old.title, old.content);
        INSERT INTO notebook_sources_fts(rowid, notebook_id, title, content)
        VALUES (new.rowid, new.notebook_id, new.title, new.content);
      END;
    `);

    log.info('Migração NotebookLM (Cadernos, Fontes & FTS5) aplicada com sucesso.');
  } catch (err) {
    log.error('Erro ao aplicar migração NotebookLM:', err.message);
  }
}

export default {
  applyNotebookLmMigration
};
