// src/workers/worker_nutricao.js — Nutrição Alta Proteína (160g) & Motor de Receitas Saudáveis
import { sqliteMasterDb } from '../shared/sqliteMasterDb.js';
import { createLogger } from '../utils/logger.js';
import { askAgent, generateDeterministicCompletion } from '../services/reasoningService.js';
import { searchLiveWeb } from '../shared/webSearch.js';
import {
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
} from '../services/nutritionCatalogService.js';

const log = createLogger('WorkerNutricao');
const DAILY_PROTEIN_TARGET = 160;
const DAILY_WATER_TARGET = 2500;

function renderProgressBar(current, target, totalBars = 10) {
  const percent = Math.min(Math.max(current / target, 0), 1);
  const filledBars = Math.round(percent * totalBars);
  const emptyBars = totalBars - filledBars;
  const bar = '█'.repeat(filledBars) + '░'.repeat(emptyBars);
  const pctText = Math.round((current / target) * 100);
  return `[${bar}] ${pctText}%`;
}

// ─── Plano Alimentar de Alta Proteína ────────────────────────────────────────

export function getPlanoNutricional() {
  return `🥗 *PLANO NUTRICIONAL DE ALTA PERFORMANCE*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🎯 *Meta Diária:* ${DAILY_PROTEIN_TARGET}g Proteína (~2g/kg) | 2.5L Água | 5g Creatina\n\n` +
    `🥣 *1. Pequeno-Almoço Energético (08h00)*\n` +
    `• 200g Cottage Milbona + 35g Aveia/Nestum PRO + Canela + Café\n` +
    `• Macros: *28g Proteína* | 26g HC | 4g Gord | *252 kcal*\n\n` +
    `🥩 *2. Almoço de Força (12h30 - 13h30)*\n` +
    `• 250g Lombo de Porco em Air-Fryer (temperado c/ alho e orégãos)\n` +
    `• 120g Arroz basmati ou batata-doce + Brócolos/Salada\n` +
    `• Macros: *54g Proteína* | 32g HC | 8g Gord | *415 kcal*\n\n` +
    `⚡ *3. Lanche / Pré-Treino (16h30)*\n` +
    `• 2 Ovos cozidos ou mexidos + 1 Iogurte Grego Ligeiro Milbona\n` +
    `• Macros: *24g Proteína* | 6g HC | 10g Gord | *210 kcal*\n\n` +
    `🍗 *4. Jantar de Recuperação (20h00)*\n` +
    `• 250g Peito de Peru Salteado + 200g Vegetais Freshona (Wok)\n` +
    `• Macros: *58g Proteína* | 14g HC | 6g Gord | *342 kcal*\n\n` +
    `🌙 *5. Ceia Anabólica (opcional)*\n` +
    `• Queijo fresco magro ou 1 scoop de Whey c/ água\n` +
    `• Macros: *20g Proteína* | 3g HC | 2g Gord | *110 kcal*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🍽️ *Receitas Rápidas:* \`/receita\`, \`/receita_airfryer\`, \`/receita_mcc\`\n` +
    `💡 _Registar refeição:_ \`/proteina 54 : Lombo de porco com arroz\``;
}

// ─── Resumo Diário com Barra de Progresso ────────────────────────────────────

export function getResumoHoje() {
  const data = sqliteMasterDb.getTodayNutrition();
  const { totalProtein, totalCalories, totalWater, tookCreatina, proteinTarget, waterTarget, todayLogs } = data;

  const protBar = renderProgressBar(totalProtein, proteinTarget, 10);
  const waterBar = renderProgressBar(totalWater, waterTarget, 10);
  const creatinaIcon = tookCreatina ? '✅ Tomada (5g)' : '☐ Pendente (toma 5g com água)';
  const pctMeta = Math.round((totalProtein / proteinTarget) * 100);

  let msg =
    `📊 *RESUMO NUTRICIONAL DE HOJE*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🍗 *Proteína:* ${totalProtein}g / ${proteinTarget}g (${pctMeta}% da meta)\n` +
    `${protBar}\n\n` +
    `💧 *Hidratação:* ${totalWater}ml / ${waterTarget}ml\n` +
    `${waterBar}\n\n` +
    `🔥 *Calorias Estimadas:* ~${totalCalories} kcal\n` +
    `⚡ *Creatina Diária:* ${creatinaIcon}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n`;

  if (todayLogs.length === 0) {
    msg += `_Ainda não registaste refeições hoje._\nEnvia ex: \`/proteina 40 : Almoço\` ou \`/receita_airfryer frango\`!`;
  } else {
    msg += `📋 *Refeições Registadas Hoje:*\n`;
    todayLogs.slice(0, 6).forEach((l) => {
      const hora = new Date(l.created_at).toLocaleTimeString('pt-PT', { timeZone: 'Europe/Lisbon', hour: '2-digit', minute: '2-digit' });
      if (l.water_ml > 0) {
        msg += `• [${hora}] 💧 *+${l.water_ml}ml Água*\n`;
      } else if (l.creatina) {
        msg += `• [${hora}] ⚡ *Creatina (5g)*\n`;
      } else {
        msg += `• [${hora}] *${l.meal}* (+${l.protein}g prot | ~${l.calories || Math.round(l.protein * 4)} kcal)\n`;
      }
    });
  }

  return msg;
}

// ─── Registos Diários (Proteína, Água, Creatina) ─────────────────────────────

export function handleProteinaInput(input, userId = '') {
  const match = String(input || '').match(/^(\d+)\s*(?::\s*(.*))?$/);
  if (!match) {
    return (
      `💡 *Como registar proteína:*\n` +
      `\`/proteina <gramas> : <refeição>\`\n\n` +
      `Exemplo: \`/proteina 54 : Lombo de porco com batata\``
    );
  }

  const grams = parseInt(match[1], 10);
  const desc = match[2] ? match[2].trim() : 'Refeição rica em proteína';
  // Fator Atwater: 4 kcal por grama de proteína
  const atwKcal = Math.round(grams * 4);

  sqliteMasterDb.addNutritionLog({
    meal: desc,
    protein: grams,
    calories: atwKcal,
    notes: 'Registo rápido via Telegram'
  });

  if (userId) {
    recordFoodConsumption({
      userId,
      description: desc,
      quantity: grams,
      unit: 'g',
      protein: grams,
      calories: atwKcal,
      source: 'telegram_quick'
    });
  }

  const status = sqliteMasterDb.getTodayNutrition();
  const restante = Math.max(0, status.proteinTarget - status.totalProtein);
  const protBar = renderProgressBar(status.totalProtein, status.proteinTarget, 10);

  return (
    `🍗 *Registo Proteico Adicionado!*\n` +
    `• Refeição: *${desc}*\n` +
    `• Adicionado: *+${grams}g de proteína* (~${atwKcal} kcal — Atwater 4 kcal/g)\n\n` +
    `📊 *Progresso Diário:* ${status.totalProtein}g / ${status.proteinTarget}g\n` +
    `${protBar}\n` +
    `${restante > 0 ? `🎯 Faltam *${restante}g* para a meta diária de ${DAILY_PROTEIN_TARGET}g.` : `🏆 *PARABÉNS!* Meta diária de ${DAILY_PROTEIN_TARGET}g atingida!`}`
  );
}

export function handleAguaInput(input) {
  const match = String(input || '').match(/^(\d+)$/);
  if (!match) {
    return `💧 Indica os ml de água bebidos. Ex: \`/agua 500\` ou \`/agua 250\``;
  }

  const ml = parseInt(match[1], 10);
  sqliteMasterDb.addNutritionLog({ meal: `Água (${ml}ml)`, water_ml: ml });

  const status = sqliteMasterDb.getTodayNutrition();
  const waterBar = renderProgressBar(status.totalWater, DAILY_WATER_TARGET, 10);
  const restante = Math.max(0, status.waterTarget - status.totalWater);

  return (
    `💧 *+${ml}ml de água registados!*\n\n` +
    `🥤 *Hidratação Hoje:* ${status.totalWater}ml / ${status.waterTarget}ml\n` +
    `${waterBar}\n` +
    `${restante > 0 ? `🎯 Faltam *${restante}ml* para os 2.5 Litros.` : `🏆 *Meta de Hidratação Completa!*`}`
  );
}

export function handleCreatina() {
  sqliteMasterDb.addNutritionLog({ meal: 'Creatina Diária (5g)', creatina: true });
  return (
    `⚡ *Toma diária de 5g de Creatina registada com sucesso!*\n\n` +
    `A saturação muscular diária está assegurada. Mantém os 2.5L de água ao longo do dia.`
  );
}

// ─── Comandos Canónicos de Alimentação, Catálogo e Compras ──────────────────

export function handleComer(input, userId = 'default_user') {
  const clean = String(input || '').trim();
  if (!clean) {
    return (
      `🍽️ *Como registar refeição consumida:*\n` +
      `\`/comer <quantidade><unidade> <alimento>\`\n\n` +
      `Exemplos:\n` +
      `• \`/comer 150g Peito de frango\`\n` +
      `• \`/comer 200ml Leite magro\`\n` +
      `• \`/comer 1 Barra proteica\`\n\n` +
      `💡 Se o produto estiver no catálogo oficial (\`/foto_rotulo\`), os valores são calculados proporcionalmente de forma exata.`
    );
  }

  let quantity = 100;
  let unit = 'g';
  let productName = clean;

  const match = clean.match(/^(\d+(?:[.,]\d+)?)\s*(g|gr|gramas|ml|mililitros|kg|un|unidades|doses?)?\s+(.+)$/i);
  if (match) {
    quantity = parseFloat(match[1].replace(',', '.'));
    unit = match[2] ? match[2].toLowerCase() : 'g';
    productName = match[3].trim();
  }

  // Pesquisar se já existe no catálogo
  const results = searchProducts(productName, 3);
  const found = results.length > 0 ? results[0] : null;

  let protein = 0;
  let carbs = 0;
  let fat = 0;
  let calories = 0;
  let isEstimated = true;
  let productId = null;
  let labelSource = 'estimated';

  if (found && found.protein !== undefined) {
    productId = found.id;
    const basis = Number(found.basis_quantity) || 100;
    const ratio = quantity / basis;
    protein = Math.round(Number(found.protein || 0) * ratio * 10) / 10;
    carbs = Math.round(Number(found.carbohydrates || 0) * ratio * 10) / 10;
    fat = Math.round(Number(found.fat || 0) * ratio * 10) / 10;
    calories = Math.round(Number(found.energy_kcal || 0) * ratio);
    isEstimated = false;
    labelSource = 'catalog';
  } else {
    // Estimativas de Atwater para categorias comuns em pt
    const lower = productName.toLowerCase();
    let protPer100 = 15;
    let carbsPer100 = 10;
    let fatPer100 = 5;

    if (lower.includes('frango') || lower.includes('peru')) {
      protPer100 = 31; carbsPer100 = 0; fatPer100 = 3.6;
    } else if (lower.includes('lombo') || lower.includes('porco') || lower.includes('vaca') || lower.includes('carne') || lower.includes('bife')) {
      protPer100 = 26; carbsPer100 = 0; fatPer100 = 8;
    } else if (lower.includes('ovo') || lower.includes('ovos')) {
      protPer100 = 13; carbsPer100 = 1.1; fatPer100 = 11;
    } else if (lower.includes('cottage') || lower.includes('queijo fresco')) {
      protPer100 = 12; carbsPer100 = 3; fatPer100 = 2.5;
    } else if (lower.includes('atum') || lower.includes('salm') || lower.includes('peixe')) {
      protPer100 = 24; carbsPer100 = 0; fatPer100 = 6;
    } else if (lower.includes('arroz') || lower.includes('massa')) {
      protPer100 = 3; carbsPer100 = 28; fatPer100 = 0.5;
    } else if (lower.includes('batata')) {
      protPer100 = 2; carbsPer100 = 20; fatPer100 = 0.2;
    } else if (lower.includes('aveia') || lower.includes('nestum')) {
      protPer100 = 13; carbsPer100 = 60; fatPer100 = 7;
    } else if (lower.includes('whey') || lower.includes('proteina')) {
      protPer100 = 75; carbsPer100 = 5; fatPer100 = 3;
    }

    const ratio = quantity / 100;
    protein = Math.round(protPer100 * ratio * 10) / 10;
    carbs = Math.round(carbsPer100 * ratio * 10) / 10;
    fat = Math.round(fatPer100 * ratio * 10) / 10;
    // Fatores de Atwater: 4 kcal/g proteína, 4 kcal/g hidratos, 9 kcal/g gordura
    calories = Math.round(protein * 4 + carbs * 4 + fat * 9);
    isEstimated = true;
    labelSource = 'estimated_atwater';
  }

  // Registar no modelo canónico (food_entries + product_history se productId existir)
  recordFoodConsumption({
    userId,
    productId,
    description: `${productName} (${quantity}${unit})`,
    quantity,
    unit,
    calories,
    protein,
    carbohydrates: carbs,
    fat,
    source: labelSource,
    estimated: isEstimated,
    confidence: isEstimated ? 0.75 : 1.0
  });

  // Registar no sqliteMasterDb legado para compatibilidade com relatórios existentes
  sqliteMasterDb.addNutritionLog({
    meal: `${productName} (${quantity}${unit})`,
    protein: Math.round(protein),
    calories: Math.round(calories),
    notes: isEstimated ? 'Consumo estimado' : 'Consumo catálogo oficial'
  });

  const status = sqliteMasterDb.getTodayNutrition();
  const protBar = renderProgressBar(status.totalProtein, DAILY_PROTEIN_TARGET, 10);
  const restante = Math.max(0, DAILY_PROTEIN_TARGET - status.totalProtein);
  const tipoRegisto = isEstimated ? '⚠️ *[Estimado]*' : '✅ *[Catálogo Oficial]*';

  return (
    `🍽️ *Consumo Registado!* ${tipoRegisto}\n` +
    `• Alimento: *${productName}*\n` +
    `• Porção: *${quantity} ${unit}*\n` +
    `• Macros: *+${protein}g Proteína* | ${carbs}g HC | ${fat}g Gord | *~${calories} kcal*\n\n` +
    `📊 *Progresso Proteico Hoje:* ${status.totalProtein}g / ${DAILY_PROTEIN_TARGET}g (${Math.round((status.totalProtein / DAILY_PROTEIN_TARGET) * 100)}%)\n` +
    `${protBar}\n` +
    (restante > 0 ? `🎯 Faltam *${restante}g* para a tua meta diária.` : `🏆 *PARABÉNS!* Meta diária de 160g de proteína atingida!`) +
    (isEstimated ? `\n\n💡 _Dica: Envia uma foto do rótulo com \`/foto_rotulo\` para cadastrar a tabela oficial deste produto no catálogo._` : '')
  );
}

export function handleFotoRefeicao() {
  return (
    `📸 *Registo Visual de Refeições (Gemini Vision Multimodal)*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `Para registar uma refeição por fotografia:\n\n` +
    `1. Envia uma fotografia do teu prato no chat.\n` +
    `2. Coloca na legenda do envio: \`/foto_refeicao\` ou uma breve descrição dos alimentos.\n` +
    `3. A IA analisará visualmente as proporções, calculará calorias e proteína (fatores de Atwater 4/4/9/2) e registará a refeição no teu diário alimentar!\n\n` +
    `💡 _Em alternativa direta por texto:_ \`/comer 180g Salmão grelhado com brócolos\``
  );
}

export function handleFotoRotulo() {
  return (
    `🏷️ *Leitura de Rótulo Nutricional para o Catálogo*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `Para adicionar um produto à base de dados permanente:\n\n` +
    `1. Envia uma fotografia nítida da tabela de declaração nutricional (por 100g/100ml) e do código de barras.\n` +
    `2. Coloca na legenda: \`/foto_rotulo <Nome do Produto>\`.\n` +
    `3. A tabela nutricional é extraída e gravada em \`products\` e \`nutrition_facts\`.\n\n` +
    `🔒 *Regra Estrita de Governação:* Adicionar um rótulo ao catálogo *NÃO* conta como consumo nem altera as tuas calorias de hoje. Só consomes quando fizeres \`/comer <produto>\`!`
  );
}

export function handleDiarioAlimentar(userId = 'default_user') {
  const entries = getFoodEntriesToday(userId);
  if (!entries || entries.length === 0) {
    const legacy = sqliteMasterDb.getTodayNutrition().todayLogs;
    if (!legacy || legacy.length === 0) {
      return (
        `📋 *DIÁRIO ALIMENTAR DE HOJE*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `Nenhuma refeição registada hoje.\n\n` +
        `Regista com: \`/comer 150g Frango\` ou \`/proteina 40 : Almoço\``
      );
    }
    let msg = `📋 *DIÁRIO ALIMENTAR DE HOJE:*\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    legacy.forEach((l) => {
      const hora = new Date(l.created_at).toLocaleTimeString('pt-PT', { timeZone: 'Europe/Lisbon', hour: '2-digit', minute: '2-digit' });
      if (l.water_ml > 0) {
        msg += `• [${hora}] 💧 *Água:* +${l.water_ml}ml\n`;
      } else if (l.creatina) {
        msg += `• [${hora}] ⚡ *Creatina:* 5g\n`;
      } else {
        msg += `• [${hora}] 🍽️ *${l.meal}*: +${l.protein}g prot | ~${l.calories || Math.round(l.protein * 4)} kcal\n`;
      }
    });
    return msg;
  }

  let totalKcal = 0;
  let totalProt = 0;
  const lines = [];

  entries.forEach((e) => {
    totalKcal += Number(e.calories || 0);
    totalProt += Number(e.protein || 0);
    const hora = new Date(e.consumed_at).toLocaleTimeString('pt-PT', { timeZone: 'Europe/Lisbon', hour: '2-digit', minute: '2-digit' });
    const flag = e.estimated ? '⚠️ [Estimado]' : '✅ [Catálogo]';
    lines.push(`• [${hora}] *${e.description}* (${e.quantity}${e.unit || 'g'})\n  ↳ *${e.protein}g Prot* | ${e.calories} kcal | ${e.carbohydrates || 0}g HC | ${e.fat || 0}g Gord ${flag}`);
  });

  return (
    `📋 *DIÁRIO ALIMENTAR DE HOJE*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    lines.join('\n\n') +
    `\n━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🔥 *Total Ingerido:* ~${Math.round(totalKcal)} kcal | 🍗 *Proteína Total:* ${Math.round(totalProt * 10) / 10}g / ${DAILY_PROTEIN_TARGET}g`
  );
}

export function handleResumoNutricional(userId = 'default_user') {
  const summary = getDailyNutritionSummary(userId);
  const protBar = renderProgressBar(summary.totals.protein, summary.goals.protein, 10);
  const waterBar = renderProgressBar(summary.totals.waterLiters * 1000, summary.goals.water * 1000, 10);
  const protRestante = Math.max(0, summary.goals.protein - summary.totals.protein);
  const waterRestante = Math.max(0, Math.round((summary.goals.water - summary.totals.waterLiters) * 10) / 10);

  return (
    `📊 *RESUMO NUTRICIONAL COMPLETO*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🍗 *Proteína:* ${summary.totals.protein}g / ${summary.goals.protein}g (${summary.percentages.protein}%)\n` +
    `${protBar}\n` +
    `${protRestante > 0 ? `🎯 Faltam *${protRestante.toFixed(1)}g* para a meta.\n\n` : `🏆 *Meta de Proteína Concluída!*\n\n`}` +
    `🔥 *Energia Total:* ~${summary.totals.calories} kcal\n` +
    `🍞 *Hidratos de Carbono:* ${summary.totals.carbohydrates}g\n` +
    `🥑 *Gorduras:* ${summary.totals.fat}g\n` +
    `🌾 *Fibras:* ${summary.totals.fibre}g\n` +
    `🧂 *Sal:* ${summary.totals.salt}g\n\n` +
    `💧 *Hidratação:* ${summary.totals.waterLiters}L / ${summary.goals.water}L (${summary.percentages.water}%)\n` +
    `${waterBar}\n` +
    `${waterRestante > 0 ? `🎯 Faltam *${waterRestante}L* de água.\n\n` : `🏆 *Meta de Hidratação Completa!*\n\n`}` +
    `⚡ *Creatina:* ${summary.goals.creatine}g recomendados diariamente\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🍽️ Total de registos hoje: ${summary.entriesCount}`
  );
}

export function handleConsumoAgua(args, userId = 'default_user') {
  const clean = String(args || '').trim();
  if (clean && /^\d+$/.test(clean)) {
    return handleAguaInput(clean);
  }
  const summary = getDailyNutritionSummary(userId);
  const waterBar = renderProgressBar(summary.totals.waterLiters * 1000, summary.goals.water * 1000, 10);
  const waterRestante = Math.max(0, Math.round((summary.goals.water - summary.totals.waterLiters) * 10) / 10);
  return (
    `🥤 *ESTADO DE HIDRATAÇÃO DIÁRIA*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `💧 *Consumido Hoje:* ${summary.totals.waterLiters}L / ${summary.goals.water}L (${summary.percentages.water}%)\n` +
    `${waterBar}\n` +
    `${waterRestante > 0 ? `🎯 Faltam *${waterRestante}L* para a meta de ${summary.goals.water}L.` : `🏆 *Meta de 2.5L atingida!*`}\n\n` +
    `💡 Para registar consumo de água: \`/consumo_agua 250\` ou \`/agua 500\``
  );
}

export function handleMetasNutricionais(args, userId = 'default_user') {
  const clean = String(args || '').trim();
  if (!clean) {
    const goals = getUserGoals(userId);
    return (
      `🎯 *METAS NUTRICIONAIS ATUAIS*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🍗 *Proteína Diária:* ${goals.proteinGoal}g\n` +
      `💧 *Água Diária:* ${goals.waterGoal} Litros\n` +
      `⚡ *Creatina Diária:* ${goals.creatineGoal}g\n` +
      `🔥 *Calorias Alvo:* ${goals.calorieGoal || 2200} kcal\n\n` +
      `💡 Para alterar: \`/metas_nutricionais <proteina> <agua_litros> <creatina_g>\`\n` +
      `Exemplo: \`/metas_nutricionais 165 3.0 5\``
    );
  }

  const parts = clean.split(/\s+/);
  const p = parseFloat(parts[0]);
  const w = parseFloat(parts[1]);
  const c = parseFloat(parts[2]);

  const updated = setUserGoals(userId, {
    proteinGoal: !isNaN(p) && p > 0 ? p : undefined,
    waterGoal: !isNaN(w) && w > 0 ? w : undefined,
    creatineGoal: !isNaN(c) && c > 0 ? c : undefined
  });

  return (
    `✅ *Metas Nutricionais Atualizadas!*\n` +
    `• Proteína: *${updated.proteinGoal}g*\n` +
    `• Água: *${updated.waterGoal}L*\n` +
    `• Creatina: *${updated.creatineGoal}g*`
  );
}

export function handleAdicionarCompra(args, userId = 'default_user') {
  const clean = String(args || '').trim();
  if (!clean) {
    return (
      `🛒 *Como adicionar item às compras:*\n` +
      `\`/adicionar_compra <nome do item> [quantidade]\`\n\n` +
      `Exemplo: \`/adicionar_compra Leite magro 2 un\``
    );
  }

  const match = clean.match(/^(.*?)(?:\s+(\d+(?:[.,]\d+)?)\s*(un|kg|g|l|pacotes?|garrafas?|caixas?)?)?$/i);
  const itemDesc = (match && match[1] ? match[1] : clean).trim();
  const qty = match && match[2] ? parseFloat(match[2].replace(',', '.')) : 1;
  const unit = match && match[3] ? match[3] : 'un';

  addShoppingItem({
    userId,
    description: itemDesc,
    quantity: qty,
    unit
  });

  // Também adiciona no sqliteMasterDb legado para consistência com o resto do sistema
  sqliteMasterDb.addShopping(`${itemDesc} (${qty} ${unit})`, 'geral', { first_name: 'André' });

  return (
    `🛒 *Item adicionado à lista de compras:*\n` +
    `• *${itemDesc}* (Qtd: ${qty} ${unit})\n\n` +
    `🔒 _Nota: Este registo é estritamente logístico e NÃO afeta o teu diário calórico/nutricional de hoje._`
  );
}

export function handleFotoCompra() {
  return (
    `🧾 *Registo de Fatura / Compras por Imagem*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `Para registar produtos comprados no supermercado:\n\n` +
    `1. Envia a fotografia do recibo ou dos produtos adquiridos.\n` +
    `2. Coloca na legenda: \`/foto_compra\`.\n` +
    `3. Os itens são inseridos no histórico de compras (\`purchase_entries\`) e na lista de despensa.\n\n` +
    `🔒 *Garantia:* Comprar comida *NÃO* é consumir. O teu balanço calórico mantém-se intacto!`
  );
}

export function handleComprado(args, userId = 'default_user') {
  const clean = String(args || '').trim();
  const pending = getShoppingItems(userId, 'pending');

  if (!clean) {
    if (pending.length === 0) return '🛒 Não tens itens pendentes na lista de compras.';
    return (
      `🛒 *Itens pendentes para marcar como comprado:*\n` +
      pending.map((p, i) => `${i + 1}. [${p.id.slice(0, 6)}] *${p.description}* (${p.quantity} ${p.unit})`).join('\n') +
      `\n\nUsa: \`/comprado <número ou nome do item>\``
    );
  }

  let target = pending.find((p) => p.id === clean || p.id.startsWith(clean));
  const numIdx = parseInt(clean, 10) - 1;
  if (!target && !isNaN(numIdx) && numIdx >= 0 && numIdx < pending.length) {
    target = pending[numIdx];
  }
  if (!target) {
    target = pending.find((p) => p.description.toLowerCase().includes(clean.toLowerCase()));
  }

  if (!target) {
    recordPurchase({
      userId,
      description: clean,
      quantity: 1,
      unit: 'un',
      source: 'manual_direct'
    });
    return `✅ Compra registada no histórico: *${clean}* (sem afetar consumo nutricional).`;
  }

  markShoppingItemBought(userId, target.id);
  return (
    `✅ *Item marcado como comprado e arquivado no histórico!*\n` +
    `• Produto: *${target.description}* (${target.quantity} ${target.unit})\n\n` +
    `🔒 _Garantia:_ Guardado em \`purchase_entries\`. O teu consumo calórico permanece inalterado.`
  );
}

export function handleHistoricoCompras(userId = 'default_user') {
  const history = getPurchaseHistory(userId, 10);
  if (!history || history.length === 0) {
    return `🛒 Não existem compras registadas no histórico recente.`;
  }
  let msg = `🛒 *HISTÓRICO RECENTE DE COMPRAS:*\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  history.forEach((h) => {
    const data = new Date(h.purchase_date).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const nome = h.product_name || h.description || 'Produto';
    msg += `• [${data}] *${nome}* — ${h.quantity} ${h.unit} ${h.total_price > 0 ? `(${h.total_price}€)` : ''}\n`;
  });
  return msg;
}

export function handleProdutosFrequentes(userId = 'default_user') {
  const freq = getFrequentProducts(userId, 5);
  let msg = `🧠 *MEMÓRIA DE PRODUTOS FREQUENTES*\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  msg += `🍗 *Mais Consumidos:*\n`;
  if (freq.mostConsumed.length === 0) {
    msg += `_Sem registos de consumo ainda._\n`;
  } else {
    freq.mostConsumed.forEach((p, i) => {
      msg += `${i + 1}. *${p.name}* ${p.brand ? `(${p.brand})` : ''} — ${p.occurrences}x (${p.total_consumed} ${p.unit})\n`;
    });
  }

  msg += `\n🛒 *Mais Comprados:*\n`;
  if (freq.mostPurchased.length === 0) {
    msg += `_Sem registos de compras ainda._\n`;
  } else {
    freq.mostPurchased.forEach((p, i) => {
      msg += `${i + 1}. *${p.name}* ${p.brand ? `(${p.brand})` : ''} — ${p.occurrences}x (${p.total_purchased} ${p.unit})\n`;
    });
  }

  return msg;
}

export function handleMaisConsumidos(userId = 'default_user') {
  const freq = getFrequentProducts(userId, 10);
  if (freq.mostConsumed.length === 0) return '🍗 Ainda não tens registos de consumo no histórico.';
  let msg = `🍗 *TOP PRODUTOS MAIS CONSUMIDOS:*\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  freq.mostConsumed.forEach((p, i) => {
    msg += `${i + 1}. *${p.name}* ${p.brand ? `(${p.brand})` : ''} — ${p.occurrences} vezes (${p.total_consumed} ${p.unit})\n`;
  });
  return msg;
}

export function handleMaisComprados(userId = 'default_user') {
  const freq = getFrequentProducts(userId, 10);
  if (freq.mostPurchased.length === 0) return '🛒 Ainda não tens registos de compras no histórico.';
  let msg = `🛒 *TOP PRODUTOS MAIS COMPRADOS:*\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  freq.mostPurchased.forEach((p, i) => {
    msg += `${i + 1}. *${p.name}* ${p.brand ? `(${p.brand})` : ''} — ${p.occurrences} vezes (${p.total_purchased} ${p.unit})\n`;
  });
  return msg;
}

export function handleCorrigirProduto(args) {
  const clean = String(args || '').trim();
  if (!clean) {
    return `🔧 *Como corrigir produto no catálogo:*\n\`/corrigir_produto <id_ou_nome> <novo_nome>\`\nExemplo: \`/corrigir_produto Leite Leite Magro Mimosa\``;
  }
  const parts = clean.split(/\s+/);
  const targetTerm = parts[0];
  const newName = parts.slice(1).join(' ').trim();

  const found = searchProducts(targetTerm, 1);
  if (found.length === 0) {
    return `❌ Produto não encontrado para o termo "${targetTerm}". Consulta com \`/produtos_frequentes\`.`;
  }
  const prod = found[0];
  if (!newName) {
    return `🔧 Encontrado: *${prod.name}* (ID: ${prod.id}). Para renomear: \`/corrigir_produto ${prod.id} Novo Nome\``;
  }
  updateProductDetails(prod.id, { name: newName });
  return `✅ Produto corrigido no catálogo: *${newName}* (ID: ${prod.id}).`;
}

export function handleEliminarProduto(args) {
  const clean = String(args || '').trim();
  if (!clean) {
    return `🗑️ *Como eliminar produto do catálogo:*\n\`/eliminar_produto <id_ou_nome>\``;
  }
  const found = searchProducts(clean, 1);
  if (found.length === 0) {
    return `❌ Produto não encontrado para "${clean}".`;
  }
  const prod = found[0];
  deleteProduct(prod.id);
  return `🗑️ Produto eliminado do catálogo e memória: *${prod.name}* (ID: ${prod.id}).`;
}

// ─── Motor de Receitas Saudáveis (Geral / Airfryer / Monsieur Cuisine Connect) ─

function buildDeterministicFallbackRecipe(query, mode) {
  const titulo = query || (mode === 'mcc' ? 'Creme Proteico de Frango e Legumes (MCC)' : 'Peito de Frango Marinado com Batata-Doce');
  const protPorDose = 48;
  const pctMeta = Math.round((protPorDose / DAILY_PROTEIN_TARGET) * 100);

  if (mode === 'airfryer') {
    return (
      `🍽️ *RECEITA AIRFRYER SAUDÁVEL: ${titulo}*\n\n` +
      `⏱️ *1. Tempo & Doses:*\n` +
      `• Tempo: 22 minutos (pré-aquecimento 3 min + 19 min Airfryer a 190°C)\n` +
      `• Rendimento: 2 doses\n\n` +
      `⚖️ *2. Ingredientes (Quantidades Exatas):*\n` +
      `• 400g Peito de frango em cubos (ou ingrediente pedido: ${titulo})\n` +
      `• 300g Batata-doce descascada em palitos\n` +
      `• 200g Brócolos em floretes\n` +
      `• 10ml Azeite virgem extra (1 colher sopa)\n` +
      `• Temperos: 5g pimentão doce, 3g alho em pó, sal e pimenta q.b.\n\n` +
      `👨‍🍳 *3. Preparação Passo a Passo:*\n` +
      `1. Pré-aquece a Airfryer a 190°C durante 3 minutos.\n` +
      `2. Envolve a batata-doce com 5ml de azeite e pimentão; cozinha 10 min a 190°C.\n` +
      `3. Tempera o frango com alho em pó, restante azeite, sal e pimenta; junta ao cesto com os brócolos.\n` +
      `4. Cozinha mais 9 minutos a 195°C (agitando a meio para dourar por igual) até atingir 74°C no interior.\n\n` +
      `📊 *4. Informação Nutricional (por dose — 1/2):*\n` +
      `| Macro | Valor por Dose | Meta Diária |\n` +
      `|---|---|---|\n` +
      `| Calorias | ~435 kcal | — |\n` +
      `| Proteína | ${protPorDose}g | ${pctMeta}% da meta diária de ${DAILY_PROTEIN_TARGET}g |\n` +
      `| Hidratos de Carbono | 34g | — |\n` +
      `| Gorduras | 9g | — |\n\n` +
      `💡 _Para registar esta dose:_ \`/proteina ${protPorDose} : ${titulo} (Airfryer)\``
    );
  }

  if (mode === 'mcc') {
    return (
      `🤖 *RECEITA MONSIEUR CUISINE CONNECT: ${titulo}*\n\n` +
      `⏱️ *1. Tempo & Doses:*\n` +
      `• Tempo Total: 22 minutos (robô Monsieur Cuisine Connect — confeção direta sem refogado)\n` +
      `• Rendimento: 2 doses\n\n` +
      `⚖️ *2. Ingredientes (Quantidades Exatas):*\n` +
      `• 400g Peito de frango ou peru em cubos (adaptado a: ${titulo})\n` +
      `• 250g Tomate pelado triturado + 250g Courgette/Brócolos em pedaços\n` +
      `• 150ml Caldo caseiro ou água + 10ml Azeite virgem extra adicionado a cru no final\n` +
      `• Ervas aromáticas diretas: orégãos, tomilho, salsa fresca, alho em pó e pitada de sal\n\n` +
      `👨‍🍳 *3. Preparação Passo a Passo (Monsieur Cuisine Connect):*\n` +
      `1. Coloca os legumes e ervas aromáticas no copo: *Picar 5 seg / Velocidade 5*.\n` +
      `2. Junta diretamente o frango/peru, tomate triturado e 150ml de caldo (sem refogado): *Cozinhar 18 min / 100°C / Velocidade 1 / Rotação Inversa (Reverse)*.\n` +
      `3. Retifica ervas aromáticas e envolve os 10ml de azeite em cru no último minuto (*30 seg / Vel 1 / Reverse*).\n` +
      `4. Serve de imediato bem quente.\n\n` +
      `📊 *4. Informação Nutricional (por dose — 1/2 | Ref. EFSA/ISSN):*\n` +
      `| Macro | Valor por Dose | Meta Diária |\n` +
      `|---|---|---|\n` +
      `| Calorias | ~375 kcal | — |\n` +
      `| Proteína | ${protPorDose}g | ${pctMeta}% da meta diária de ${DAILY_PROTEIN_TARGET}g |\n` +
      `| Hidratos de Carbono | 18g | — |\n` +
      `| Gorduras | 7g | — |\n\n` +
      `💡 _Para registar esta dose:_ \`/proteina ${protPorDose} : ${titulo} (MCC)\``
    );
  }

  return (
    `🥗 *RECEITA SAUDÁVEL ALTA PROTEÍNA: ${titulo}*\n\n` +
    `⏱️ *1. Tempo & Doses:*\n` +
    `• Tempo: 20 minutos | Rendimento: 2 doses\n\n` +
    `⚖️ *2. Ingredientes (Quantidades Exatas):*\n` +
    `• 400g Proteína magra principal (${titulo})\n` +
    `• 240g Legumes variados (brócolos, espinafres ou feijão-verde)\n` +
    `• 120g Arroz basmati cru (ou quinoa)\n` +
    `• 10ml Azeite virgem extra + ervas aromáticas e limão q.b.\n\n` +
    `👨‍🍳 *3. Preparação Passo a Passo:*\n` +
    `1. Coze 120g de arroz basmati em água a ferver durante 11 minutos e escorre.\n` +
    `2. Grelha ou salteia 400g de proteína magra numa frigideira antiaderente com 10ml de azeite (6–8 min).\n` +
    `3. Salta os 240g de legumes no mesmo tacho por 4 minutos mantendo textura crocante.\n` +
    `4. Emprata dividido em 2 doses iguais e finaliza com sumo de limão.\n\n` +
    `📊 *4. Informação Nutricional (por dose — 1/2):*\n` +
    `| Macro | Valor por Dose | Meta Diária |\n` +
    `|---|---|---|\n` +
    `| Calorias | ~460 kcal | — |\n` +
    `| Proteína | ${protPorDose}g | ${pctMeta}% da meta diária de ${DAILY_PROTEIN_TARGET}g |\n` +
    `| Hidratos de Carbono | 48g | — |\n` +
    `| Gorduras | 9g | — |\n\n` +
    `💡 _Para registar esta dose:_ \`/proteina ${protPorDose} : ${titulo}\``
  );
}

export async function generateHealthyRecipe({ query = '', mode = 'geral' } = {}) {
  const topic = String(query || '').trim() || 'refeição rápida rica em proteína';
  const modeLabel =
    mode === 'airfryer'
      ? 'Airfryer (indica temperatura exata °C e minutos)'
      : mode === 'mcc'
      ? 'Monsieur Cuisine Connect (receita direta sem refogados pesados; usa ervas aromáticas, Velocidade 1-10, Temperatura °C, Tempo e Reverse)'
      : 'Cozinha Tradicional Saudável';

  let webGrounding = '';
  try {
    const searchQ = `receita saudavel ${mode === 'mcc' ? 'monsieur cuisine' : mode === 'airfryer' ? 'airfryer' : ''} ${topic} alta proteina`;
    const hits = await searchLiveWeb(searchQ, 3);
    if (hits.length > 0) {
      webGrounding = `Referências web reais encontradas:\n${hits.map((h) => `- ${h.title} (${h.url || h.link})`).join('\n')}`;
    }
  } catch (err) {
    log.warn(`Pesquisa web de receita ignorada: ${err.message}`);
  }

  const prompt =
    `Cria UMA receita saudável portuguesa real, económica e rica em proteína para: "${topic}".\n` +
    `Equipamento obrigatório: ${modeLabel}.\n` +
    `${webGrounding ? `${webGrounding}\n` : ''}\n` +
    `REGRAS DE FORMATO OBRIGATÓRIAS (4 BLOCOS EXATOS, ZERO ALUCINAÇÕES):\n` +
    `1. ⏱️ Tempo de preparação e número de doses.\n` +
    `2. ⚖️ Lista de ingredientes exclusivamente em gramas (g) ou mililitros (ml) com produtos comuns em Portugal (usar apenas os ingredientes indicados quando especificados).\n` +
    `3. 👨‍🍳 Preparação numerada passo a passo (sem refogados pesados no modo MCC).\n` +
    `4. 📊 Tabela de macronutrientes POR DOSE (Calorias kcal, Proteína g, Hidratos g, Gorduras g) E obrigatoriamente a percentagem exata face à meta diária de 160g de proteína (ex: "X% da meta diária de 160g").\n` +
    `No fim, inclui sugestão pronta de registo: /proteina <valor> : <nome>.`;

  const aiRes = await generateDeterministicCompletion({
    systemPrompt:
      'És o Chef Nutricionista Desportivo de André Pinheiro (PT-PT, EFSA, temperature=0.0). Nunca inventes macros irreais nem omitas os 4 blocos.',
    prompt,
    maxTokens: 1500
  });

  const finalText =
    aiRes?.text && aiRes.text.includes('160g') && /\d+\s*g/i.test(aiRes.text)
      ? aiRes.text
      : buildDeterministicFallbackRecipe(topic, mode);

  try {
    const protMatch = finalText.match(/(\d+)\s*g/i);
    sqliteMasterDb.saveRecipe({
      title: topic,
      mode,
      query: topic,
      content: finalText,
      protein_g: protMatch ? parseInt(protMatch[1], 10) : 48
    });
  } catch {}

  return finalText;
}

export async function handleAnaliseIa(text) {
  try {
    const reply = await askAgent({
      chatId: 'nutri_analise',
      workerTag: 'nutricao',
      prompt: `Analisa este pedido nutricional e responde de forma concisa, factual e estruturada com macros exatos (Proteína, Hidratos, Gordura, Kcal e % meta 160g):\n\n${text}`
    });
    return reply || '⚠️ Não consegui gerar a resposta nutricional neste momento.';
  } catch (err) {
    log.error('Erro na IA Nutrição:', err?.message || err);
    return '⚠️ Serviço de IA temporariamente indisponível. Usa `/proteina <gramas> : <refeição>`.';
  }
}

// ─── Dispatcher Nutrição & Receitas ──────────────────────────────────────────

export async function handle(text, ctx = {}) {
  const chatId = String(ctx.chat?.id || ctx.from?.id || process.env.CHAT_ID_AUTORIZADO || process.env.AUTHORIZED_CHAT_ID || '');
  log.info('Processando pedido de Nutrição', { text: text.substring(0, 60), chatId });
  const trimmed = text.trim();

  if (/^\/(reset|limpar)\b/i.test(trimmed)) {
    return await askAgent({ chatId, workerTag: 'nutricao', prompt: '/reset' });
  }

  if (/^\/(start|menu|ajuda)\b/i.test(trimmed)) {
    return (
      `🥗 *Olá André! Nutrição 160g & Receitas Saudáveis:*\n\n` +
      `*🍽️ Alimentação & Registo:*\n` +
      `• \`/comer 150g Frango\` — Registar consumo (catálogo oficial ou estimado)\n` +
      `• \`/proteina 50 : Bife com arroz\` — Registo rápido de proteína\n` +
      `• \`/diario_alimentar\` — Histórico de refeições de hoje com macros\n` +
      `• \`/resumo_nutricional\` | \`/hoje\` — Resumo diário completo (160g prot, 2.5L água)\n` +
      `• \`/consumo_agua 500\` | \`/agua 500\` — Registar hidratação\n` +
      `• \`/creatina\` — Registar 5g diários\n` +
      `• \`/metas_nutricionais\` — Ver/alterar metas de proteína e água\n` +
      `• \`/foto_refeicao\` — Instruções de análise visual por IA\n` +
      `• \`/foto_rotulo\` — Instruções para cadastrar rótulo no catálogo\n\n` +
      `*🛒 Compras & Despensa:*\n` +
      `• \`/adicionar_compra Leite 2 un\` — Adicionar à lista de compras\n` +
      `• \`/comprado Leite\` — Registar compra no histórico\n` +
      `• \`/historico_compras\` — Ver compras recentes\n` +
      `• \`/foto_compra\` — Registar talão de supermercado\n\n` +
      `*🧠 Memória & Catálogo:*\n` +
      `• \`/produtos_frequentes\` | \`/mais_consumidos\` | \`/mais_comprados\`\n` +
      `• \`/corrigir_produto\` | \`/eliminar_produto\`\n\n` +
      `*👨‍🍳 Motor de Receitas:*\n` +
      `• \`/plano\` — Ver plano alimentar estruturado\n` +
      `• \`/receita salmão\` | \`/receita_airfryer frango\` | \`/receita_mcc sopa\``
    );
  }

  // ─── 1. Comandos Canónicos de Alimentação & Consumo ───
  if (/^\/comer\b/i.test(trimmed)) {
    return handleComer(trimmed.replace(/^\/comer\s*/i, '').trim(), chatId);
  }

  if (/^\/foto_refeicao\b/i.test(trimmed)) {
    return handleFotoRefeicao();
  }

  if (/^\/foto_rotulo\b/i.test(trimmed)) {
    return handleFotoRotulo();
  }

  if (/^\/diario_alimentar\b/i.test(trimmed)) {
    return handleDiarioAlimentar(chatId);
  }

  if (/^\/resumo_nutricional\b/i.test(trimmed)) {
    return handleResumoNutricional(chatId);
  }

  if (/^\/consumo_agua\b/i.test(trimmed)) {
    return handleConsumoAgua(trimmed.replace(/^\/consumo_agua\s*/i, '').trim(), chatId);
  }

  if (/^\/metas_nutricionais\b/i.test(trimmed)) {
    return handleMetasNutricionais(trimmed.replace(/^\/metas_nutricionais\s*/i, '').trim(), chatId);
  }

  // ─── 2. Comandos Canónicos de Compras & Histórico ───
  if (/^\/adicionar_compra\b/i.test(trimmed)) {
    return handleAdicionarCompra(trimmed.replace(/^\/adicionar_compra\s*/i, '').trim(), chatId);
  }

  if (/^\/foto_compra\b/i.test(trimmed)) {
    return handleFotoCompra();
  }

  if (/^\/comprado\b/i.test(trimmed)) {
    return handleComprado(trimmed.replace(/^\/comprado\s*/i, '').trim(), chatId);
  }

  if (/^\/historico_compras\b/i.test(trimmed)) {
    return handleHistoricoCompras(chatId);
  }

  // ─── 3. Comandos Canónicos de Memória & Catálogo ───
  if (/^\/produtos_frequentes\b/i.test(trimmed)) {
    return handleProdutosFrequentes(chatId);
  }

  if (/^\/mais_consumidos\b/i.test(trimmed)) {
    return handleMaisConsumidos(chatId);
  }

  if (/^\/mais_comprados\b/i.test(trimmed)) {
    return handleMaisComprados(chatId);
  }

  if (/^\/corrigir_produto\b/i.test(trimmed)) {
    return handleCorrigirProduto(trimmed.replace(/^\/corrigir_produto\s*/i, '').trim());
  }

  if (/^\/eliminar_produto\b/i.test(trimmed)) {
    return handleEliminarProduto(trimmed.replace(/^\/eliminar_produto\s*/i, '').trim());
  }

  if (/^\/(plano|dieta|menu_dieta)\b/i.test(trimmed)) return getPlanoNutricional();
  if (/^\/(hoje|macros|resumo|status)\b/i.test(trimmed)) return getResumoHoje();

  if (/^\/proteina\b/i.test(trimmed)) {
    return handleProteinaInput(trimmed.replace(/^\/proteina\s*/i, '').trim());
  }

  if (/^\/agua\b/i.test(trimmed)) {
    return handleAguaInput(trimmed.replace(/^\/agua\s*/i, '').trim());
  }

  if (/^\/creatina\b/i.test(trimmed)) {
    return handleCreatina();
  }

  // Motor de Receitas Saudáveis (Slash + Linguagem Natural)
  if (/^\/receita_airfryer\b/i.test(trimmed)) {
    return await generateHealthyRecipe({ query: trimmed.replace(/^\/receita_airfryer\s*/i, ''), mode: 'airfryer' });
  }
  if (/^\/receita_mcc\b/i.test(trimmed)) {
    return await generateHealthyRecipe({ query: trimmed.replace(/^\/receita_mcc\s*/i, ''), mode: 'mcc' });
  }
  if (/^\/receita\b/i.test(trimmed)) {
    const q = trimmed.replace(/^\/receita\s*/i, '').trim();
    const inferredMode = /air\s*fryer/i.test(q) ? 'airfryer' : /\b(mcc|monsieur|bimby)\b/i.test(q) ? 'mcc' : 'geral';
    return await generateHealthyRecipe({ query: q, mode: inferredMode });
  }

  if (/\b(receita|cozinhar|sugest[aã]o\s+de\s+(jantar|almo[cç]o)|air\s*fryer|monsieur\s+cuisine|mcc)\b/i.test(trimmed)) {
    const mode = /air\s*fryer/i.test(trimmed) ? 'airfryer' : /\b(mcc|monsieur\s+cuisine)\b/i.test(trimmed) ? 'mcc' : 'geral';
    return await generateHealthyRecipe({ query: trimmed, mode });
  }

  const quickProtMatch = trimmed.match(/^(\d{1,3})\s*(?:g|gr)?\s*(?:de\s+prote[ií]na)?\s*[:\-]?\s*(.*)$/i);
  if (quickProtMatch && parseInt(quickProtMatch[1], 10) <= 200 && quickProtMatch[2]) {
    return handleProteinaInput(`${quickProtMatch[1]} : ${quickProtMatch[2]}`);
  }

  const today = sqliteMasterDb.getTodayNutrition();
  const extraContext = `Hoje André consumiu ${today.totalProtein}g de ${today.proteinTarget}g de proteína, ${today.totalWater}ml de água, creatina=${today.tookCreatina ? 'Sim' : 'Pendente'}.`;

  return await askAgent({
    chatId,
    workerTag: 'nutricao',
    prompt: trimmed,
    extraContext
  });
}

export default {
  handle,
  getPlanoNutricional,
  getResumoHoje,
  handleProteinaInput,
  handleAguaInput,
  handleCreatina,
  handleComer,
  handleFotoRefeicao,
  handleFotoRotulo,
  handleDiarioAlimentar,
  handleResumoNutricional,
  handleConsumoAgua,
  handleMetasNutricionais,
  handleAdicionarCompra,
  handleFotoCompra,
  handleComprado,
  handleHistoricoCompras,
  handleProdutosFrequentes,
  handleMaisConsumidos,
  handleMaisComprados,
  handleCorrigirProduto,
  handleEliminarProduto,
  handleAnaliseIa,
  generateHealthyRecipe
};
