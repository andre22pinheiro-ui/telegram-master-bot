// src/shared/migrations/nutritionPurchaseMigration.js — 7 Tabelas Canónicas para Produto, Consumo e Compra
import { createLogger } from '../../utils/logger.js';

const log = createLogger('NutritionMigration');

/**
 * Aplica migração idempotente criando as 7 tabelas e índices de Produto, Consumo e Compra
 * @param {import('better-sqlite3').Database} db
 */
export function applyNutritionPurchaseMigration(db) {
  try {
    db.exec(`
      -- a) products
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        brand TEXT,
        variant TEXT,
        barcode TEXT UNIQUE,
        net_weight REAL,
        net_volume REAL,
        unit TEXT DEFAULT 'g',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);

      -- b) nutrition_facts
      CREATE TABLE IF NOT EXISTS nutrition_facts (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL,
        basis_quantity REAL DEFAULT 100,
        basis_unit TEXT DEFAULT 'g',
        energy_kcal REAL,
        energy_kj REAL,
        protein REAL DEFAULT 0,
        carbohydrates REAL DEFAULT 0,
        sugars REAL DEFAULT 0,
        fat REAL DEFAULT 0,
        saturated_fat REAL DEFAULT 0,
        fibre REAL DEFAULT 0,
        salt REAL DEFAULT 0,
        source TEXT DEFAULT 'label',
        confidence REAL DEFAULT 1.0,
        created_at TEXT NOT NULL,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_nutrition_facts_product ON nutrition_facts(product_id);

      -- c) food_entries (Consumo)
      CREATE TABLE IF NOT EXISTS food_entries (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        product_id TEXT,
        description TEXT NOT NULL,
        quantity REAL NOT NULL,
        unit TEXT DEFAULT 'g',
        consumed_at TEXT NOT NULL,
        calories REAL DEFAULT 0,
        protein REAL DEFAULT 0,
        carbohydrates REAL DEFAULT 0,
        fat REAL DEFAULT 0,
        fibre REAL DEFAULT 0,
        salt REAL DEFAULT 0,
        source TEXT DEFAULT 'manual',
        estimated INTEGER DEFAULT 0,
        confidence REAL DEFAULT 1.0,
        created_at TEXT NOT NULL,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_food_entries_user_consumed ON food_entries(user_id, consumed_at);

      -- d) shopping_items (Lista de Compras Canónica)
      CREATE TABLE IF NOT EXISTS shopping_items (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        product_id TEXT,
        description TEXT NOT NULL,
        quantity REAL DEFAULT 1,
        unit TEXT DEFAULT 'un',
        status TEXT DEFAULT 'pending',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_shopping_items_user_status ON shopping_items(user_id, status);

      -- e) purchase_entries (Registo Histórico de Compras Efetuadas)
      CREATE TABLE IF NOT EXISTS purchase_entries (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        product_id TEXT,
        quantity REAL DEFAULT 1,
        unit TEXT DEFAULT 'un',
        unit_price REAL DEFAULT 0,
        total_price REAL DEFAULT 0,
        purchase_date TEXT NOT NULL,
        source TEXT DEFAULT 'manual',
        created_at TEXT NOT NULL,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_purchase_entries_user_date ON purchase_entries(user_id, purchase_date);

      -- f) product_history (Histórico Unificado de Eventos de Produto)
      CREATE TABLE IF NOT EXISTS product_history (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        event_type TEXT NOT NULL CHECK(event_type IN ('consumption', 'purchase', 'correction')),
        event_date TEXT NOT NULL,
        quantity REAL NOT NULL,
        unit TEXT NOT NULL,
        source TEXT DEFAULT 'manual',
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_product_history_user_event ON product_history(user_id, event_date);
      CREATE INDEX IF NOT EXISTS idx_product_history_product ON product_history(product_id);

      -- g) nutrition_goals (Metas Nutricionais por Utilizador)
      CREATE TABLE IF NOT EXISTS nutrition_goals (
        id TEXT PRIMARY KEY,
        user_id TEXT UNIQUE NOT NULL,
        protein_goal REAL DEFAULT 160,
        water_goal REAL DEFAULT 2.5,
        creatine_goal REAL DEFAULT 5,
        calorie_goal REAL,
        other_goals TEXT DEFAULT '{}',
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_nutrition_goals_user ON nutrition_goals(user_id);
    `);
    log.info('7 tabelas canónicas de Produto, Consumo e Compra migradas com sucesso.');
  } catch (err) {
    log.error('Erro ao aplicar migração de nutrição/compras:', err.message);
    throw err;
  }
}

