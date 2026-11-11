// src/workers/worker_nutricao.js — Nutrição Alta Proteína (160g) & Motor de Receitas Saudáveis
import { sqliteMasterDb } from '../shared/sqliteMasterDb.js';
import { createLogger } from '../utils/logger.js';
import { askAgent, generateDeterministicCompletion } from '../services/reasoningService.js';
import { searchLiveWeb } from '../shared/webSearch.js';

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

export function handleProteinaInput(input) {
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
  const estCal = Math.round(grams * 6.5);

  sqliteMasterDb.addNutritionLog({
    meal: desc,
    protein: grams,
    calories: estCal,
    notes: 'Registo rápido via Telegram'
  });

  const status = sqliteMasterDb.getTodayNutrition();
  const restante = Math.max(0, status.proteinTarget - status.totalProtein);
  const protBar = renderProgressBar(status.totalProtein, status.proteinTarget, 10);

  return (
    `🍗 *Registo Proteico Adicionado!*\n` +
    `• Refeição: *${desc}*\n` +
    `• Adicionado: *+${grams}g de proteína* (~${estCal} kcal)\n\n` +
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
      `• Tempo Total: 25 minutos (robô de cozinha Monsieur Cuisine Connect)\n` +
      `• Rendimento: 2 doses\n\n` +
      `⚖️ *2. Ingredientes (Quantidades Exatas):*\n` +
      `• 400g Peito de peru ou frango em tiras (adaptado a: ${titulo})\n` +
      `• 150g Cebola em quartos + 2 dentes de alho\n` +
      `• 250g Tomate pelado triturado + 200g Courgette/Cenoura\n` +
      `• 10ml Azeite virgem extra + 150ml Caldo caseiro\n` +
      `• Especiarias: salsa, orégãos e pitada de sal\n\n` +
      `👨‍🍳 *3. Preparação Passo a Passo (Monsieur Cuisine Connect):*\n` +
      `1. Coloca cebola e alho no copo: *Picar 5 seg / Velocidade 5*. Baixa com a espátula.\n` +
      `2. Junta 10ml de azeite: *Refogar (Sear/Reverse) 4 min / 120°C / Velocidade 1* sem copo medidor.\n` +
      `3. Adiciona o frango/peru, legumes, tomate e caldo: *Cozinhar 18 min / 100°C / Velocidade 1 / Rotação Inversa (Reverse)*.\n` +
      `4. Verifica consistência; serve quente (ou tritura molho separado 15 seg / Vel 6 se preferires creme).\n\n` +
      `📊 *4. Informação Nutricional (por dose — 1/2):*\n` +
      `| Macro | Valor por Dose | Meta Diária |\n` +
      `|---|---|---|\n` +
      `| Calorias | ~395 kcal | — |\n` +
      `| Proteína | ${protPorDose}g | ${pctMeta}% da meta diária de ${DAILY_PROTEIN_TARGET}g |\n` +
      `| Hidratos de Carbono | 22g | — |\n` +
      `| Gorduras | 8g | — |\n\n` +
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
  const chatId = String(ctx.chat?.id || ctx.from?.id || '950415577');
  log.info('Processando pedido de Nutrição', { text: text.substring(0, 60), chatId });
  const trimmed = text.trim();

  if (/^\/(reset|limpar)\b/i.test(trimmed)) {
    return await askAgent({ chatId, workerTag: 'nutricao', prompt: '/reset' });
  }

  if (/^\/(start|menu|ajuda)\b/i.test(trimmed)) {
    return (
      `🥗 *Olá André! Nutrição 160g & Receitas Saudáveis:*\n\n` +
      `• \`/plano\` — Ver plano diário de refeições (160g proteína)\n` +
      `• \`/hoje\` — Progresso de hoje (proteína, kcal, água, creatina)\n` +
      `• \`/proteina 50 : Bife com arroz\` — Registar proteína\n` +
      `• \`/agua 500\` — Registar água (ml)\n` +
      `• \`/creatina\` — Registar 5g diários\n` +
      `• \`/receita salmão\` — Receita saudável completa c/ tabela macros\n` +
      `• \`/receita_airfryer frango\` — Receita adaptada a Airfryer\n` +
      `• \`/receita_mcc sopa legumes\` — Receita Monsieur Cuisine Connect`
    );
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
  handleAnaliseIa,
  generateHealthyRecipe
};
