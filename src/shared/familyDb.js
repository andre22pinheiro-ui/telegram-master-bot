// src/shared/familyDb.js — Base de dados persistente JSON para a Mini App Família e Bots
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../../data');
const DB_FILE = join(DATA_DIR, 'family_store.json');

function ensureStore() {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    if (!existsSync(DB_FILE)) {
      const initial = {
        shopping: [
          { id: '1', item_text: 'Leite meio gordo', category: 'mercearia', completed: false, created_by_name: 'André', created_at: new Date().toISOString() },
          { id: '2', item_text: 'Pão fresco', category: 'padaria', completed: false, created_by_name: 'André', created_at: new Date().toISOString() }
        ],
        tasks: [
          { id: '1', title: 'Revisão periódica do autocarro RotaBus', assigned_to: 'André', completed: false, created_by_name: 'André', created_at: new Date().toISOString() },
          { id: '2', title: 'Preparar mochila da Carolina', assigned_to: 'Ambos', completed: false, created_by_name: 'André', created_at: new Date().toISOString() }
        ],
        baby_logs: [
          { id: '1', event_type: 'actividades', details: 'Pintura e desenho na escola', notes: 'Muito bem disposta', created_by_name: 'André', logged_time: new Date().toISOString() }
        ],
        notes: [
          { id: '1', title: 'Ideia RotaBus', content: 'Manter sempre prioridade a autoestradas e conforto VIP', color_tag: 'emerald', created_by_name: 'André', created_at: new Date().toISOString() }
        ]
      };
      writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), 'utf8');
      return initial;
    }
    return JSON.parse(readFileSync(DB_FILE, 'utf8'));
  } catch (err) {
    console.error('[familyDb] Erro ao ler base de dados:', err);
    return { shopping: [], tasks: [], baby_logs: [], notes: [] };
  }
}

function saveStore(data) {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('[familyDb] Erro ao gravar dados:', err);
    return false;
  }
}

export const familyDb = {
  // COMPRAS
  getShopping() {
    const store = ensureStore();
    return store.shopping || [];
  },
  addShopping(itemText, category = "geral", user = {}) {
    const store = ensureStore();
    const id = Date.now().toString();
    const name = user.first_name || user.username || "André";
    const item = {
      id,
      item_text: itemText,
      category,
      completed: false,
      created_by_name: name,
      created_at: new Date().toISOString()
    };
    store.shopping = store.shopping || [];
    store.shopping.unshift(item);
    saveStore(store);
    return item;
  },
  toggleShopping(id, completed) {
    const store = ensureStore();
    store.shopping = (store.shopping || []).map(it => {
      if (String(it.id) === String(id)) {
        return { ...it, completed: typeof completed === 'boolean' ? completed : !it.completed };
      }
      return it;
    });
    saveStore(store);
    return { success: true };
  },
  deleteShopping(id) {
    const store = ensureStore();
    store.shopping = (store.shopping || []).filter(it => String(it.id) !== String(id));
    saveStore(store);
    return { success: true };
  },
  clearCompletedShopping() {
    const store = ensureStore();
    store.shopping = (store.shopping || []).filter(it => !it.completed);
    saveStore(store);
    return { success: true };
  },

  // TAREFAS
  getTasks() {
    const store = ensureStore();
    return store.tasks || [];
  },
  addTask(title, assignedTo = "Ambos", user = {}) {
    const store = ensureStore();
    const id = Date.now().toString();
    const name = user.first_name || user.username || "André";
    const task = {
      id,
      title,
      assigned_to: assignedTo,
      completed: false,
      created_by_name: name,
      created_at: new Date().toISOString()
    };
    store.tasks = store.tasks || [];
    store.tasks.unshift(task);
    saveStore(store);
    return task;
  },
  toggleTask(id, completed) {
    const store = ensureStore();
    store.tasks = (store.tasks || []).map(t => {
      if (String(t.id) === String(id)) {
        return { ...t, completed: typeof completed === 'boolean' ? completed : !t.completed };
      }
      return t;
    });
    saveStore(store);
    return { success: true };
  },
  deleteTask(id) {
    const store = ensureStore();
    store.tasks = (store.tasks || []).filter(t => String(t.id) !== String(id));
    saveStore(store);
    return { success: true };
  },

  // CAROLINA / BEBÉ / ESCOLA
  getBabyLogs() {
    const store = ensureStore();
    return store.baby_logs || [];
  },
  addBabyLog(eventType, details, notes = "", user = {}) {
    const store = ensureStore();
    const id = Date.now().toString();
    const name = user.first_name || user.username || "André";
    const log = {
      id,
      event_type: eventType,
      details,
      notes: notes || "",
      created_by_name: name,
      logged_time: new Date().toISOString()
    };
    store.baby_logs = store.baby_logs || [];
    store.baby_logs.unshift(log);
    saveStore(store);
    return log;
  },
  deleteBabyLog(id) {
    const store = ensureStore();
    store.baby_logs = (store.baby_logs || []).filter(l => String(l.id) !== String(id));
    saveStore(store);
    return { success: true };
  },

  // NOTAS
  getNotes() {
    const store = ensureStore();
    return store.notes || [];
  },
  addNote(title, content, colorTag = "blue", user = {}) {
    const store = ensureStore();
    const id = Date.now().toString();
    const name = user.first_name || user.username || "André";
    const note = {
      id,
      title: title || "Nota",
      content,
      color_tag: colorTag,
      created_by_name: name,
      created_at: new Date().toISOString()
    };
    store.notes = store.notes || [];
    store.notes.unshift(note);
    saveStore(store);
    return note;
  },
  deleteNote(id) {
    const store = ensureStore();
    store.notes = (store.notes || []).filter(n => String(n.id) !== String(id));
    saveStore(store);
    return { success: true };
  }
};

export default familyDb;
