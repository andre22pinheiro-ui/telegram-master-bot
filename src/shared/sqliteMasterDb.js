// src/shared/sqliteMasterDb.js — Base de Dados Única SQLite WAL Pessoal & Familiar (13 Tabelas)
import Database from 'better-sqlite3';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import path from 'path';
import { createLogger } from '../utils/logger.js';

const log = createLogger('SqliteMasterDb');

const DEFAULT_DB_PATH = path.resolve('./data/pessoal_master.db');
const LEGACY_DATA_DIR = path.resolve('./data');

function getDbPath() {
  return process.env.MASTER_DB_PATH ? path.resolve(process.env.MASTER_DB_PATH) : DEFAULT_DB_PATH;
}

let dbInstance = null;
let initializedPath = null;

export function triggerCloudSyncDebounced(delayMs = 5000) {
  if (process.env.NODE_ENV === 'test' || process.env.DISABLE_DRIVE_SYNC === 'true') {
    return false;
  }
  import('../services/googleDriveService.js')
    .then((m) => m.triggerCloudSyncDebounced?.(delayMs))
    .catch(() => {});
  return true;
}

function notifyDriveSync() {
  return triggerCloudSyncDebounced(5000);
}

function initTables(db) {
  db.exec(`
    -- 1. Lista de Compras
    CREATE TABLE IF NOT EXISTS shopping (
      id TEXT PRIMARY KEY,
      item_text TEXT NOT NULL,
      category TEXT DEFAULT 'geral',
      completed INTEGER DEFAULT 0,
      created_by_name TEXT DEFAULT 'André',
      created_at TEXT NOT NULL
    );

    -- 2. Tarefas Familiares
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      assigned_to TEXT DEFAULT 'Ambos',
      completed INTEGER DEFAULT 0,
      created_by_name TEXT DEFAULT 'André',
      created_at TEXT NOT NULL
    );

    -- 3. Diário Bebé (Carolina)
    CREATE TABLE IF NOT EXISTS baby_logs (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      details TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_by_name TEXT DEFAULT 'André',
      logged_time TEXT NOT NULL
    );

    -- 4. Notas Rápidas
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      title TEXT DEFAULT 'Nota',
      content TEXT NOT NULL,
      color_tag TEXT DEFAULT 'blue',
      created_by_name TEXT DEFAULT 'André',
      created_at TEXT NOT NULL
    );

    -- 5. Lembretes Proativos
    CREATE TABLE IF NOT EXISTS reminders (
      id TEXT PRIMARY KEY,
      text TEXT NOT NULL,
      trigger_at TEXT NOT NULL,
      chat_id TEXT DEFAULT '950415577',
      created_by_name TEXT DEFAULT 'André',
      created_at TEXT NOT NULL,
      sent INTEGER DEFAULT 0,
      sent_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_reminders_due ON reminders(sent, trigger_at);

    -- 6. Registos de Nutrição & Alta Proteína
    CREATE TABLE IF NOT EXISTS nutrition_logs (
      id TEXT PRIMARY KEY,
      meal TEXT DEFAULT 'Refeição',
      protein REAL DEFAULT 0,
      calories REAL DEFAULT 0,
      carbs REAL DEFAULT 0,
      fats REAL DEFAULT 0,
      water_ml INTEGER DEFAULT 0,
      creatina INTEGER DEFAULT 0,
      notes TEXT DEFAULT '',
      created_by_name TEXT DEFAULT 'André',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_nutrition_created ON nutrition_logs(created_at);

    -- 7. Radar Frente 1: Casas Amarante & CMVM
    CREATE TABLE IF NOT EXISTS radar_casas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fingerprint TEXT NOT NULL,
      freguesia TEXT,
      tipologia TEXT,
      titulo TEXT,
      portal TEXT,
      url TEXT UNIQUE,
      preco REAL,
      preco_anterior REAL,
      area_util REAL,
      area_terreno REAL,
      classe_energetica TEXT,
      sem_licenca INTEGER DEFAULT 0,
      is_ruina INTEGER DEFAULT 0,
      valor_cmvm REAL,
      classificacao TEXT,
      alertado INTEGER DEFAULT 0,
      data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      data_atualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- 8. Radar Frente 2: Carros (EV >300km, Híbridos, Combustão)
    CREATE TABLE IF NOT EXISTS radar_carros (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fingerprint TEXT NOT NULL,
      marca_modelo TEXT NOT NULL,
      combustivel TEXT DEFAULT 'eletrico',
      autonomia_km INTEGER DEFAULT 0,
      ano INTEGER,
      km INTEGER,
      preco REAL,
      preco_anterior REAL,
      portal TEXT,
      url TEXT UNIQUE,
      localizacao TEXT DEFAULT 'Portugal',
      classificacao TEXT DEFAULT '🚗 OPORTUNIDADE',
      alertado INTEGER DEFAULT 0,
      data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      data_atualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- 9. Radar Frente 3: Tech & Informática (Portáteis, TVs, Gadgets, Smartphones)
    CREATE TABLE IF NOT EXISTS radar_tech (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fingerprint TEXT NOT NULL,
      categoria TEXT DEFAULT 'tech',
      produto TEXT NOT NULL,
      loja TEXT,
      estado TEXT DEFAULT 'novo',
      preco REAL,
      preco_anterior REAL,
      desconto_pct REAL DEFAULT 0,
      url TEXT UNIQUE,
      classificacao TEXT DEFAULT '💻 NEGÓCIO',
      alertado INTEGER DEFAULT 0,
      data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      data_atualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- 10. Radar Frente 4: Amazon.es & Warehouse (Segunda Mano)
    CREATE TABLE IF NOT EXISTS radar_amazon (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fingerprint TEXT NOT NULL,
      titulo TEXT NOT NULL,
      asin TEXT,
      categoria TEXT DEFAULT 'ofertas',
      condicao TEXT DEFAULT 'Novo',
      preco REAL,
      preco_anterior REAL,
      preco_habitual REAL,
      desconto_pct REAL DEFAULT 0,
      fonte TEXT DEFAULT 'amazon.es',
      url TEXT UNIQUE,
      alertado INTEGER DEFAULT 0,
      data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      data_atualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- 11. Radar Frente 5: Ecossistema Apple (Novo vs Recondicionado Grau A)
    CREATE TABLE IF NOT EXISTS radar_apple (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fingerprint TEXT NOT NULL,
      modelo TEXT NOT NULL,
      capacidade TEXT,
      condicao TEXT DEFAULT 'Novo',
      loja TEXT,
      bateria_pct TEXT DEFAULT '100%',
      garantia_meses INTEGER DEFAULT 36,
      preco REAL,
      preco_anterior REAL,
      diferenca_novo_eur REAL DEFAULT 0,
      recomendacao TEXT,
      url TEXT UNIQUE,
      alertado INTEGER DEFAULT 0,
      data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      data_atualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- 12. Filtros & Alertas de Vigilância Ativa (/vigiar)
    CREATE TABLE IF NOT EXISTS radar_filtros (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      categoria TEXT NOT NULL,
      termo TEXT NOT NULL,
      url TEXT,
      preco_alvo REAL,
      ativo INTEGER DEFAULT 1,
      chat_id TEXT DEFAULT '950415577',
      created_by TEXT DEFAULT 'André',
      ultimo_preco REAL,
      ultima_verificacao TEXT,
      created_at TEXT NOT NULL
    );

    -- 13. Memória Conversacional Persistente
    CREATE TABLE IF NOT EXISTS conversation_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_key TEXT NOT NULL,
      chat_id TEXT NOT NULL,
      worker_tag TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp_ms INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_conv_session ON conversation_history(session_key, timestamp_ms);

    -- 14. Receitas Saudáveis Guardadas (Airfryer / MCC / Geral)
    CREATE TABLE IF NOT EXISTS saved_recipes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      mode TEXT DEFAULT 'geral',
      query TEXT DEFAULT '',
      content TEXT NOT NULL,
      protein_g REAL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    -- 15. Histórico de Execuções do Radar 5 Frentes
    CREATE TABLE IF NOT EXISTS radar_execucoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      frente TEXT NOT NULL,
      total_scanned INTEGER DEFAULT 0,
      new_alerts INTEGER DEFAULT 0,
      status TEXT DEFAULT 'ok',
      executed_at TEXT NOT NULL
    );

    -- 16. Registo de Erros & Self-Refine Cloud
    CREATE TABLE IF NOT EXISTS error_reports (
      id TEXT PRIMARY KEY,
      service TEXT NOT NULL,
      message TEXT NOT NULL,
      stack TEXT,
      context_json TEXT DEFAULT '{}',
      resolved INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );
  `);
}

function migrateLegacyDataIfNeeded(db, dbPath) {
  // Só migrar automaticamente quando usamos a DB principal (não em ficheiros de teste temporários)
  if (path.resolve(dbPath) !== DEFAULT_DB_PATH) {
    return;
  }

  try {
    // A. Migrar family_store.json -> tabelas shopping, tasks, baby_logs, notes, nutrition_logs, reminders
    const familyFile = path.join(LEGACY_DATA_DIR, 'family_store.json');
    if (existsSync(familyFile)) {
      const store = JSON.parse(readFileSync(familyFile, 'utf8'));
      const tx = db.transaction(() => {
        if (db.prepare('SELECT COUNT(*) AS c FROM shopping').get().c === 0 && Array.isArray(store.shopping)) {
          const stmt = db.prepare('INSERT OR IGNORE INTO shopping (id, item_text, category, completed, created_by_name, created_at) VALUES (?, ?, ?, ?, ?, ?)');
          for (const it of store.shopping) {
            stmt.run(String(it.id || Date.now()), String(it.item_text || it.text || ''), it.category || 'geral', it.completed ? 1 : 0, it.created_by_name || 'André', it.created_at || new Date().toISOString());
          }
        }
        if (db.prepare('SELECT COUNT(*) AS c FROM tasks').get().c === 0 && Array.isArray(store.tasks)) {
          const stmt = db.prepare('INSERT OR IGNORE INTO tasks (id, title, assigned_to, completed, created_by_name, created_at) VALUES (?, ?, ?, ?, ?, ?)');
          for (const t of store.tasks) {
            stmt.run(String(t.id || Date.now()), String(t.title || ''), t.assigned_to || 'Ambos', t.completed ? 1 : 0, t.created_by_name || 'André', t.created_at || new Date().toISOString());
          }
        }
        if (db.prepare('SELECT COUNT(*) AS c FROM baby_logs').get().c === 0 && Array.isArray(store.baby_logs)) {
          const stmt = db.prepare('INSERT OR IGNORE INTO baby_logs (id, event_type, details, notes, created_by_name, logged_time) VALUES (?, ?, ?, ?, ?, ?)');
          for (const l of store.baby_logs) {
            stmt.run(String(l.id || Date.now()), l.event_type || 'registo', l.details || '', l.notes || '', l.created_by_name || 'André', l.logged_time || new Date().toISOString());
          }
        }
        if (db.prepare('SELECT COUNT(*) AS c FROM notes').get().c === 0 && Array.isArray(store.notes)) {
          const stmt = db.prepare('INSERT OR IGNORE INTO notes (id, title, content, color_tag, created_by_name, created_at) VALUES (?, ?, ?, ?, ?, ?)');
          for (const n of store.notes) {
            stmt.run(String(n.id || Date.now()), n.title || 'Nota', n.content || '', n.color_tag || 'blue', n.created_by_name || 'André', n.created_at || new Date().toISOString());
          }
        }
        if (db.prepare('SELECT COUNT(*) AS c FROM nutrition_logs').get().c === 0 && Array.isArray(store.nutrition_logs)) {
          const stmt = db.prepare('INSERT OR IGNORE INTO nutrition_logs (id, meal, protein, calories, carbs, fats, water_ml, creatina, notes, created_by_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
          for (const nu of store.nutrition_logs) {
            stmt.run(String(nu.id || Date.now()), nu.meal || 'Refeição', Number(nu.protein) || 0, Number(nu.calories) || 0, Number(nu.carbs) || 0, Number(nu.fats) || 0, Number(nu.water_ml) || 0, nu.creatina ? 1 : 0, nu.notes || '', nu.created_by_name || 'André', nu.created_at || new Date().toISOString());
          }
        }
        if (db.prepare('SELECT COUNT(*) AS c FROM reminders').get().c === 0 && Array.isArray(store.reminders)) {
          const stmt = db.prepare('INSERT OR IGNORE INTO reminders (id, text, trigger_at, chat_id, created_by_name, created_at, sent, sent_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
          for (const r of store.reminders) {
            stmt.run(String(r.id || Date.now()), r.text || '', r.trigger_at || new Date().toISOString(), String(r.chat_id || '950415577'), r.created_by_name || 'André', r.created_at || new Date().toISOString(), r.sent ? 1 : 0, r.sent_at || null);
          }
        }
      });
      tx();
      log.info('Migração legada de family_store.json para pessoal_master.db verificada.');
    }

    // B. Migrar imoveis_amarante.db -> tabela radar_casas
    const legacyImmoPath = path.join(LEGACY_DATA_DIR, 'imoveis_amarante.db');
    if (existsSync(legacyImmoPath) && db.prepare('SELECT COUNT(*) AS c FROM radar_casas').get().c === 0) {
      const legacyDb = new Database(legacyImmoPath, { readonly: true });
      try {
        const rows = legacyDb.prepare('SELECT * FROM imoveis').all();
        if (rows.length > 0) {
          const stmt = db.prepare(`
            INSERT OR IGNORE INTO radar_casas (
              fingerprint, freguesia, tipologia, titulo, portal, url, preco,
              area_util, area_terreno, classe_energetica, sem_licenca, is_ruina,
              valor_cmvm, classificacao, alertado, data_criacao, data_atualizacao
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          const txImmo = db.transaction((items) => {
            for (const row of items) {
              stmt.run(
                row.fingerprint || 'migrado',
                row.freguesia || 'Amarante',
                row.tipologia || 'Moradia',
                row.titulo || 'Imóvel em Amarante',
                row.portal || 'Portal Imobiliário',
                row.url,
                row.preco || 0,
                row.area_util || 100,
                row.area_terreno || 0,
                row.classe_energetica || 'D',
                row.sem_licenca ? 1 : 0,
                row.is_ruina ? 1 : 0,
                row.valor_cmvm || 0,
                row.classificacao || null,
                row.alertado ? 1 : 0,
                row.data_criacao || new Date().toISOString(),
                row.data_atualizacao || new Date().toISOString()
              );
            }
          });
          txImmo(rows);
          log.info(`Migrados ${rows.length} imóveis legados para radar_casas em pessoal_master.db.`);
        }
      } finally {
        legacyDb.close();
      }
    }

    // C. Migrar conversas_historico.json -> conversation_history
    const legacyConvPath = path.join(LEGACY_DATA_DIR, 'conversas_historico.json');
    if (existsSync(legacyConvPath) && db.prepare('SELECT COUNT(*) AS c FROM conversation_history').get().c === 0) {
      const convObj = JSON.parse(readFileSync(legacyConvPath, 'utf8'));
      const stmt = db.prepare('INSERT INTO conversation_history (session_key, chat_id, worker_tag, role, content, timestamp_ms) VALUES (?, ?, ?, ?, ?, ?)');
      const txConv = db.transaction(() => {
        for (const [sessionKey, session] of Object.entries(convObj || {})) {
          const [chatId = 'default', workerTag = 'master'] = sessionKey.split(':');
          for (const turn of session?.turns || []) {
            stmt.run(sessionKey, chatId, workerTag, turn.role || 'user', String(turn.content || ''), Number(turn.timestamp) || Date.now());
          }
        }
      });
      txConv();
      log.info('Histórico conversacional legado migrado para pessoal_master.db.');
    }
  } catch (err) {
    log.warn(`Aviso na migração legada para pessoal_master.db: ${err.message}`);
  }
}

export function getMasterDb() {
  const targetPath = getDbPath();
  if (dbInstance && initializedPath === targetPath) {
    return dbInstance;
  }

  if (dbInstance && initializedPath !== targetPath) {
    try { dbInstance.close(); } catch {}
    dbInstance = null;
  }

  const dir = path.dirname(targetPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const db = new Database(targetPath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('busy_timeout = 5000');

  initTables(db);
  migrateLegacyDataIfNeeded(db, targetPath);

  dbInstance = db;
  initializedPath = targetPath;
  log.info(`SQLite WAL Master ativo: ${targetPath}`);
  return dbInstance;
}

export function checkpointMasterDb() {
  try {
    const db = getMasterDb();
    db.pragma('wal_checkpoint(TRUNCATE)');
    return true;
  } catch (err) {
    log.error(`Erro no WAL checkpoint: ${err.message}`);
    return false;
  }
}

export function closeMasterDb() {
  if (dbInstance) {
    try {
      dbInstance.pragma('wal_checkpoint(TRUNCATE)');
      dbInstance.close();
    } catch {}
    dbInstance = null;
    initializedPath = null;
  }
}

function generateId() {
  return `${Date.now()}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
}

function userDisplayName(user = {}) {
  if (typeof user === 'string') return user || 'André';
  return user?.first_name || user?.username || 'André';
}

// ─── Helper Genérico para Upsert e Deteção de Baixa de Preço no Radar ───────
const VALID_RADAR_TABLES = new Set([
  'radar_casas', 'radar_carros', 'radar_tech', 'radar_amazon', 'radar_apple'
]);

function upsertRadarRecord(table, url, preco, insertSql, insertParams, updateSql, updateParams) {
  if (!VALID_RADAR_TABLES.has(table)) {
    throw new Error(`Tabela de radar inválida: ${table}`);
  }
  const db = getMasterDb();
  const existing = db.prepare(`SELECT * FROM ${table} WHERE url = ?`).get(url);

  if (!existing) {
    const info = db.prepare(insertSql).run(...insertParams);
    const created = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(info.lastInsertRowid);
    notifyDriveSync();
    return { isNew: true, priceDropped: false, previousPrice: null, record: created };
  }

  const oldPrice = Number(existing.preco) || 0;
  const newPrice = Number(preco) || 0;
  const priceDropped = oldPrice > 0 && newPrice > 0 && newPrice < oldPrice;

  db.prepare(updateSql).run(
    ...updateParams,
    priceDropped ? oldPrice : existing.preco_anterior,
    priceDropped ? 0 : existing.alertado,
    existing.id
  );
  const updated = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(existing.id);
  if (priceDropped) notifyDriveSync();
  return { isNew: false, priceDropped, previousPrice: oldPrice, record: updated };
}

export const sqliteMasterDb = {
  getDbPath,
  getDb: getMasterDb,
  checkpoint: checkpointMasterDb,
  close: closeMasterDb,

  // ─── 1. COMPRAS ─────────────────────────────────────────────────────────────
  getShopping() {
    const rows = getMasterDb().prepare('SELECT * FROM shopping ORDER BY rowid DESC').all();
    return rows.map((r) => ({ ...r, completed: Boolean(r.completed) }));
  },
  addShopping(itemText, category = 'geral', user = {}) {
    const id = generateId();
    const createdAt = new Date().toISOString();
    const createdBy = userDisplayName(user);
    getMasterDb()
      .prepare('INSERT INTO shopping (id, item_text, category, completed, created_by_name, created_at) VALUES (?, ?, ?, 0, ?, ?)')
      .run(id, String(itemText || '').trim(), category || 'geral', createdBy, createdAt);
    notifyDriveSync();
    return { id, item_text: String(itemText || '').trim(), category: category || 'geral', completed: false, created_by_name: createdBy, created_at: createdAt };
  },
  toggleShopping(id, completed) {
    const db = getMasterDb();
    const current = db.prepare('SELECT completed FROM shopping WHERE id = ?').get(String(id));
    if (!current) return { success: false };
    const next = typeof completed === 'boolean' ? (completed ? 1 : 0) : (current.completed ? 0 : 1);
    db.prepare('UPDATE shopping SET completed = ? WHERE id = ?').run(next, String(id));
    notifyDriveSync();
    return { success: true };
  },
  deleteShopping(id) {
    getMasterDb().prepare('DELETE FROM shopping WHERE id = ?').run(String(id));
    notifyDriveSync();
    return { success: true };
  },
  clearCompletedShopping() {
    getMasterDb().prepare('DELETE FROM shopping WHERE completed = 1').run();
    notifyDriveSync();
    return { success: true };
  },

  // ─── 2. TAREFAS ─────────────────────────────────────────────────────────────
  getTasks() {
    const rows = getMasterDb().prepare('SELECT * FROM tasks ORDER BY rowid DESC').all();
    return rows.map((r) => ({ ...r, completed: Boolean(r.completed) }));
  },
  addTask(title, assignedTo = 'Ambos', user = {}) {
    const id = generateId();
    const createdAt = new Date().toISOString();
    const createdBy = userDisplayName(user);
    getMasterDb()
      .prepare('INSERT INTO tasks (id, title, assigned_to, completed, created_by_name, created_at) VALUES (?, ?, ?, 0, ?, ?)')
      .run(id, String(title || '').trim(), assignedTo || 'Ambos', createdBy, createdAt);
    notifyDriveSync();
    return { id, title: String(title || '').trim(), assigned_to: assignedTo || 'Ambos', completed: false, created_by_name: createdBy, created_at: createdAt };
  },
  toggleTask(id, completed) {
    const db = getMasterDb();
    const current = db.prepare('SELECT completed FROM tasks WHERE id = ?').get(String(id));
    if (!current) return { success: false };
    const next = typeof completed === 'boolean' ? (completed ? 1 : 0) : (current.completed ? 0 : 1);
    db.prepare('UPDATE tasks SET completed = ? WHERE id = ?').run(next, String(id));
    notifyDriveSync();
    return { success: true };
  },
  deleteTask(id) {
    getMasterDb().prepare('DELETE FROM tasks WHERE id = ?').run(String(id));
    notifyDriveSync();
    return { success: true };
  },

  // ─── 3. DIÁRIO BEBÉ (CAROLINA) ──────────────────────────────────────────────
  getBabyLogs() {
    return getMasterDb().prepare('SELECT * FROM baby_logs ORDER BY rowid DESC').all();
  },
  addBabyLog(eventType, details, notes = '', user = {}) {
    const id = generateId();
    const loggedTime = new Date().toISOString();
    const createdBy = userDisplayName(user);
    getMasterDb()
      .prepare('INSERT INTO baby_logs (id, event_type, details, notes, created_by_name, logged_time) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, eventType || 'registo', details || '', notes || '', createdBy, loggedTime);
    notifyDriveSync();
    return { id, event_type: eventType || 'registo', details: details || '', notes: notes || '', created_by_name: createdBy, logged_time: loggedTime };
  },
  deleteBabyLog(id) {
    getMasterDb().prepare('DELETE FROM baby_logs WHERE id = ?').run(String(id));
    notifyDriveSync();
    return { success: true };
  },

  // ─── 4. NOTAS ───────────────────────────────────────────────────────────────
  getNotes() {
    return getMasterDb().prepare('SELECT * FROM notes ORDER BY rowid DESC').all();
  },
  addNote(title, content, colorTag = 'blue', user = {}) {
    const id = generateId();
    const createdAt = new Date().toISOString();
    const createdBy = userDisplayName(user);
    getMasterDb()
      .prepare('INSERT INTO notes (id, title, content, color_tag, created_by_name, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, title || 'Nota', content || '', colorTag || 'blue', createdBy, createdAt);
    notifyDriveSync();
    return { id, title: title || 'Nota', content: content || '', color_tag: colorTag || 'blue', created_by_name: createdBy, created_at: createdAt };
  },
  deleteNote(id) {
    getMasterDb().prepare('DELETE FROM notes WHERE id = ?').run(String(id));
    notifyDriveSync();
    return { success: true };
  },

  // ─── 5. LEMBRETES ───────────────────────────────────────────────────────────
  getReminders() {
    const rows = getMasterDb().prepare('SELECT * FROM reminders ORDER BY trigger_at ASC').all();
    return rows.map((r) => ({ ...r, sent: Boolean(r.sent) }));
  },
  addReminder({ text, triggerAt, chatId = '950415577', user = {} }) {
    const id = generateId();
    const createdAt = new Date().toISOString();
    const isoTrigger = new Date(triggerAt).toISOString();
    const createdBy = userDisplayName(user);
    getMasterDb()
      .prepare('INSERT INTO reminders (id, text, trigger_at, chat_id, created_by_name, created_at, sent) VALUES (?, ?, ?, ?, ?, ?, 0)')
      .run(id, String(text || '').trim(), isoTrigger, String(chatId || '950415577'), createdBy, createdAt);
    notifyDriveSync();
    return {
      id,
      text: String(text || '').trim(),
      trigger_at: isoTrigger,
      chat_id: String(chatId || '950415577'),
      created_by_name: createdBy,
      created_at: createdAt,
      sent: false
    };
  },
  getPendingDueReminders() {
    const nowIso = new Date().toISOString();
    const rows = getMasterDb()
      .prepare('SELECT * FROM reminders WHERE sent = 0 AND trigger_at <= ? ORDER BY trigger_at ASC')
      .all(nowIso);
    return rows.map((r) => ({ ...r, sent: false }));
  },
  markReminderSent(id) {
    const sentAt = new Date().toISOString();
    getMasterDb().prepare('UPDATE reminders SET sent = 1, sent_at = ? WHERE id = ?').run(sentAt, String(id));
    notifyDriveSync();
    return { success: true };
  },
  deleteReminder(id) {
    getMasterDb().prepare('DELETE FROM reminders WHERE id = ?').run(String(id));
    notifyDriveSync();
    return { success: true };
  },

  // ─── 6. NUTRIÇÃO ────────────────────────────────────────────────────────────
  getNutritionLogs() {
    const rows = getMasterDb().prepare('SELECT * FROM nutrition_logs ORDER BY rowid DESC').all();
    return rows.map((r) => ({ ...r, creatina: Boolean(r.creatina) }));
  },
  addNutritionLog({ meal = 'Refeição', protein = 0, calories = 0, carbs = 0, fats = 0, water_ml = 0, creatina = false, notes = '', user = {} } = {}) {
    const id = generateId();
    const createdAt = new Date().toISOString();
    const createdBy = userDisplayName(user);
    getMasterDb()
      .prepare(`
        INSERT INTO nutrition_logs (id, meal, protein, calories, carbs, fats, water_ml, creatina, notes, created_by_name, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        id,
        meal || 'Refeição',
        Number(protein) || 0,
        Number(calories) || 0,
        Number(carbs) || 0,
        Number(fats) || 0,
        Number(water_ml) || 0,
        creatina ? 1 : 0,
        notes || '',
        createdBy,
        createdAt
      );
    notifyDriveSync();
    return {
      id,
      meal: meal || 'Refeição',
      protein: Number(protein) || 0,
      calories: Number(calories) || 0,
      carbs: Number(carbs) || 0,
      fats: Number(fats) || 0,
      water_ml: Number(water_ml) || 0,
      creatina: Boolean(creatina),
      notes: notes || '',
      created_by_name: createdBy,
      created_at: createdAt
    };
  },
  deleteNutritionLog(id) {
    getMasterDb().prepare('DELETE FROM nutrition_logs WHERE id = ?').run(String(id));
    notifyDriveSync();
    return { success: true };
  },
  getTodayNutrition() {
    const logs = this.getNutritionLogs();
    const todayStr = new Date().toLocaleDateString('pt-PT', { timeZone: 'Europe/Lisbon' });
    const todayLogs = logs.filter((l) => {
      try {
        return new Date(l.created_at).toLocaleDateString('pt-PT', { timeZone: 'Europe/Lisbon' }) === todayStr;
      } catch {
        return false;
      }
    });

    const totalProtein = todayLogs.reduce((acc, cur) => acc + (Number(cur.protein) || 0), 0);
    const totalCalories = todayLogs.reduce((acc, cur) => acc + (Number(cur.calories) || 0), 0);
    const totalWater = todayLogs.reduce((acc, cur) => acc + (Number(cur.water_ml) || 0), 0);
    const tookCreatina = todayLogs.some((cur) => cur.creatina === true);

    return {
      todayLogs,
      totalProtein,
      totalCalories,
      totalWater,
      tookCreatina,
      proteinTarget: 160,
      waterTarget: 2500
    };
  },

  // ─── 7-11. RADAR 5 FRENTES (CASAS, CARROS, TECH, AMAZON, APPLE) ─────────────
  upsertRadarCasa(item) {
    return upsertRadarRecord(
      'radar_casas',
      item.url,
      item.preco,
      `INSERT INTO radar_casas (
        fingerprint, freguesia, tipologia, titulo, portal, url, preco,
        area_util, area_terreno, classe_energetica, sem_licenca, is_ruina,
        valor_cmvm, classificacao, alertado
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.fingerprint || 'amarante',
        item.freguesia || 'Amarante',
        item.tipologia || 'Moradia',
        item.titulo || 'Imóvel em Amarante',
        item.portal || 'Portal Imobiliário',
        item.url,
        Number(item.preco) || 0,
        Number(item.area_util) || 100,
        Number(item.area_terreno) || 0,
        item.classe_energetica || 'D',
        item.sem_licenca ? 1 : 0,
        item.is_ruina ? 1 : 0,
        Number(item.valor_cmvm) || 0,
        item.classificacao || null,
        item.alertado ? 1 : 0
      ],
      `UPDATE radar_casas SET
        preco = ?, titulo = ?, portal = ?, area_util = ?, area_terreno = ?,
        valor_cmvm = ?, classificacao = ?, preco_anterior = ?, alertado = ?,
        data_atualizacao = CURRENT_TIMESTAMP
      WHERE id = ?`,
      [
        Number(item.preco) || 0,
        item.titulo || 'Imóvel em Amarante',
        item.portal || 'Portal Imobiliário',
        Number(item.area_util) || 100,
        Number(item.area_terreno) || 0,
        Number(item.valor_cmvm) || 0,
        item.classificacao || null
      ]
    );
  },
  getRadarCasas(limit = 30) {
    return getMasterDb().prepare('SELECT * FROM radar_casas ORDER BY data_criacao DESC, id DESC LIMIT ?').all(limit);
  },

  upsertRadarCarro(item) {
    return upsertRadarRecord(
      'radar_carros',
      item.url,
      item.preco,
      `INSERT INTO radar_carros (
        fingerprint, marca_modelo, combustivel, autonomia_km, ano, km,
        preco, portal, url, localizacao, classificacao, alertado
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.fingerprint || 'carro',
        item.marca_modelo || 'Automóvel',
        item.combustivel || 'eletrico',
        Number(item.autonomia_km) || 0,
        item.ano ? Number(item.ano) : null,
        item.km ? Number(item.km) : null,
        Number(item.preco) || 0,
        item.portal || 'Auto',
        item.url,
        item.localizacao || 'Portugal',
        item.classificacao || '🚗 OPORTUNIDADE',
        item.alertado ? 1 : 0
      ],
      `UPDATE radar_carros SET
        preco = ?, marca_modelo = ?, portal = ?, km = ?, autonomia_km = ?,
        classificacao = ?, preco_anterior = ?, alertado = ?,
        data_atualizacao = CURRENT_TIMESTAMP
      WHERE id = ?`,
      [
        Number(item.preco) || 0,
        item.marca_modelo || 'Automóvel',
        item.portal || 'Auto',
        item.km ? Number(item.km) : null,
        Number(item.autonomia_km) || 0,
        item.classificacao || '🚗 OPORTUNIDADE'
      ]
    );
  },
  getRadarCarros(limit = 30) {
    return getMasterDb().prepare('SELECT * FROM radar_carros ORDER BY data_criacao DESC, id DESC LIMIT ?').all(limit);
  },

  upsertRadarTech(item) {
    return upsertRadarRecord(
      'radar_tech',
      item.url,
      item.preco,
      `INSERT INTO radar_tech (
        fingerprint, categoria, produto, loja, estado, preco, desconto_pct, url, classificacao, alertado
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.fingerprint || 'tech',
        item.categoria || 'tech',
        item.produto || 'Tech',
        item.loja || 'Loja Tech PT',
        item.estado || 'novo',
        Number(item.preco) || 0,
        Number(item.desconto_pct) || 0,
        item.url,
        item.classificacao || '💻 NEGÓCIO',
        item.alertado ? 1 : 0
      ],
      `UPDATE radar_tech SET
        preco = ?, produto = ?, loja = ?, desconto_pct = ?, classificacao = ?,
        preco_anterior = ?, alertado = ?, data_atualizacao = CURRENT_TIMESTAMP
      WHERE id = ?`,
      [
        Number(item.preco) || 0,
        item.produto || 'Tech',
        item.loja || 'Loja Tech PT',
        Number(item.desconto_pct) || 0,
        item.classificacao || '💻 NEGÓCIO'
      ]
    );
  },
  getRadarTech(limit = 30) {
    return getMasterDb().prepare('SELECT * FROM radar_tech ORDER BY data_criacao DESC, id DESC LIMIT ?').all(limit);
  },

  upsertRadarAmazon(item) {
    return upsertRadarRecord(
      'radar_amazon',
      item.url,
      item.preco,
      `INSERT INTO radar_amazon (
        fingerprint, titulo, asin, categoria, condicao, preco, preco_habitual, desconto_pct, fonte, url, alertado
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.fingerprint || 'amazon',
        item.titulo || 'Produto Amazon.es',
        item.asin || null,
        item.categoria || 'ofertas',
        item.condicao || 'Novo',
        Number(item.preco) || 0,
        Number(item.preco_habitual) || 0,
        Number(item.desconto_pct) || 0,
        item.fonte || 'amazon.es',
        item.url,
        item.alertado ? 1 : 0
      ],
      `UPDATE radar_amazon SET
        preco = ?, titulo = ?, condicao = ?, preco_habitual = ?, desconto_pct = ?,
        preco_anterior = ?, alertado = ?, data_atualizacao = CURRENT_TIMESTAMP
      WHERE id = ?`,
      [
        Number(item.preco) || 0,
        item.titulo || 'Produto Amazon.es',
        item.condicao || 'Novo',
        Number(item.preco_habitual) || 0,
        Number(item.desconto_pct) || 0
      ]
    );
  },
  getRadarAmazon(limit = 30) {
    return getMasterDb().prepare('SELECT * FROM radar_amazon ORDER BY data_criacao DESC, id DESC LIMIT ?').all(limit);
  },

  upsertRadarApple(item) {
    return upsertRadarRecord(
      'radar_apple',
      item.url,
      item.preco,
      `INSERT INTO radar_apple (
        fingerprint, modelo, capacidade, condicao, loja, bateria_pct, garantia_meses,
        preco, diferenca_novo_eur, recomendacao, url, alertado
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.fingerprint || 'apple',
        item.modelo || 'Apple',
        item.capacidade || null,
        item.condicao || 'Novo',
        item.loja || 'Apple PT',
        item.bateria_pct || '100%',
        Number(item.garantia_meses) || 36,
        Number(item.preco) || 0,
        Number(item.diferenca_novo_eur) || 0,
        item.recomendacao || null,
        item.url,
        item.alertado ? 1 : 0
      ],
      `UPDATE radar_apple SET
        preco = ?, loja = ?, garantia_meses = ?, diferenca_novo_eur = ?, recomendacao = ?,
        preco_anterior = ?, alertado = ?, data_atualizacao = CURRENT_TIMESTAMP
      WHERE id = ?`,
      [
        Number(item.preco) || 0,
        item.loja || 'Apple PT',
        Number(item.garantia_meses) || 36,
        Number(item.diferenca_novo_eur) || 0,
        item.recomendacao || null
      ]
    );
  },
  getRadarApple(limit = 30) {
    return getMasterDb().prepare('SELECT * FROM radar_apple ORDER BY data_criacao DESC, id DESC LIMIT ?').all(limit);
  },

  markRadarAlerted(table, id) {
    if (!VALID_RADAR_TABLES.has(table)) return false;
    getMasterDb().prepare(`UPDATE ${table} SET alertado = 1 WHERE id = ?`).run(id);
    return true;
  },

  // ─── 12. FILTROS ATIVOS (/vigiar) ───────────────────────────────────────────
  addRadarFilter({ categoria, termo, url = null, precoAlvo = null, chatId = '950415577', createdBy = 'André' }) {
    const createdAt = new Date().toISOString();
    const info = getMasterDb()
      .prepare(`
        INSERT INTO radar_filtros (categoria, termo, url, preco_alvo, ativo, chat_id, created_by, created_at)
        VALUES (?, ?, ?, ?, 1, ?, ?, ?)
      `)
      .run(
        String(categoria || 'geral').toLowerCase(),
        String(termo || '').trim(),
        url || null,
        precoAlvo ? Number(precoAlvo) : null,
        String(chatId || '950415577'),
        createdBy || 'André',
        createdAt
      );
    notifyDriveSync();
    return getMasterDb().prepare('SELECT * FROM radar_filtros WHERE id = ?').get(info.lastInsertRowid);
  },
  getRadarFilters(onlyActive = true) {
    const db = getMasterDb();
    const sql = onlyActive
      ? 'SELECT * FROM radar_filtros WHERE ativo = 1 ORDER BY id DESC'
      : 'SELECT * FROM radar_filtros ORDER BY id DESC';
    return db.prepare(sql).all().map((r) => ({ ...r, ativo: Boolean(r.ativo) }));
  },
  updateRadarFilterPrice(id, ultimoPreco) {
    getMasterDb()
      .prepare('UPDATE radar_filtros SET ultimo_preco = ?, ultima_verificacao = ? WHERE id = ?')
      .run(Number(ultimoPreco) || null, new Date().toISOString(), id);
    notifyDriveSync();
    return true;
  },
  deleteRadarFilter(id) {
    getMasterDb().prepare('DELETE FROM radar_filtros WHERE id = ?').run(Number(id));
    notifyDriveSync();
    return { success: true };
  },

  // ─── 13. MEMÓRIA CONVERSACIONAL ─────────────────────────────────────────────
  getConversationTurns(sessionKey, ttlMs = 3 * 60 * 60 * 1000) {
    const db = getMasterDb();
    const cutoff = Date.now() - ttlMs;
    db.prepare('DELETE FROM conversation_history WHERE session_key = ? AND timestamp_ms < ?').run(sessionKey, cutoff);
    return db
      .prepare('SELECT role, content, timestamp_ms AS timestamp FROM conversation_history WHERE session_key = ? ORDER BY id ASC')
      .all(sessionKey);
  },
  appendConversationTurn(sessionKey, chatId, workerTag, role, content, maxTurns = 12) {
    const db = getMasterDb();
    const now = Date.now();
    db.prepare(`
      INSERT INTO conversation_history (session_key, chat_id, worker_tag, role, content, timestamp_ms)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(sessionKey, String(chatId || 'default'), String(workerTag || 'master'), role, String(content || '').slice(0, 1500), now);

    // Manter janela deslizante de maxTurns * 2 registos por sessão
    const maxItems = maxTurns * 2;
    const countRow = db.prepare('SELECT COUNT(*) AS c FROM conversation_history WHERE session_key = ?').get(sessionKey);
    if ((countRow?.c || 0) > maxItems) {
      db.prepare(`
        DELETE FROM conversation_history
        WHERE session_key = ? AND id NOT IN (
          SELECT id FROM conversation_history WHERE session_key = ? ORDER BY id DESC LIMIT ?
        )
      `).run(sessionKey, sessionKey, maxItems);
    }
  },
  clearConversationSession(sessionKey) {
    getMasterDb().prepare('DELETE FROM conversation_history WHERE session_key = ?').run(sessionKey);
    return true;
  },
  clearAllConversations() {
    getMasterDb().prepare('DELETE FROM conversation_history').run();
    return true;
  },
  getConversationStats() {
    const db = getMasterDb();
    const sessions = db.prepare('SELECT COUNT(DISTINCT session_key) AS c FROM conversation_history').get()?.c || 0;
    const turns = db.prepare('SELECT COUNT(*) AS c FROM conversation_history').get()?.c || 0;
    return { activeSessions: sessions, totalTurns: turns };
  },

  // ─── 14. RECEITAS GUARDADAS ─────────────────────────────────────────────────
  saveRecipe({ title, mode = 'geral', query = '', content, protein_g = 0 } = {}) {
    const id = generateId();
    const createdAt = new Date().toISOString();
    getMasterDb()
      .prepare('INSERT INTO saved_recipes (id, title, mode, query, content, protein_g, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, String(title || 'Receita Saudável').slice(0, 120), mode || 'geral', query || '', String(content || ''), Number(protein_g) || 0, createdAt);
    notifyDriveSync();
    return { id, title, mode, query, protein_g: Number(protein_g) || 0, created_at: createdAt };
  },
  getSavedRecipes(limit = 15) {
    return getMasterDb().prepare('SELECT * FROM saved_recipes ORDER BY rowid DESC LIMIT ?').all(limit);
  },

  // ─── 15. EXECUÇÕES DO RADAR ─────────────────────────────────────────────────
  recordRadarExecution({ frente = 'global', totalScanned = 0, newAlerts = 0, status = 'ok' } = {}) {
    const executedAt = new Date().toISOString();
    getMasterDb()
      .prepare('INSERT INTO radar_execucoes (frente, total_scanned, new_alerts, status, executed_at) VALUES (?, ?, ?, ?, ?)')
      .run(String(frente), Number(totalScanned) || 0, Number(newAlerts) || 0, String(status), executedAt);
    notifyDriveSync();
    return { frente, totalScanned, newAlerts, status, executed_at: executedAt };
  },
  getRadarExecutions(limit = 20) {
    return getMasterDb().prepare('SELECT * FROM radar_execucoes ORDER BY id DESC LIMIT ?').all(limit);
  },

  // ─── 16. RELATÓRIOS DE ERROS (SELF-REFINE) ──────────────────────────────────
  addErrorReport({ service = 'system', message = '', stack = null, context = {} } = {}) {
    const id = generateId();
    const createdAt = new Date().toISOString();
    getMasterDb()
      .prepare('INSERT INTO error_reports (id, service, message, stack, context_json, resolved, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)')
      .run(id, String(service), String(message), stack ? String(stack) : null, JSON.stringify(context || {}), createdAt);
    notifyDriveSync();
    return { id, service, message, stack, context, resolved: false, created_at: createdAt };
  },
  getErrorReports(limit = 30) {
    return getMasterDb()
      .prepare('SELECT * FROM error_reports ORDER BY rowid DESC LIMIT ?')
      .all(limit)
      .map((r) => ({ ...r, resolved: Boolean(r.resolved) }));
  },
  markErrorReportResolved(id) {
    getMasterDb().prepare('UPDATE error_reports SET resolved = 1 WHERE id = ?').run(String(id));
    notifyDriveSync();
    return { success: true };
  },

  // ─── ESTATÍSTICAS GERAIS & DIAGNÓSTICO ──────────────────────────────────────
  getStats() {
    const db = getMasterDb();
    const tables = [
      'shopping', 'tasks', 'baby_logs', 'notes', 'reminders', 'nutrition_logs',
      'radar_casas', 'radar_carros', 'radar_tech', 'radar_amazon', 'radar_apple',
      'radar_filtros', 'conversation_history', 'saved_recipes', 'radar_execucoes', 'error_reports'
    ];
    const counts = {};
    for (const t of tables) {
      counts[t] = db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get()?.c || 0;
    }
    return { dbPath: getDbPath(), tables: counts };
  }
};

export default sqliteMasterDb;

