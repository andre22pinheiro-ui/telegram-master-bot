// src/services/proactiveEngine.js — Motor Proativo Europe/Lisbon (node-cron + Silêncio Noturno + Briefings & Nutrição)
import cron from 'node-cron';
import { createLogger } from '../utils/logger.js';
import { sqliteMasterDb } from '../shared/sqliteMasterDb.js';
import { getDailyNewsBriefing } from './newsService.js';
import { obterPostosMaisBaratos, formatarCombustiveisMarkdown } from './combustiveisService.js';
import { getEmailBriefing, getEmailStatus } from './emailService.js';
import {
  dispararCicloRadarComAlertas,
  gerarRelatorioMultiFrenteMarkdown
} from './immoRadarService.js';
import { sendRadarTelegramAlert } from './radarCommon.js';
import { VERCEL_IMMO_APP } from '../shared/immoSitesCatalog.js';
import { handle as handleNutricao } from '../workers/worker_nutricao.js';

const log = createLogger('ProactiveEngine');

let activeCronTasks = [];
let activeIntervals = [];
let isEngineRunning = false;

function getDefaultAdminChatId() {
  return String(
    process.env.CHAT_ID_AUTORIZADO ||
      process.env.AUTHORIZED_CHAT_ID ||
      process.env.TELEGRAM_CHAT_ID ||
      '950415577'
  ).trim();
}

/**
 * Devolve hora, minuto, minutos desde a meia-noite e chave de dia no fuso Europe/Lisbon.
 */
export function getLisbonClock(date = new Date()) {
  const target = date instanceof Date ? date : new Date(date);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Lisbon',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(target);

  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10) % 24;
  const minute = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);
  const dayKey = target.toLocaleDateString('pt-PT', { timeZone: 'Europe/Lisbon' });

  return {
    hour,
    minute,
    minutesSinceMidnight: hour * 60 + minute,
    dayKey
  };
}

/**
 * Janela de silêncio noturno obrigatória: 22:30 às 07:30 Europe/Lisbon.
 * Apenas lembretes críticos agendados e alertas urgentes podem contornar esta janela.
 */
export function isQuietHours(date = new Date()) {
  const { minutesSinceMidnight } = getLisbonClock(date);
  const quietStart = 22 * 60 + 30; // 22:30 -> 1350
  const quietEnd = 7 * 60 + 30;    // 07:30 -> 450
  return minutesSinceMidnight >= quietStart || minutesSinceMidnight < quietEnd;
}

function splitTelegramChunks(text, maxLen = 3900) {
  const chunks = [];
  let remaining = String(text || '');
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }
    let cut = remaining.lastIndexOf('\n', maxLen);
    if (cut <= 0) cut = maxLen;
    chunks.push(remaining.substring(0, cut));
    remaining = remaining.substring(cut).trimStart();
  }
  return chunks;
}

async function sendProactiveMessage(botInstance, chatId, text, extra = null) {
  if (!botInstance?.telegram || !chatId || !text) return false;
  const chunks = splitTelegramChunks(text, 3900);
  let sent = false;

  for (let i = 0; i < chunks.length; i++) {
    const isLast = i === chunks.length - 1;
    const opts = {
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
      ...(isLast && extra ? extra : {})
    };
    try {
      await botInstance.telegram.sendMessage(chatId, chunks[i], opts);
      sent = true;
    } catch {
      const plainOpts = { disable_web_page_preview: true, ...(isLast && extra ? extra : {}) };
      delete plainOpts.parse_mode;
      try {
        await botInstance.telegram.sendMessage(chatId, chunks[i].replace(/[*_`[\]]/g, ''), plainOpts);
        sent = true;
      } catch (err) {
        log.warn(`Falha envio proativo para ${chatId}: ${err.message}`);
      }
    }
  }
  return sent;
}

function compactSectionLines(markdown = '', maxLines = 4) {
  return String(markdown || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, maxLines)
    .join('\n');
}

/**
 * Briefing Executivo Matinal das 08:00 (Europe/Lisbon):
 * Notícias Certificadas + IPMA Porto/Amarante + DGEG Combustíveis + Emails IMAP + Tarefas Pendentes.
 */
export async function buildMorningExecutiveBriefing({
  getNewsFn = () => getDailyNewsBriefing(true),
  getFuelFn = obterPostosMaisBaratos,
  formatFuelFn = formatarCombustiveisMarkdown,
  getEmailStatusFn = getEmailStatus,
  getEmailBriefingFn = () => getEmailBriefing(5),
  getTasksFn = () => sqliteMasterDb.getTasks()
} = {}) {
  const [newsResult, dieselResult, petrolResult] = await Promise.allSettled([
    getNewsFn(),
    getFuelFn('amarante', 'gasoleo'),
    getFuelFn('amarante', 'gasolina')
  ]);

  const sections = [];

  if (newsResult.status === 'fulfilled' && newsResult.value) {
    sections.push(String(newsResult.value).trim());
  } else {
    sections.push('🗞️ *BRIEFING OFICIAL CERTIFICADO*\n_Serviço de notícias temporariamente indisponível._');
  }

  const fuelParts = [];
  if (dieselResult.status === 'fulfilled' && dieselResult.value) {
    const md = compactSectionLines(formatFuelFn(dieselResult.value), 4);
    if (md) fuelParts.push(md);
  }
  if (petrolResult.status === 'fulfilled' && petrolResult.value) {
    const md = compactSectionLines(formatFuelFn(petrolResult.value), 4);
    if (md) fuelParts.push(md);
  }
  if (fuelParts.length > 0) {
    sections.push(`⛽ *COMBUSTÍVEIS AMARANTE / LIXA (DGEG)*\n${fuelParts.join('\n\n')}`);
  }

  try {
    const emailCfg = getEmailStatusFn();
    if (emailCfg?.configured) {
      const emailBriefing = await getEmailBriefingFn();
      if (emailBriefing) {
        sections.push(String(emailBriefing).trim());
      }
    }
  } catch (err) {
    log.warn('Falha ao incluir emails no briefing matinal:', err.message);
  }

  try {
    const tasks = getTasksFn() || [];
    const pending = tasks.filter((t) => !t.completed);
    if (pending.length > 0) {
      const lines = pending
        .slice(0, 5)
        .map((t, idx) => `${idx + 1}. ${t.title}${t.assigned_to ? ` _(${t.assigned_to})_` : ''}`);
      sections.push(`📋 *TAREFAS PENDENTES (${pending.length})*\n${lines.join('\n')}`);
    }
  } catch (err) {
    log.warn('Falha ao ler tarefas no briefing matinal:', err.message);
  }

  return sections.join('\n\n━━━━━━━━━━━━━━━━━━\n');
}

/**
 * Avaliação Proativa de Nutrição (13:00 e 20:00 Europe/Lisbon — meta EFSA/ISSN 160g proteína, 2500ml água, 5g creatina).
 * Às 20h00, se proteína < 70% da meta (< 112g), sugere receita rápida MCC/Airfryer com ervas aromáticas diretas (zero refogado).
 */
export async function evaluateNutritionProactiveCheck({
  nutritionData = null,
  hour = getLisbonClock().hour,
  generateRecipeFn = null
} = {}) {
  const data = nutritionData || sqliteMasterDb.getTodayNutrition();
  const proteinTarget = Number(data?.proteinTarget || 160);
  const waterTarget = Number(data?.waterTarget || 2500);
  const totalProtein = Number(data?.totalProtein || 0);
  const totalWater = Number(data?.totalWater || 0);
  const tookCreatina = Boolean(data?.tookCreatina);

  const proteinRatio = proteinTarget > 0 ? totalProtein / proteinTarget : 1;
  const remainingProtein = Math.max(0, Math.round(proteinTarget - totalProtein));
  const remainingWater = Math.max(0, Math.round(waterTarget - totalWater));

  if (hour >= 20) {
    if (proteinRatio < 0.7) {
      let recipeText = '';
      if (typeof generateRecipeFn === 'function') {
        try {
          recipeText = await generateRecipeFn({ remainingProtein, totalProtein, proteinTarget });
        } catch (err) {
          log.warn('Erro ao gerar receita proativa:', err.message);
        }
      } else {
        try {
          recipeText = await handleNutricao(
            '/receita_mcc pescada e peito de frango a vapor com limão e ervas aromáticas sem refogado',
            { from: { id: getDefaultAdminChatId(), first_name: 'André' } }
          );
        } catch (err) {
          log.warn('Fallback determinístico na receita noturna:', err.message);
        }
      }

      if (!recipeText) {
        recipeText =
          `👨‍🍳 *Sugestão Rápida MCC / Airfryer (Zero Refogado):*\n` +
          `• 220g peito de frango ou filetes de pescada diretamente na Airfryer (180°C, 12 min) ou no cesto a vapor do MCC.\n` +
          `• Temperar apenas com sumo de limão, alecrim, tomilho e cebolinho frescos; juntar 1 fio de azeite virgem extra no prato após cozinhar (~48g proteína).`;
      }

      return (
        `🥩 *ALERTA PROATIVO DE NUTRIÇÃO (20h00 — EFSA/ISSN)*\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `⚠️ Estás nos *${totalProtein}g / ${proteinTarget}g* de proteína (${Math.round(proteinRatio * 100)}%, abaixo dos 70% mínimos).\n` +
        `💧 Água: *${totalWater}ml / ${waterTarget}ml*${!tookCreatina ? ' | ⚡ *Creatina 5g pendente*' : ' | ⚡ Creatina: ✅'}\n` +
        `🎯 Falta atingir cerca de *+${remainingProtein}g de proteína* antes de deitar.\n\n` +
        `${recipeText}`
      );
    }

    if (totalWater < 0.7 * waterTarget || !tookCreatina) {
      return (
        `💧 *CHECK-IN NOTURNO DE HIDRATAÇÃO (20h00)*\n` +
        `• Proteína: *${totalProtein}g / ${proteinTarget}g* ✅\n` +
        `• Água: *${totalWater}ml / ${waterTarget}ml* (faltam *${remainingWater}ml*)\n` +
        `• Creatina 5g: ${tookCreatina ? '✅ Registada' : '⚡ Pendente'}`
      );
    }

    return null;
  }

  if (hour === 13) {
    const lowMorningProtein = proteinRatio < 0.35;
    const lowMorningWater = totalWater < 0.4 * waterTarget;
    if (!lowMorningProtein && !lowMorningWater && tookCreatina) {
      return null;
    }
    return (
      `🍽️ *CHECK-IN PROATIVO DE ALMOÇO (13h00 — Meta EFSA/ISSN)*\n` +
      `• Proteína atual: *${totalProtein}g / ${proteinTarget}g* (faltam *${remainingProtein}g*)\n` +
      `• Água atual: *${totalWater}ml / ${waterTarget}ml* (faltam *${remainingWater}ml*)\n` +
      `• Creatina diária (5g): ${tookCreatina ? '✅ OK' : '⚡ Ainda por tomar'}`
    );
  }

  return null;
}

/**
 * Despacha lembretes vencidos (ignora propositadamente janela de silêncio noturno por serem alertas críticos agendados).
 */
export async function dispatchDueReminders(
  botInstance,
  defaultChatId = getDefaultAdminChatId(),
  { db = sqliteMasterDb } = {}
) {
  if (!botInstance?.telegram) return 0;
  let dispatched = 0;

  try {
    const due = db.getPendingDueReminders() || [];
    for (const rem of due) {
      const target = rem.chat_id || defaultChatId;
      const hora = new Date(rem.trigger_at).toLocaleTimeString('pt-PT', {
        timeZone: 'Europe/Lisbon',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
      const alerta =
        `🔔 *ALERTA DE LEMBRETE!*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `⏰ *Assunto:* *${rem.text}*\n` +
        `⏱️ *Agendado:* ${hora} (${rem.created_by_name || 'André'})`;

      await sendProactiveMessage(botInstance, target, alerta);
      db.markReminderSent(rem.id);
      dispatched += 1;
    }
  } catch (err) {
    log.warn('Erro ao despachar lembretes devidos:', err.message);
  }

  return dispatched;
}

/**
 * Para todos os cron jobs e intervalos ativos do Motor Proativo (limpeza de shutdown / testes).
 */
export function stopProactiveEngine() {
  for (const task of activeCronTasks) {
    try {
      task.stop();
      if (typeof task.destroy === 'function') task.destroy();
    } catch {}
  }
  activeCronTasks = [];

  for (const timer of activeIntervals) {
    try {
      clearInterval(timer);
    } catch {}
  }
  activeIntervals = [];
  isEngineRunning = false;
}

/**
 * Arranca todos os agendadores Cloud-Native Europe/Lisbon via node-cron + ticker de lembretes (15s).
 */
export function startProactiveEngine(
  botInstance,
  {
    db = sqliteMasterDb,
    checkRamThresholdMb = 450,
    keepAliveUrl = process.env.RENDER_EXTERNAL_URL || 'https://telegram-master-bot-0h2h.onrender.com'
  } = {}
) {
  if (!botInstance) return null;
  if (isEngineRunning) {
    stopProactiveEngine();
  }

  const adminChatId = getDefaultAdminChatId();
  const cronOpts = { timezone: 'Europe/Lisbon' };

  // 1. 08:00 Europe/Lisbon — Briefing Executivo Matinal
  const morningBriefingTask = cron.schedule(
    '0 8 * * *',
    async () => {
      if (isQuietHours()) return;
      try {
        const briefing = await buildMorningExecutiveBriefing({ getTasksFn: () => db.getTasks() });
        await sendProactiveMessage(botInstance, adminChatId, briefing);
      } catch (err) {
        log.error('Erro no briefing matinal 08:00:', err.message);
      }
    },
    cronOpts
  );

  // 2. 08:30 Europe/Lisbon — Relatório Diário Consolidado 5 Frentes
  const radarMorningReportTask = cron.schedule(
    '30 8 * * *',
    async () => {
      if (isQuietHours()) return;
      try {
        const relatorio = gerarRelatorioMultiFrenteMarkdown();
        await sendRadarTelegramAlert(botInstance, relatorio, {
          inline_keyboard: [
            [{ text: '🏠 Abrir ImmoEval Vercel', web_app: { url: VERCEL_IMMO_APP.url } }],
            [{ text: '📡 Varrer 5 Frentes Agora', callback_data: 'immo_radar_scan' }]
          ]
        });
      } catch (err) {
        log.error('Erro no relatório radar 08:30:', err.message);
      }
    },
    cronOpts
  );

  // 3. 08:05, 12:05, 16:05, 20:05 Europe/Lisbon — Varredura Silenciosa 5 Frentes (só notifica novidades/baixas)
  const radarScanTask = cron.schedule(
    '5 8,12,16,20 * * *',
    async () => {
      if (isQuietHours()) return;
      try {
        await dispararCicloRadarComAlertas(botInstance);
      } catch (err) {
        log.error('Erro na varredura 4h/4h:', err.message);
      }
    },
    cronOpts
  );

  // 4. 13:00 e 20:00 Europe/Lisbon — Check-in Proativo Nutrição & Receita Rápida (<70% às 20h)
  const nutritionCheckTask = cron.schedule(
    '0 13,20 * * *',
    async () => {
      if (isQuietHours()) return;
      try {
        const { hour } = getLisbonClock();
        const msg = await evaluateNutritionProactiveCheck({
          nutritionData: db.getTodayNutrition(),
          hour
        });
        if (msg) {
          await sendProactiveMessage(botInstance, adminChatId, msg);
        }
      } catch (err) {
        log.error('Erro no check-in proativo de nutrição:', err.message);
      }
    },
    cronOpts
  );

  // 5. */10 * * * * — Keep-Alive Render + Monitorização de RAM
  const keepAliveTask = cron.schedule(
    '*/10 * * * *',
    async () => {
      const rssMb = Math.round(process.memoryUsage().rss / (1024 * 1024));
      if (rssMb > checkRamThresholdMb) {
        log.warn(`⚠️ Consumo de RAM elevado: ${rssMb}MB RSS (limite alerta ${checkRamThresholdMb}MB)`);
      }
      if (process.env.RENDER || process.env.NODE_ENV === 'production' || process.env.RENDER_EXTERNAL_URL) {
        const targets = [
          `${String(keepAliveUrl).replace(/\/$/, '')}/health`,
          'https://zeropaper-frota-bot.onrender.com/health',
          'https://zeropaper-frota-bot-0h2h.onrender.com/health'
        ];
        for (const healthUrl of [...new Set(targets)]) {
          fetch(healthUrl, { signal: AbortSignal.timeout(4000) }).catch(() => {});
        }
      }
    },
    cronOpts
  );

  // 6. Ticker 15s — Lembretes Familiares Críticos (contorna silêncio noturno)
  const reminderInterval = setInterval(() => {
    dispatchDueReminders(botInstance, adminChatId, { db }).catch(() => {});
  }, 15000);
  if (typeof reminderInterval.unref === 'function') {
    reminderInterval.unref();
  }

  activeCronTasks = [
    morningBriefingTask,
    radarMorningReportTask,
    radarScanTask,
    nutritionCheckTask,
    keepAliveTask
  ];
  activeIntervals = [reminderInterval];
  isEngineRunning = true;

  log.info(
    '⏰ Motor Proativo Europe/Lisbon ativado (node-cron 08:00/08:30/4h/13:00/20:00/10m + lembretes 15s + silêncio 22:30-07:30).'
  );

  return {
    cronCount: activeCronTasks.length,
    stop: stopProactiveEngine
  };
}

export default {
  getLisbonClock,
  isQuietHours,
  buildMorningExecutiveBriefing,
  evaluateNutritionProactiveCheck,
  dispatchDueReminders,
  startProactiveEngine,
  stopProactiveEngine
};
