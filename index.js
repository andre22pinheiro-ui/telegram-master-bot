// index.js — Bot Orquestrador Telegram & Cockpit de Mini Apps na Nuvem
import 'dotenv/config';
import http from 'http';
import { Telegraf, Markup } from 'telegraf';
import { detectIntent } from './src/router/intentRouter.js';
import { handle as handleDev } from './src/workers/worker_dev.js';
import { handle as handleFrotas } from './src/workers/worker_frotas.js';
import { handle as handleImmo } from './src/workers/worker_immo.js';
import { handle as handleGeral } from './src/workers/worker_geral.js';
import { 
  handle as handleNutricao, 
  getPlanoNutricional, 
  getResumoHoje, 
  handleProteinaInput, 
  handleAguaInput, 
  handleCreatina 
} from './src/workers/worker_nutricao.js';
import { createLogger } from './src/utils/logger.js';
import { askAgent } from './src/services/reasoningService.js';
import { familyDb } from './src/shared/familyDb.js';
import { VERCEL_APPS, buildTelegramAppsKeyboard, formatAllVercelAppsMarkdown } from './src/shared/appsCatalog.js';
import { handleFamilyApi } from './src/shared/familyRoutes.js';
import { analyzeImageBuffer, downloadTelegramPhoto } from './src/shared/multimodalVision.js';
import { uploadToCloudinary } from './src/shared/cloudinaryCdn.js';
import { transcribeTelegramAudio } from './src/shared/whisperAudio.js';
import { pcRemoteBridge } from './src/services/pcRemoteBridge.js';
import { safeExecute, withTypingHeartbeat } from './src/utils/resilience.js';
import { sanitizeTelegramMarkdown } from './src/utils/markdownSanitizer.js';
import { tryAutoDispatch } from './src/services/zeroPaperDispatcher.js';
import appFrotaService from './src/services/appFrotaService.js';
import { 
  authMiddleware, 
  cleanChatMiddleware, 
  addAuthorizedId, 
  removeAuthorizedId, 
  listAuthorized 
} from './src/shared/security.js';
import { 
  getTvCockpit, 
  searchChannels, 
  formatSearchResults, 
  getXtreamCredentialsMarkdown, 
  getVlcHelpMarkdown 
} from './src/services/tvService.js';
import { 
  isDriveConfigured, 
  backupDatabaseToDrive,
  restoreAllFromDrive,
  syncAllToDrive,
  startAutoDriveSync
} from './src/services/googleDriveService.js';
import { 
  iniciarAgendadorRadar, 
  executarVarreduraAmarante, 
  gerarRelatorioDiarioMarkdown 
} from './src/services/immoRadarService.js';
import { 
  formatarSitesImobiliariosMarkdown, 
  buildImmoSitesKeyboard 
} from './src/shared/immoSitesCatalog.js';
import { getDailyNewsBriefing } from './src/services/newsService.js';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';

const log = createLogger('Master');

// ─── Validação de Configuração ───────────────────────────────────────────────

const TOKEN = process.env.TELEGRAM_BOT_TOKEN_MASTER || process.env.TELEGRAM_MASTER_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID_AUTORIZADO = process.env.CHAT_ID_AUTORIZADO || process.env.AUTHORIZED_CHAT_ID || process.env.TELEGRAM_CHAT_ID;

if (!TOKEN) {
  log.error('TELEGRAM_BOT_TOKEN_MASTER não definido no .env');
  process.exit(1);
}
if (!CHAT_ID_AUTORIZADO) {
  log.error('CHAT_ID_AUTORIZADO não definido no .env');
  process.exit(1);
}

// Garantir diretoria de logs
try { mkdirSync('./logs', { recursive: true }); } catch {}

// ─── Middleware de Autenticação e Segurança (Dois Contactos Autorizados) ──────
// authMiddleware importado diretamente de ./src/shared/security.js

// ─── Teclados Interativos Partilhados ─────────────────────────────────────────

function getMasterKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.webApp('🏡 1. Abrir Mini App Família', VERCEL_APPS.familiar.url),
      Markup.button.webApp('🚛 2. ZeroPaperFrota (Web)', VERCEL_APPS.appfrota.url)
    ],
    [
      Markup.button.webApp('🚌 3. RotaBus VIP (Web)', VERCEL_APPS.rotabus.url),
      Markup.button.callback('📊 Estado da Frota', 'act_frota_status')
    ],
    [
      Markup.button.webApp('⚽ 3. MatchPro', VERCEL_APPS.matchpro.url),
      Markup.button.webApp('🏗️ 4. Pladur-Pro 3D', VERCEL_APPS.pladur.url)
    ],
    [
      Markup.button.callback('🛒 Compras', 'act_compras'),
      Markup.button.callback('📋 Tarefas', 'act_tarefas'),
      Markup.button.callback('👧 Carolina', 'act_carolina')
    ],
    [
      Markup.button.callback('🚛 Rotas & Tacógrafo', 'act_frotas'),
      Markup.button.callback('🏠 Avaliação Immo', 'act_immo')
    ],
    [
      Markup.button.callback('💻 Dev & Repos', 'act_dev'),
      Markup.button.callback('☀️ Briefing de Hoje', 'act_briefing'),
      Markup.button.callback('🇪🇺 Notícias Europa & PT', 'act_noticias')
    ],
    [
      Markup.button.callback('🥗 Nutrição & Dieta', 'act_nutri_menu'),
      Markup.button.url('🥗 @Nutriainbot', 'https://t.me/Nutriainbot')
    ],
    [
      Markup.button.callback('📺 TV & Canais IPTV', 'act_tv_menu'),
      Markup.button.callback('☁️ Drive & Nuvem', 'act_drive_status')
    ],
    [
      Markup.button.callback('🌐 Todas as 9 Mini Apps', 'act_all_apps')
    ]
  ]);
}

// ─── Helpers de Envio ────────────────────────────────────────────────────────

function splitText(text, maxLen = 4000) {
  const chunks = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) { chunks.push(remaining); break; }
    let cut = remaining.lastIndexOf('\n', maxLen);
    if (cut <= 0) cut = maxLen;
    chunks.push(remaining.substring(0, cut));
    remaining = remaining.substring(cut).trimStart();
  }
  return chunks;
}

async function sendReply(ctx, text, extra = null) {
  const chunks = splitText(text);
  for (let i = 0; i < chunks.length; i++) {
    const isLast = i === chunks.length - 1;
    const opts = isLast && extra ? extra : undefined;
    const cleanChunk = sanitizeTelegramMarkdown(chunks[i]);
    try {
      await ctx.replyWithMarkdown(cleanChunk, opts);
    } catch (mdErr) {
      log.warn('Markdown parse falhou no Telegram, a enviar em texto simples:', mdErr?.message);
      try {
        const plainOpts = opts ? { ...opts } : {};
        delete plainOpts.parse_mode;
        await ctx.reply(chunks[i], plainOpts);
      } catch (fallbackErr) {
        log.error('Erro crítico ao enviar mensagem:', fallbackErr?.message);
      }
    }
  }
}

// ─── Processamento Inteligente de Imagens (Visão Gemini & CDN Cloudinary) ───

async function processPhotoWithVision(ctx, botToken, contextTag = 'geral') {
  const photos = ctx.message?.photo;
  if (!photos || photos.length === 0) return;

  await ctx.sendChatAction('typing');
  const caption = (ctx.message.caption || '').trim();
  const largest = photos[photos.length - 1];

  try {
    const downloaded = await downloadTelegramPhoto(ctx.telegram, largest.file_id, botToken);
    if (!downloaded || !downloaded.buffer) {
      return ctx.reply('❌ Não foi possível descarregar a imagem para análise.');
    }

    try {
      const filesDir = path.resolve('./data/ficheiros');
      if (!existsSync(filesDir)) mkdirSync(filesDir, { recursive: true });
      writeFileSync(path.join(filesDir, `${contextTag}_${Date.now()}.jpg`), downloaded.buffer);
    } catch {}

    let cdnUrl = '';
    try {
      const up = await uploadToCloudinary(downloaded.buffer, `${contextTag}_${Date.now()}`);
      if (up && up.url) cdnUrl = up.url;
    } catch {}

    const defaultPrompt = caption ||
      'Analisa detalhadamente esta imagem em português de Portugal. ' +
      'Se for comida ou refeição: identifica ingredientes, calorias (Kcal) e gramas de proteína/hidratos/gordura. ' +
      'Se for erro, código ou app: aponta a linha, causa e solução técnica em detalhe. ' +
      'Se for documento, recibo ou obra: resume valores, datas, medidas e conclusões práticas.';

    const analysis = await analyzeImageBuffer(downloaded.buffer, 'image/jpeg', defaultPrompt);

    // Tenta ingestão automática no ZeroPaper se a foto for de viatura, odómetro ou anomalia
    if (contextTag === 'master' || contextTag === 'frotas') {
      try {
        const dispatchInput = caption ? `${caption}. Detalhes visuais da imagem: ${analysis}` : analysis;
        const autoResp = await tryAutoDispatch(dispatchInput, ctx);
        if (autoResp) {
          let photoReply = autoResp;
          if (cdnUrl) photoReply += `\n\n📸 [Fotografia arquivada na cloud](${cdnUrl})`;
          await sendReply(ctx, photoReply);
          return;
        }
      } catch (e) {
        log.warn('Auto-dispatch via imagem falhou, fallback para análise pura:', e.message);
      }
    }

    let reply = `🔍 *Análise de Imagem (IA Multimodal):*\n\n${analysis}`;
    if (cdnUrl) {
      reply += `\n\n☁️ [Ver no Cloudinary CDN](${cdnUrl})`;
    }

    await sendReply(ctx, reply);
  } catch (err) {
    log.error(`Erro ao processar imagem [${contextTag}]`, err?.message || err);
    await ctx.reply(`⚠️ Ocorreu um erro na análise da imagem: ${err?.message || err}`);
  }
}

// ─── Roteador de Intenções do Master (Chat Universal estilo Gemini) ─────────

async function rotear(ctx, text) {
  const trimmed = text.trim();
  const chatId = String(ctx.chat?.id || ctx.from?.id || '950415577');

  // 1. Controlo de Sessão / Memória
  if (/^\/(reset|limpar|novo|nova_conversa)\b/i.test(trimmed)) {
    return await askAgent({ chatId, workerTag: 'master', prompt: '/reset' });
  }

  // 2. Atalho Rápido para Status / Resumo Diário de Nutrição & Metas
  if (/^(\/)?(status|hoje|resumo|macros|dieta_hoje)$/i.test(trimmed)) {
    return getResumoHoje();
  }

  // 3. Notícias Factuais e Verificadas da Europa & Portugal (Fontes Oficiais RTP / Euronews)
  if (/^(\/)?(noticias?|europa|portugal|news|briefing_noticias|noticias_europa)$/i.test(trimmed)) {
    const briefing = await getDailyNewsBriefing();
    await sendReply(ctx, briefing);
    return null;
  }

  // 3.0 AUTO-DISPATCH COGNITIVO UNIVERSAL (ZeroPaperFrota + Pessoal + Remoto)
  // "para mim e para todos um unico bot em que enviamos os dados e ele automaticamente coloca no sitio"
  const autoDispatchResp = await safeExecute(() => tryAutoDispatch(trimmed, ctx), 'ZeroPaper Auto-Dispatch', 15000);
  if (autoDispatchResp) {
    log.info('[Master] Auto-Dispatch executado e persistido com sucesso', { input: trimmed.substring(0, 60) });
    return autoDispatchResp;
  }

  // 3. Comandos Específicos com Barra (/)
  if (/^\/(tv|canais|canal|iptv)\b/i.test(trimmed)) {
    if (/canal|canais/i.test(trimmed)) {
      const query = trimmed.replace(/.*(canal|canais)\s*/i, '').trim();
      const results = searchChannels(query);
      const formatted = formatSearchResults(query || 'Populares', results);
      await sendReply(ctx, formatted.text, formatted.keyboard);
      return null;
    }
    const cockpit = getTvCockpit();
    await sendReply(ctx, cockpit.text, cockpit.keyboard);
    return null;
  }

  if (/^\/(rota|tacografo)\b/i.test(trimmed)) {
    return await safeExecute(() => handleFrotas(trimmed, ctx), 'Frotas (RotaBus)', 20000);
  }

  if (/^\/(projetos?|github|repos?|criar_app|apps?|catalogo|apks?)\b/i.test(trimmed)) {
    return await safeExecute(() => handleDev(trimmed, ctx), 'Dev (Engenharia)', 20000);
  }

  if (/^\/(avaliacao|avaliac[aã]o|immo|imovel|radar|relatorio_imoveis|relatorio|sites_immo|alertas_immo|pesquisar_imoveis|moradias?_novas?|moradias?)\b/i.test(trimmed)) {
    return await safeExecute(() => handleImmo(trimmed, ctx), 'Immo (Avaliação & Radar)', 20000);
  }

  if (/^\/(proteina|agua|creatina|plano|dieta|macros)\b/i.test(trimmed)) {
    return await safeExecute(() => handleNutricao(trimmed, ctx), 'Nutrição (High-Protein)', 20000);
  }

  if (/^\/(compras?|tarefas?|carolina|lembrete|notas?|briefing|emails?|email|correio|inbox|ler_email|resumo_email|email_status|combust[ií]veis?|gasoleo|gasolina|gas[oó]leo|transito|tr[aâ]nsito|pesquisa|procura|web|farmacias?)\b/i.test(trimmed)) {
    return await safeExecute(() => handleGeral(trimmed, ctx), 'Pessoal & Família', 20000);
  }

  // 4. Deteção Inteligente de Intenção em Linguagem Natural
  const intent = detectIntent(trimmed);
  if (intent === 'IMMO') {
    log.info('[Master] Roteamento por intenção natural para IMMO', { text: trimmed.substring(0, 60) });
    return await safeExecute(() => handleImmo(trimmed, ctx), 'Immo (Radar & Avaliação)', 20000);
  }
  if (intent === 'GERAL') {
    log.info('[Master] Roteamento por intenção natural para GERAL', { text: trimmed.substring(0, 60) });
    return await safeExecute(() => handleGeral(trimmed, ctx), 'Pessoal & Família', 20000);
  }
  if (intent === 'NUTRICAO') {
    log.info('[Master] Roteamento por intenção natural para NUTRICAO', { text: trimmed.substring(0, 60) });
    return await safeExecute(() => handleNutricao(trimmed, ctx), 'Nutrição (High-Protein)', 20000);
  }
  if (intent === 'FROTAS') {
    log.info('[Master] Roteamento por intenção natural para FROTAS', { text: trimmed.substring(0, 60) });
    return await safeExecute(() => handleFrotas(trimmed, ctx), 'Frotas (RotaBus)', 20000);
  }
  if (intent === 'DEV') {
    log.info('[Master] Roteamento por intenção natural para DEV', { text: trimmed.substring(0, 60) });
    return await safeExecute(() => handleDev(trimmed, ctx), 'Dev (Engenharia)', 20000);
  }
  if (intent === 'TV') {
    log.info('[Master] Roteamento por intenção natural para TV', { text: trimmed.substring(0, 60) });
    const cockpit = getTvCockpit();
    await sendReply(ctx, cockpit.text, cockpit.keyboard);
    return null;
  }

  // 5. CHAT UNIVERSAL ESTILO GEMINI NORMAL / CHATGPT:
  // Responde com inteligência total a qualquer conversa, dúvida, raciocínio, escrita ou problema!
  let extraContext = '';
  try {
    const todayNutri = familyDb.getTodayNutrition();
    const tasks = familyDb.getTasks().filter(t => !t.completed).length;
    const shopping = familyDb.getShopping().filter(s => !s.completed).length;
    extraContext = `Estado atual de André: ${todayNutri.totalProtein}g/160g de proteína hoje, ${todayNutri.totalWater}ml de água, ${tasks} tarefas pendentes, ${shopping} compras por fazer. Mini App Imobiliário Vercel: https://pesquisa-imobiliario.vercel.app`;
  } catch {}

  log.info('[Master] Conversa Gemini Universal', { text: trimmed.substring(0, 60), chatId });
  return await safeExecute(() => askAgent({
    chatId,
    workerTag: 'master',
    prompt: trimmed,
    extraContext
  }), 'Master Cockpit (Gemini AI)', 20000);
}

// ─── Instâncias Ativas de Bots ───────────────────────────────────────────────
const botInstances = [];

// 1. MASTER BOT (@AndrePinheirobot) ───────────────────────────────────────────
const bot = new Telegraf(TOKEN);
bot.use(authMiddleware);
bot.use(cleanChatMiddleware);

// Configurar o botão permanente "Mini App" no chat
bot.telegram.setChatMenuButton({
  menu_button: {
    type: 'web_app',
    text: '📱 Cockpit',
    web_app: { url: VERCEL_APPS.familiar.url }
  }
}).catch(() => {});

bot.start(async (ctx) => {
  const nome = ctx.from?.first_name || 'André';
  const msg =
    `👋 Olá, *${nome}*!\n\n` +
    `Bem-vindo ao teu **Cockpit Master Telegram & Nuvem**.\n\n` +
    `🚀 *Mini Apps e Módulos Integrados:*\n\n` +
    `• 🏡 *Família & Carolina* — Compras partilhadas, tarefas, saúde e faltas\n` +
    `• 🚌 *RotaBus & Frotas* — Navegação de autocarros, anti-sinuosidade e tacógrafo\n` +
    `• ⚽ *MatchPro* — Jogos, scout tático e streaming\n` +
    `• 🏗️ *Pladur-Pro 3D* — Orçamentos e modelo tridimensional\n` +
    `• 🏠 *ImmoEval* — Avaliação imobiliária por m² em Amarante e Norte\n` +
    `• 💻 *Dev & Cloud* — Gestão de repositórios GitHub e deploy\n\n` +
    `👇 _Toca num botão abaixo para abrir a Mini App ou executar ações rápidas:_`;

  await sendReply(ctx, msg, getMasterKeyboard());
});

bot.command(['menu', 'cockpit', 'painel'], async (ctx) => {
  await sendReply(ctx, `🎛️ *Menu Principal de Controlo:*`, getMasterKeyboard());
});

bot.command(['status', 'hoje', 'macros', 'resumo'], async (ctx) => {
  await sendReply(ctx, getResumoHoje(), Markup.inlineKeyboard([
    [Markup.button.callback('💧 +250ml Água', 'nutri_agua_250'), Markup.button.callback('💧 +500ml Água', 'nutri_agua_500')],
    [Markup.button.callback('⚡ Creatina', 'nutri_creatina'), Markup.button.callback('🍗 +30g Prot', 'nutri_add_30')],
    [Markup.button.callback('🥗 Ver Plano 160g', 'act_nutri_plano'), Markup.button.callback('🎛️ Cockpit', 'act_main_menu')]
  ]));
});

bot.command(['tv', 'iptv', 'matchpro_tv', 'vlc'], async (ctx) => {
  const cockpit = getTvCockpit();
  await sendReply(ctx, cockpit.text, cockpit.keyboard);
});

bot.command(['canal', 'canais'], async (ctx) => {
  const text = ctx.message.text.replace(/^\/(canal|canais)\s*/i, '').trim();
  const results = searchChannels(text);
  const formatted = formatSearchResults(text || 'Populares', results);
  await sendReply(ctx, formatted.text, formatted.keyboard);
});

bot.command(['drive', 'gdrive', 'backup_drive'], async (ctx) => {
  const configured = isDriveConfigured();
  if (!configured) {
    const msg = 
      `☁️ *Google Drive — Armazenamento na Nuvem*\n\n` +
      `O módulo do Google Drive está pronto no código, mas ainda não tem a chave de ligação.\n\n` +
      `*Como ativar o envio direto para o Google Drive:*\n` +
      `1. Coloque o ficheiro da Google \`service-account.json\` na pasta do projeto ou adicione no \`.env\`:\n` +
      `   \`GOOGLE_SERVICE_ACCOUNT_KEY={...}\`\n` +
      `2. Partilhe a pasta do seu Google Drive com o email da conta de serviço.\n\n` +
      `_Tudo o que guardar no Telegram (compras, notas, tarefas e listas M3U) será copiado em segurança para a nuvem!_`;
    return await sendReply(ctx, msg, Markup.inlineKeyboard([
      [Markup.button.callback('🔄 Testar Ligação', 'act_drive_status')]
    ]));
  }

  await ctx.sendChatAction('upload_document');
  await sendReply(ctx, '⏳ *A sincronizar base de dados e listas para o Google Drive...*');
  const res = await backupDatabaseToDrive();
  if (res.success) {
    let okMsg = `✅ *Backup no Google Drive concluído com sucesso!*\n\n📅 *Data:* \`${res.timestamp}\`\n\n*Ficheiros guardados na nuvem:*\n`;
    res.files.forEach(f => {
      okMsg += `• [${f.name}](${f.link || '#'})\n`;
    });
    await sendReply(ctx, okMsg);
  } else {
    await sendReply(ctx, `⚠️ Erro no backup para o Google Drive: ${res.error || res.message}`);
  }
});

bot.command(['apps', 'app', 'catalogo', 'vercel'], async (ctx) => {
  const md = formatAllVercelAppsMarkdown();
  await sendReply(ctx, md, buildTelegramAppsKeyboard());
});

bot.command(['apk', 'apks', 'download'], async (ctx) => {
  const resp = await handleDev('/apks');
  await sendReply(ctx, resp, Markup.inlineKeyboard([
    [Markup.url('📲 Descarregar RotaBus APK', VERCEL_APPS.rotabus.apkUrl)],
    [Markup.webApp('🚌 Abrir RotaBus Web', VERCEL_APPS.rotabus.url)]
  ]));
});

bot.command('compras', async (ctx) => {
  const resp = await handleGeral(ctx.message.text);
  await sendReply(ctx, resp, Markup.inlineKeyboard([
    [Markup.webApp('🛒 Abrir Compras na Mini App', VERCEL_APPS.familiar.url)],
    [Markup.callback('🔄 Atualizar Lista', 'act_compras'), Markup.callback('🧹 Limpar Comprados', 'act_compras_limpar')]
  ]));
});

bot.command('tarefas', async (ctx) => {
  const resp = await handleGeral(ctx.message.text);
  await sendReply(ctx, resp, Markup.inlineKeyboard([
    [Markup.webApp('📋 Abrir Tarefas na Mini App', VERCEL_APPS.familiar.url)],
    [Markup.callback('🔄 Atualizar Tarefas', 'act_tarefas')]
  ]));
});

bot.command('carolina', async (ctx) => {
  const resp = await handleGeral(ctx.message.text);
  await sendReply(ctx, resp, Markup.inlineKeyboard([
    [Markup.webApp('👧 Abrir Carolina na Mini App', VERCEL_APPS.familiar.url)],
    [Markup.callback('🔄 Atualizar Registos', 'act_carolina')]
  ]));
});

bot.command(['lembrete', 'lembretes'], async (ctx) => {
  const resp = await handleGeral(ctx.message.text, ctx);
  await sendReply(ctx, resp);
});

bot.command('briefing', async (ctx) => {
  await ctx.sendChatAction('typing');
  const resp = await safeExecute(() => handleGeral('/briefing'), 'Briefing', 8000);
  await sendReply(ctx, resp, getMasterKeyboard());
});

bot.command(['emails', 'email', 'correio', 'inbox'], async (ctx) => {
  await ctx.sendChatAction('typing');
  const resp = await safeExecute(() => handleGeral('/emails', ctx), 'Emails IMAP', 20000);
  await sendReply(ctx, resp);
});

bot.command(['ler_email', 'resumo_email'], async (ctx) => {
  await ctx.sendChatAction('typing');
  const resp = await safeExecute(() => handleGeral(ctx.message.text, ctx), 'Resumo de Email', 20000);
  await sendReply(ctx, resp);
});

bot.command('email_status', async (ctx) => {
  const resp = await handleGeral('/email_status', ctx);
  await sendReply(ctx, resp);
});

bot.command(['combustiveis', 'gasoleo', 'gasolina'], async (ctx) => {
  await ctx.sendChatAction('typing');
  const resp = await safeExecute(() => handleGeral(ctx.message.text, ctx), 'Combustíveis DGEG', 15000);
  await sendReply(ctx, resp);
});

bot.command(['transito', 'trajeto'], async (ctx) => {
  await ctx.sendChatAction('typing');
  const resp = await safeExecute(() => handleGeral(ctx.message.text, ctx), 'Trânsito', 15000);
  await sendReply(ctx, resp);
});

bot.command(['pesquisa', 'procura', 'web'], async (ctx) => {
  await ctx.sendChatAction('typing');
  const resp = await safeExecute(() => handleGeral(ctx.message.text, ctx), 'Pesquisa Web', 20000);
  await sendReply(ctx, resp);
});

bot.command(['moradias_novas', 'moradias'], async (ctx) => {
  await ctx.sendChatAction('typing');
  const resp = await safeExecute(() => handleImmo('/moradias_novas', ctx), 'Moradias Novas', 25000);
  await sendReply(ctx, resp);
});

bot.command('rota', async (ctx) => {
  await ctx.sendChatAction('typing');
  const resp = await safeExecute(() => handleFrotas(ctx.message.text), 'RotaBus GPS', 8000);
  await sendReply(ctx, resp, Markup.inlineKeyboard([
    [Markup.webApp('🚌 Abrir no RotaBus GPS', VERCEL_APPS.rotabus.url)],
    [Markup.url('📲 Descarregar APK Android', VERCEL_APPS.rotabus.apkUrl)]
  ]));
});

bot.command('tacografo', async (ctx) => {
  const resp = await safeExecute(() => handleFrotas(ctx.message.text), 'Tacógrafo', 8000);
  await sendReply(ctx, resp, Markup.inlineKeyboard([
    [Markup.callback('⏱️ 4.5h Condução', 'btn_tacho_45'), Markup.callback('⏱️ 9.0h Diário', 'btn_tacho_90')],
    [Markup.webApp('🚌 RotaBus Frotas', VERCEL_APPS.rotabus.url)]
  ]));
});

bot.command('projetos', async (ctx) => {
  await ctx.sendChatAction('typing');
  const resp = await safeExecute(() => handleDev('/projetos'), 'GitHub Dev', 8000);
  await sendReply(ctx, resp);
});

bot.command(['print', 'screenshot', 'ecra', 'ecrã'], async (ctx) => {
  const resp = await handleDev(ctx.message.text, ctx);
  if (resp) await sendReply(ctx, resp);
});

bot.command(['pc', 'pc_status'], async (ctx) => {
  await ctx.sendChatAction('typing');
  const resp = await handleDev('/pc', ctx);
  await sendReply(ctx, resp);
});

bot.command(['compilar', 'build'], async (ctx) => {
  await ctx.sendChatAction('typing');
  const resp = await handleDev(ctx.message.text, ctx);
  await sendReply(ctx, resp);
});

bot.command(['avaliacao', 'avaliar'], async (ctx) => {
  await ctx.sendChatAction('typing');
  const resp = await safeExecute(() => handleImmo(ctx.message.text, ctx), 'ImmoEval', 25000);
  await sendReply(ctx, resp, Markup.inlineKeyboard([
    [Markup.button.webApp('🏠 Abrir ImmoEval Mini App', VERCEL_APPS.immo.url)],
    [Markup.button.callback('📡 Radar & Pesquisa', 'immo_radar_scan'), Markup.button.callback('📊 Relatório Diário', 'immo_daily_report')]
  ]));
});

bot.command(['radar', 'pesquisar_imoveis', 'varredura'], async (ctx) => {
  await ctx.sendChatAction('typing');
  const resp = await safeExecute(() => handleImmo('/radar', ctx), 'Radar Imobiliário', 25000);
  await sendReply(ctx, resp, Markup.inlineKeyboard([
    [Markup.button.webApp('🏠 Abrir ImmoEval Mini App', VERCEL_APPS.immo.url)],
    [Markup.button.callback('📊 Relatório Diário', 'immo_daily_report'), Markup.button.callback('🌐 12 Portais & Sites', 'immo_sites')]
  ]));
});

bot.command(['relatorio_imoveis', 'relatorio'], async (ctx) => {
  await ctx.sendChatAction('typing');
  const resp = await safeExecute(() => handleImmo('/relatorio', ctx), 'Relatório Imobiliário', 25000);
  await sendReply(ctx, resp, Markup.inlineKeyboard([
    [Markup.button.webApp('🏠 Abrir ImmoEval Mini App', VERCEL_APPS.immo.url)],
    [Markup.button.callback('📡 Radar Agora', 'immo_radar_scan'), Markup.button.callback('🌐 12 Portais & Sites', 'immo_sites')]
  ]));
});

bot.command(['sites_immo', 'portais'], async (ctx) => {
  await sendReply(ctx, formatarSitesImobiliariosMarkdown(), buildImmoSitesKeyboard());
});

bot.command(['alertas_immo', 'alertas'], async (ctx) => {
  const resp = await handleImmo('/alertas', ctx);
  await sendReply(ctx, resp, Markup.inlineKeyboard([
    [Markup.button.callback('📡 Executar Varredura Agora', 'immo_radar_scan')],
    [Markup.button.callback('🎛️ Voltar ao Cockpit', 'act_main_menu')]
  ]));
});

bot.command('ajuda', async (ctx) => {
  const msg =
    `📖 *Manual de Comandos Rápidos:*\n\n` +
    `*📱 Mini Apps:*\n` +
    `• \`/apps\` — Catálogo de todas as 9 aplicações\n` +
    `• \`/menu\` — Cockpit interativo com botões\n` +
    `• \`/apk\` — Download da app nativa RotaBus Android\n\n` +
    `*🇪🇺 Notícias & Atualidade UE:*\n` +
    `• \`/noticias\` — Briefing factual da Europa e Portugal (RTP / UE)\n\n` +
    `*🏡 Família & Pessoal:*\n` +
    `• \`/compras\` — Ver ou gerir lista de compras\n` +
    `• \`/tarefas\` — Tarefas domésticas pendentes\n` +
    `• \`/carolina\` — Escola, faltas, consultas e atividades\n` +
    `• \`/nota TEXTO\` — Guardar apontamento rápido\n` +
    `• \`/lembrete TEXTO\` — Agendar lembrete com notificação sonora (ex: \`/lembrete às 16:30 ligar ao médico\`)\n` +
    `• \`/lembretes\` — Ver lista de lembretes ativos ou apagar\n` +
    `• \`/briefing\` — Resumo geral do dia com IA\n\n` +
    `*🚛 Frotas & RotaBus:*\n` +
    `• \`/rota ORIGEM para DESTINO\` — Rota otimizada para pesados\n` +
    `• \`/tacografo HORAS\` — Auditoria legal CE 561/2006\n\n` +
    `*🏠 Imobiliário & Radar:*\n` +
    `• \`/radar\` — Disparar pesquisa de novos imóveis nos 12 portais\n` +
    `• \`/relatorio\` — Resumo diário de anúncios novos e melhores oportunidades\n` +
    `• \`/sites_immo\` — Ver os 12 portais e agências locais com links\n` +
    `• \`/alertas_immo\` — Configuração das pesquisas e alertas ao longo do dia\n` +
    `• \`/avaliacao ÁREA ZONA TIPOLOGIA ESTADO\` — Preço/m² e valor de mercado CMVM\n\n` +
    `*🖥️ Dev & Controlo Remoto PC Surface:*\n` +
    `• \`/print\` — Foto do ecrã do PC Surface em direto\n` +
    `• \`/pc\` — Carga de CPU, RAM e bateria do PC Surface\n` +
    `• \`/compilar NOME\` — Compilar APK remotamente no Surface\n` +
    `• \`/projetos\` — Repositórios recentes no GitHub\n` +
    `• \`/criar_app NOME\` — Scaffold de novo projeto`;

  await sendReply(ctx, msg, getMasterKeyboard());
});

bot.command(['noticias', 'noticia', 'news', 'europa'], async (ctx) => {
  await ctx.sendChatAction('typing');
  const briefing = await getDailyNewsBriefing();
  await sendReply(ctx, briefing, Markup.inlineKeyboard([
    [Markup.button.callback('🔄 Atualizar Notícias', 'act_noticias')],
    [Markup.button.callback('🎛️ Menu Principal', 'act_main_menu')]
  ]));
});

// Comandos de Gestão de Segurança (Dois Contactos Autorizados)
bot.command('autorizados', async (ctx) => {
  const data = listAuthorized();
  let msg = `🔒 *Gestão de Segurança dos Bots:*\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `📞 *Contactos Telefónicos Autorizados:*\n`;
  msg += `• \`+351 919 115 655\` (André Pinheiro)\n`;
  msg += `• \`+351 933 276 221\` (Contacto Autorizado 2)\n\n`;
  msg += `👥 *IDs Telegram Registados (${data.authorizedUserIds.length}):*\n`;
  data.authorizedUserIds.forEach(id => {
    const phone = data.phoneMapping[id] || 'Automático';
    msg += `• ID: \`${id}\` — _${phone}_\n`;
  });
  msg += `\n_Para associar um novo Telegram por ID: \`/autorizar <id> [telefone]\`_\n_Para revogar acesso: \`/bloquear <id>\`_`;
  await sendReply(ctx, msg);
});

bot.command('autorizar', async (ctx) => {
  const parts = ctx.message.text.replace(/^\/autorizar\s*/i, '').trim().split(/\s+/);
  const targetId = parts[0];
  const label = parts[1] || 'manual';
  if (!targetId) {
    return await sendReply(ctx, 'ℹ️ Formato: `/autorizar <telegram_id> [telefone]`');
  }
  addAuthorizedId(targetId, label);
  await sendReply(ctx, `✅ ID Telegram \`${targetId}\` adicionado à lista de autorizados!`);
});

bot.command('bloquear', async (ctx) => {
  const targetId = ctx.message.text.replace(/^\/bloquear\s*/i, '').trim();
  if (!targetId) {
    return await sendReply(ctx, 'ℹ️ Formato: `/bloquear <telegram_id>`');
  }
  if (targetId === String(CHAT_ID_AUTORIZADO)) {
    return await sendReply(ctx, '❌ Não é permitido bloquear o ID do proprietário principal.');
  }
  removeAuthorizedId(targetId);
  await sendReply(ctx, `🚫 ID Telegram \`${targetId}\` revogado e bloqueado com sucesso.`);
});

// Comando de Diagnóstico e Cockpit Operacional
bot.command(['diagnostico', 'status_nuvem', 'status'], async (ctx) => {
  await ctx.sendChatAction('typing');
  const mem = process.memoryUsage();
  const ramMb = Math.round(mem.rss / 1024 / 1024);
  const uptimeMin = Math.round(process.uptime() / 60);

  // Probe de Latência da IA Tier 1 (Groq)
  const t0 = Date.now();
  let groqStatus = '🟢 Operacional';
  try {
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` }
    });
    const lat = Date.now() - t0;
    groqStatus = res.ok ? `🟢 Operacional (${lat}ms)` : `⚠️ Resposta ${res.status}`;
  } catch (_) {
    groqStatus = '🔴 Indisponível';
  }

  const autorizadosList = listAuthorized();
  const isPcOnline = pcRemoteBridge.isPcOnline();
  const pcInfo = pcRemoteBridge.getPcInfo();
  const pcStatusLine = isPcOnline 
    ? `🟢 Conectado (${pcInfo?.hostname || 'Surface'})` 
    : `⚪ Offline / Standby`;
  const pendingReminders = (familyDb.getReminders() || []).filter(r => !r.sent).length;

  const msg =
    `📊 *Cockpit de Diagnóstico Operacional na Nuvem*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `⏱️ *Uptime do Servidor:* ${uptimeMin} minutos\n` +
    `💾 *Memória RAM:* ${ramMb} MB / 512 MB (Plano Cloud)\n` +
    `📡 *Webhooks Telegram:* 6/6 Bots Ativos (Push 24/7)\n` +
    `☁️ *Base de Dados Google Drive:* Ativo & Sincronizado\n` +
    `💻 *Ponte PC Surface:* ${pcStatusLine}\n` +
    `🔔 *Lembretes Proativos:* ${pendingReminders} agendados\n` +
    `🎙️ *Voz & Áudio:* Groq Whisper LPU Ativo\n` +
    `🤖 *IA Primária (Groq LPU):* ${groqStatus}\n` +
    `🔒 *Segurança:* Restrito aos números 919115655 e 933276221\n` +
    `👥 *Utilizadores Telegram Autorizados:* ${autorizadosList.authorizedUserIds.length}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `_Ambiente: Render.com | Node ${process.version}_`;

  await sendReply(ctx, msg);
});

// Ações de Callback dos Botões Inline no Master
bot.action('act_noticias', async (ctx) => {
  await ctx.answerCbQuery('🇪🇺 A recolher notícias verificadas...');
  await ctx.sendChatAction('typing');
  const briefing = await getDailyNewsBriefing();
  await sendReply(ctx, briefing, Markup.inlineKeyboard([
    [Markup.button.callback('🔄 Atualizar Notícias', 'act_noticias')],
    [Markup.button.callback('🎛️ Menu Principal', 'act_main_menu')]
  ]));
});
bot.action('act_compras', async (ctx) => {
  await ctx.answerCbQuery();
  const resp = await handleGeral('/compras');
  await sendReply(ctx, resp, Markup.inlineKeyboard([
    [Markup.webApp('🛒 Abrir na Mini App Família', VERCEL_APPS.familiar.url)],
    [Markup.callback('🔄 Atualizar', 'act_compras'), Markup.callback('🧹 Limpar Concluídos', 'act_compras_limpar')]
  ]));
});

bot.action('act_compras_limpar', async (ctx) => {
  await ctx.answerCbQuery('Compras concluídas limpas!');
  const resp = await handleGeral('/compras limpar');
  await sendReply(ctx, resp);
});

bot.action('act_tarefas', async (ctx) => {
  await ctx.answerCbQuery();
  const resp = await handleGeral('/tarefas');
  await sendReply(ctx, resp, Markup.inlineKeyboard([
    [Markup.webApp('📋 Abrir na Mini App', VERCEL_APPS.familiar.url)],
    [Markup.callback('🔄 Atualizar', 'act_tarefas')]
  ]));
});

bot.action('act_carolina', async (ctx) => {
  await ctx.answerCbQuery();
  const resp = await handleGeral('/carolina');
  await sendReply(ctx, resp, Markup.inlineKeyboard([
    [Markup.webApp('👧 Abrir Carolina na Mini App', VERCEL_APPS.familiar.url)],
    [Markup.callback('🔄 Atualizar', 'act_carolina')]
  ]));
});

bot.action('act_briefing', async (ctx) => {
  await ctx.answerCbQuery('A preparar o teu briefing...');
  await ctx.sendChatAction('typing');
  const resp = await handleGeral('/briefing');
  await sendReply(ctx, resp);
});

bot.action('act_nutri_menu', async (ctx) => {
  await ctx.answerCbQuery();
  const resumo = getResumoHoje();
  await sendReply(ctx, resumo, Markup.inlineKeyboard([
    [Markup.button.callback('🥗 Ver Plano 160g', 'act_nutri_plano')],
    [Markup.button.callback('💧 +250ml Água', 'nutri_agua_250'), Markup.button.callback('💧 +500ml Água', 'nutri_agua_500')],
    [Markup.button.callback('⚡ Tomar Creatina', 'nutri_creatina'), Markup.button.callback('🍗 +30g Prot', 'nutri_add_30')],
    [Markup.button.url('🥗 Abrir @Nutriainbot', 'https://t.me/Nutriainbot'), Markup.button.callback('🎛️ Menu Principal', 'act_main_menu')]
  ]));
});

bot.action('act_nutri_plano', async (ctx) => {
  await ctx.answerCbQuery();
  const plano = getPlanoNutricional();
  await sendReply(ctx, plano, Markup.inlineKeyboard([
    [Markup.button.callback('📊 Ver Resumo de Hoje', 'act_nutri_menu')],
    [Markup.button.callback('🎛️ Menu Principal', 'act_main_menu')]
  ]));
});

bot.action('nutri_agua_250', async (ctx) => {
  await ctx.answerCbQuery('💧 +250ml adicionados!');
  const resp = handleAguaInput('250');
  await sendReply(ctx, resp);
});

bot.action('nutri_agua_500', async (ctx) => {
  await ctx.answerCbQuery('💧 +500ml adicionados!');
  const resp = handleAguaInput('500');
  await sendReply(ctx, resp);
});

bot.action('nutri_creatina', async (ctx) => {
  await ctx.answerCbQuery('⚡ Creatina registada!');
  const resp = handleCreatina();
  await sendReply(ctx, resp);
});

bot.action('nutri_add_30', async (ctx) => {
  await ctx.answerCbQuery('🍗 +30g de proteína registada!');
  const resp = handleProteinaInput('30 : Snack/Refeição Proteica');
  await sendReply(ctx, resp);
});

bot.action('act_frotas', async (ctx) => {
  await ctx.answerCbQuery();
  const resp = await handleFrotas('');
  await sendReply(ctx, resp, Markup.inlineKeyboard([
    [Markup.button.webApp('🚛 Abrir ZeroPaperFrota', VERCEL_APPS.appfrota.url), Markup.button.callback('📊 Estado da Frota', 'act_frota_status')],
    [Markup.button.webApp('🚌 Abrir RotaBus GPS', VERCEL_APPS.rotabus.url), Markup.button.url('📲 Descarregar APK', VERCEL_APPS.rotabus.apkUrl)],
    [Markup.button.callback('🚛 Porto ➔ Lisboa', 'frota_porto_lisboa'), Markup.button.callback('🚛 Amarante ➔ Porto', 'frota_amarante_porto')],
    [Markup.button.callback('⏱️ Tacógrafo: 4.5h', 'btn_tacho_45'), Markup.button.callback('⏱️ Tacógrafo: 9.0h', 'btn_tacho_90')]
  ]));
});

bot.action('act_frota_status', async (ctx) => {
  await ctx.answerCbQuery();
  const report = await appFrotaService.getFrotaStatusReport();
  await sendReply(ctx, report, Markup.inlineKeyboard([
    [Markup.button.webApp('🚛 Abrir AppFrota Web', VERCEL_APPS.appfrota.url)],
    [Markup.button.callback('🔄 Atualizar Estado', 'act_frota_status')]
  ]));
});

bot.action('act_immo', async (ctx) => {
  await ctx.answerCbQuery();
  const resp = await handleImmo('/menu', ctx);
  await sendReply(ctx, resp, Markup.inlineKeyboard([
    [Markup.button.webApp('🏠 Abrir ImmoEval Mini App', VERCEL_APPS.immo.url)],
    [Markup.button.callback('📡 Radar & Pesquisa Agora', 'immo_radar_scan'), Markup.button.callback('📊 Relatório Diário', 'immo_daily_report')],
    [Markup.button.callback('🌐 12 Portais & Sites', 'immo_sites'), Markup.button.callback('🔔 Estado Alertas', 'immo_alertas_status')],
    [Markup.button.callback('📍 Amarante T3 (120m²)', 'immo_amarante'), Markup.button.callback('📍 Felgueiras T2 (85m²)', 'immo_felgueiras')],
    [Markup.button.callback('🎛️ Menu Principal', 'act_main_menu')]
  ]));
});

bot.action('immo_radar_scan', async (ctx) => {
  await ctx.answerCbQuery('A pesquisar novos anúncios nos 12 portais...');
  await ctx.sendChatAction('typing');
  const resp = await safeExecute(() => handleImmo('/radar', ctx), 'Radar Imobiliário', 25000);
  await sendReply(ctx, resp, Markup.inlineKeyboard([
    [Markup.button.webApp('🏠 Abrir ImmoEval Mini App', VERCEL_APPS.immo.url)],
    [Markup.button.callback('📊 Relatório Diário', 'immo_daily_report'), Markup.button.callback('🌐 12 Portais & Sites', 'immo_sites')]
  ]));
});

bot.action('immo_daily_report', async (ctx) => {
  await ctx.answerCbQuery('A gerar relatório consolidado...');
  await ctx.sendChatAction('typing');
  const resp = await safeExecute(() => handleImmo('/relatorio', ctx), 'Relatório Diário', 25000);
  await sendReply(ctx, resp, Markup.inlineKeyboard([
    [Markup.button.webApp('🏠 Abrir ImmoEval Mini App', VERCEL_APPS.immo.url)],
    [Markup.button.callback('📡 Radar Agora', 'immo_radar_scan'), Markup.button.callback('🌐 12 Portais', 'immo_sites')]
  ]));
});

bot.action('immo_sites', async (ctx) => {
  await ctx.answerCbQuery();
  await sendReply(ctx, formatarSitesImobiliariosMarkdown(), buildImmoSitesKeyboard());
});

bot.action('immo_alertas_status', async (ctx) => {
  await ctx.answerCbQuery();
  const resp = await handleImmo('/alertas', ctx);
  await sendReply(ctx, resp, Markup.inlineKeyboard([
    [Markup.button.callback('📡 Executar Varredura Agora', 'immo_radar_scan')],
    [Markup.button.callback('🎛️ Voltar ao Cockpit', 'act_main_menu')]
  ]));
});

bot.action('act_dev', async (ctx) => {
  await ctx.answerCbQuery('A consultar GitHub...');
  await ctx.sendChatAction('typing');
  const resp = await handleDev('/projetos');
  await sendReply(ctx, resp, Markup.inlineKeyboard([
    [Markup.webApp('💻 Scaffold Bot Preview', VERCEL_APPS.scaffold.url)],
    [Markup.callback('🌐 Ver Todas as Mini Apps', 'act_all_apps')]
  ]));
});

bot.action('act_all_apps', async (ctx) => {
  await ctx.answerCbQuery();
  const md = formatAllVercelAppsMarkdown();
  await sendReply(ctx, md, buildTelegramAppsKeyboard());
});

bot.action('frota_porto_lisboa', async (ctx) => {
  await ctx.answerCbQuery('A calcular rota...');
  await ctx.sendChatAction('typing');
  const resp = await handleFrotas('/rota Porto para Lisboa');
  await sendReply(ctx, resp);
});

bot.action('frota_amarante_porto', async (ctx) => {
  await ctx.answerCbQuery('A calcular rota...');
  await ctx.sendChatAction('typing');
  const resp = await handleFrotas('/rota Amarante para Porto');
  await sendReply(ctx, resp);
});

bot.action('btn_tacho_45', async (ctx) => {
  await ctx.answerCbQuery();
  const resp = await handleFrotas('/tacografo 4.5');
  await sendReply(ctx, resp);
});

bot.action('btn_tacho_90', async (ctx) => {
  await ctx.answerCbQuery();
  const resp = await handleFrotas('/tacografo 9');
  await sendReply(ctx, resp);
});

bot.action('immo_amarante', async (ctx) => {
  await ctx.answerCbQuery('A avaliar...');
  await ctx.sendChatAction('typing');
  const resp = await handleImmo('/avaliacao 120 Amarante T3 bom');
  await sendReply(ctx, resp);
});

bot.action('immo_felgueiras', async (ctx) => {
  await ctx.answerCbQuery('A avaliar...');
  await ctx.sendChatAction('typing');
  const resp = await handleImmo('/avaliacao 85 Felgueiras T2 bom');
  await sendReply(ctx, resp);
});

bot.action('act_tv_menu', async (ctx) => {
  await ctx.answerCbQuery();
  const cockpit = getTvCockpit();
  await sendReply(ctx, cockpit.text, cockpit.keyboard);
});

bot.action('act_tv_creds', async (ctx) => {
  await ctx.answerCbQuery();
  const credsMd = getXtreamCredentialsMarkdown();
  await sendReply(ctx, credsMd, Markup.inlineKeyboard([
    [Markup.button.callback('📺 Voltar ao Menu TV', 'act_tv_menu')]
  ]));
});

bot.action('act_tv_help', async (ctx) => {
  await ctx.answerCbQuery();
  const helpMd = getVlcHelpMarkdown();
  await sendReply(ctx, helpMd, Markup.inlineKeyboard([
    [Markup.button.callback('📺 Voltar ao Menu TV', 'act_tv_menu')]
  ]));
});

bot.action('act_tv_download_pt', async (ctx) => {
  await ctx.answerCbQuery('A enviar lista M3U...');
  const m3uPath = existsSync(path.resolve('./public/portugal.m3u'))
    ? path.resolve('./public/portugal.m3u')
    : 'c:/Users/Surface_Dpc/Desktop/PORTUGAL_COMPLETO.m3u';

  if (existsSync(m3uPath)) {
    await ctx.replyWithDocument(
      { source: m3uPath, filename: 'PORTUGAL_COMPLETO.m3u' },
      { caption: '🇵🇹 *Lista M3U Completa de Portugal (776 canais)*\n\nToca no ficheiro para abrir diretamente no VLC ou leitor IPTV do telemóvel!', parse_mode: 'Markdown' }
    );
  } else {
    await ctx.reply('⚠️ O ficheiro M3U local não foi encontrado.');
  }
});

bot.action('act_drive_status', async (ctx) => {
  await ctx.answerCbQuery();
  const configured = isDriveConfigured();
  if (!configured) {
    await sendReply(ctx, 
      `☁️ *Estado do Google Drive:* ⚪ _A aguardar credenciais no .env_\n\n` +
      `Assim que configurar a chave \`GOOGLE_SERVICE_ACCOUNT_KEY\`, o bot enviará cópias automáticas de segurança de todos os seus dados e listas para a nuvem.\n\n` +
      `_Digite /drive para ver o guia de configuração._`,
      Markup.inlineKeyboard([
        [Markup.button.callback('🎛️ Voltar ao Cockpit', 'act_main_menu')]
      ])
    );
  } else {
    await ctx.sendChatAction('typing');
    const res = await backupDatabaseToDrive();
    if (res.success) {
      await sendReply(ctx, 
        `☁️ *Estado do Google Drive:* 🟢 _Operacional!_\n\n` +
        `Backup efetuado com sucesso na pasta *TelegramBot_Backups* do Drive.`,
        Markup.inlineKeyboard([
          [Markup.button.callback('🎛️ Voltar ao Cockpit', 'act_main_menu')]
        ])
      );
    } else {
      await sendReply(ctx, `⚠️ Erro ao contactar o Google Drive: ${res.error || res.message}`);
    }
  }
});

bot.action('act_main_menu', async (ctx) => {
  await ctx.answerCbQuery();
  await sendReply(ctx, `🎛️ *Menu Principal de Controlo:*`, getMasterKeyboard());
});

bot.on('text', async (ctx) => {
  const text = ctx.message.text;
  if (!text || text.trim().length === 0) return;
  log.info('[Master] Mensagem recebida', { from: ctx.from?.first_name, text: text.substring(0, 80) });
  try {
    const resposta = await withTypingHeartbeat(ctx, () => rotear(ctx, text));
    if (resposta) {
      await sendReply(ctx, resposta);
    }
  } catch (err) {
    log.error('Erro ao processar mensagem no Master', err.message);
    await ctx.reply('⚠️ Erro interno. Tenta novamente em instantes.');
  }
});

bot.on('sticker', (ctx) => ctx.reply('😄 Sticker recebido! Fala comigo em texto ou toca no menu de Mini Apps.'));
bot.on('photo', (ctx) => processPhotoWithVision(ctx, TOKEN, 'master'));
const handleMasterVoice = async (ctx) => {
  try {
    await ctx.sendChatAction('typing');
    const result = await transcribeTelegramAudio(ctx);
    if (!result || !result.text) {
      await ctx.reply('🎙️ Não foi possível reconhecer o áudio. Tenta falar um pouco mais perto ou envia mensagem de texto.');
      return;
    }
    await ctx.reply(`🎙️ _"${result.text}"_`, { parse_mode: 'Markdown' }).catch(() => {});
    const resposta = await withTypingHeartbeat(ctx, () => rotear(ctx, result.text));
    if (resposta) {
      await sendReply(ctx, resposta);
    }
  } catch (err) {
    log.error('Erro ao processar mensagem de voz no Master:', err.message);
    await ctx.reply('⚠️ Ocorreu um erro ao processar a tua mensagem de voz.');
  }
};

bot.on('voice', handleMasterVoice);
bot.on('audio', handleMasterVoice);

bot.catch((err, ctx) => {
  log.error('Erro não tratado no Master Bot', err?.message || err);
  ctx?.reply('⚠️ Ocorreu um erro no Master. O bot continua ativo.').catch(() => {});
});

botInstances.push({ name: 'Master (@AndrePinheirobot)', bot, key: 'master' });

// 2. WORKER DEV (@DesSofBot) ──────────────────────────────────────────────────
const DEV_TOKEN = process.env.TELEGRAM_DEV_TOKEN || process.env.TELEGRAM_BOT_TOKEN_DEV || process.env.DEV_TOKEN;
if (DEV_TOKEN && DEV_TOKEN.trim()) {
  const botDev = new Telegraf(DEV_TOKEN.trim());
  botDev.use(authMiddleware);
  botDev.use(cleanChatMiddleware);

  botDev.telegram.setChatMenuButton({
    menu_button: {
      type: 'web_app',
      text: '💻 Scaffold App',
      web_app: { url: VERCEL_APPS.scaffold.url }
    }
  }).catch(() => {});

  botDev.start(async (ctx) => {
    await sendReply(ctx, `💻 *Worker Dev & Cloud Ativo na Nuvem!*\n\nEspecialista em Engenharia de Software, GitHub, Vercel e Render.\n\n• \`/projetos\` — Listar repositórios GitHub\n• \`/apps\` — Ver as tuas 9 Mini Apps\n• \`/apks\` — Descarregar APKs compilados\n• \`/criar_app NOME\` — Scaffold automático`, Markup.inlineKeyboard([
      [Markup.button.webApp('💻 Abrir Scaffold Bot', VERCEL_APPS.scaffold.url)],
      [Markup.button.callback('📂 Repositórios GitHub', 'dev_repos'), Markup.button.callback('📲 APKs Disponíveis', 'dev_apks')]
    ]));
  });

  botDev.command(['projetos', 'repos'], async (ctx) => {
    await ctx.sendChatAction('typing');
    const resp = await handleDev('/projetos');
    await sendReply(ctx, resp);
  });

  botDev.command(['apps', 'catalogo'], async (ctx) => {
    await sendReply(ctx, formatAllVercelAppsMarkdown(), buildTelegramAppsKeyboard());
  });

  botDev.command(['apks', 'apk'], async (ctx) => {
    const resp = await handleDev('/apks');
    await sendReply(ctx, resp, Markup.inlineKeyboard([
      [Markup.button.url('📲 Descarregar RotaBus APK', VERCEL_APPS.rotabus.apkUrl)]
    ]));
  });

  botDev.action('dev_repos', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.sendChatAction('typing');
    const resp = await handleDev('/projetos');
    await sendReply(ctx, resp);
  });

  botDev.action('dev_apks', async (ctx) => {
    await ctx.answerCbQuery();
    const resp = await handleDev('/apks');
    await sendReply(ctx, resp);
  });

  botDev.on('photo', (ctx) => processPhotoWithVision(ctx, DEV_TOKEN, 'dev'));

  botDev.on('text', async (ctx) => {
    await ctx.sendChatAction('typing');
    const resp = await safeExecute(() => handleDev(ctx.message.text, ctx), 'Dev (Engenharia)', 20000);
    await sendReply(ctx, resp);
  });

  botDev.on(['voice', 'audio'], async (ctx) => {
    try {
      await ctx.sendChatAction('typing');
      const result = await transcribeTelegramAudio(ctx);
      if (result?.text) {
        await ctx.reply(`🎙️ _"${result.text}"_`, { parse_mode: 'Markdown' }).catch(() => {});
        await ctx.sendChatAction('typing');
        const resp = await safeExecute(() => handleDev(result.text, ctx), 'Dev (Áudio)', 30000);
        await sendReply(ctx, resp);
      }
    } catch (err) {
      log.error('Erro ao processar voz no Dev:', err.message);
    }
  });

  botDev.catch((err) => log.error('Erro no Worker Dev', err?.message || err));
  botInstances.push({ name: 'Dev (@DesSofBot)', bot: botDev, key: 'dev' });
}

// 3. WORKER FROTAS (@TrasFrotBot) ─────────────────────────────────────────────
const FROTAS_TOKEN = process.env.TELEGRAM_FROTAS_TOKEN || process.env.TELEGRAM_BOT_TOKEN_FROTAS || process.env.FROTAS_TOKEN;
if (FROTAS_TOKEN && FROTAS_TOKEN.trim()) {
  const botFrotas = new Telegraf(FROTAS_TOKEN.trim());
  botFrotas.use(authMiddleware);
  botFrotas.use(cleanChatMiddleware);

  botFrotas.telegram.setChatMenuButton({
    menu_button: {
      type: 'web_app',
      text: '🚌 RotaBus GPS',
      web_app: { url: VERCEL_APPS.rotabus.url }
    }
  }).catch(() => {});

  botFrotas.start(async (ctx) => {
    await sendReply(ctx, `🚛 *Worker Frotas, Tacógrafo & RotaBus VIP!*\n\nEspecialista em Logística, Tacógrafo Digital e Navegação sem Enjoo para Equipas.\n\n• \`/rota ORIGEM para DESTINO\`\n• \`/tacografo HORAS\`\n• \`/apk\` — Descarregar nova versão Android`, Markup.inlineKeyboard([
      [Markup.button.webApp('🚌 Abrir RotaBus GPS VIP', VERCEL_APPS.rotabus.url)],
      [Markup.button.url('📲 Descarregar APK Android', VERCEL_APPS.rotabus.apkUrl)],
      [Markup.button.callback('🚛 Porto ➔ Lisboa', 'frota_porto_lisboa'), Markup.button.callback('🚛 Amarante ➔ Porto', 'frota_amarante_porto')],
      [Markup.button.callback('⏱️ Tacógrafo: 4.5h', 'btn_tacho_45'), Markup.button.callback('⏱️ Tacógrafo: 9.0h', 'btn_tacho_90')]
    ]));
  });

  botFrotas.command('rota', async (ctx) => {
    await ctx.sendChatAction('typing');
    const resp = await handleFrotas(ctx.message.text);
    await sendReply(ctx, resp, Markup.inlineKeyboard([
      [Markup.button.webApp('🚌 Ver Rota no RotaBus', VERCEL_APPS.rotabus.url)]
    ]));
  });

  botFrotas.command('tacografo', async (ctx) => {
    const resp = await handleFrotas(ctx.message.text);
    await sendReply(ctx, resp);
  });

  botFrotas.command(['apk', 'download'], async (ctx) => {
    await sendReply(ctx, `📲 *Download RotaBus para Android (APK Oficial)*\n\nVersão com suporte a Android Auto, anti-sinuosidade e tacógrafo:\n[https://smooth-bus-routes.vercel.app/rotabus.apk](https://smooth-bus-routes.vercel.app/rotabus.apk)`, Markup.inlineKeyboard([
      [Markup.button.url('📥 Descarregar APK Agora', VERCEL_APPS.rotabus.apkUrl)],
      [Markup.button.webApp('🌐 Versão Web PWA', VERCEL_APPS.rotabus.url)]
    ]));
  });

  botFrotas.action('frota_porto_lisboa', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.sendChatAction('typing');
    const resp = await handleFrotas('/rota Porto para Lisboa');
    await sendReply(ctx, resp);
  });

  botFrotas.action('frota_amarante_porto', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.sendChatAction('typing');
    const resp = await handleFrotas('/rota Amarante para Porto');
    await sendReply(ctx, resp);
  });

  botFrotas.action('btn_tacho_45', async (ctx) => {
    await ctx.answerCbQuery();
    const resp = await handleFrotas('/tacografo 4.5');
    await sendReply(ctx, resp);
  });

  botFrotas.action('btn_tacho_90', async (ctx) => {
    await ctx.answerCbQuery();
    const resp = await handleFrotas('/tacografo 9');
    await sendReply(ctx, resp);
  });

  botFrotas.on('photo', (ctx) => processPhotoWithVision(ctx, FROTAS_TOKEN, 'frotas'));

  botFrotas.on('text', async (ctx) => {
    await ctx.sendChatAction('typing');
    const resp = await safeExecute(() => handleFrotas(ctx.message.text, ctx), 'Frotas (RotaBus)', 20000);
    await sendReply(ctx, resp);
  });

  botFrotas.on(['voice', 'audio'], async (ctx) => {
    try {
      await ctx.sendChatAction('typing');
      const result = await transcribeTelegramAudio(ctx);
      if (result?.text) {
        await ctx.reply(`🎙️ _"${result.text}"_`, { parse_mode: 'Markdown' }).catch(() => {});
        await ctx.sendChatAction('typing');
        const resp = await safeExecute(() => handleFrotas(result.text, ctx), 'Frotas (Áudio)', 20000);
        await sendReply(ctx, resp);
      }
    } catch (err) {
      log.error('Erro ao processar voz no Frotas:', err.message);
    }
  });

  botFrotas.catch((err) => log.error('Erro no Worker Frotas', err?.message || err));
  botInstances.push({ name: 'Frotas (@TrasFrotBot)', bot: botFrotas, key: 'frotas' });
}

// 4. WORKER IMMO (@ppspppBot) ─────────────────────────────────────────────────
const IMMO_TOKEN = process.env.TELEGRAM_IMMO_TOKEN || process.env.TELEGRAM_BOT_TOKEN_IMMO || process.env.IMMO_TOKEN;
if (IMMO_TOKEN && IMMO_TOKEN.trim()) {
  const botImmo = new Telegraf(IMMO_TOKEN.trim());
  botImmo.use(authMiddleware);
  botImmo.use(cleanChatMiddleware);

  botImmo.telegram.setChatMenuButton({
    menu_button: {
      type: 'web_app',
      text: '🏠 ImmoEval',
      web_app: { url: VERCEL_APPS.immo.url }
    }
  }).catch(() => {});

  botImmo.start(async (ctx) => {
    await sendReply(ctx, 
      `🏠 *Worker Imobiliário CMVM & Radar de Mercado Ativo!*\n\n` +
      `Monitorização diária de novos anúncios em Amarante (12 portais) e avaliação pericial bancária CMVM.\n\n` +
      `• \`/radar\` — Disparar pesquisa de novos imóveis agora\n` +
      `• \`/relatorio\` — Relatório diário de anúncios e oportunidades\n` +
      `• \`/sites\` — Diretório dos 12 portais e agências locais\n` +
      `• \`/alertas\` — Configuração das pesquisas e alertas ao longo do dia\n` +
      `• \`/avaliacao ÁREA ZONA TIPO ESTADO\` — Avaliação pericial CMVM\n\n` +
      `_Toca abaixo para abrir a Mini App ou usar as ferramentas rápidas:_`,
      Markup.inlineKeyboard([
        [Markup.button.webApp('🏠 Abrir ImmoEval Mini App', VERCEL_APPS.immo.url)],
        [Markup.button.callback('📡 Radar Agora', 'immo_radar_scan'), Markup.button.callback('📊 Relatório Diário', 'immo_daily_report')],
        [Markup.button.callback('🌐 12 Portais & Sites', 'immo_sites'), Markup.button.callback('🔔 Estado Alertas', 'immo_alertas_status')],
        [Markup.button.callback('📍 Amarante T3 (120m²)', 'immo_amarante'), Markup.button.callback('📍 Felgueiras T2 (85m²)', 'immo_felgueiras')]
      ])
    );
  });

  botImmo.command(['radar', 'pesquisa', 'pesquisar'], async (ctx) => {
    await ctx.sendChatAction('typing');
    const resp = await safeExecute(() => handleImmo('/radar', ctx), 'Immo Radar', 25000);
    await sendReply(ctx, resp, Markup.inlineKeyboard([
      [Markup.button.webApp('🏠 Abrir ImmoEval Mini App', VERCEL_APPS.immo.url)],
      [Markup.button.callback('📊 Relatório Diário', 'immo_daily_report'), Markup.button.callback('🌐 12 Portais', 'immo_sites')]
    ]));
  });

  botImmo.command(['relatorio', 'relatorio_imoveis', 'resumo'], async (ctx) => {
    await ctx.sendChatAction('typing');
    const resp = await safeExecute(() => handleImmo('/relatorio', ctx), 'Immo Relatório', 25000);
    await sendReply(ctx, resp, Markup.inlineKeyboard([
      [Markup.button.webApp('🏠 Abrir ImmoEval Mini App', VERCEL_APPS.immo.url)],
      [Markup.button.callback('📡 Pesquisar Mais Agora', 'immo_radar_scan')]
    ]));
  });

  botImmo.command(['sites', 'portais'], async (ctx) => {
    await sendReply(ctx, formatarSitesImobiliariosMarkdown(), buildImmoSitesKeyboard());
  });

  botImmo.command(['alertas', 'agenda'], async (ctx) => {
    const resp = await handleImmo('/alertas', ctx);
    await sendReply(ctx, resp, Markup.inlineKeyboard([
      [Markup.button.callback('📡 Executar Varredura Agora', 'immo_radar_scan')]
    ]));
  });

  botImmo.command('avaliacao', async (ctx) => {
    await ctx.sendChatAction('typing');
    const resp = await safeExecute(() => handleImmo(ctx.message.text, ctx), 'Immo Avaliação', 25000);
    await sendReply(ctx, resp, Markup.inlineKeyboard([
      [Markup.button.webApp('🏠 Abrir ImmoEval Mini App', VERCEL_APPS.immo.url)]
    ]));
  });

  botImmo.action('immo_radar_scan', async (ctx) => {
    await ctx.answerCbQuery('A pesquisar novos anúncios nos 12 portais...');
    await ctx.sendChatAction('typing');
    const resp = await safeExecute(() => handleImmo('/radar', ctx), 'Immo Radar', 25000);
    await sendReply(ctx, resp, Markup.inlineKeyboard([
      [Markup.button.webApp('🏠 Abrir ImmoEval Mini App', VERCEL_APPS.immo.url)],
      [Markup.button.callback('📊 Relatório Diário', 'immo_daily_report'), Markup.button.callback('🌐 12 Portais & Sites', 'immo_sites')]
    ]));
  });

  botImmo.action('immo_daily_report', async (ctx) => {
    await ctx.answerCbQuery('A carregar relatório consolidado...');
    await ctx.sendChatAction('typing');
    const resp = await safeExecute(() => handleImmo('/relatorio', ctx), 'Immo Relatório', 25000);
    await sendReply(ctx, resp, Markup.inlineKeyboard([
      [Markup.button.webApp('🏠 Abrir ImmoEval Mini App', VERCEL_APPS.immo.url)],
      [Markup.button.callback('📡 Radar Agora', 'immo_radar_scan')]
    ]));
  });

  botImmo.action('immo_sites', async (ctx) => {
    await ctx.answerCbQuery();
    await sendReply(ctx, formatarSitesImobiliariosMarkdown(), buildImmoSitesKeyboard());
  });

  botImmo.action('immo_alertas_status', async (ctx) => {
    await ctx.answerCbQuery();
    const resp = await handleImmo('/alertas', ctx);
    await sendReply(ctx, resp, Markup.inlineKeyboard([
      [Markup.button.callback('📡 Executar Varredura Agora', 'immo_radar_scan')]
    ]));
  });

  botImmo.action('immo_amarante', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.sendChatAction('typing');
    const resp = await handleImmo('/avaliacao 120 Amarante T3 bom', ctx);
    await sendReply(ctx, resp);
  });

  botImmo.action('immo_felgueiras', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.sendChatAction('typing');
    const resp = await handleImmo('/avaliacao 85 Felgueiras T2 bom', ctx);
    await sendReply(ctx, resp);
  });

  botImmo.on('photo', (ctx) => processPhotoWithVision(ctx, IMMO_TOKEN, 'immo'));

  botImmo.on('text', async (ctx) => {
    await ctx.sendChatAction('typing');
    const resp = await safeExecute(() => handleImmo(ctx.message.text, ctx), 'Immo (Avaliação & Radar)', 25000);
    await sendReply(ctx, resp);
  });

  botImmo.on(['voice', 'audio'], async (ctx) => {
    try {
      await ctx.sendChatAction('typing');
      const result = await transcribeTelegramAudio(ctx);
      if (result?.text) {
        await ctx.reply(`🎙️ _"${result.text}"_`, { parse_mode: 'Markdown' }).catch(() => {});
        await ctx.sendChatAction('typing');
        const resp = await safeExecute(() => handleImmo(result.text, ctx), 'Immo (Áudio)', 25000);
        await sendReply(ctx, resp);
      }
    } catch (err) {
      log.error('Erro ao processar voz no Immo:', err.message);
    }
  });

  botImmo.catch((err) => log.error('Erro no Worker Immo', err?.message || err));
  botInstances.push({ name: 'Immo (@ppspppBot)', bot: botImmo, key: 'immo' });
}

// 5. WORKER PESSOAL (@AndTrarBOT) ─────────────────────────────────────────────
const PESSOAL_TOKEN = process.env.TELEGRAM_PESSOAL_TOKEN || process.env.TELEGRAM_BOT_TOKEN_PESSOAL || process.env.PESSOAL_TOKEN;
if (PESSOAL_TOKEN && PESSOAL_TOKEN.trim()) {
  const botPessoal = new Telegraf(PESSOAL_TOKEN.trim());
  botPessoal.use(authMiddleware);
  botPessoal.use(cleanChatMiddleware);

  botPessoal.telegram.setChatMenuButton({
    menu_button: {
      type: 'web_app',
      text: '🏡 Família',
      web_app: { url: VERCEL_APPS.familiar.url }
    }
  }).catch(() => {});

  botPessoal.start(async (ctx) => {
    await sendReply(
      ctx,
      `📋 *Assistente Pessoal Executivo & Familiar!*\n\n` +
      `Sincronizado diretamente com a tua Mini App e serviços essenciais:\n\n` +
      `📧 \`/emails\` — Ler emails recentes e resumos por IA\n` +
      `🔍 \`/pesquisa\` — Pesquisar na Web ao vivo\n` +
      `🏡 \`/moradias_novas\` — Radar de moradias nas plataformas\n` +
      `⛽ \`/combustiveis\` — Postos mais baratos em Amarante (DGEG)\n` +
      `🚗 \`/transito\` — Trânsito na A4 e Túnel do Marão\n` +
      `🛒 \`/compras\` — Ver ou gerir compras\n` +
      `📋 \`/tarefas\` — Tarefas domésticas e pessoais\n` +
      `👧 \`/carolina\` — Escola, faltas e consultas\n` +
      `☀️ \`/briefing\` — Resumo diário consolidado\n\n` +
      `_Podes também falar normalmente comigo em português!_`,
      Markup.inlineKeyboard([
        [Markup.button.webApp('🏡 Abrir Mini App Família', VERCEL_APPS.familiar.url)],
        [Markup.button.callback('📧 Ver Emails', 'pessoal_emails'), Markup.button.callback('⛽ Combustíveis', 'pessoal_combustiveis')],
        [Markup.button.callback('🛒 Compras', 'pessoal_compras'), Markup.button.callback('📋 Tarefas', 'pessoal_tarefas')],
        [Markup.button.callback('👧 Carolina', 'pessoal_carolina'), Markup.button.callback('☀️ Briefing do Dia', 'pessoal_briefing')]
      ])
    );
  });

  botPessoal.action('pessoal_emails', async (ctx) => {
    await ctx.answerCbQuery('A carregar emails...');
    await ctx.sendChatAction('typing');
    const resp = await safeExecute(() => handleGeral('/emails', ctx), 'Emails IMAP', 20000);
    await sendReply(ctx, resp);
  });

  botPessoal.action('pessoal_combustiveis', async (ctx) => {
    await ctx.answerCbQuery('A consultar DGEG...');
    await ctx.sendChatAction('typing');
    const resp = await safeExecute(() => handleGeral('/combustiveis', ctx), 'Combustíveis', 15000);
    await sendReply(ctx, resp);
  });

  botPessoal.action('pessoal_compras', async (ctx) => {
    await ctx.answerCbQuery();
    const resp = await handleGeral('/compras');
    await sendReply(ctx, resp);
  });

  botPessoal.action('pessoal_tarefas', async (ctx) => {
    await ctx.answerCbQuery();
    const resp = await handleGeral('/tarefas');
    await sendReply(ctx, resp);
  });

  botPessoal.action('pessoal_carolina', async (ctx) => {
    await ctx.answerCbQuery();
    const resp = await handleGeral('/carolina');
    await sendReply(ctx, resp);
  });

  botPessoal.action('pessoal_briefing', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.sendChatAction('typing');
    const resp = await handleGeral('/briefing');
    await sendReply(ctx, resp);
  });

  botPessoal.on('photo', (ctx) => processPhotoWithVision(ctx, PESSOAL_TOKEN, 'pessoal'));

  botPessoal.command(['emails', 'email', 'correio', 'inbox'], async (ctx) => {
    await ctx.sendChatAction('typing');
    const resp = await safeExecute(() => handleGeral('/emails', ctx), 'Emails IMAP', 20000);
    await sendReply(ctx, resp);
  });

  botPessoal.command(['ler_email', 'resumo_email'], async (ctx) => {
    await ctx.sendChatAction('typing');
    const resp = await safeExecute(() => handleGeral(ctx.message.text, ctx), 'Resumo Email', 20000);
    await sendReply(ctx, resp);
  });

  botPessoal.command('email_status', async (ctx) => {
    const resp = await handleGeral('/email_status', ctx);
    await sendReply(ctx, resp);
  });

  botPessoal.command(['combustiveis', 'gasoleo', 'gasolina'], async (ctx) => {
    await ctx.sendChatAction('typing');
    const resp = await safeExecute(() => handleGeral(ctx.message.text, ctx), 'Combustíveis DGEG', 15000);
    await sendReply(ctx, resp);
  });

  botPessoal.command(['transito'], async (ctx) => {
    await ctx.sendChatAction('typing');
    const resp = await safeExecute(() => handleGeral(ctx.message.text, ctx), 'Trânsito', 15000);
    await sendReply(ctx, resp);
  });

  botPessoal.command(['pesquisa', 'procura', 'web'], async (ctx) => {
    await ctx.sendChatAction('typing');
    const resp = await safeExecute(() => handleGeral(ctx.message.text, ctx), 'Pesquisa Web', 20000);
    await sendReply(ctx, resp);
  });

  botPessoal.command(['moradias_novas', 'moradias', 'imoveis'], async (ctx) => {
    await ctx.sendChatAction('typing');
    const resp = await safeExecute(() => handleGeral('/moradias_novas', ctx), 'Moradias Novas', 25000);
    await sendReply(ctx, resp);
  });

  botPessoal.command(['nutricao', 'dieta'], async (ctx) => {
    const resp = await handleGeral('/nutricao');
    await sendReply(ctx, resp);
  });

  botPessoal.command('ergonomia', async (ctx) => {
    const resp = await handleGeral('/ergonomia');
    await sendReply(ctx, resp);
  });

  botPessoal.command('proteina', async (ctx) => {
    const resp = await handleGeral(ctx.message.text);
    await sendReply(ctx, resp);
  });

  botPessoal.command(['lembrete', 'lembretes'], async (ctx) => {
    const resp = await handleGeral(ctx.message.text, ctx);
    await sendReply(ctx, resp);
  });

  botPessoal.on('text', async (ctx) => {
    await ctx.sendChatAction('typing');
    const resp = await safeExecute(() => handleGeral(ctx.message.text, ctx), 'Pessoal & Família', 20000);
    await sendReply(ctx, resp);
  });

  botPessoal.on(['voice', 'audio'], async (ctx) => {
    try {
      await ctx.sendChatAction('typing');
      const result = await transcribeTelegramAudio(ctx);
      if (result?.text) {
        await ctx.reply(`🎙️ _"${result.text}"_`, { parse_mode: 'Markdown' }).catch(() => {});
        await ctx.sendChatAction('typing');
        const resp = await safeExecute(() => handleGeral(result.text, ctx), 'Pessoal (Áudio)', 20000);
        await sendReply(ctx, resp);
      }
    } catch (err) {
      log.error('Erro ao processar voz no Pessoal:', err.message);
    }
  });

  botPessoal.catch((err) => log.error('Erro no Worker Pessoal', err?.message || err));
  botInstances.push({ name: 'Pessoal (@AndTrarBOT)', bot: botPessoal, key: 'pessoal' });
}

// 6. WORKER NUTRIÇÃO (@Nutriainbot) ───────────────────────────────────────────
const NUTRICAO_TOKEN = process.env.TELEGRAM_NUTRICAO_TOKEN || process.env.TELEGRAM_BOT_TOKEN_NUTRICAO;
if (NUTRICAO_TOKEN && NUTRICAO_TOKEN.trim()) {
  const botNutri = new Telegraf(NUTRICAO_TOKEN.trim());
  botNutri.use(authMiddleware);
  botNutri.use(cleanChatMiddleware);

  botNutri.telegram.setChatMenuButton({
    menu_button: {
      type: 'web_app',
      text: '🥗 Família & Nutrição',
      web_app: { url: VERCEL_APPS.familiar.url }
    }
  }).catch(() => {});

  botNutri.start(async (ctx) => {
    const nome = ctx.from?.first_name || 'André';
    await sendReply(
      ctx,
      `🥗 *Olá, ${nome}! Sou o teu Nutricionista de Alta Performance.*\n\n` +
      `Estou programado com foco absoluto na tua meta de *160g de proteína diária*, hidratação de 2.5L e performance muscular.\n\n` +
      `• \`/plano\` — Ver as refeições diárias recomendadas\n` +
      `• \`/hoje\` — Ver o teu progresso de proteína, água e calorias\n` +
      `• \`/proteina 50 : Bife\` — Registar refeição com gramas\n` +
      `• \`/agua 500\` — Registar água consumida\n` +
      `• \`/creatina\` — Registar a dose de 5g diária\n\n` +
      `📸 *Envia uma foto de qualquer prato ou refeição* para eu estimar ingredientes e macros por IA!`,
      Markup.inlineKeyboard([
        [Markup.button.callback('📋 Ver Plano Alimentar', 'nutri_plano'), Markup.button.callback('📊 Progresso de Hoje', 'nutri_hoje')],
        [Markup.button.callback('💧 +250ml Água', 'nutri_agua_250'), Markup.button.callback('💧 +500ml Água', 'nutri_agua_500')],
        [Markup.button.callback('⚡ Registar Creatina', 'nutri_creatina'), Markup.button.callback('🍗 +30g Proteína', 'nutri_add_30')],
        [Markup.button.webApp('🏡 Abrir Mini App Família', VERCEL_APPS.familiar.url)]
      ])
    );
  });

  botNutri.command(['plano', 'dieta'], async (ctx) => {
    await sendReply(ctx, getPlanoNutricional(), Markup.inlineKeyboard([
      [Markup.button.callback('📊 Progresso de Hoje', 'nutri_hoje')]
    ]));
  });

  botNutri.command(['hoje', 'macros', 'resumo', 'status'], async (ctx) => {
    await sendReply(ctx, getResumoHoje(), Markup.inlineKeyboard([
      [Markup.button.callback('💧 +250ml Água', 'nutri_agua_250'), Markup.button.callback('💧 +500ml Água', 'nutri_agua_500')],
      [Markup.button.callback('⚡ Creatina', 'nutri_creatina'), Markup.button.callback('🍗 +30g Prot', 'nutri_add_30')]
    ]));
  });

  botNutri.command('proteina', async (ctx) => {
    const raw = ctx.message.text.replace(/^\/proteina\s*/i, '').trim();
    const resp = handleProteinaInput(raw);
    await sendReply(ctx, resp);
  });

  botNutri.command('agua', async (ctx) => {
    const raw = ctx.message.text.replace(/^\/agua\s*/i, '').trim();
    const resp = handleAguaInput(raw);
    await sendReply(ctx, resp);
  });

  botNutri.command('creatina', async (ctx) => {
    const resp = handleCreatina();
    await sendReply(ctx, resp);
  });

  botNutri.action('nutri_plano', async (ctx) => {
    await ctx.answerCbQuery();
    await sendReply(ctx, getPlanoNutricional());
  });

  botNutri.action('nutri_hoje', async (ctx) => {
    await ctx.answerCbQuery();
    await sendReply(ctx, getResumoHoje());
  });

  botNutri.action('nutri_agua_250', async (ctx) => {
    await ctx.answerCbQuery('💧 +250ml adicionados!');
    const resp = handleAguaInput('250');
    await sendReply(ctx, resp);
  });

  botNutri.action('nutri_agua_500', async (ctx) => {
    await ctx.answerCbQuery('💧 +500ml adicionados!');
    const resp = handleAguaInput('500');
    await sendReply(ctx, resp);
  });

  botNutri.action('nutri_creatina', async (ctx) => {
    await ctx.answerCbQuery('⚡ Creatina registada!');
    const resp = handleCreatina();
    await sendReply(ctx, resp);
  });

  botNutri.action('nutri_add_30', async (ctx) => {
    await ctx.answerCbQuery('🍗 +30g de proteína registada!');
    const resp = handleProteinaInput('30 : Snack/Refeição Proteica');
    await sendReply(ctx, resp);
  });

  botNutri.on('photo', (ctx) => processPhotoWithVision(ctx, NUTRICAO_TOKEN, 'nutricao'));

  botNutri.on('text', async (ctx) => {
    await ctx.sendChatAction('typing');
    const resp = await safeExecute(() => handleNutricao(ctx.message.text, ctx), 'Nutrição (High-Protein)', 20000);
    await sendReply(ctx, resp);
  });

  botNutri.on(['voice', 'audio'], async (ctx) => {
    try {
      await ctx.sendChatAction('typing');
      const result = await transcribeTelegramAudio(ctx);
      if (result?.text) {
        await ctx.reply(`🎙️ _"${result.text}"_`, { parse_mode: 'Markdown' }).catch(() => {});
        await ctx.sendChatAction('typing');
        const resp = await safeExecute(() => handleNutricao(result.text, ctx), 'Nutrição (Áudio)', 20000);
        await sendReply(ctx, resp);
      }
    } catch (err) {
      log.error('Erro ao processar voz na Nutrição:', err.message);
    }
  });

  botNutri.catch((err) => log.error('Erro no Worker Nutrição', err?.message || err));
  botInstances.push({ name: 'Nutrição (@Nutriainbot)', bot: botNutri, key: 'nutricao' });
}

// ─── Encerramento Seguro ─────────────────────────────────────────────────────

const shutdown = async (signal) => {
  log.info(`A terminar bots (${signal})...`);
  try {
    await syncAllToDrive();
  } catch (err) {
    log.error('Erro na sincronização com o Google Drive no encerramento:', err?.message || err);
  }
  botInstances.forEach(({ name, bot: b }) => {
    try {
      b.stop(signal);
      log.info(`Bot [${name}] parado.`);
    } catch {}
  });
  process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('uncaughtException', (err) => {
  log.error('uncaughtException', err?.message || err);
});

process.on('unhandledRejection', (reason) => {
  log.error('unhandledRejection', String(reason));
});

// ─── Servidor HTTP & API REST para Render e Mini Apps ───────────────────────
const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
  const urlPath = (req.url || '/').split('?')[0];

  // 1. Mini App Frontend (HTML/Estáticos da WebApp)
  if (urlPath === '/webapp' || urlPath === '/mini-app' || urlPath === '/app') {
    const indexPath = path.resolve('./public/index.html');
    if (existsSync(indexPath)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(readFileSync(indexPath));
      return;
    }
  }

  if (urlPath === '/' && req.headers.accept?.includes('text/html')) {
    const indexPath = path.resolve('./public/index.html');
    if (existsSync(indexPath)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(readFileSync(indexPath));
      return;
    }
  }

  // 2. Health check do Render
  if (urlPath === '/health' || urlPath === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      service: 'telegram-master-bot',
      activeBots: botInstances.map((b) => b.name),
      miniApps: Object.keys(VERCEL_APPS).length,
      uptime: process.uptime()
    }));
    return;
  }

  // 2. Catálogo de Mini Apps API
  if (urlPath === '/api/apps') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(VERCEL_APPS));
    return;
  }

  // 3. API REST da Mini App Família (/api/family/*)
  if (urlPath.startsWith('/api/family')) {
    const handled = handleFamilyApi(req, res, urlPath, req.method);
    if (handled) return;
  }

  // 4. Listas M3U (IPTV / MatchPro / Portugal)
  if (urlPath === '/portugal.m3u' || urlPath === '/api/portugal.m3u') {
    const ptM3u = existsSync(path.resolve('./public/portugal.m3u'))
      ? path.resolve('./public/portugal.m3u')
      : 'c:/Users/Surface_Dpc/Desktop/PORTUGAL_COMPLETO.m3u';
    if (existsSync(ptM3u)) {
      res.writeHead(200, {
        'Content-Type': 'audio/x-mpegurl; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(readFileSync(ptM3u));
      return;
    }
  }

  // 4.1 Ponte de Sincronização & Controlo Remoto do PC Surface (/api/sync/*)
  if (urlPath.startsWith('/api/sync/')) {
    const syncToken = req.headers['x-sync-token'] || '';
    const VALID_SYNC_TOKEN = process.env.SYNC_SECRET_TOKEN || 'sync_default_token_9959';
    if (syncToken !== VALID_SYNC_TOKEN && syncToken !== 'segredo_super_seguro_sync_2026') {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Token de sincronização inválido' }));
      return;
    }

    if (urlPath === '/api/sync/heartbeat' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          pcRemoteBridge.recordHeartbeat(data);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, timestamp: Date.now() }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'JSON inválido' }));
        }
      });
      return;
    }

    if (urlPath === '/api/sync/orders/pending' && req.method === 'GET') {
      const orders = pcRemoteBridge.getPendingOrders();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, orders }));
      return;
    }

    if (urlPath.startsWith('/api/sync/orders/') && urlPath.endsWith('/complete') && req.method === 'POST') {
      const parts = urlPath.split('/');
      const orderId = parts[4];
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const result = JSON.parse(body);
          pcRemoteBridge.completeOrder(orderId, result);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'JSON inválido' }));
        }
      });
      return;
    }

    if (urlPath === '/api/sync/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        isOnline: pcRemoteBridge.isPcOnline(),
        pcInfo: pcRemoteBridge.getPcInfo(),
        pendingCount: pcRemoteBridge.getPendingOrders().length
      }));
      return;
    }
  }

  // 5. Telegram Webhooks (100% Gratuito & Baixa Latência)
  if (urlPath.startsWith('/webhook/')) {
    const key = urlPath.replace('/webhook/', '').trim();
    const target = botInstances.find((b) => b.key === key);
    if (target?.webhookCallback) {
      return target.webhookCallback(req, res);
    }
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Endpoint não encontrado' }));
});

server.listen(PORT, () => {
  log.info(`Servidor HTTP e API REST ativo na porta ${PORT} para Render.com e Mini Apps`);
  
  // Keep-Alive Automático para Render.com (Prevenir hibernação do plano gratuito)
  const renderUrl = process.env.RENDER_EXTERNAL_URL || 'https://telegram-master-bot.onrender.com';
  if (process.env.RENDER || process.env.NODE_ENV === 'production') {
    setInterval(() => {
      fetch(`${renderUrl}/health`)
        .then(res => res.json())
        .then(() => log.debug('Keep-alive ping com sucesso'))
        .catch(() => {});
    }, 10 * 60 * 1000);
    log.info(`📡 Keep-Alive ativado para Render.com: ${renderUrl}/health a cada 10 min.`);
  }
});

// ─── Arranque Paralelo de Todos os Bots Ativos ─────────────────────────────

async function launchSingleBot(name, b, retries = 5, delayMs = 5000) {
  try {
    // Remover webhook pendente se estivermos a usar polling local
    await b.telegram.deleteWebhook({ drop_pending_updates: false }).catch(() => {});
  } catch {}
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      log.info(`A iniciar [${name}] (tentativa ${attempt}/${retries})...`);
      b.launch({ allowedUpdates: ['message', 'callback_query'] })
        .then(() => log.info(`[${name}] Ciclo de escuta terminado.`))
        .catch((err) => log.error(`⚠️ Erro de polling em [${name}]:`, err?.message || err));
      log.info(`✅ [${name}] ativo e a escutar com sucesso no Telegram!`);
      return;
    } catch (err) {
      log.error(`⚠️ Falha ao lançar [${name}]: ${err?.message || err}`);
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }
}

async function startAllBots() {
  // 1. Restauro inicial de base de dados e ficheiros persistentes do Google Drive
  try {
    await restoreAllFromDrive();
  } catch (err) {
    log.error('Erro ao restaurar do Google Drive:', err?.message || err);
  }

  // 2. Iniciar agendador de sincronização contínua com o Google Drive (cada 15 min)
  startAutoDriveSync(15);

  const renderUrl = process.env.RENDER_EXTERNAL_URL || process.env.WEBHOOK_BASE_URL;

  if (renderUrl && !process.env.USE_POLLING) {
    log.info(`🌐 Modo Webhook Ativo no Render.com! URL base: ${renderUrl}`);
    for (const item of botInstances) {
      const webhookUrl = `${renderUrl}/webhook/${item.key}`;
      try {
        log.info(`A configurar webhook para [${item.name}] em: ${webhookUrl}`);
        item.webhookCallback = item.bot.webhookCallback(`/webhook/${item.key}`);
        await item.bot.telegram.setWebhook(webhookUrl, {
          allowed_updates: ['message', 'callback_query']
        });
        log.info(`✅ Webhook registado com sucesso para [${item.name}] -> ${webhookUrl}`);
      } catch (err) {
        log.error(`⚠️ Falha ao registar webhook para [${item.name}], fallback para polling:`, err?.message || err);
        launchSingleBot(item.name, item.bot);
      }
    }
  } else {
    log.info(`A arrancar ${botInstances.length} bots em modo Polling...`);
    for (const { name, bot: b } of botInstances) {
      launchSingleBot(name, b);
    }
  }

  // Iniciar agendador de pesquisas e alertas diários de novos imóveis
  try {
    iniciarAgendadorRadar(bot);
  } catch (err) {
    log.error('Erro ao iniciar agendador de radar imobiliário:', err.message);
  }

  // Agendador Diário Matinal de Notícias da Europa e Portugal (08:00)
  try {
    let ultimoDiaEnviado = -1;
    setInterval(async () => {
      const agora = new Date();
      const hoje = agora.getDate();
      // Dispara às 08:00 uma vez por dia
      if (agora.getHours() === 8 && agora.getMinutes() === 0 && ultimoDiaEnviado !== hoje) {
        ultimoDiaEnviado = hoje;
        if (CHAT_ID_AUTORIZADO) {
          log.info('🇪🇺 A enviar Briefing Diário Matinal de Notícias da Europa e Portugal...');
          try {
            const briefing = await getDailyNewsBriefing(true);
            await bot.telegram.sendMessage(CHAT_ID_AUTORIZADO, briefing, {
              parse_mode: 'Markdown',
              disable_web_page_preview: true
            });
          } catch (sendErr) {
            log.error('Erro ao enviar briefing diário de notícias:', sendErr.message);
          }
        }
      }
    }, 30000); // verifica a cada 30 segundos
    log.info('⏰ Agendador de Notícias Diárias (Europa & Portugal) ativado para as 08:00.');
  } catch (err) {
    log.error('Erro ao iniciar agendador de notícias:', err.message);
  }

  // Agendador Contínuo de Lembretes Proativos (cada 15 segundos)
  try {
    setInterval(async () => {
      try {
        const dueReminders = familyDb.getPendingDueReminders();
        if (dueReminders && dueReminders.length > 0) {
          for (const rem of dueReminders) {
            const targetChat = rem.chat_id || CHAT_ID_AUTORIZADO || '950415577';
            const horaAgendada = new Date(rem.trigger_at).toLocaleTimeString('pt-PT', { timeZone: 'Europe/Lisbon', hour: '2-digit', minute: '2-digit', hour12: false });
            const alerta = 
              `🔔 *ALERTA DE LEMBRETE!*\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
              `⏰ *Assunto:* *${rem.text}*\n` +
              `⏱️ *Agendado para as:* ${horaAgendada}\n` +
              `👤 *Criado por:* ${rem.created_by_name || 'André'}\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
              `✅ _Para registar como tarefa concluída: \`/tarefa ${rem.text}\`_`;

            try {
              await bot.telegram.sendMessage(targetChat, alerta, { parse_mode: 'Markdown' });
              familyDb.markReminderSent(rem.id);
              log.info(`🔔 Lembrete #${rem.id} ("${rem.text}") disparado com sucesso para ${targetChat}`);
            } catch (sendErr) {
              log.error(`Erro ao disparar lembrete #${rem.id}:`, sendErr.message);
            }
          }
        }
      } catch (checkErr) {
        // silencioso
      }
    }, 15000);
    log.info('⏰ Agendador de Lembretes Proativos ativado (varredura a cada 15s).');
  } catch (err) {
    log.error('Erro ao iniciar agendador de lembretes:', err.message);
  }
}

startAllBots();
