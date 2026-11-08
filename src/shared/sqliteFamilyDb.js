import Database from "better-sqlite3";
import path from "path";
import { pushToCloud } from "./cloudSync.js";

/**
 * MOTOR DE BASE DE DADOS HÍBRIDA SQLITE LOCAL + NUVEM
 * Grava localmente no disco e sincroniza automaticamente na Nuvem!
 */

const DB_PATH = path.resolve("./family.db");
const db = new Database(DB_PATH);

// Ativar modo WAL (Write-Ahead Logging) para alta concorrência e velocidade máxima
db.pragma("journal_mode = WAL");

// Função auxiliar para disparar backup de sincronização na Nuvem
function notifyCloudSync() {
  try {
    const shopping = db.prepare("SELECT * FROM shopping").all();
    const tasks = db.prepare("SELECT * FROM tasks").all();
    const baby_logs = db.prepare("SELECT * FROM baby_logs").all();
    const notes = db.prepare("SELECT * FROM notes").all();
    pushToCloud({ shopping, tasks, baby_logs, notes });
  } catch (_) {}
}

// Criar tabelas se não existirem
db.exec(`
  CREATE TABLE IF NOT EXISTS shopping (
    id TEXT PRIMARY KEY,
    item_text TEXT NOT NULL,
    category TEXT DEFAULT 'geral',
    completed INTEGER DEFAULT 0,
    created_by_name TEXT,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    assigned_to TEXT DEFAULT 'Ambos',
    completed INTEGER DEFAULT 0,
    created_by_name TEXT,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS baby_logs (
    id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    details TEXT NOT NULL,
    notes TEXT,
    created_by_name TEXT,
    logged_time TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    color_tag TEXT DEFAULT 'blue',
    created_by_name TEXT,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  );
`);

export const sqliteFamilyDb = {
  // COMPRAS
  getShopping() {
    return db.prepare("SELECT * FROM shopping ORDER BY created_at DESC").all().map(r => ({ ...r, completed: Boolean(r.completed) }));
  },
  addShopping(itemText, category = "geral", user = {}) {
    const id = Date.now().toString();
    const name = user.first_name || user.username || "André";
    const stmt = db.prepare("INSERT INTO shopping (id, item_text, category, completed, created_by_name) VALUES (?, ?, ?, 0, ?)");
    stmt.run(id, itemText, category, name);
    notifyCloudSync();
    return { id, item_text: itemText, category, completed: false, created_by_name: name };
  },
  toggleShopping(id, completed) {
    db.prepare("UPDATE shopping SET completed = ? WHERE id = ?").run(completed ? 1 : 0, id);
    notifyCloudSync();
    return { success: true };
  },
  deleteShopping(id) {
    db.prepare("DELETE FROM shopping WHERE id = ?").run(id);
    notifyCloudSync();
    return { success: true };
  },

  // TAREFAS
  getTasks() {
    return db.prepare("SELECT * FROM tasks ORDER BY created_at DESC").all().map(r => ({ ...r, completed: Boolean(r.completed) }));
  },
  addTask(title, assignedTo = "Ambos", user = {}) {
    const id = Date.now().toString();
    const name = user.first_name || "André";
    db.prepare("INSERT INTO tasks (id, title, assigned_to, completed, created_by_name) VALUES (?, ?, ?, 0, ?)").run(id, title, assignedTo, name);
    notifyCloudSync();
    return { id, title, assigned_to: assignedTo, completed: false, created_by_name: name };
  },
  toggleTask(id, completed) {
    db.prepare("UPDATE tasks SET completed = ? WHERE id = ?").run(completed ? 1 : 0, id);
    notifyCloudSync();
    return { success: true };
  },
  deleteTask(id) {
    db.prepare("DELETE FROM tasks WHERE id = ?").run(id);
    notifyCloudSync();
    return { success: true };
  },

  // BEBÉ
  getBabyLogs() {
    return db.prepare("SELECT * FROM baby_logs ORDER BY logged_time DESC LIMIT 25").all();
  },
  addBabyLog(eventType, details, notes = "", user = {}) {
    const id = Date.now().toString();
    const name = user.first_name || "Família";
    db.prepare("INSERT INTO baby_logs (id, event_type, details, notes, created_by_name) VALUES (?, ?, ?, ?, ?)").run(id, eventType, details, notes, name);
    notifyCloudSync();
    return { id, event_type: eventType, details, notes, created_by_name: name, logged_time: new Date().toISOString() };
  },
  deleteBabyLog(id) {
    db.prepare("DELETE FROM baby_logs WHERE id = ?").run(id);
    notifyCloudSync();
    return { success: true };
  },

  // NOTAS
  getNotes() {
    return db.prepare("SELECT * FROM notes ORDER BY created_at DESC").all();
  },
  addNote(title, content, colorTag = "blue", user = {}) {
    const id = Date.now().toString();
    const name = user.first_name || "André";
    db.prepare("INSERT INTO notes (id, title, content, color_tag, created_by_name) VALUES (?, ?, ?, ?, ?)").run(id, title, content, colorTag, name);
    notifyCloudSync();
    return { id, title, content, color_tag: colorTag, created_by_name: name };
  },
  deleteNote(id) {
    db.prepare("DELETE FROM notes WHERE id = ?").run(id);
    notifyCloudSync();
    return { success: true };
  }
};

