// index.js — Grok Bot (@AndrePinheirobot) | Orquestrador Pessoal, Familiar, Notícias Certificadas & Radar 5 Frentes
import 'dotenv/config';
import http from 'http';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { Telegraf, Markup } from 'telegraf';
import { createLogger } from './src/utils/logger.js';
import { sqliteMasterDb } from './src/shared/sqliteMasterDb.js';
import { routeMessage } from './src/router/masterRouter.js';
import { handle as handleGeral } from './src/workers/worker_geral.js';
import { handle as handleImmo } from './src/workers/worker_immo.js';
import { handle as handleDev, handleStatusCloud } from './src/workers/worker_dev.js';
import {
  handle as handleNutricao,
  getPlanoNutricional,
  getResumoHoje,
  handleProteinaInput,
  handleAguaInput,
  handleCreatina
} from './src/workers/worker_nutricao.js';
import { askAgent } from './src/services/reasoningService.js';
import { VERCEL_APPS, buildTelegramAppsKeyboard, formatAllVercelAppsMarkdown } from './src/shared/appsCatalog.js';
import { handleFamilyApi } from './src/shared/familyRoutes.js';
import { analyzeImageBuffer, downloadTelegramPhoto } from './src/shared/multimodalVision.js';
import { uploadToCloudinary } from './src/shared/cloudinaryCdn.js';
import { transcribeTelegramAudio } from './src/shared/whisperAudio.js';
import { safeExecute, withTypingHeartbeat } from './src/utils/resilience.js';
import { sanitizeTelegramMarkdown } from './src/utils/markdownSanitizer.js';
import {
  authMiddleware,
  cleanChatMiddleware,
  addAuthorizedId,
  removeAuthorizedId,
  listAuthorized
} from './src/shared/security.js';
import { getTvCockpit, searchChannels, formatSearchResults, getXtreamCredentialsMarkdown, getVlcHelpMarkdown } from './src/services/tvService.js';
import { initCloudPersistence, isDriveConfigured, getDriveSyncStatus, backupDatabaseToDrive, startAutoDriveSync } from './src/services/googleDriveService.js';
import { iniciarAgendadorRadar, dispararCicloRadarComAlertas, gerarRelatorioMultiFrenteMarkdown } from './src/services/immoRadarService.js';
import { formatarSitesImobiliariosMarkdown, buildImmoSitesKeyboard } from './src/shared/immoSitesCatalog.js';
import { getDailyNewsBriefing, getRegionalNews, getGovNews } from './src/services/newsService.js';
import { getEmailBriefing, getEmailStatus } from './src/services/emailService.js';

const log = createLogger('Master');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN_MASTER || process.env.TELEGRAM_MASTER_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID_AUTORIZADO = process.env.CHAT_ID_AUTORIZADO || process.env.AUTHORIZED_CHAT_ID || process.env.TELEGRAM_CHAT_ID || '950415577';
const PORT = parseInt(process.env.PORT, 10) || 3000;

if (!TOKEN) {
  log.error('TELEGRAM_BOT_TOKEN_MASTER não definido no .env');
  process.exit(1);
}

try {
  mkdirSync('./logs', { recursive: true });
} catch {}

// ─── Helpers de Envio Telegram ───────────────────────────────────────────────

function splitText(text, maxLen = 4000) {
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

async function sendReply(ctx, text, extra = null) {
  if (!text) return;
  const chunks = splitText(text);
  for (let i = 0; i < chunks.length; i++) {
    const isLast = i === chunks.length - 1;
    const opts = isLast && extra ? extra : undefined;
    const cleanChunk = sanitizeTelegramMarkdown(chunks[i]);
    try {
      await ctx.replyWithMarkdown(cleanChunk, opts);
    } catch (mdErr) {
      log.warn('Markdown parse falhou no Telegram, fallback texto simples:', mdErr?.message);
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

function getMasterKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.webApp('🏡 Família & Carolina', VERCEL_APPS.familiar.url),
      Markup.button.webApp('🏠 ImmoEval CMVM', VERCEL_APPS.immo.url)
    ],
    [
      Markup.button.callback('🛒 Compras', 'act_compras'),
      Markup.button.callback('📋 Tarefas', 'act_tarefas'),
      Markup.button.callback('👧 Carolina', 'act_carolina')
    ],
    [
      Markup.button.callback('🥗 Nutrição & Receitas', 'act_nutri_menu'),
      Markup.button.callback('📡 Radar 5 Frentes', 'act_immo')
    ],
    [
      Markup.button.callback('🗞️ Notícias Oficiais', 'act_noticias'),
      Markup.button.callback('🏘️ Amarante', 'act_noticias_regiao'),
      Markup.button.callback('🏛️ Governo', 'act_governo')
    ],
    [
      Markup.button.callback('☁️ Status Cloud', 'act_status_cloud'),
      Markup.button.callback('📺 TV IPTV', 'act_tv_menu'),
      Markup.button.callback('💾 Drive SQLite', 'act_drive_status')
    ],
    [
      Markup.button.callback('☀️ Briefing Diário', 'act_briefing'),
      Markup.button.callback('🌐 9 Mini Apps Vercel', 'act_all_apps')
    ]
  ]);
}

// ─── Visão Multimodal (Gemini temp = 0.0 + Cloudinary) ────────────────────────

async function processPhotoWithVision(ctx, botToken) {
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
      writeFileSync(path.join(filesDir, `master_${Date.now()}.jpg`), downloaded.buffer);
    } catch {}

    let cdnUrl = '';
    try {
      const up = await uploadToCloudinary(downloaded.buffer, `master_${Date.now()}`);
      if (up && up.url) cdnUrl = up.url;
    } catch {}

    const defaultPrompt =
      caption ||
      'Analisa detalhadamente esta imagem em português de Portugal (temperature 0.0, factual sem invenções). ' +
        'Se for comida/refeição: identifica ingredientes, estima calorias (Kcal), proteína, hidratos e gordura. ' +
        'Se for erro de código ou ecrã: identifica causa e solução. ' +
        'Se for anúncio/produto/recibo: extrai preço, modelo, valores e datas reais visíveis.';

    const analysis = await analyzeImageBuffer(downloaded.buffer, 'image/jpeg', defaultPrompt);
    let reply = `🔍 *Análise Visual Grok Bot (Gemini Multimodal):*\n\n${analysis}`;
    if (cdnUrl) {
      reply += `\n\n☁️ [Ver no Cloudinary CDN](${cdnUrl})`;
    }
    await sendReply(ctx, reply);
  } catch (err) {
    log.error('Erro ao processar imagem:', err?.message || err);
    await ctx.reply(`⚠️ Erro na análise da imagem: ${err?.message || err}`);
  }
}

// ─── Roteador Mestre Central ─────────────────────────────────────────────────

async function rotear(ctx, text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;

  // TV IPTV com teclados interativos nativos
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

  return await safeExecute(() => routeMessage(trimmed, ctx), 'Grok Bot (@AndrePinheirobot)', 25000);
}

// ─── Bot Único Unificado (@AndrePinheirobot) ─────────────────────────────────

const bot = new Telegraf(TOKEN);
bot.use(authMiddleware);
bot.use(cleanChatMiddleware);

bot.start(async (ctx) => {
  const nome = ctx.from?.first_name || 'André';
  const msg =
    `👋 Olá, *${nome}*! Sou o **Grok Bot (@AndrePinheirobot)**.\n\n` +
    `Sistema pessoal 100% Cloud-Native (Render 24/7 + SQLite WAL + Google Drive Write-Through + Cascata IA temp=0.0):\n\n` +
    `• 🏡 *Família & Casa* — Compras, tarefas, Carolina, notas, lembretes, DGEG, Farmácias & Email\n` +
    `• 🗞️ *Notícias Certificadas* — Governo PT, DRE, IPMA, CM Amarante & Imprensa ERC\n` +
    `• 🥗 *Nutrição & Receitas* — Meta 160g proteína + Airfryer & Monsieur Cuisine Connect\n` +
    `• 📡 *Radar 5 Frentes* — Casas CMVM, Carros, Tech, Amazon.es, Apple & \`/vigiar\`\n` +
    `• ☁️ *DevOps Cloud* — GitHub API, compilações APK via GitHub Actions, Vercel & \`/status_cloud\`\n\n` +
    `_(Nota: Gestão operacional de frotas e AppFrota corre isolada em **@zeropaperfrotaBot**)_`;

  await sendReply(ctx, msg, getMasterKeyboard());
});

bot.command(['menu', 'cockpit', 'painel'], async (ctx) => {
  await sendReply(ctx, `🎛️ *Grok Bot — Cockpit Pessoal & Familiar:*`, getMasterKeyboard());
});

bot.command('ajuda', async (ctx) => {
  const msg =
    `📖 *Manual Completo — @AndrePinheirobot (100% Cloud-Native)*\n\n` +
    `*🗞️ Notícias Oficiais Certificadas (Whitelist ERC):*\n` +
    `• \`/noticias\` — Briefing Nacional, Amarante, Governo & IPMA\n` +
    `• \`/noticias_regiao\` | \`/amarante\` — CM Amarante, CIM Tâmega e Sousa, A Verdade, JN\n` +
    `• \`/governo\` | \`/leis\` — Portugal.gov, Diário da República, ANEPC/IP\n\n` +
    `*🥗 Nutrição (160g) & Motor de Receitas:*\n` +
    `• \`/hoje\` | \`/plano\` | \`/proteina 50 : Frango\` | \`/agua 500\` | \`/creatina\`\n` +
    `• \`/receita [prato]\` | \`/receita_airfryer [prato]\` | \`/receita_mcc [prato]\`\n\n` +
    `*📡 Radar de Oportunidades (5 Frentes):*\n` +
    `• \`/casas [zona]\` | \`/moradias_novas\` | \`/avaliacao\` | \`/sites\`\n` +
    `• \`/carros [modelo]\` (Standvirtual, Carmine, Piscapisca, OLX, CustoJusto)\n` +
    `• \`/tech [produto]\` (PCDiga, Globaldata, PCComponentes, Chip7, OLX, Wallapop)\n` +
    `• \`/amazon [produto]\` | \`/ofertas\` | \`/vigiar_amazon\` (Amazon.es + Warehouse)\n` +
    `• \`/apple [modelo]\` | \`/iphone_preco\` | \`/apple_refurb\` | \`/vigiar_apple\` (Novo 3A vs Grau A)\n` +
    `• \`/vigiar <cat> <termo> [preço]\` | \`/meus_alertas\` | \`/radar\` | \`/relatorio\`\n\n` +
    `*🏡 Família, Produtividade & Utilitários:*\n` +
    `• \`/compras\` | \`/tarefas\` | \`/carolina\` | \`/nota\` | \`/lembrete\` | \`/briefing\`\n` +
    `• \`/emails\` | \`/ler_email N\` | \`/farmacias\` | \`/pesquisa\` | \`/combustiveis\` | \`/transito\` | \`/tv\` | \`/apps\`\n\n` +
    `*☁️ DevOps 100% Cloud (Render + GitHub Actions + Drive):*\n` +
    `• \`/status_cloud\` | \`/compilar <repo>\` | \`/projetos\` | \`/criar_app\` | \`/drive\``;

  await sendReply(ctx, msg, getMasterKeyboard());
});

// ─── Comandos Diretos (Notícias, Família, Nutrição, Radar 5 Frentes, Dev, Admin) ─

bot.command(['noticias', 'noticia', 'news'], async (ctx) => {
  await ctx.sendChatAction('typing');
  await sendReply(
    ctx,
    await getDailyNewsBriefing(),
    Markup.inlineKeyboard([
      [Markup.button.callback('🔄 Atualizar', 'act_noticias'), Markup.button.callback('🏘️ Amarante', 'act_noticias_regiao')],
      [Markup.button.callback('🏛️ Governo & Leis', 'act_governo'), Markup.button.callback('🎛️ Cockpit', 'act_main_menu')]
    ])
  );
});

bot.command(['noticias_regiao', 'amarante'], async (ctx) => {
  await ctx.sendChatAction('typing');
  await sendReply(ctx, await getRegionalNews());
});

bot.command(['governo', 'leis'], async (ctx) => {
  await ctx.sendChatAction('typing');
  await sendReply(ctx, await getGovNews());
});

bot.command(['hoje', 'macros', 'resumo', 'nutri_hoje'], async (ctx) => {
  await sendReply(
    ctx,
    getResumoHoje(),
    Markup.inlineKeyboard([
      [Markup.button.callback('💧 +250ml Água', 'nutri_agua_250'), Markup.button.callback('💧 +500ml Água', 'nutri_agua_500')],
      [Markup.button.callback('⚡ Creatina 5g', 'nutri_creatina'), Markup.button.callback('🍗 +30g Prot', 'nutri_add_30')],
      [Markup.button.callback('🥗 Plano 160g', 'act_nutri_plano'), Markup.button.callback('🎛️ Cockpit', 'act_main_menu')]
    ])
  );
});

bot.command(['plano', 'dieta', 'proteina', 'agua', 'creatina', 'receita', 'receita_airfryer', 'receita_mcc'], async (ctx) => {
  await ctx.sendChatAction('typing');
  await sendReply(ctx, await handleNutricao(ctx.message.text, ctx));
});

bot.command(['compras', 'tarefas', 'carolina', 'nota', 'notas', 'lembrete', 'lembretes', 'briefing', 'emails', 'email', 'correio', 'inbox', 'ler_email', 'resumo_email', 'email_status', 'combustiveis', 'gasoleo', 'gasolina', 'transito', 'trajeto', 'farmacias', 'pesquisa', 'procura', 'web'], async (ctx) => {
  await ctx.sendChatAction('typing');
  await sendReply(ctx, await handleGeral(ctx.message.text, ctx));
});

bot.command(['radar', 'pesquisar_imoveis', 'varredura', 'casas', 'moradias_novas', 'moradias', 'avaliacao', 'avaliar', 'sites', 'sites_immo', 'portais', 'relatorio', 'relatorio_imoveis', 'alertas', 'alertas_immo', 'carros', 'tech', 'amazon', 'ofertas', 'apple', 'iphone_preco', 'apple_refurb', 'vigiar', 'vigiar_amazon', 'vigiar_apple', 'meus_alertas'], async (ctx) => {
  await ctx.sendChatAction('typing');
  await sendReply(ctx, await handleImmo(ctx.message.text, ctx));
});

bot.command(['projetos', 'criar_app', 'compilar', 'build', 'status_cloud', 'cloud', 'diagnostico', 'status', 'pc', 'pc_status', 'print', 'screenshot', 'ecra', 'ecrã'], async (ctx) => {
  await ctx.sendChatAction('typing');
  await sendReply(ctx, await handleDev(ctx.message.text, ctx));
});

bot.command(['apps', 'app', 'catalogo', 'vercel'], async (ctx) => {
  await sendReply(ctx, formatAllVercelAppsMarkdown(), buildTelegramAppsKeyboard());
});

bot.command(['apk', 'apks', 'download'], async (ctx) => {
  await sendReply(ctx, await handleDev('/apks', ctx));
});

bot.command(['rota', 'tacografo', 'frota', 'frotas'], async (ctx) => {
  await sendReply(ctx, await routeMessage(ctx.message.text, ctx));
});

bot.command(['tv', 'iptv', 'matchpro_tv', 'vlc'], async (ctx) => {
  const cockpit = getTvCockpit();
  await sendReply(ctx, cockpit.text, cockpit.keyboard);
});

bot.command(['canal', 'canais'], async (ctx) => {
  const q = ctx.message.text.replace(/^\/(canal|canais)\s*/i, '').trim();
  const formatted = formatSearchResults(q || 'Populares', searchChannels(q));
  await sendReply(ctx, formatted.text, formatted.keyboard);
});

bot.command(['drive', 'gdrive', 'backup_drive'], async (ctx) => {
  if (!isDriveConfigured()) {
    return await sendReply(
      ctx,
      `☁️ *Google Drive:* aguarda \`GOOGLE_SERVICE_ACCOUNT_KEY\` ou \`./service-account.json\` para sincronizar \`pessoal_master.db\` e \`autorizados.json\`.`
    );
  }
  await ctx.sendChatAction('upload_document');
  await sendReply(ctx, '⏳ *A sincronizar pessoal_master.db (WAL checkpoint) para o Google Drive...*');
  const res = await backupDatabaseToDrive();
  if (res.success) {
    await sendReply(ctx, `✅ *Backup SQLite WAL concluído!* (${res.timestamp})\n${res.files.map((f) => `• [${f.name}](${f.link || '#'})`).join('\n')}`);
  } else {
    await sendReply(ctx, `⚠️ Erro Drive: ${res.error || res.message}`);
  }
});

bot.command('autorizados', async (ctx) => {
  const data = listAuthorized();
  let msg = `🔒 *Gestão de Segurança (@AndrePinheirobot):*\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `👥 *IDs Autorizados (${data.authorizedUserIds.length}):*\n`;
  data.authorizedUserIds.forEach((id) => {
    msg += `• ID: \`${id}\` — _${data.phoneMapping[id] || 'Registado'}_\n`;
  });
  await sendReply(ctx, msg);
});

bot.command('autorizar', async (ctx) => {
  const args = ctx.message.text.replace(/^\/autorizar\s*/i, '').trim().split(/\s+/);
  const targetId = args[0];
  if (!targetId || !/^\d+$/.test(targetId)) {
    return await sendReply(ctx, '💡 Formato: `/autorizar <ID_TELEGRAM> [telemovel]`');
  }
  addAuthorizedId(targetId, args[1] || 'Autorizado pelo Admin');
  await sendReply(ctx, `✅ ID Telegram \`${targetId}\` autorizado!`);
});

bot.command('bloquear', async (ctx) => {
  const targetId = ctx.message.text.replace(/^\/bloquear\s*/i, '').trim();
  if (!targetId) return await sendReply(ctx, '💡 Formato: `/bloquear <ID_TELEGRAM>`');
  removeAuthorizedId(targetId);
  await sendReply(ctx, `🚫 ID Telegram \`${targetId}\` revogado.`);
});

bot.action('act_status_cloud', async (ctx) => {
  await ctx.answerCbQuery('☁️ A medir estado Cloud...');
  await sendReply(ctx, await handleStatusCloud());
});
bot.action('act_dev', async (ctx) => {
  await ctx.answerCbQuery();
  await sendReply(ctx, await handleDev('/projetos', ctx));
});

// ─── Callbacks Inline ────────────────────────────────────────────────────────

bot.action('act_noticias', async (ctx) => {
  await ctx.answerCbQuery('🗞️ A consultar fontes oficiais...');
  await sendReply(ctx, await getDailyNewsBriefing(true));
});
bot.action('act_noticias_regiao', async (ctx) => {
  await ctx.answerCbQuery('🏘️ Amarante & Tâmega e Sousa...');
  await sendReply(ctx, await getRegionalNews());
});
bot.action('act_governo', async (ctx) => {
  await ctx.answerCbQuery('🏛️ Governo, DRE & IPMA...');
  await sendReply(ctx, await getGovNews());
});
bot.action('act_compras', async (ctx) => {
  await ctx.answerCbQuery();
  await sendReply(ctx, await handleGeral('/compras', ctx), Markup.inlineKeyboard([[Markup.button.callback('🧹 Limpar Concluídas', 'act_compras_limpar'), Markup.button.callback('🎛️ Cockpit', 'act_main_menu')]]));
});
bot.action('act_compras_limpar', async (ctx) => {
  await ctx.answerCbQuery('Lista limpa');
  await sendReply(ctx, await handleGeral('/compras limpar', ctx));
});
bot.action('act_tarefas', async (ctx) => {
  await ctx.answerCbQuery();
  await sendReply(ctx, await handleGeral('/tarefas', ctx));
});
bot.action('act_carolina', async (ctx) => {
  await ctx.answerCbQuery();
  await sendReply(ctx, await handleGeral('/carolina', ctx));
});
bot.action('act_briefing', async (ctx) => {
  await ctx.answerCbQuery();
  await sendReply(ctx, await handleGeral('/briefing', ctx));
});
bot.action('act_nutri_menu', async (ctx) => {
  await ctx.answerCbQuery();
  await sendReply(ctx, getResumoHoje(), Markup.inlineKeyboard([
    [Markup.button.callback('💧 +250ml', 'nutri_agua_250'), Markup.button.callback('💧 +500ml', 'nutri_agua_500'), Markup.button.callback('⚡ Creatina', 'nutri_creatina')],
    [Markup.button.callback('🥗 Plano 160g', 'act_nutri_plano'), Markup.button.callback('🍽️ Receita Airfryer', 'act_nutri_airfryer')],
    [Markup.button.callback('🎛️ Cockpit', 'act_main_menu')]
  ]));
});
bot.action('act_nutri_plano', async (ctx) => {
  await ctx.answerCbQuery();
  await sendReply(ctx, getPlanoNutricional());
});
bot.action('act_nutri_airfryer', async (ctx) => {
  await ctx.answerCbQuery('A gerar receita Airfryer...');
  await sendReply(ctx, await handleNutricao('/receita_airfryer frango batata doce', ctx));
});
bot.action('nutri_agua_250', async (ctx) => {
  await ctx.answerCbQuery('💧 +250ml');
  await sendReply(ctx, handleAguaInput('250'));
});
bot.action('nutri_agua_500', async (ctx) => {
  await ctx.answerCbQuery('💧 +500ml');
  await sendReply(ctx, handleAguaInput('500'));
});
bot.action('nutri_creatina', async (ctx) => {
  await ctx.answerCbQuery('⚡ 5g Creatina');
  await sendReply(ctx, handleCreatina());
});
bot.action('nutri_add_30', async (ctx) => {
  await ctx.answerCbQuery('🍗 +30g Proteína');
  await sendReply(ctx, handleProteinaInput('30 : Snack proteico'));
});
bot.action('act_immo', async (ctx) => {
  await ctx.answerCbQuery();
  await sendReply(ctx, await handleImmo('/menu', ctx), Markup.inlineKeyboard([
    [Markup.button.callback('📡 Varrer 5 Frentes Agora', 'immo_radar_scan'), Markup.button.callback('📊 Relatório Diário', 'immo_daily_report')],
    [Markup.button.callback('🏠 Portais Imob.', 'immo_sites'), Markup.button.callback('🎛️ Cockpit', 'act_main_menu')]
  ]));
});
bot.action('immo_radar_scan', async (ctx) => {
  await ctx.answerCbQuery('📡 A varrer as 5 Frentes...');
  await ctx.sendChatAction('typing');
  const res = await dispararCicloRadarComAlertas(null);
  await sendReply(ctx, `✅ *Varredura 5 Frentes concluída:*\nAlertas novos: ${res.alertasEnviados}\n\n${gerarRelatorioMultiFrenteMarkdown()}`);
});
bot.action('immo_daily_report', async (ctx) => {
  await ctx.answerCbQuery();
  await sendReply(ctx, gerarRelatorioMultiFrenteMarkdown());
});
bot.action('immo_sites', async (ctx) => {
  await ctx.answerCbQuery();
  await sendReply(ctx, formatarSitesImobiliariosMarkdown(), buildImmoSitesKeyboard());
});
bot.action('act_all_apps', async (ctx) => {
  await ctx.answerCbQuery();
  await sendReply(ctx, formatAllVercelAppsMarkdown(), buildTelegramAppsKeyboard());
});
bot.action('act_tv_menu', async (ctx) => {
  await ctx.answerCbQuery();
  const cockpit = getTvCockpit();
  await sendReply(ctx, cockpit.text, cockpit.keyboard);
});
bot.action('act_tv_creds', async (ctx) => {
  await ctx.answerCbQuery();
  await sendReply(ctx, getXtreamCredentialsMarkdown());
});
bot.action('act_tv_help', async (ctx) => {
  await ctx.answerCbQuery();
  await sendReply(ctx, getVlcHelpMarkdown());
});
bot.action('act_tv_download_pt', async (ctx) => {
  await ctx.answerCbQuery('A enviar M3U...');
  const m3uPath = existsSync(path.resolve('./public/portugal.m3u'))
    ? path.resolve('./public/portugal.m3u')
    : 'c:/Users/Surface_Dpc/Desktop/PORTUGAL_COMPLETO.m3u';
  if (existsSync(m3uPath)) {
    await ctx.replyWithDocument({ source: m3uPath, filename: 'PORTUGAL_COMPLETO.m3u' });
  } else {
    await ctx.reply('⚠️ Ficheiro M3U local não encontrado.');
  }
});
bot.action('act_drive_status', async (ctx) => {
  await ctx.answerCbQuery();
  if (!isDriveConfigured()) {
    return await sendReply(ctx, `☁️ *Google Drive:* ⚪ Sem credenciais configuradas.`);
  }
  const res = await backupDatabaseToDrive();
  await sendReply(ctx, res.success ? '☁️ *Google Drive:* 🟢 Backup WAL concluído!' : `⚠️ Erro Drive: ${res.error || res.message}`);
});
bot.action('act_main_menu', async (ctx) => {
  await ctx.answerCbQuery();
  await sendReply(ctx, `🎛️ *Grok Bot — Cockpit Pessoal:*`, getMasterKeyboard());
});

// ─── Mensagens Naturais, Fotos, Voz (Whisper LPU) ───────────────────────────

bot.on('text', async (ctx) => {
  const text = ctx.message.text;
  if (!text || text.trim().length === 0) return;
  try {
    const resposta = await withTypingHeartbeat(ctx, () => rotear(ctx, text));
    if (resposta) {
      await sendReply(ctx, resposta);
    }
  } catch (err) {
    log.error('Erro ao processar texto:', err.message);
    await ctx.reply('⚠️ Erro interno. Tenta novamente.');
  }
});

bot.on('sticker', (ctx) => ctx.reply('😄 Sticker recebido!'));
bot.on('photo', (ctx) => processPhotoWithVision(ctx, TOKEN));

const handleMasterVoice = async (ctx) => {
  try {
    await ctx.sendChatAction('typing');
    const result = await transcribeTelegramAudio(ctx);
    if (!result || !result.text) {
      return await ctx.reply('🎙️ Não foi possível reconhecer o áudio.');
    }
    await ctx.reply(`🎙️ _"${result.text}"_`, { parse_mode: 'Markdown' }).catch(() => {});
    const resposta = await withTypingHeartbeat(ctx, () => rotear(ctx, result.text));
    if (resposta) await sendReply(ctx, resposta);
  } catch (err) {
    log.error('Erro no áudio:', err.message);
    await ctx.reply('⚠️ Erro ao processar nota de voz.');
  }
};

bot.on('voice', handleMasterVoice);
bot.on('audio', handleMasterVoice);

bot.catch((err, ctx) => {
  log.error('Erro não tratado no Grok Bot:', err?.message || err);
  ctx?.reply('⚠️ Ocorreu um erro. O bot continua operacional.').catch(() => {});
});

// ─── Servidor HTTP & Webhook Único (/webhook/master) ─────────────────────────

let masterWebhookCallback = null;

const server = http.createServer((req, res) => {
  const urlPath = (req.url || '/').split('?')[0];

  if (urlPath === '/webapp' || urlPath === '/mini-app' || urlPath === '/app' || (urlPath === '/' && req.headers.accept?.includes('text/html'))) {
    const indexPath = path.resolve('./public/index.html');
    if (existsSync(indexPath)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(readFileSync(indexPath));
      return;
    }
  }

  if (urlPath === '/health' || urlPath === '/') {
    const dbStats = sqliteMasterDb.getStats();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'ok',
        service: 'telegram-master-bot',
        bot: '@AndrePinheirobot',
        webhook: '/webhook/master',
        architecture: '100%-cloud-native-personal',
        miniApps: Object.keys(VERCEL_APPS).length,
        sqliteTables: Object.keys(dbStats.tables).length,
        driveSync: getDriveSyncStatus(),
        uptime: process.uptime()
      })
    );
    return;
  }

  if (urlPath === '/api/apps') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(VERCEL_APPS));
    return;
  }

  if (urlPath.startsWith('/api/family')) {
    if (handleFamilyApi(req, res, urlPath, req.method)) return;
  }

  if (urlPath === '/portugal.m3u' || urlPath === '/api/portugal.m3u') {
    const ptM3u = existsSync(path.resolve('./public/portugal.m3u'))
      ? path.resolve('./public/portugal.m3u')
      : 'c:/Users/Surface_Dpc/Desktop/PORTUGAL_COMPLETO.m3u';
    if (existsSync(ptM3u)) {
      res.writeHead(200, { 'Content-Type': 'audio/x-mpegurl; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      res.end(readFileSync(ptM3u));
      return;
    }
  }

  if (urlPath === '/webhook/master' && masterWebhookCallback) {
    return masterWebhookCallback(req, res);
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Endpoint não encontrado' }));
});

// ─── Arranque & Agendadores Europe/Lisbon ────────────────────────────────────

function getLisbonClock() {
  const now = new Date();
  const [hh, mm] = new Intl.DateTimeFormat('pt-PT', {
    timeZone: 'Europe/Lisbon',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
    .format(now)
    .split(':')
    .map((n) => parseInt(n, 10));
  return {
    hour: hh,
    minute: mm,
    dayKey: now.toLocaleDateString('pt-PT', { timeZone: 'Europe/Lisbon' })
  };
}

let isShuttingDown = false;

async function handleGracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  log.info(`🛑 Sinal ${signal} recebido. A executar backup final Google Drive antes de encerrar...`);

  try {
    sqliteMasterDb.checkpoint();
    if (isDriveConfigured()) {
      await Promise.race([
        backupDatabaseToDrive(),
        new Promise((resolve) => setTimeout(resolve, 8000))
      ]);
    }
  } catch (err) {
    log.error('Erro no backup final de shutdown:', err.message);
  }

  try {
    bot.stop(signal);
  } catch {}
  try {
    sqliteMasterDb.close();
  } catch {}
  server.close(() => {
    log.info('✅ Encerramento gracioso concluído.');
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 2000).unref();
}

process.once('SIGTERM', () => handleGracefulShutdown('SIGTERM'));
process.once('SIGINT', () => handleGracefulShutdown('SIGINT'));

async function startMasterBot() {
  // 1. Boot Restore Obrigatório ANTES de abrir SQLite ou HTTP :3000
  try {
    await initCloudPersistence();
  } catch (err) {
    log.error('Erro no Boot Restore Drive:', err.message);
  }

  sqliteMasterDb.getDb();

  // 2. Iniciar servidor HTTP e Keep-Alive 10m
  server.listen(PORT, () => {
    log.info(`Servidor HTTP 100% Cloud-Native ativo na porta ${PORT} (@AndrePinheirobot | /webhook/master)`);
    const keepAliveUrl = process.env.RENDER_EXTERNAL_URL || 'https://telegram-master-bot-0h2h.onrender.com';
    if (process.env.RENDER || process.env.NODE_ENV === 'production' || process.env.RENDER_EXTERNAL_URL) {
      setInterval(() => {
        fetch(`${keepAliveUrl.replace(/\/$/, '')}/health`).catch(() => {});
      }, 10 * 60 * 1000).unref();
      log.info(`📡 Keep-Alive Render ativo: ${keepAliveUrl}/health a cada 10 min.`);
    }
  });

  startAutoDriveSync(15);

  const renderUrl = process.env.RENDER_EXTERNAL_URL || process.env.WEBHOOK_BASE_URL;
  if (renderUrl && process.env.USE_POLLING !== 'true') {
    const webhookUrl = `${renderUrl.replace(/\/$/, '')}/webhook/master`;
    try {
      masterWebhookCallback = bot.webhookCallback('/webhook/master');
      await bot.telegram.setWebhook(webhookUrl, { allowed_updates: ['message', 'callback_query'] });
      log.info(`✅ Webhook único registado: ${webhookUrl}`);
    } catch (err) {
      log.error(`Falha ao configurar webhook, fallback polling:`, err.message);
      await bot.telegram.deleteWebhook({ drop_pending_updates: false }).catch(() => {});
      bot.launch({ allowedUpdates: ['message', 'callback_query'] }).catch(() => {});
    }
  } else {
    await bot.telegram.deleteWebhook({ drop_pending_updates: false }).catch(() => {});
    bot.launch({ allowedUpdates: ['message', 'callback_query'] }).catch((err) => log.error('Erro polling:', err.message));
    log.info('✅ @AndrePinheirobot ativo em modo Polling local!');
  }

  // Agendador Multi-Frente 5 Frentes (08h30 + 4h em 4h 08h-22h Lisboa)
  iniciarAgendadorRadar(bot);

  // Agendador Briefing Matinal às 08h00 Europe/Lisbon (Notícias Certificadas + Emails)
  let lastNewsDay = null;
  setInterval(async () => {
    const { hour, minute, dayKey } = getLisbonClock();
    if (hour === 8 && minute === 0 && lastNewsDay !== dayKey) {
      lastNewsDay = dayKey;
      try {
        const newsBriefing = await getDailyNewsBriefing(true);
        let fullBriefing = newsBriefing;
        if (getEmailStatus().configured) {
          const emailBriefing = await getEmailBriefing(5).catch(() => null);
          if (emailBriefing) {
            fullBriefing += `\n\n━━━━━━━━━━━━━━━━━━\n${emailBriefing}`;
          }
        }
        await bot.telegram.sendMessage(CHAT_ID_AUTORIZADO, fullBriefing.slice(0, 4000), {
          parse_mode: 'Markdown',
          disable_web_page_preview: true
        }).catch(async () => {
          await bot.telegram.sendMessage(CHAT_ID_AUTORIZADO, fullBriefing.slice(0, 4000).replace(/[*_`]/g, ''), {
            disable_web_page_preview: true
          }).catch(() => {});
        });
      } catch (err) {
        log.error('Erro briefing matinal 08:00:', err.message);
      }
    }
  }, 30000).unref();

  // Agendador Lembretes Proativos a cada 15 segundos
  setInterval(async () => {
    try {
      const due = sqliteMasterDb.getPendingDueReminders();
      for (const rem of due) {
        const target = rem.chat_id || CHAT_ID_AUTORIZADO;
        const hora = new Date(rem.trigger_at).toLocaleTimeString('pt-PT', { timeZone: 'Europe/Lisbon', hour: '2-digit', minute: '2-digit', hour12: false });
        const alerta =
          `🔔 *ALERTA DE LEMBRETE!*\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `⏰ *Assunto:* *${rem.text}*\n` +
          `⏱️ *Agendado:* ${hora} (${rem.created_by_name || 'André'})`;
        await bot.telegram.sendMessage(target, alerta, { parse_mode: 'Markdown' }).catch(async () => {
          await bot.telegram.sendMessage(target, alerta.replace(/[*_`]/g, '')).catch(() => {});
        });
        sqliteMasterDb.markReminderSent(rem.id);
      }
    } catch {}
  }, 15000).unref();
}

startMasterBot();
