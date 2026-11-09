// src/workers/worker_nutricao.js — Especialista em Nutrição, Alta Proteína e Performance
import axios from 'axios';
import { familyDb } from '../shared/familyDb.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('WorkerNutricao');
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

function dataHora() {
  return new Date().toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon', hour12: false });
}

// ─── Barra de Progresso Visual ──────────────────────────────────────────────

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
    `🎯 *Meta Diária:* 160g Proteína (~2g/kg) | 2.5L Água | 5g Creatina\n\n` +
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
    `💡 _Registar refeição:_ \`/proteina 54 : Lombo de porco com arroz\`\n` +
    `📸 _Também podes enviar a foto do prato para análise automática!_`;
}

// ─── Resumo Diário com Barra de Progresso ────────────────────────────────────

export function getResumoHoje() {
  const data = familyDb.getTodayNutrition();
  const { totalProtein, totalCalories, totalWater, tookCreatina, proteinTarget, waterTarget, todayLogs } = data;

  const protBar = renderProgressBar(totalProtein, proteinTarget, 10);
  const waterBar = renderProgressBar(totalWater, waterTarget, 10);
  const creatinaIcon = tookCreatina ? '✅ Tomada (5g)' : '☐ Pendente (toma 5g com água)';

  let msg =
    `📊 *RESUMO NUTRICIONAL DE HOJE*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🍗 *Proteína:* ${totalProtein}g / ${proteinTarget}g\n` +
    `${protBar}\n\n` +
    `💧 *Hidratação:* ${totalWater}ml / ${waterTarget}ml\n` +
    `${waterBar}\n\n` +
    `🔥 *Calorias Estimadas:* ~${totalCalories} kcal\n` +
    `⚡ *Creatina Diária:* ${creatinaIcon}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n`;

  if (todayLogs.length === 0) {
    msg += `_Ainda não registaste refeições hoje._\nUsa os botões abaixo ou envia ex: \`/proteina 40 : Almoço\`!`;
  } else {
    msg += `📋 *Refeições Registadas Hoje:*\n`;
    todayLogs.slice(0, 6).forEach((l, i) => {
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

// ─── Registo de Proteína Rápida ──────────────────────────────────────────────

export function handleProteinaInput(input) {
  const match = input.match(/^(\d+)\s*(?::\s*(.*))?$/);
  if (!match) {
    return (
      `💡 *Como registar proteína:*\n` +
      `\`/proteina <gramas> : <refeição>\`\n\n` +
      `Exemplo: \`/proteina 54 : Lombo de porco com batata\`\n` +
      `Exemplo rápido: \`/proteina 30\``
    );
  }

  const grams = parseInt(match[1], 10);
  const desc = match[2] ? match[2].trim() : 'Refeição Proteica';
  const caloriesEst = Math.round(grams * 5.5); // estimativa padrão composta

  familyDb.addNutritionLog({
    meal: desc,
    protein: grams,
    calories: caloriesEst,
    notes: 'Registo via Telegram @Nutriainbot'
  });

  const status = familyDb.getTodayNutrition();
  return (
    `✅ *Refeição Registada com Sucesso!*\n\n` +
    `• Prato: *${desc}*\n` +
    `• Proteína adicionada: *+${grams}g*\n` +
    `• Total hoje: *${status.totalProtein}g* de *${status.proteinTarget}g* (${Math.round((status.totalProtein / status.proteinTarget) * 100)}%)\n\n` +
    `_Digita /hoje para ver o relatório completo._`
  );
}

// ─── Registo de Água ────────────────────────────────────────────────────────

export function handleAguaInput(input) {
  let ml = 250;
  const match = input.match(/\d+/);
  if (match) {
    ml = parseInt(match[0], 10);
  }

  familyDb.addNutritionLog({
    meal: `Água (${ml}ml)`,
    water_ml: ml,
    notes: 'Hidratação diária'
  });

  const status = familyDb.getTodayNutrition();
  return (
    `💧 *+${ml}ml de Água Registados!*\n\n` +
    `Total de hoje: *${status.totalWater}ml* de *${status.waterTarget}ml* (${Math.round((status.totalWater / status.waterTarget) * 100)}%)\n\n` +
    `_A manter o corpo e os rins hidratados em alta performance!_`
  );
}

// ─── Registo de Creatina ────────────────────────────────────────────────────

export function handleCreatina() {
  familyDb.addNutritionLog({
    meal: 'Creatina Monoidratada (5g)',
    creatina: true,
    notes: 'Dose diária de creatina'
  });

  return (
    `⚡ *Dose de Creatina (5g) Registada!*\n\n` +
    `Excelente! A saturação muscular de fosfocreatina está mantida.\n` +
    `Lembra-te de beber pelo menos 2.5L de água ao longo do dia.`
  );
}

// ─── Análise com IA (Gemini) ou Sugestão de Receita ──────────────────────────

export async function handleAnaliseIa(text) {
  if (!GEMINI_API_KEY) {
    return (
      `🥩 *Sugestão Rápida de Refeição:*
• Bife de frango ou lombo de porco (200g) = ~45g Proteína
• 3 Ovos inteiros + 2 claras = ~26g Proteína
• 1 Lata de Atum natural = ~30g Proteína
• 200g Queijo Cottage Milbona = ~28g Proteína`
    );
  }

  try {
    const prompt =
      `És um nutricionista desportivo de elite português focado em hipertrofia, energia e alta proteína (meta diária 160g de proteína). ` +
      `Responde em português de Portugal de forma concisa, encorajadora e estruturada com bullet points e estimativa de macros (Proteína, Hidratos, Gordura, Kcal) para o seguinte pedido:\n\n"${text}"`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    const res = await axios.post(
      url,
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.6, maxOutputTokens: 600 }
      },
      { timeout: 7500 }
    );

    const reply = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return reply || '⚠️ Não consegui gerar a resposta nutricional neste momento.';
  } catch (err) {
    log.error('Erro na IA Nutrição:', err?.message || err);
    return '⚠️ Serviço de IA temporariamente sobrecarregado. Podes registar diretamente com `/proteina <gramas> : <refeição>`.';
  }
}

// ─── Dispatcher Geral de Texto ──────────────────────────────────────────────

export async function handle(text) {
  log.info('Processando pedido de Nutrição', { text: text.substring(0, 60) });
  const trimmed = text.trim();

  // Comandos diretos
  if (/^\/(start|menu|ajuda)\b/i.test(trimmed)) {
    return (
      `🥗 *Olá André! Sou o teu Nutricionista & Assistente de Alta Proteína.*\n\n` +
      `Aqui geres a tua alimentação, bates a tua meta de *160g de proteína diária*, controlas a água e a creatina.\n\n` +
      `⚡ *Comandos Rápidos:*\n` +
      `• \`/plano\` — Ver plano diário de refeições ricas em proteína\n` +
      `• \`/hoje\` — Ver progresso de proteína, calorias e água\n` +
      `• \`/proteina 50 : Bife com arroz\` — Registar refeição\n` +
      `• \`/agua 500\` — Registar consumo de água (ml)\n` +
      `• \`/creatina\` — Registar toma diária de 5g\n` +
      `• \`/receita atum\` — Pedir receita de alto teor proteico\n\n` +
      `📸 *Dica:* Tira uma foto ao teu prato e envia aqui no chat para a IA analisar os macros automaticamente!`
    );
  }

  if (/^\/(plano|dieta|menu_dieta)\b/i.test(trimmed)) {
    return getPlanoNutricional();
  }

  if (/^\/(hoje|macros|resumo|status)\b/i.test(trimmed)) {
    return getResumoHoje();
  }

  if (/^\/proteina\b/i.test(trimmed)) {
    const raw = trimmed.replace(/^\/proteina\s*/i, '').trim();
    return handleProteinaInput(raw);
  }

  if (/^\/agua\b/i.test(trimmed)) {
    const raw = trimmed.replace(/^\/agua\s*/i, '').trim();
    return handleAguaInput(raw);
  }

  if (/^\/creatina\b/i.test(trimmed)) {
    return handleCreatina();
  }

  // Deteção rápida de padrão numérico de proteína (ex: "45g de frango", "comi 30 proteina")
  const quickProtMatch = trimmed.match(/^(\d{1,3})\s*(?:g|gr)?\s*(?:de\s+prote[ií]na)?\s*[:\-]?\s*(.*)$/i);
  if (quickProtMatch && parseInt(quickProtMatch[1], 10) <= 200 && quickProtMatch[2]) {
    return handleProteinaInput(`${quickProtMatch[1]} : ${quickProtMatch[2]}`);
  }

  // Consulta em linguagem natural à IA nutricionista
  return await handleAnaliseIa(trimmed);
}

export default {
  handle,
  getPlanoNutricional,
  getResumoHoje,
  handleProteinaInput,
  handleAguaInput,
  handleCreatina,
  handleAnaliseIa
};

