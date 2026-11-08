// index.js — Bot Orquestrador Telegram & Cockpit de Mini Apps na Nuvem
import 'dotenv/config';
import http from 'http';
import { Telegraf, Markup } from 'telegraf';
import { detectIntent } from './src/router/intentRouter.js';
import { handle as handleDev } from './src/workers/worker_dev.js';
import { handle as handleFrotas } from './src/workers/worker_frotas.js';
import { handle as handleImmo } from './src/workers/worker_immo.js';
import { handle as handleGeral } from './src/workers/worker_geral.js';
import { createLogger } from './src/utils/logger.js';
import { VERCEL_APPS, buildTelegramAppsKeyboard, formatAllVercelAppsMarkdown } from './src/shared/appsCatalog.js';
import { handleFamilyApi } from './src/shared/familyRoutes.js';
import { analyzeImageBuffer, downloadTelegramPhoto } from './src/shared/multimodalVision.js';
import { uploadToCloudinary } from './src/shared/cloudinaryCdn.js';
import { safeExecute } from './src/utils/resilience.js';
import { cleanChatMiddleware } from './src/shared/security.js';
import { existsSync, readFileSync, mkdirSync } from 'fs';
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

// ─── Middleware de Autenticação Partilhado ────────────────────────────────────

const authMiddleware = async (ctx, next) => {
  const chatId = String(ctx.chat?.id || '');
  const userId = String(ctx.from?.id || '');

  if (chatId !== CHAT_ID_AUTORIZADO && userId !== CHAT_ID_AUTORIZADO) {
    log.warn('Acesso não autorizado bloqueado', { chatId, userId });
    await ctx.reply('⛔ Acesso restrito ao proprietário do sistema.');
    return;
  }
  return next();
};

// ─── Teclados Interativos Partilhados ─────────────────────────────────────────

function getMasterKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.webApp('🏡 1. Abrir Mini App Família', VERCEL_APPS.familiar.url)
    ],
    [
      Markup.button.webApp('🚌 2. RotaBus VIP (Web)', VERCEL_APPS.rotabus.url),
      Markup.button.url('📲 Descarregar APK', VERCEL_APPS.rotabus.apkUrl)
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
      Markup.button.callback('☀️ Briefing de Hoje', 'act_briefing')
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
    await ctx.replyWithMarkdown(chunks[i], isLast && extra ? extra : undefined);
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

// ─── Roteador de Intenções do Master ─────────────────────────────────────────

async function rotear(ctx, text) {
  const intent = detectIntent(text);
  log.info(`Roteando para worker: ${intent}`);

  switch (intent) {
    case 'DEV':
      return await safeExecute(() => handleDev(text), 'Dev (Engenharia)', 8000);
    case 'FROTAS':
      return await safeExecute(() => handleFrotas(text), 'Frotas (RotaBus)', 8000);
    case 'IMMO':
      return await safeExecute(() => handleImmo(text), 'Immo (Avaliação)', 8000);
    case 'GERAL':
    default:
      return await safeExecute(() => handleGeral(text), 'Pessoal & Família', 8000);
  }
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

bot.command('briefing', async (ctx) => {
  await ctx.sendChatAction('typing');
  const resp = await safeExecute(() => handleGeral('/briefing'), 'Briefing', 8000);
  await sendReply(ctx, resp, getMasterKeyboard());
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

bot.command('avaliacao', async (ctx) => {
  await ctx.sendChatAction('typing');
  const resp = await safeExecute(() => handleImmo(ctx.message.text), 'ImmoEval', 8000);
  await sendReply(ctx, resp, Markup.inlineKeyboard([
    [Markup.webApp('🏠 Abrir ImmoEval Mini App', VERCEL_APPS.immo.url)]
  ]));
});

bot.command('ajuda', async (ctx) => {
  const msg =
    `📖 *Manual de Comandos Rápidos:*\n\n` +
    `*📱 Mini Apps:*\n` +
    `• \`/apps\` — Catálogo de todas as 9 aplicações\n` +
    `• \`/menu\` — Cockpit interativo com botões\n` +
    `• \`/apk\` — Download da app nativa RotaBus Android\n\n` +
    `*🏡 Família & Pessoal:*\n` +
    `• \`/compras\` — Ver ou gerir lista de compras\n` +
    `• \`/tarefas\` — Tarefas domésticas pendentes\n` +
    `• \`/carolina\` — Escola, faltas, consultas e atividades\n` +
    `• \`/nota TEXTO\` — Guardar apontamento rápido\n` +
    `• \`/briefing\` — Resumo geral do dia com IA\n\n` +
    `*🚛 Frotas & RotaBus:*\n` +
    `• \`/rota ORIGEM para DESTINO\` — Rota otimizada para pesados\n` +
    `• \`/tacografo HORAS\` — Auditoria legal CE 561/2006\n\n` +
    `*🏠 Imobiliário:*\n` +
    `• \`/avaliacao ÁREA ZONA TIPOLOGIA ESTADO\` — Preço/m² e valor de mercado\n\n` +
    `*🖥️ Dev & Cloud:*\n` +
    `• \`/projetos\` — Repositórios recentes no GitHub\n` +
    `• \`/criar_app NOME\` — Scaffold de novo projeto`;

  await sendReply(ctx, msg, getMasterKeyboard());
});

// Ações de Callback dos Botões Inline no Master
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

bot.action('act_frotas', async (ctx) => {
  await ctx.answerCbQuery();
  const resp = await handleFrotas('');
  await sendReply(ctx, resp, Markup.inlineKeyboard([
    [Markup.webApp('🚌 Abrir RotaBus GPS', VERCEL_APPS.rotabus.url), Markup.url('📲 Descarregar APK', VERCEL_APPS.rotabus.apkUrl)],
    [Markup.callback('🚛 Porto ➔ Lisboa', 'frota_porto_lisboa'), Markup.callback('🚛 Amarante ➔ Porto', 'frota_amarante_porto')],
    [Markup.callback('⏱️ Tacógrafo: 4.5h', 'btn_tacho_45'), Markup.callback('⏱️ Tacógrafo: 9.0h', 'btn_tacho_90')]
  ]));
});

bot.action('act_immo', async (ctx) => {
  await ctx.answerCbQuery();
  const resp = await handleImmo('');
  await sendReply(ctx, resp, Markup.inlineKeyboard([
    [Markup.webApp('🏠 Abrir ImmoEval Mini App', VERCEL_APPS.immo.url)],
    [Markup.callback('📍 Amarante T3 (120m²)', 'immo_amarante'), Markup.callback('📍 Felgueiras T2 (85m²)', 'immo_felgueiras')]
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

bot.on('text', async (ctx) => {
  const text = ctx.message.text;
  if (!text || text.trim().length === 0) return;
  log.info('[Master] Mensagem recebida', { from: ctx.from?.first_name, text: text.substring(0, 80) });
  try {
    await ctx.sendChatAction('typing');
    const resposta = await rotear(ctx, text);
    await sendReply(ctx, resposta);
  } catch (err) {
    log.error('Erro ao processar mensagem no Master', err.message);
    await ctx.reply('⚠️ Erro interno. Tenta novamente em instantes.');
  }
});

bot.on('sticker', (ctx) => ctx.reply('😄 Sticker recebido! Fala comigo em texto ou toca no menu de Mini Apps.'));
bot.on('photo', (ctx) => processPhotoWithVision(ctx, TOKEN, 'master'));
bot.on('voice', (ctx) => ctx.reply('🎙️ Mensagem de voz recebida!'));

bot.catch((err, ctx) => {
  log.error('Erro não tratado no Master Bot', err?.message || err);
  ctx?.reply('⚠️ Ocorreu um erro no Master. O bot continua ativo.').catch(() => {});
});

botInstances.push({ name: 'Master (@AndrePinheirobot)', bot });

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
    const resp = await safeExecute(() => handleDev(ctx.message.text), 'Dev (Engenharia)', 8000);
    await sendReply(ctx, resp);
  });

  botDev.catch((err) => log.error('Erro no Worker Dev', err?.message || err));
  botInstances.push({ name: 'Dev (@DesSofBot)', bot: botDev });
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
    const resp = await safeExecute(() => handleFrotas(ctx.message.text), 'Frotas (RotaBus)', 8000);
    await sendReply(ctx, resp);
  });

  botFrotas.catch((err) => log.error('Erro no Worker Frotas', err?.message || err));
  botInstances.push({ name: 'Frotas (@TrasFrotBot)', bot: botFrotas });
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
    await sendReply(ctx, `🏠 *Worker Imobiliário CMVM Ativo na Nuvem!*\n\nAvaliação imobiliária por m² para Amarante e Região Norte.\n\n• \`/avaliacao ÁREA ZONA TIPOLOGIA ESTADO\`\nEx: \`/avaliacao 120 Amarante T3 bom\``, Markup.inlineKeyboard([
      [Markup.button.webApp('🏠 Abrir ImmoEval Mini App', VERCEL_APPS.immo.url)],
      [Markup.button.callback('📍 Amarante T3 (120m²)', 'immo_amarante'), Markup.button.callback('📍 Felgueiras T2 (85m²)', 'immo_felgueiras')]
    ]));
  });

  botImmo.action('immo_amarante', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.sendChatAction('typing');
    const resp = await handleImmo('/avaliacao 120 Amarante T3 bom');
    await sendReply(ctx, resp);
  });

  botImmo.action('immo_felgueiras', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.sendChatAction('typing');
    const resp = await handleImmo('/avaliacao 85 Felgueiras T2 bom');
    await sendReply(ctx, resp);
  });

  botImmo.on('photo', (ctx) => processPhotoWithVision(ctx, IMMO_TOKEN, 'immo'));

  botImmo.on('text', async (ctx) => {
    await ctx.sendChatAction('typing');
    const resp = await safeExecute(() => handleImmo(ctx.message.text), 'Immo (Avaliação)', 8000);
    await sendReply(ctx, resp);
  });

  botImmo.catch((err) => log.error('Erro no Worker Immo', err?.message || err));
  botInstances.push({ name: 'Immo (@ppspppBot)', bot: botImmo });
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
    await sendReply(ctx, `📋 *Assistente Familiar & Produtividade!*\n\nSincronizado diretamente com a tua Mini App no Telegram.\n\n• \`/compras\` — Ver ou gerir compras\n• \`/tarefas\` — Tarefas domésticas e pessoais\n• \`/carolina\` — Escola, faltas e consultas\n• \`/briefing\` — Resumo diário de compromissos`, Markup.inlineKeyboard([
      [Markup.button.webApp('🏡 Abrir Mini App Família', VERCEL_APPS.familiar.url)],
      [Markup.button.callback('🛒 Lista de Compras', 'pessoal_compras'), Markup.button.callback('📋 Tarefas da Casa', 'pessoal_tarefas')],
      [Markup.button.callback('👧 Carolina (Escola/Saúde)', 'pessoal_carolina'), Markup.button.callback('☀️ Briefing do Dia', 'pessoal_briefing')]
    ]));
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

  botPessoal.on('text', async (ctx) => {
    await ctx.sendChatAction('typing');
    const resp = await safeExecute(() => handleGeral(ctx.message.text), 'Pessoal & Família', 8000);
    await sendReply(ctx, resp);
  });

  botPessoal.catch((err) => log.error('Erro no Worker Pessoal', err?.message || err));
  botInstances.push({ name: 'Pessoal (@AndTrarBOT)', bot: botPessoal });
}

// ─── Encerramento Seguro ─────────────────────────────────────────────────────

const shutdown = (signal) => {
  log.info(`A terminar bots (${signal})...`);
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

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Endpoint não encontrado' }));
});

server.listen(PORT, () => {
  log.info(`Servidor HTTP e API REST ativo na porta ${PORT} para Render.com e Mini Apps`);
});

// ─── Arranque Paralelo de Todos os Bots Ativos ─────────────────────────────

async function launchSingleBot(name, b, retries = 5, delayMs = 5000) {
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

function startAllBots() {
  log.info(`A arrancar ${botInstances.length} bots em paralelo com suporte completo a Mini Apps...`);
  for (const { name, bot: b } of botInstances) {
    launchSingleBot(name, b);
  }
}

startAllBots();
