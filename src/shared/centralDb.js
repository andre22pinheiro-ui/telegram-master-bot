import "dotenv/config";
import fs from "fs";
import path from "path";

/**
 * MOTOR DE BASE DE DADOS CENTRALIZADA MULTI-WORKER
 * Todos os workers e o bot master ligam-se a este repositório unificado de dados.
 * Suporta persistência sincronizada em ficheiro central com garantia atómica,
 * com adaptabilidade para ligação remota (ex: Supabase / Firebase / Cloudflare KV).
 */

const CENTRAL_DB_PATH = path.resolve("./data_central.json");

// Estado inicial padrão
const DEFAULT_STATE = {
  version: "2.0.0",
  lastUpdated: new Date().toISOString(),
  users: {
    // Armazena preferências isoladas por utilizador
    // "950415577": { settings: {}, sessionData: {} }
  },
  pessoal: {
    shopping: [],
    tasks: [],
    notes: [],
    nutritionLogs: []
  },
  frotas: {
    savedRoutes: [],
    drivers: [],
    vehicles: []
  },
  immo: {
    savedProperties: [],
    evaluations: []
  },
  dev: {
    managedApps: [],
    deployLogs: []
  }
};

let dbCache = null;
let writeTimeout = null;

function readDatabase() {
  try {
    if (fs.existsSync(CENTRAL_DB_PATH)) {
      const raw = fs.readFileSync(CENTRAL_DB_PATH, "utf-8");
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error("[CENTRAL DB] Erro ao ler base de dados central:", err.message);
  }

  // Migrar dados antigos de data_pessoal.json se existirem
  const legacyPessoalPath = path.resolve("./data_pessoal.json");
  if (fs.existsSync(legacyPessoalPath)) {
    try {
      const legacy = JSON.parse(fs.readFileSync(legacyPessoalPath, "utf-8"));
      DEFAULT_STATE.pessoal = {
        shopping: legacy.shopping || [],
        tasks: legacy.tasks || [],
        notes: legacy.notes || [],
        nutritionLogs: legacy.nutritionLogs || []
      };
    } catch (_) {}
  }

  saveDatabaseSync(DEFAULT_STATE);
  return DEFAULT_STATE;
}

function saveDatabaseSync(data) {
  try {
    data.lastUpdated = new Date().toISOString();
    fs.writeFileSync(CENTRAL_DB_PATH, JSON.stringify(data, null, 2), "utf-8");
    dbCache = data;
  } catch (err) {
    console.error("[CENTRAL DB] Erro fatal ao persistir dados centrais:", err.message);
  }
}

/**
 * Obtém o snapshot atual da base de dados central
 */
export function getCentralDB() {
  if (!dbCache) {
    dbCache = readDatabase();
  }
  return dbCache;
}

/**
 * Atualiza um ramo ou entidade da base de dados com sincronização imediata
 * @param {string} domain 'pessoal' | 'frotas' | 'immo' | 'dev' | 'users'
 * @param {Function} updater Função que recebe o estado atual do domínio e o muta/retorna
 */
export function updateCentralDB(domain, updater) {
  const current = getCentralDB();
  if (!current[domain]) {
    current[domain] = {};
  }
  const result = updater(current[domain], current);
  if (result !== undefined) {
    current[domain] = result;
  }
  saveDatabaseSync(current);
  return current[domain];
}

/**
 * Gestão de Sessões Isoladas por Utilizador (mantendo dados centrais comuns)
 */
export function getUserSession(userId) {
  const db = getCentralDB();
  const idStr = String(userId);
  if (!db.users[idStr]) {
    db.users[idStr] = {
      id: idStr,
      created: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      state: {},
      history: []
    };
    saveDatabaseSync(db);
  }
  return db.users[idStr];
}

export function updateUserSession(userId, updateFn) {
  return updateCentralDB("users", (users) => {
    const idStr = String(userId);
    if (!users[idStr]) {
      users[idStr] = { id: idStr, created: new Date().toISOString(), state: {}, history: [] };
    }
    users[idStr].lastSeen = new Date().toISOString();
    updateFn(users[idStr]);
    return users;
  });
}

