// src/services/nutritionCatalogService.js — Gestão Canónica de Produtos, Consumo e Compras
import { getMasterDb } from '../shared/sqliteMasterDb.js';
import { createLogger } from '../utils/logger.js';
import crypto from 'crypto';

const log = createLogger('NutritionCatalogService');

function generateId() {
  return crypto.randomUUID ? crypto.randomUUID() : `id_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Cálculo energético de Atwater:
 * Proteína: 4 kcal/g, Hidratos: 4 kcal/g, Gordura: 9 kcal/g, Fibra: 2 kcal/g
 */
export function calculateAtwaterEnergy({ protein = 0, carbs = 0, fat = 0, fibre = 0 }) {
  const p = Math.max(0, Number(protein) || 0);
  const c = Math.max(0, Number(carbs) || 0);
  const f = Math.max(0, Number(fat) || 0);
  const fb = Math.max(0, Number(fibre) || 0);
  const energyKcal = Math.round(p * 4 + c * 4 + f * 9 + fb * 2);
  const energyKj = Math.round(energyKcal * 4.184);
  return { energyKcal, energyKj };
}

// ─── 1. CATÁLOGO DE PRODUTOS & RÓTULOS (Sem afetar consumo) ───────────────────

export function registerProductWithFacts({
  name,
  brand = null,
  variant = null,
  barcode = null,
  netWeight = null,
  netVolume = null,
  unit = 'g',
  basisQuantity = 100,
  basisUnit = 'g',
  energyKcal = null,
  energyKj = null,
  protein = 0,
  carbohydrates = 0,
  sugars = 0,
  fat = 0,
  saturatedFat = 0,
  fibre = 0,
  salt = 0,
  source = 'label',
  confidence = 1.0
}) {
  const db = getMasterDb();
  const cleanBarcode = barcode ? String(barcode).trim() : null;

  let existingProduct = null;
  if (cleanBarcode) {
    existingProduct = db.prepare('SELECT * FROM products WHERE barcode = ?').get(cleanBarcode);
  }

  const now = new Date().toISOString();
  let productId;

  if (existingProduct) {
    productId = existingProduct.id;
    db.prepare(`
      UPDATE products
      SET name = ?, brand = ?, variant = ?, net_weight = ?, net_volume = ?, unit = ?, updated_at = ?
      WHERE id = ?
    `).run(
      String(name || existingProduct.name).trim(),
      brand || existingProduct.brand,
      variant || existingProduct.variant,
      netWeight !== null ? Number(netWeight) : existingProduct.net_weight,
      netVolume !== null ? Number(netVolume) : existingProduct.net_volume,
      unit || existingProduct.unit,
      now,
      productId
    );
  } else {
    productId = generateId();
    db.prepare(`
      INSERT INTO products (id, name, brand, variant, barcode, net_weight, net_volume, unit, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      productId,
      String(name || 'Produto sem nome').trim(),
      brand || null,
      variant || null,
      cleanBarcode,
      netWeight !== null ? Number(netWeight) : null,
      netVolume !== null ? Number(netVolume) : null,
      unit || 'g',
      now,
      now
    );
  }

  // Se não foi fornecida energia, calcular pelos fatores de Atwater
  let finalKcal = energyKcal;
  let finalKj = energyKj;
  if (finalKcal === null || finalKcal === undefined) {
    const atw = calculateAtwaterEnergy({ protein, carbs: carbohydrates, fat, fibre });
    finalKcal = atw.energyKcal;
    finalKj = atw.energyKj;
  }

  const existingFacts = db.prepare('SELECT id FROM nutrition_facts WHERE product_id = ?').get(productId);
  if (existingFacts) {
    db.prepare(`
      UPDATE nutrition_facts
      SET basis_quantity = ?, basis_unit = ?, energy_kcal = ?, energy_kj = ?, protein = ?,
          carbohydrates = ?, sugars = ?, fat = ?, saturated_fat = ?, fibre = ?, salt = ?,
          source = ?, confidence = ?
      WHERE id = ?
    `).run(
      Number(basisQuantity) || 100,
      basisUnit || 'g',
      finalKcal,
      finalKj,
      Number(protein) || 0,
      Number(carbohydrates) || 0,
      Number(sugars) || 0,
      Number(fat) || 0,
      Number(saturatedFat) || 0,
      Number(fibre) || 0,
      Number(salt) || 0,
      source || 'label',
      Number(confidence) || 1.0,
      existingFacts.id
    );
  } else {
    db.prepare(`
      INSERT INTO nutrition_facts (
        id, product_id, basis_quantity, basis_unit, energy_kcal, energy_kj, protein,
        carbohydrates, sugars, fat, saturated_fat, fibre, salt, source, confidence, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      generateId(),
      productId,
      Number(basisQuantity) || 100,
      basisUnit || 'g',
      finalKcal,
      finalKj,
      Number(protein) || 0,
      Number(carbohydrates) || 0,
      Number(sugars) || 0,
      Number(fat) || 0,
      Number(saturatedFat) || 0,
      Number(fibre) || 0,
      Number(salt) || 0,
      source || 'label',
      Number(confidence) || 1.0,
      now
    );
  }

  log.info(`Produto e tabela nutricional registados com sucesso: ${name} [${productId}]`);
  return { productId, name, barcode: cleanBarcode, energyKcal: finalKcal, protein };
}

export function findProductByBarcode(barcode) {
  const db = getMasterDb();
  const clean = String(barcode || '').trim();
  const prod = db.prepare('SELECT * FROM products WHERE barcode = ?').get(clean);
  if (!prod) return null;
  const facts = db.prepare('SELECT * FROM nutrition_facts WHERE product_id = ?').get(prod.id);
  return { ...prod, facts: facts || null };
}

export function searchProducts(query) {
  const db = getMasterDb();
  const term = `%${String(query || '').trim()}%`;
  return db.prepare(`
    SELECT p.*, f.protein, f.energy_kcal, f.basis_quantity, f.basis_unit
    FROM products p
    LEFT JOIN nutrition_facts f ON p.id = f.product_id
    WHERE p.name LIKE ? OR p.brand LIKE ? OR p.barcode LIKE ?
    ORDER BY p.updated_at DESC
    LIMIT 10
  `).all(term, term, term);
}

// ─── 2. REGISTO DE CONSUMO (food_entries + product_history) ───────────────────

export function recordFoodConsumption({
  userId,
  productId = null,
  description,
  quantity,
  unit = 'g',
  consumedAt = null,
  calories = null,
  protein = null,
  carbohydrates = null,
  fat = null,
  fibre = null,
  salt = null,
  source = 'manual',
  estimated = 0,
  confidence = 1.0
}) {
  const db = getMasterDb();
  const now = new Date().toISOString();
  const timestamp = consumedAt ? new Date(consumedAt).toISOString() : now;
  const q = Number(quantity) || 100;
  const entryId = generateId();

  let finalProtein = protein;
  let finalCarbs = carbohydrates;
  let finalFat = fat;
  let finalFibre = fibre;
  let finalSalt = salt;
  let finalKcal = calories;

  // Se associado a um produto de catálogo, calcular proporcionalmente (valor_100g * quantidade / 100)
  if (productId) {
    const facts = db.prepare('SELECT * FROM nutrition_facts WHERE product_id = ?').get(productId);
    if (facts && (finalProtein === null || finalKcal === null)) {
      const basis = Number(facts.basis_quantity) || 100;
      const ratio = q / basis;
      finalProtein = finalProtein !== null ? Number(finalProtein) : Math.round(Number(facts.protein || 0) * ratio * 10) / 10;
      finalCarbs = finalCarbs !== null ? Number(finalCarbs) : Math.round(Number(facts.carbohydrates || 0) * ratio * 10) / 10;
      finalFat = finalFat !== null ? Number(finalFat) : Math.round(Number(facts.fat || 0) * ratio * 10) / 10;
      finalFibre = finalFibre !== null ? Number(finalFibre) : Math.round(Number(facts.fibre || 0) * ratio * 10) / 10;
      finalSalt = finalSalt !== null ? Number(finalSalt) : Math.round(Number(facts.salt || 0) * ratio * 100) / 100;
      finalKcal = finalKcal !== null ? Number(finalKcal) : Math.round(Number(facts.energy_kcal || 0) * ratio);
    }
  }

  // Fallback se não fornecido: Atwater
  if (finalKcal === null || finalKcal === undefined) {
    finalKcal = calculateAtwaterEnergy({
      protein: finalProtein || 0,
      carbs: finalCarbs || 0,
      fat: finalFat || 0,
      fibre: finalFibre || 0
    }).energyKcal;
  }

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO food_entries (
        id, user_id, product_id, description, quantity, unit, consumed_at,
        calories, protein, carbohydrates, fat, fibre, salt, source, estimated, confidence, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      entryId,
      String(userId),
      productId || null,
      String(description || 'Refeição').trim(),
      q,
      unit || 'g',
      timestamp,
      Number(finalKcal) || 0,
      Number(finalProtein) || 0,
      Number(finalCarbs) || 0,
      Number(finalFat) || 0,
      Number(finalFibre) || 0,
      Number(finalSalt) || 0,
      source || 'manual',
      estimated ? 1 : 0,
      Number(confidence) || 1.0,
      now
    );

    if (productId) {
      db.prepare(`
        INSERT INTO product_history (id, user_id, product_id, event_type, event_date, quantity, unit, source)
        VALUES (?, ?, ?, 'consumption', ?, ?, ?, ?)
      `).run(
        generateId(),
        String(userId),
        productId,
        timestamp,
        q,
        unit || 'g',
        source || 'manual'
      );
    }
  });

  tx();
  log.info(`Consumo registado: ${description} (+${finalProtein}g prot, ~${finalKcal} kcal)`);
  return {
    entryId,
    description,
    quantity: q,
    unit,
    calories: finalKcal,
    protein: finalProtein,
    estimated: Boolean(estimated)
  };
}

// ─── 3. GESTÃO DE COMPRAS (shopping_items + purchase_entries + product_history) ──

export function addShoppingItem({ userId, productId = null, description, quantity = 1, unit = 'un' }) {
  const db = getMasterDb();
  const id = generateId();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO shopping_items (id, user_id, product_id, description, quantity, unit, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)
  `).run(
    id,
    String(userId),
    productId || null,
    String(description || '').trim(),
    Number(quantity) || 1,
    unit || 'un',
    now,
    now
  );
  return { id, description, quantity, unit, status: 'pending' };
}

export function recordPurchase({
  userId,
  productId = null,
  description = '',
  quantity = 1,
  unit = 'un',
  unitPrice = 0,
  totalPrice = null,
  purchaseDate = null,
  source = 'manual'
}) {
  const db = getMasterDb();
  const now = new Date().toISOString();
  const date = purchaseDate ? new Date(purchaseDate).toISOString() : now;
  const q = Number(quantity) || 1;
  const up = Number(unitPrice) || 0;
  const tp = totalPrice !== null ? Number(totalPrice) : Math.round(q * up * 100) / 100;
  const purchaseId = generateId();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO purchase_entries (id, user_id, product_id, quantity, unit, unit_price, total_price, purchase_date, source, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      purchaseId,
      String(userId),
      productId || null,
      q,
      unit || 'un',
      up,
      tp,
      date,
      source || 'manual',
      now
    );

    if (productId) {
      db.prepare(`
        INSERT INTO product_history (id, user_id, product_id, event_type, event_date, quantity, unit, source)
        VALUES (?, ?, ?, 'purchase', ?, ?, ?, ?)
      `).run(
        generateId(),
        String(userId),
        productId,
        date,
        q,
        unit || 'un',
        source || 'manual'
      );
    }
  });

  tx();
  log.info(`Compra registada: ${description || productId} (Qtd: ${q} ${unit}, Total: ${tp} €)`);
  return { purchaseId, quantity: q, unit, totalPrice: tp, date };
}

// ─── 4. RESUMO NUTRICIONAL DIÁRIO & METAS ────────────────────────────────────

export function getUserGoals(userId) {
  const db = getMasterDb();
  const goals = db.prepare('SELECT * FROM nutrition_goals WHERE user_id = ?').get(String(userId));
  if (!goals) {
    return {
      proteinGoal: 160,
      waterGoal: 2.5,
      creatineGoal: 5,
      calorieGoal: 2200
    };
  }
  return {
    proteinGoal: Number(goals.protein_goal) || 160,
    waterGoal: Number(goals.water_goal) || 2.5,
    creatineGoal: Number(goals.creatine_goal) || 5,
    calorieGoal: Number(goals.calorie_goal) || 2200
  };
}

export function setUserGoals(userId, { proteinGoal, waterGoal, creatineGoal, calorieGoal }) {
  const db = getMasterDb();
  const now = new Date().toISOString();
  const existing = db.prepare('SELECT id FROM nutrition_goals WHERE user_id = ?').get(String(userId));

  if (existing) {
    db.prepare(`
      UPDATE nutrition_goals
      SET protein_goal = COALESCE(?, protein_goal),
          water_goal = COALESCE(?, water_goal),
          creatine_goal = COALESCE(?, creatine_goal),
          calorie_goal = COALESCE(?, calorie_goal),
          updated_at = ?
      WHERE user_id = ?
    `).run(
      proteinGoal !== undefined ? Number(proteinGoal) : null,
      waterGoal !== undefined ? Number(waterGoal) : null,
      creatineGoal !== undefined ? Number(creatineGoal) : null,
      calorieGoal !== undefined ? Number(calorieGoal) : null,
      now,
      String(userId)
    );
  } else {
    db.prepare(`
      INSERT INTO nutrition_goals (id, user_id, protein_goal, water_goal, creatine_goal, calorie_goal, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      generateId(),
      String(userId),
      proteinGoal !== undefined ? Number(proteinGoal) : 160,
      waterGoal !== undefined ? Number(waterGoal) : 2.5,
      creatineGoal !== undefined ? Number(creatineGoal) : 5,
      calorieGoal !== undefined ? Number(calorieGoal) : 2200,
      now
    );
  }
  return getUserGoals(userId);
}

export function getShoppingItems(userId, status = null) {
  const db = getMasterDb();
  if (status) {
    return db.prepare(`
      SELECT s.*, p.name AS product_name, p.brand
      FROM shopping_items s
      LEFT JOIN products p ON s.product_id = p.id
      WHERE s.user_id = ? AND s.status = ?
      ORDER BY s.created_at DESC
    `).all(String(userId), String(status));
  }
  return db.prepare(`
    SELECT s.*, p.name AS product_name, p.brand
    FROM shopping_items s
    LEFT JOIN products p ON s.product_id = p.id
    WHERE s.user_id = ?
    ORDER BY s.created_at DESC
  `).all(String(userId));
}

export function markShoppingItemBought(userId, itemId) {
  const db = getMasterDb();
  const now = new Date().toISOString();
  const item = db.prepare('SELECT * FROM shopping_items WHERE id = ? AND user_id = ?').get(String(itemId), String(userId));
  if (!item) return null;

  const tx = db.transaction(() => {
    db.prepare('UPDATE shopping_items SET status = ?, updated_at = ? WHERE id = ?').run('bought', now, String(itemId));

    db.prepare(`
      INSERT INTO purchase_entries (id, user_id, product_id, quantity, unit, unit_price, total_price, purchase_date, source, created_at)
      VALUES (?, ?, ?, ?, ?, 0, 0, ?, 'shopping_list', ?)
    `).run(
      generateId(),
      String(userId),
      item.product_id || null,
      item.quantity || 1,
      item.unit || 'un',
      now,
      now
    );

    if (item.product_id) {
      db.prepare(`
        INSERT INTO product_history (id, user_id, product_id, event_type, event_date, quantity, unit, source)
        VALUES (?, ?, ?, 'purchase', ?, ?, ?, 'shopping_list')
      `).run(
        generateId(),
        String(userId),
        item.product_id,
        now,
        item.quantity || 1,
        item.unit || 'un'
      );
    }
  });

  tx();
  return { id: item.id, description: item.description, status: 'bought' };
}

export function getPurchaseHistory(userId, limit = 10) {
  const db = getMasterDb();
  return db.prepare(`
    SELECT pe.*, p.name AS product_name, p.brand
    FROM purchase_entries pe
    LEFT JOIN products p ON pe.product_id = p.id
    WHERE pe.user_id = ?
    ORDER BY pe.purchase_date DESC
    LIMIT ?
  `).all(String(userId), limit);
}

export function getFoodEntriesToday(userId, date = new Date()) {
  const db = getMasterDb();
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  return db.prepare(`
    SELECT fe.*, p.name AS product_name, p.brand
    FROM food_entries fe
    LEFT JOIN products p ON fe.product_id = p.id
    WHERE fe.user_id = ? AND fe.consumed_at >= ? AND fe.consumed_at <= ?
    ORDER BY fe.consumed_at ASC
  `).all(String(userId), startOfDay.toISOString(), endOfDay.toISOString());
}

export function getDailyNutritionSummary(userId, date = new Date()) {
  const db = getMasterDb();
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const startIso = startOfDay.toISOString();
  const endIso = endOfDay.toISOString();

  const entries = db.prepare(`
    SELECT * FROM food_entries
    WHERE user_id = ? AND consumed_at >= ? AND consumed_at <= ?
    ORDER BY consumed_at ASC
  `).all(String(userId), startIso, endIso);

  const goals = db.prepare('SELECT * FROM nutrition_goals WHERE user_id = ?').get(String(userId)) || {
    protein_goal: 160,
    water_goal: 2.5,
    creatine_goal: 5,
    calorie_goal: 2200
  };

  let totalCalories = 0;
  let totalProtein = 0;
  let totalCarbs = 0;
  let totalFat = 0;
  let totalFibre = 0;
  let totalSalt = 0;

  for (const e of entries) {
    totalCalories += Number(e.calories) || 0;
    totalProtein += Number(e.protein) || 0;
    totalCarbs += Number(e.carbohydrates) || 0;
    totalFat += Number(e.fat) || 0;
    totalFibre += Number(e.fibre) || 0;
    totalSalt += Number(e.salt) || 0;
  }

  // Obter água do dia a partir dos logs de água
  const legacyWater = db.prepare(`
    SELECT SUM(water_ml) AS w FROM nutrition_logs
    WHERE created_at >= ? AND created_at <= ?
  `).get(startIso, endIso)?.w || 0;

  const totalWaterLiters = Math.round((legacyWater / 1000) * 10) / 10;
  const proteinGoal = Number(goals.protein_goal) || 160;
  const waterGoal = Number(goals.water_goal) || 2.5;

  return {
    date: startOfDay.toISOString().split('T')[0],
    totals: {
      calories: Math.round(totalCalories),
      protein: Math.round(totalProtein * 10) / 10,
      carbohydrates: Math.round(totalCarbs * 10) / 10,
      fat: Math.round(totalFat * 10) / 10,
      fibre: Math.round(totalFibre * 10) / 10,
      salt: Math.round(totalSalt * 100) / 100,
      waterLiters: totalWaterLiters
    },
    goals: {
      protein: proteinGoal,
      water: waterGoal,
      creatine: Number(goals.creatine_goal) || 5,
      calories: Number(goals.calorie_goal) || null
    },
    percentages: {
      protein: Math.round((totalProtein / proteinGoal) * 100),
      water: Math.round((totalWaterLiters / waterGoal) * 100)
    },
    entriesCount: entries.length,
    entries
  };
}

// ─── 5. PRODUTOS FREQUENTES & MEMÓRIA ────────────────────────────────────────

export function getFrequentProducts(userId, limit = 5) {
  const db = getMasterDb();
  const mostConsumed = db.prepare(`
    SELECT p.*, COUNT(h.id) AS occurrences, SUM(h.quantity) AS total_consumed
    FROM product_history h
    JOIN products p ON h.product_id = p.id
    WHERE h.user_id = ? AND h.event_type = 'consumption'
    GROUP BY p.id
    ORDER BY occurrences DESC, total_consumed DESC
    LIMIT ?
  `).all(String(userId), limit);

  const mostPurchased = db.prepare(`
    SELECT p.*, COUNT(h.id) AS occurrences, SUM(h.quantity) AS total_purchased
    FROM product_history h
    JOIN products p ON h.product_id = p.id
    WHERE h.user_id = ? AND h.event_type = 'purchase'
    GROUP BY p.id
    ORDER BY occurrences DESC, total_purchased DESC
    LIMIT ?
  `).all(String(userId), limit);

  return { mostConsumed, mostPurchased };
}

export function updateProductDetails(productId, { name, brand, variant, barcode, netWeight, netVolume, unit }) {
  const db = getMasterDb();
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE products
    SET name = COALESCE(?, name),
        brand = COALESCE(?, brand),
        variant = COALESCE(?, variant),
        barcode = COALESCE(?, barcode),
        net_weight = COALESCE(?, net_weight),
        net_volume = COALESCE(?, net_volume),
        unit = COALESCE(?, unit),
        updated_at = ?
    WHERE id = ?
  `).run(name, brand, variant, barcode, netWeight, netVolume, unit, now, String(productId));
  return db.prepare('SELECT * FROM products WHERE id = ?').get(String(productId));
}

export function deleteProduct(productId) {
  const db = getMasterDb();
  db.prepare('DELETE FROM products WHERE id = ?').run(String(productId));
  return true;
}

export default {
  calculateAtwaterEnergy,
  registerProductWithFacts,
  findProductByBarcode,
  searchProducts,
  recordFoodConsumption,
  addShoppingItem,
  recordPurchase,
  getUserGoals,
  setUserGoals,
  getShoppingItems,
  markShoppingItemBought,
  getPurchaseHistory,
  getFoodEntriesToday,
  getDailyNutritionSummary,
  getFrequentProducts,
  updateProductDetails,
  deleteProduct
};
