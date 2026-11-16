// src/shared/migrations/iaNutricionistaMigration.js — Migração IA-Nutricionista (Asimov Academy Adaptada | ADR-044)
import { createLogger } from '../../utils/logger.js';

const log = createLogger('IaNutricionistaMigration');

/**
 * Cria tabelas de avaliação visual de refeições e conhecimento nutricional
 * @param {import('better-sqlite3').Database} db
 */
export function applyIaNutricionistaMigration(db) {
  try {
    db.exec(`
      -- 1. nutrition_visual_evaluations: Análises de imagens de pratos e rótulos
      CREATE TABLE IF NOT EXISTS nutrition_visual_evaluations (
        id TEXT PRIMARY KEY,
        user_id TEXT DEFAULT 'default_user',
        image_source TEXT,
        meal_type TEXT DEFAULT 'refeição',
        foods_detected_json TEXT NOT NULL,
        total_protein REAL NOT NULL,
        total_calories REAL NOT NULL,
        total_carbs REAL NOT NULL,
        total_fat REAL NOT NULL,
        nutritionist_feedback TEXT,
        recorded_to_log INTEGER DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_visual_eval_user ON nutrition_visual_evaluations(user_id, created_at DESC);

      -- 2. nutrition_diet_tips: Dicas clínicas e estratégias nutricionais
      CREATE TABLE IF NOT EXISTS nutrition_diet_tips (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);

    // Inserir dicas canónicas se tabela estiver vazia
    const count = db.prepare('SELECT COUNT(*) as c FROM nutrition_diet_tips').get().c;
    if (count === 0) {
      const now = new Date().toISOString();
      const insert = db.prepare('INSERT INTO nutrition_diet_tips (category, title, content, created_at) VALUES (?, ?, ?, ?)');

      insert.run(
        'timing',
        'Distribuição de Proteína (Leucine Threshold)',
        'Para atingir 160g de proteína, distribui a ingestão em 4 doses de 35-45g. Cada dose deve conter ~3g de leucina para ativar a via mTOR de síntese proteica muscular.',
        now
      );

      insert.run(
        'hidratacao',
        'Protocolo de 2.5 Litros de Água',
        'Inicia o dia com 500ml ao acordar. Consome 500ml a meio da manhã, 500ml no treino/tarde e 500ml ao jantar. A hidratação ótima previne a fadiga muscular e melhora a digestão proteica.',
        now
      );

      insert.run(
        'creatina',
        'Creatina Monoidratada Diária (5g)',
        'Toma 5g todos os dias no mesmo horário (com uma refeição contendo hidratos para potenciar a absorção). A retenção hídrica intramuscular melhora a recuperação e potência.',
        now
      );

      insert.run(
        'substituicao',
        'Tabela de Equivalências Proteicas (30g de Proteína)',
        '• 100g de Peito de Frango/Peru\n• 115g de Lombo de Porco Grelhado\n• 140g de Salmão ou Atum ao Natural\n• 250g de Queijo Quark ou Cottage Milbona\n• 4 Ovos Inteiros Médios\n• 1 Scoop e meio de Whey Protein',
        now
      );

      insert.run(
        'confeccao',
        'Airfryer e MCC sem Refogados Pesados',
        'Cozinhar carnes na Airfryer temperadas com alho, orégãos e paprika preserva a proteína sem adicionar calorias de fritura. No robot MCC, o vapor mantém os minerais essenciais.',
        now
      );

      log.info('Dicas canónicas de nutrição clínica inseridas com sucesso.');
    }

    log.info('Migração IA-Nutricionista aplicada com sucesso.');
  } catch (err) {
    log.error('Erro ao aplicar migração IA-Nutricionista:', err.message);
  }
}

export default {
  applyIaNutricionistaMigration
};
