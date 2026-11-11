// src/router/masterRouter.js — Router Unificado & Grok Dispatcher 100% Cloud (@AndrePinheirobot | temp: 0.0)
import { createLogger } from '../utils/logger.js';
import { sqliteMasterDb } from '../shared/sqliteMasterDb.js';
import { generateDeterministicCompletion, askAgent } from '../services/reasoningService.js';
import * as workerGeral from '../workers/worker_geral.js';
import * as workerNutricao from '../workers/worker_nutricao.js';
import * as workerImmo from '../workers/worker_immo.js';
import * as workerDev from '../workers/worker_dev.js';

const log = createLogger('MasterRouter');

export const FLEET_REDIRECT_MSG =
  `🚛 *Domínio Profissional Isolado (Arquitetura Limpa)*\n\n` +
  `A gestão operacional de frotas, ZeroPaperFrota, AppFrota, rotas de camiões/autocarros (\`/rota\`) e auditoria de tacógrafo (\`/tacografo\`) corre exclusivamente no bot dedicado empresarial:\n` +
  `👉 **@zeropaperfrotaBot**\n\n` +
  `Aqui no **@AndrePinheirobot** mantenho apenas a tua vida pessoal, família, nutrição, notícias oficiais, radar de compras (5 frentes) e dev/PC pessoal.`;

// Regra de redirecionamento restrito de frota/trabalho
const WORK_FLEET_PATTERNS = [
  /^\/(frota|frotas|veiculos|viaturas|rota|tacografo|appfrota)\b/i,
  /\b(appfrota|zeropaperfrota|rotabus|tac[oó]grafo|ce\s*561\/2006|condu[cç][aã]o\s+cont[ií]nua)\b/i,
  /\b(?:autocarro|cami[aã]o|viatura|frota)\b.*\b(?:avaria|trav[oõ]es|km|od[oó]metro|revis[aã]o|oficina|higieniza[cç][aã]o|lavagem|checklist|manuten[cç][aã]o|[a-z0-9]{2}-[a-z0-9]{2}-[a-z0-9]{2})\b/i,
  /\b(?:avaria|manuten[cç][aã]o|revis[aã]o|checklist|higieniza[cç][aã]o)\b.*\b(?:autocarro|cami[aã]o|viatura|frota)\b/i,
  /\bmatr[ií]cula\s+[a-z0-9]{2}-[a-z0-9]{2}-[a-z0-9]{2}\b/i
];

const PATTERNS = {
  NUTRICAO: [
    /^\/(plano|hoje|proteina|agua|creatina|nutricao|dieta|macros|receita|receita_airfryer|receita_mcc)\b/i,
    /\b(prote[ií]na|creatina|macros?|calorias?|receita|air\s*fryer|monsieur\s+cuisine|\bmcc\b|lombo de porco|peito de frango|cottage|nestum)\b/i
  ],
  IMMO: [
    /^\/(radar|casas|moradias?_novas?|novas?|moradias?|sites|relatorio|avaliacao|avaliar|alertas|carros?|tech|amazon|ofertas?|apple|iphone_preco|apple_refurb|vigiar|vigiar_amazon|vigiar_apple|meus_alertas)\b/i,
    /\b(moradia|apartamento|im[oó]vel|imobili[aá]ri|idealista|imovirtual|cmvm|standvirtual|piscapisca|carmine|pcdiga|globaldata|pccomponentes|wallapop|amazon\.es|segunda\s+mano|iphone|macbook|recondicionad|grau\s+a|iservices|swappie|back\s*market)\b/i
  ],
  DEV: [
    /^\/(code|projetos?|criar_app|deploy|apps?|apks?|status_cloud|print|screenshot|pc|pc_status|hardware|pc_sistema|compilar|build)\b/i,
    /\b(c[oó]digo|bug|erro|node\.?js|react|github(?:\s+actions)?|vercel|render|cloud\s*status|telemetria\s+cloud|webhook|pc\s*surface|screenshot|ecr[aã]|compilar\s+apk)\b/i
  ],
  GERAL: [
    /^\/(noticias|noticias_regiao|amarante|governo|leis|farmacias?|compras?|tarefas?|carolina|nota|notas|lembrete|lembretes|briefing|resumo|emails?|ler_email|resumo_email|email_status|pesquisa|google|combustiveis|gasoleo|gasolina|transito|tv|programacao)\b/i,
    /\b(not[ií]cias?|di[aá]rio\s+da\s+rep[uú]blica|portugal\.gov|ipma|prociv|farm[aá]cias?|email|inbox|correio|compras|supermercado|tarefa|carolina|escola|lembra-me|lembrar|daqui a \d+|amanh[aã]\s+[aà]s|nota:|combust[ií]veis|gas[oó]leo|tr[aâ]nsito)\b/i
  ]
};

export function detectIntent(text = '') {
  const clean = String(text || '').trim();
  if (!clean) return 'GERAL';

  for (const re of WORK_FLEET_PATTERNS) {
    if (re.test(clean)) return 'FROTA_REDIRECT';
  }
  for (const re of PATTERNS.NUTRICAO) {
    if (re.test(clean)) return 'NUTRICAO';
  }
  for (const re of PATTERNS.IMMO) {
    if (re.test(clean)) return 'IMMO';
  }
  for (const re of PATTERNS.DEV) {
    if (re.test(clean)) return 'DEV';
  }
  for (const re of PATTERNS.GERAL) {
    if (re.test(clean)) return 'GERAL';
  }

  return 'MASTER';
}

const DISPATCH_PROMPT = `És o Grok Cognitive Dispatcher do ecossistema PESSOAL de André Pinheiro (@AndrePinheirobot).
Analisa a mensagem e extrai apenas se for uma AÇÃO DIRETA verificável em JSON puro (sem markdown):

Domínios válidos:
- "PESSOAL": action = "adicionar_compra" (items: string[]) | "adicionar_tarefa" (tasks: string[], assigned_to) | "diario_bebe" (event_type: fralda|sono|alimentacao|medicao|escola|geral, details) | "nota_rapida" (title, content)
- "LEMBRETE": action = "agendar_lembrete" (reminder_text, time_expression, relative_minutes)
- "NUTRICAO": action = "registar_proteina" (grams, meal) | "registar_agua" (ml) | "registar_creatina"
- "CLOUD_DEVOPS": action = "status_cloud"
- "TRABALHO_FROTA": apenas se mencionar explicitamente gestão de autocarros, camiões, tacógrafo CE 561/2006, AppFrota ou ZeroPaperFrota.
- "CHAT": conversa normal, dúvidas, pesquisa web, receitas, notícias, avaliações ou perguntas abertas.

Formato obrigatório JSON:
{"domain":"PESSOAL|LEMBRETE|NUTRICAO|CLOUD_DEVOPS|TRABALHO_FROTA|CHAT","confidence":0.95,"action":"...","data":{...}}`;

/**
 * Tenta despacho cognitivo determinístico (temp = 0.0) em linguagem natural pessoal.
 * Devolve null se for conversa/pesquisa para seguir ao worker ou Grok Master.
 */
export async function tryPersonalDispatch(text = '', ctx = {}) {
  const trimmed = String(text || '').trim();
  if (!trimmed || trimmed.startsWith('/') || trimmed.length < 4) return null;

  // Só aciona o extrator cognitivo quando há sinal claro de comando natural de escrita/registo
  const looksActionable = /\b(compra|comprar|leite|p[aã]o|supermercado|tarefa|afazer|nota:|anota|carolina|fralda|sesta|biberon|lembra|lembrar|daqui a \d+|prote[ií]na|bebi \d+|creatina|status da cloud|status do servidor)\b/i.test(trimmed);
  if (!looksActionable) return null;

  try {
    const aiRes = await generateDeterministicCompletion({
      systemPrompt: DISPATCH_PROMPT,
      prompt: trimmed,
      maxTokens: 350
    });
    if (!aiRes?.text) return null;

    const cleanJson = aiRes.text.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
    const parsed = JSON.parse(cleanJson);
    if (!parsed || (parsed.confidence || 0) < 0.72 || parsed.domain === 'CHAT') {
      return null;
    }

    const chatId = String(ctx.chat?.id || ctx.from?.id || '950415577');
    const user = { first_name: ctx.from?.first_name || 'André', username: ctx.from?.username };
    const data = parsed.data || {};

    if (parsed.domain === 'TRABALHO_FROTA') {
      return FLEET_REDIRECT_MSG;
    }

    if (parsed.domain === 'PESSOAL') {
      if (parsed.action === 'adicionar_compra' && Array.isArray(data.items) && data.items.length > 0) {
        data.items.forEach((it) => sqliteMasterDb.addShopping(it, 'geral', user));
        return `🛒 *Compras atualizadas (SQLite):*\n${data.items.map((i) => `• ${i}`).join('\n')}`;
      }
      if (parsed.action === 'adicionar_tarefa' && Array.isArray(data.tasks) && data.tasks.length > 0) {
        data.tasks.forEach((t) => sqliteMasterDb.addTask(t, data.assigned_to || 'Ambos', user));
        return `✅ *Tarefas adicionadas:*\n${data.tasks.map((t) => `• ${t}`).join('\n')}`;
      }
      if (parsed.action === 'diario_bebe' && data.details) {
        sqliteMasterDb.addBabyLog(data.event_type || 'geral', data.details, '', user);
        return `👧 *Diário Carolina registado:* [${data.event_type || 'geral'}] ${data.details}`;
      }
      if (parsed.action === 'nota_rapida' && (data.content || data.title)) {
        sqliteMasterDb.addNote(data.title || 'Nota Rápida', data.content || data.title, 'blue', user);
        return `📝 *Nota guardada:* ${data.title || 'Nota'} — _${data.content || data.title}_`;
      }
    }

    if (parsed.domain === 'LEMBRETE' && data.reminder_text) {
      let dueAt = null;
      if (Number(data.relative_minutes) > 0) {
        dueAt = new Date(Date.now() + Number(data.relative_minutes) * 60000);
      } else {
        const parsedTime = workerGeral.parseReminderInput(`${data.time_expression || ''} ${data.reminder_text}`.trim());
        dueAt = parsedTime.triggerAt;
      }
      sqliteMasterDb.addReminder({
        text: data.reminder_text,
        triggerAt: dueAt,
        chatId,
        user
      });
      const dtFmt = dueAt.toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon', hour12: false });
      return `⏰ *Lembrete agendado para ${dtFmt}:*\n_"${data.reminder_text}"_`;
    }

    if (parsed.domain === 'NUTRICAO') {
      if (parsed.action === 'registar_proteina' && Number(data.grams) > 0) {
        return workerNutricao.handleProteinaInput(`${Number(data.grams)} : ${data.meal || 'Refeição'}`);
      }
      if (parsed.action === 'registar_agua' && Number(data.ml) > 0) {
        return workerNutricao.handleAguaInput(String(data.ml));
      }
      if (parsed.action === 'registar_creatina') {
        return workerNutricao.handleCreatina();
      }
    }

    if (parsed.domain === 'CLOUD_DEVOPS' && parsed.action === 'status_cloud') {
      return await workerDev.handleStatusCloud();
    }
  } catch (err) {
    log.debug(`Personal dispatch ignorado: ${err.message}`);
  }
  return null;
}

/**
 * Orquestrador Mestre Unificado:
 * 1. Slash Commands & Deteção de Domínio -> 2. Redirecionamento Trabalho/Frota ->
 * 3. Personal Grok Dispatcher (temp 0.0) -> 4. Workers Especializados / Grok Master.
 */
export async function routeMessage(text = '', ctx = {}) {
  const trimmed = String(text || '').trim();
  const chatId = String(ctx.chat?.id || ctx.from?.id || '950415577');
  const intent = detectIntent(trimmed);

  log.info(`[MasterRouter] intent=${intent}`, { preview: trimmed.slice(0, 60), chatId });

  if (intent === 'FROTA_REDIRECT') {
    return FLEET_REDIRECT_MSG;
  }

  // Se não for comando de barra explícito, tentar despacho cognitivo pessoal (ex: "compra leite e pão", "lembra-me daqui a 15 min...")
  if (!trimmed.startsWith('/')) {
    const dispatched = await tryPersonalDispatch(trimmed, ctx);
    if (dispatched !== null) return dispatched;
  }

  switch (intent) {
    case 'NUTRICAO':
      return await workerNutricao.handle(trimmed, ctx);
    case 'IMMO':
      return await workerImmo.handle(trimmed, ctx);
    case 'DEV':
      return await workerDev.handle(trimmed, ctx);
    case 'GERAL':
      return await workerGeral.handle(trimmed, ctx);
    default:
      return await askAgent({
        chatId,
        workerTag: 'master',
        prompt: trimmed
      });
  }
}

export default {
  FLEET_REDIRECT_MSG,
  detectIntent,
  tryPersonalDispatch,
  routeMessage
};
