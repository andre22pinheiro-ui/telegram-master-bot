// src/services/iaNutricionistaService.js — Agente Nutricionista Virtual Inteligente (Asimov Academy Adaptado | ADR-044)
import { createLogger } from '../utils/logger.js';
import { sqliteMasterDb } from '../shared/sqliteMasterDb.js';
import { recordFoodConsumption, getDailyNutritionSummary } from './nutritionCatalogService.js';
import { generateDeterministicCompletion } from './reasoningService.js';

const log = createLogger('IaNutricionista');

const DAILY_PROTEIN_TARGET = 160;

/**
 * Base de dados nutricional padrão por 100g para estimativa heurística determinística (INSA / USDA)
 */
export const FOOD_DATABASE_100G = {
  frango: { nome: 'Peito de Frango Grelhado', proteina: 31.0, hc: 0.0, gordura: 3.6, calorias: 165, fibra: 0.0 },
  peru: { nome: 'Peito de Peru Grelhado', proteina: 29.5, hc: 0.0, gordura: 2.2, calorias: 145, fibra: 0.0 },
  lombo: { nome: 'Lombo de Porco Magro', proteina: 27.0, hc: 0.0, gordura: 5.5, calorias: 160, fibra: 0.0 },
  vaca: { nome: 'Bife de Vaca Magro', proteina: 26.0, hc: 0.0, gordura: 7.0, calorias: 170, fibra: 0.0 },
  salmao: { nome: 'Salmão Grelhado', proteina: 22.0, hc: 0.0, gordura: 12.0, calorias: 200, fibra: 0.0 },
  atum: { nome: 'Atum ao Natural', proteina: 25.0, hc: 0.0, gordura: 1.0, calorias: 110, fibra: 0.0 },
  pescada: { nome: 'Filetes de Pescada Cozida/Grelhada', proteina: 18.0, hc: 0.0, gordura: 1.5, calorias: 85, fibra: 0.0 },
  ovo: { nome: 'Ovo Inteiro (médio ~50g)', proteina: 13.0, hc: 1.0, gordura: 10.0, calorias: 145, fibra: 0.0 },
  cottage: { nome: 'Queijo Cottage Milbona', proteina: 12.0, hc: 3.0, gordura: 2.2, calorias: 80, fibra: 0.0 },
  quark: { nome: 'Queijo Quark Magro', proteina: 12.2, hc: 4.0, gordura: 0.2, calorias: 67, fibra: 0.0 },
  whey: { nome: 'Whey Protein Isolada/Concentrada', proteina: 80.0, hc: 5.0, gordura: 3.0, calorias: 370, fibra: 0.0 },
  arroz: { nome: 'Arroz Branco/Basmati Cozido', proteina: 2.7, hc: 28.0, gordura: 0.3, calorias: 130, fibra: 0.4 },
  batata: { nome: 'Batata-Doce Cozida/Assada', proteina: 1.6, hc: 20.0, gordura: 0.1, calorias: 86, fibra: 3.0 },
  aveia: { nome: 'Flocos de Aveia Integral', proteina: 13.5, hc: 58.0, gordura: 7.0, calorias: 365, fibra: 10.0 },
  brocolos: { nome: 'Brócolos Cozidos', proteina: 2.8, hc: 4.0, gordura: 0.4, calorias: 35, fibra: 2.6 },
  salada: { nome: 'Salada Mista com Azeite Suave', proteina: 1.2, hc: 3.5, gordura: 4.0, calorias: 55, fibra: 2.0 }
};

/**
 * Estimador heurístico determinístico baseado no texto ou legenda do prato
 */
export function estimatePortionsFromText(caption = '') {
  const clean = String(caption || '').toLowerCase();
  const detected = [];

  // Pesquisar alimentos conhecidos
  for (const [key, item] of Object.entries(FOOD_DATABASE_100G)) {
    if (clean.includes(key)) {
      // Tentar capturar porção explícita em gramas (ex: "frango 200g")
      const regex = new RegExp(`${key}\\w*\\s*(\\d+)\\s*(?:g|gr)?`, 'i');
      const match = clean.match(regex);
      let portionG = 150; // porção padrão

      if (match && match[1]) {
        portionG = Math.max(20, Math.min(800, Number(match[1])));
      } else if (key === 'ovo') {
        portionG = 100; // 2 ovos
      } else if (key === 'arroz' || key === 'batata') {
        portionG = 120;
      } else if (key === 'brocolos' || key === 'salada') {
        portionG = 100;
      } else if (key === 'cottage' || key === 'quark') {
        portionG = 200;
      } else if (key === 'whey') {
        portionG = 30;
      }

      const factor = portionG / 100;
      const prot = Math.round(item.proteina * factor * 10) / 10;
      const hc = Math.round(item.hc * factor * 10) / 10;
      const fat = Math.round(item.gordura * factor * 10) / 10;
      const kcal = Math.round(item.calorias * factor);
      const fib = Math.round(item.fibra * factor * 10) / 10;

      detected.push({
        alimento: item.nome,
        porcaoG: portionG,
        proteinaG: prot,
        hcG: hc,
        gorduraG: fat,
        calorias: kcal,
        fibraG: fib
      });
    }
  }

  // Fallback se nenhum termo for reconhecido: refeição padrão equilibrada
  if (detected.length === 0) {
    detected.push({
      alimento: 'Fonte Proteica Mista (Grelhada)',
      porcaoG: 180,
      proteinaG: 40.0,
      hcG: 25.0,
      gorduraG: 6.0,
      calorias: 314,
      fibraG: 2.5
    });
  }

  return detected;
}

/**
 * Análise Nutricional de Fotografia / Prato (Multimodal / Heurística)
 */
export async function analyzeMealPhoto({
  userCaption = '',
  imageSource = 'telegram_photo',
  userId = 'default_user',
  useAi = true,
  aiClient = null
} = {}) {
  const summaryToday = getDailyNutritionSummary(userId);
  const currentProtein = summaryToday.totals.protein || 0;
  const targetProtein = summaryToday.goals.protein || DAILY_PROTEIN_TARGET;

  log.info(`[IaNutricionista] A analisar refeição visual de "${userCaption}" para ${userId}`);

  let foodsDetected = [];
  let feedback = '';

  // 1. Tentar inferência multimodal com IA se disponível e habilitado
  if (useAi && process.env.NODE_ENV !== 'test') {
    try {
      const prompt =
        `És o Agente Nutricionista Clínico de Alta Performance de André Pinheiro (Meta diária: 160g proteína | Foco: recomposição corporal e ganho muscular).\n` +
        `Analisa a refeição descrita ou apresentada: "${userCaption}".\n` +
        `Identifica os alimentos, porções em gramas e macronutrientes.\n` +
        `Responde EXCLUSIVAMENTE em formato JSON puro:\n` +
        `{\n` +
        `  "alimentos": [\n` +
        `    {"alimento": "Nome", "porcaoG": 180, "proteinaG": 45, "hcG": 20, "gorduraG": 5, "calorias": 305, "fibraG": 3}\n` +
        `  ],\n` +
        `  "feedback": "Opinião clínica sucinta sobre o equilíbrio de macros e adequação à meta de 160g."\n` +
        `}`;

      const aiRes = await generateDeterministicCompletion({
        systemPrompt: 'És um nutricionista desportivo clínico de rigor absoluto (temperatura 0.0). Responde em JSON.',
        prompt,
        maxTokens: 500
      });

      if (aiRes?.text) {
        const cleanJson = aiRes.text.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
        const parsed = JSON.parse(cleanJson);
        if (Array.isArray(parsed.alimentos) && parsed.alimentos.length > 0) {
          foodsDetected = parsed.alimentos;
          feedback = parsed.feedback || '';
        }
      }
    } catch (err) {
      log.warn(`[IaNutricionista] IA multimodal indisponível (${err.message}). Recorrendo a estimador determinístico.`);
    }
  }

  // 2. Se IA não devolveu alimentos, usar estimador determinístico
  if (foodsDetected.length === 0) {
    foodsDetected = estimatePortionsFromText(userCaption);
  }

  // Calcular totais da refeição
  let totalProt = 0;
  let totalKcal = 0;
  let totalHc = 0;
  let totalFat = 0;
  let totalFib = 0;

  for (const f of foodsDetected) {
    totalProt += Number(f.proteinaG || 0);
    totalKcal += Number(f.calorias || 0);
    totalHc += Number(f.hcG || 0);
    totalFat += Number(f.gorduraG || 0);
    totalFib += Number(f.fibraG || 0);
  }

  totalProt = Math.round(totalProt * 10) / 10;
  totalKcal = Math.round(totalKcal);
  totalHc = Math.round(totalHc * 10) / 10;
  totalFat = Math.round(totalFat * 10) / 10;
  totalFib = Math.round(totalFib * 10) / 10;

  const newTotalProt = currentProtein + totalProt;
  const pctOfGoal = Math.round((newTotalProt / targetProtein) * 100);
  const remainingProt = Math.max(0, Math.round((targetProtein - newTotalProt) * 10) / 10);

  if (!feedback) {
    if (totalProt >= 35) {
      feedback = `Excelente aporte proteico (+${totalProt}g), ideal para atingir o limiar de síntese proteica. Restam ${remainingProt}g para a meta diária.`;
    } else {
      feedback = `Refeição equilibrada, mas com aporte proteico moderado (+${totalProt}g). Considera reforçar com queijo quark ou ovos na próxima refeição.`;
    }
  }

  const evalId = `eval_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  const savedRecord = sqliteMasterDb.saveVisualEvaluation({
    id: evalId,
    userId,
    imageSource,
    mealType: 'refeição',
    foodsDetected,
    totalProtein: totalProt,
    totalCalories: totalKcal,
    totalCarbs: totalHc,
    totalFat: totalFat,
    feedback,
    recordedToLog: 0
  });

  return {
    ...savedRecord,
    feedback,
    totalFibre: totalFib,
    impact: {
      previousProtein: currentProtein,
      addedProtein: totalProt,
      newTotalProtein: newTotalProt,
      targetProtein,
      pctOfGoal,
      remainingProtein: remainingProt
    }
  };
}

/**
 * Confirmação e Registo Automático da Refeição Avaliada
 */
export function confirmMealEvaluation(evaluationId, userId = 'default_user') {
  const evaluation = sqliteMasterDb.getVisualEvaluation(evaluationId);
  if (!evaluation) {
    return { success: false, error: 'Avaliação não encontrada ou expirada.' };
  }

  if (evaluation.recorded_to_log) {
    return { success: false, error: 'Esta refeição já foi registada anteriormente no diário alimentar.' };
  }

  const desc = evaluation.foodsDetected.map((f) => `${f.alimento} (~${f.porcaoG}g)`).join(' + ');

  // Registar no diário alimentar do utilizador (assinatura de objeto único)
  const logEntry = recordFoodConsumption({
    userId,
    description: desc,
    quantity: 1,
    unit: 'dose',
    calories: evaluation.total_calories,
    protein: evaluation.total_protein,
    carbohydrates: evaluation.total_carbs,
    fat: evaluation.total_fat,
    estimated: 1
  });

  // Atualizar estado da avaliação no SQLite
  sqliteMasterDb.saveVisualEvaluation({
    ...evaluation,
    foodsDetected: evaluation.foodsDetected,
    recordedToLog: 1
  });

  return {
    success: true,
    evaluationId,
    logEntry,
    totalProtein: evaluation.total_protein,
    totalCalories: evaluation.total_calories
  };
}

/**
 * Consulta Conversacional ao Nutricionista Virtual
 */
export async function askNutritionist(question = '', { userId = 'default_user', useAi = true } = {}) {
  const cleanQ = String(question || '').trim();
  if (!cleanQ) {
    return 'Diz-me qual é a tua dúvida sobre alimentação, substituições de comida ou macros para hoje!';
  }

  const summary = getDailyNutritionSummary(userId);
  const tip = sqliteMasterDb.getDietTip();

  const context =
    `Perfil: André Pinheiro | Meta Diária: 160g Proteína, 2.5L Água, 5g Creatina.\n` +
    `Progresso Hoje: ${summary.totals.protein}g / ${summary.goals.protein}g proteína ingerida (~${summary.totals.calories} kcal).\n` +
    `Dica de Base: ${tip?.title} — ${tip?.content || ''}`;

  if (useAi && process.env.NODE_ENV !== 'test') {
    try {
      const aiRes = await generateDeterministicCompletion({
        systemPrompt:
          `És o Nutricionista Desportivo Virtual (inspirado no projeto IA-Nutricionista da Asimov Academy). ` +
          `Responde em Português Europeu com rigor científico e prático. Contexto:\n${context}`,
        prompt: cleanQ,
        maxTokens: 600
      });

      if (aiRes?.text) {
        return (
          `🥗 *NUTRICIONISTA VIRTUAL (Asimov IA)*\n━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `${aiRes.text}\n\n` +
          `🔒 _Referenciais ISSN / EFSA • Meta diária de 160g de proteína._`
        );
      }
    } catch (err) {
      log.warn(`[IaNutricionista] Falha ao consultar IA (${err.message}). A usar resposta padrão estruturada.`);
    }
  }

  // Resposta estruturada de contingência
  return (
    `🥗 *NUTRICIONISTA VIRTUAL (Asimov IA)*\n━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `Para a tua questão: _"${cleanQ}"_\n\n` +
    `📌 *Recomendação Técnica:* Mantém a prioridade no cumprimento da tua meta diária de *${summary.goals.protein}g de proteína*.\n` +
    `• Progresso atual: *${summary.totals.protein}g* (${summary.percentages.protein}% cumprido).\n` +
    `• Dica: ${tip?.content || 'Distribui a proteína em doses de 35-40g por refeição para maximizar a síntese proteica.'}\n\n` +
    `💡 _Usa \`/foto_refeicao\` ou \`/analisar_refeicao\` para avaliar pratos por IA._`
  );
}

// ─── FORMATADORES TELEGRAM MARKDOWN ──────────────────────────────────────────

/**
 * Formatador da Avaliação Nutricional de Prato
 */
export function formatMealAnalysisMarkdown(evalData) {
  if (!evalData) return '⚠️ Não foi possível analisar a refeição.';

  let msg = `🍽️ *ANÁLISE NUTRICIONAL DO PRATO (IA-Nutricionista)*\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;

  msg += `🥗 *Alimentos e Porções Identificadas:*\n`;
  evalData.foodsDetected.forEach((f, idx) => {
    msg += `*${idx + 1}.* ${f.alimento} (~${f.porcaoG}g)\n`;
    msg += `   ↳ *${f.proteinaG}g Prot* | ${f.calorias} kcal | ${f.hcG}g HC | ${f.gorduraG}g Gord\n`;
  });

  msg += `\n📊 *Macronutrientes Totais da Refeição:*\n`;
  msg += `• 🥩 *Proteína:* *+${evalData.total_protein}g*\n`;
  msg += `• 🔥 *Calorias:* *~${evalData.total_calories} kcal*\n`;
  msg += `• 🌾 *Hidratos:* *${evalData.total_carbs}g*\n`;
  msg += `• 🥑 *Gorduras:* *${evalData.total_fat}g*\n`;
  if (evalData.totalFibre) msg += `• 🌿 *Fibras:* *${evalData.totalFibre}g*\n`;

  if (evalData.impact) {
    const imp = evalData.impact;
    msg += `\n🎯 *Impacto na Meta Diária (160g):*\n`;
    msg += `• Total após refeição: *${imp.newTotalProtein}g / ${imp.targetProtein}g* (${imp.pctOfGoal}%)\n`;
    if (imp.remainingProtein > 0) {
      msg += `• Restam *${imp.remainingProtein}g* de proteína hoje.\n`;
    } else {
      msg += `• 🏆 *Meta diária de 160g atingida com esta refeição!*\n`;
    }
  }

  if (evalData.feedback || evalData.nutritionist_feedback) {
    msg += `\n🩺 *Avaliação Clínica:*\n_${evalData.feedback || evalData.nutritionist_feedback}_\n`;
  }

  msg += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `👉 Para somar ao diário alimentar de hoje:\n`;
  msg += `\`/confirmar_refeicao ${evalData.id}\``;

  return msg;
}

/**
 * Menu Geral /ia_nutricionista
 */
export function formatNutricionistaMenuMarkdown() {
  return (
    `🥗 *IA-NUTRICIONISTA — AGENTE INTELIGENTE NO TELEGRAM*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `Motor de nutrição visual e clínica adaptado do projeto open-source Asimov Academy:\n\n` +
    `🔹 \`/analisar_refeicao <descrição ou foto>\` — Avaliação de macros e porções por IA\n` +
    `🔹 \`/confirmar_refeicao <id>\` — Registo imediato da análise no diário alimentar\n` +
    `🔹 \`/duvida_nutricao <pergunta>\` — Consulta conversacional ao nutricionista virtual\n` +
    `🔹 \`/dica_nutricao\` — Dica clínica baseada em evidência científica (ISSN/EFSA)\n` +
    `🔹 \`/resumo_nutricional\` — Progresso diário de 160g proteína e 2.5L água\n\n` +
    `📸 *No envio de fotografias:* Envia uma foto do teu prato com a legenda \`/analisar_refeicao\` ou com o nome dos alimentos!`
  );
}

export default {
  FOOD_DATABASE_100G,
  estimatePortionsFromText,
  analyzeMealPhoto,
  confirmMealEvaluation,
  askNutritionist,
  formatMealAnalysisMarkdown,
  formatNutricionistaMenuMarkdown
};
