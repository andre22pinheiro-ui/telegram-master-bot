// src/bot/legacyBridges.js — Ponte de Compatibilidade Legacy & Upgrade Sem Conflitos para @AndrePinheirobot
import { Telegraf, Markup } from 'telegraf';
import { createLogger } from '../utils/logger.js';
import { recordExecutionError } from '../shared/selfRefineEngine.js';
import { FLEET_REDIRECT_MSG, detectIntent } from '../router/masterRouter.js';
import { VERCEL_APPS, buildTelegramAppsKeyboard, formatAllVercelAppsMarkdown } from '../shared/appsCatalog.js';
import { formatarSitesImobiliariosMarkdown, buildImmoSitesKeyboard } from '../shared/immoSitesCatalog.js';

const log = createLogger('LegacyBridges');

export const LEGACY_WEBHOOK_KEYS = ['dev', 'immo', 'pessoal', 'nutricao', 'frotas'];

export const LEGACY_BRIDGE_SPECS = [
  {
    key: 'dev',
    handle: '@DesSofBot',
    name: 'Dev (@DesSofBot)',
    mode: 'dev',
    tokenEnvKeys: ['TELEGRAM_DEV_TOKEN', 'TELEGRAM_BOT_TOKEN_DEV', 'DEV_TOKEN']
  },
  {
    key: 'immo',
    handle: '@ppspppBot',
    name: 'Immo (@ppspppBot)',
    mode: 'immo',
    tokenEnvKeys: ['TELEGRAM_IMMO_TOKEN', 'TELEGRAM_BOT_TOKEN_IMMO', 'IMMO_TOKEN']
  },
  {
    key: 'pessoal',
    handle: '@AndTrarBOT',
    name: 'Pessoal (@AndTrarBOT)',
    mode: 'geral',
    tokenEnvKeys: ['TELEGRAM_PESSOAL_TOKEN', 'TELEGRAM_BOT_TOKEN_PESSOAL', 'PESSOAL_TOKEN']
  },
  {
    key: 'nutricao',
    handle: '@Nutriainbot',
    name: 'Nutrição (@Nutriainbot)',
    mode: 'nutricao',
    tokenEnvKeys: ['TELEGRAM_NUTRICAO_TOKEN', 'TELEGRAM_BOT_TOKEN_NUTRICAO']
  },
  {
    key: 'frotas',
    handle: '@TrasFrotBot',
    name: 'Frotas Redirect (@TrasFrotBot)',
    mode: 'fleet_redirect',
    tokenEnvKeys: ['TELEGRAM_FROTAS_TOKEN', 'TELEGRAM_BOT_TOKEN_FROTAS', 'FROTAS_TOKEN']
  }
];

export const LEGACY_FLEET_ACTIONS = [
  'act_frotas',
  'act_frota_status',
  'frota_porto_lisboa',
  'frota_amarante_porto',
  'btn_tacho_45',
  'btn_tacho_90'
];

export function resolveToken(env = process.env, keys = []) {
  for (const k of keys) {
    const val = env?.[k];
    if (val && String(val).trim()) return String(val).trim();
  }
  return null;
}

export function getLegacyBridgeConfigs(env = process.env) {
  return LEGACY_BRIDGE_SPECS.map((spec) => ({
    ...spec,
    token: resolveToken(env, spec.tokenEnvKeys),
    webhookPath: `/webhook/${spec.key}`
  }));
}

export function buildFleetRedirectKeyboard(includeCockpit = true) {
  const rows = [
    [Markup.button.url('🚛 Abrir @zeropaperfrotaBot', 'https://t.me/zeropaperfrotaBot')],
    [
      Markup.button.webApp('🚛 AppFrota Web', VERCEL_APPS.appfrota.url),
      Markup.button.webApp('🚌 RotaBus GPS', VERCEL_APPS.rotabus.url)
    ]
  ];
  if (includeCockpit) {
    rows.push([Markup.button.callback('🎛️ Cockpit Pessoal', 'act_main_menu')]);
  }
  return Markup.inlineKeyboard(rows);
}

/**
 * Regista comandos de compatibilidade e callbacks legados no bot principal (@AndrePinheirobot).
 * Preserva isolamento absoluto de frotas (botões de frota redirecionam para @zeropaperfrotaBot).
 */
export function registerMasterBackCompatHandlers(targetBot, deps) {
  const { sendReply, handleImmo, getPlanoNutricional, getResumoHoje, routeMessage } = deps;

  targetBot.action('immo_amarante', async (ctx) => {
    await ctx.answerCbQuery('A avaliar T3 Amarante...');
    await ctx.sendChatAction('typing');
    await sendReply(ctx, await handleImmo('/avaliacao 120 Amarante T3 bom', ctx));
  });

  targetBot.action('immo_felgueiras', async (ctx) => {
    await ctx.answerCbQuery('A avaliar T2 Felgueiras...');
    await ctx.sendChatAction('typing');
    await sendReply(ctx, await handleImmo('/avaliacao 85 Felgueiras T2 bom', ctx));
  });

  targetBot.action('immo_alertas_status', async (ctx) => {
    await ctx.answerCbQuery();
    await sendReply(
      ctx,
      await handleImmo('/alertas', ctx),
      Markup.inlineKeyboard([
        [Markup.button.callback('📡 Executar Varredura Agora', 'immo_radar_scan')],
        [Markup.button.callback('🎛️ Cockpit', 'act_main_menu')]
      ])
    );
  });

  targetBot.action('nutri_plano', async (ctx) => {
    await ctx.answerCbQuery();
    await sendReply(ctx, getPlanoNutricional());
  });

  targetBot.action('nutri_hoje', async (ctx) => {
    await ctx.answerCbQuery();
    await sendReply(ctx, getResumoHoje());
  });

  for (const actionId of LEGACY_FLEET_ACTIONS) {
    targetBot.action(actionId, async (ctx) => {
      await ctx.answerCbQuery('Domínio isolado em @zeropaperfrotaBot');
      await sendReply(ctx, FLEET_REDIRECT_MSG, buildFleetRedirectKeyboard(true));
    });
  }

  targetBot.command(['apps_frota', 'rotabus', 'appfrota'], async (ctx) => {
    await sendReply(ctx, await routeMessage('/frota', ctx), buildFleetRedirectKeyboard(true));
  });
}

function attachTextVoiceAndPhoto(targetBot, { mode, token, deps }) {
  const { safeExecute, withTypingHeartbeat, sendReply, processPhotoWithVision, transcribeTelegramAudio, routeMessage, handleDev, handleImmo, handleGeral, handleNutricao } = deps;

  const dispatchInput = async (ctx, text) => {
    const clean = String(text || '').trim();
    if (!clean) return null;

    // Respeita sempre a barreira rígida de isolamento frota sem custo de LLM antes do worker
    if (detectIntent(clean) === 'FROTA_REDIRECT') return FLEET_REDIRECT_MSG;

    if (mode === 'dev') return await safeExecute(() => handleDev(clean, ctx), 'Dev (@DesSofBot)', 25000);
    if (mode === 'immo') return await safeExecute(() => handleImmo(clean, ctx), 'Immo (@ppspppBot)', 25000);
    if (mode === 'geral') return await safeExecute(() => handleGeral(clean, ctx), 'Pessoal (@AndTrarBOT)', 25000);
    if (mode === 'nutricao') return await safeExecute(() => handleNutricao(clean, ctx), 'Nutrição (@Nutriainbot)', 25000);
    return await safeExecute(() => routeMessage(clean, ctx), `Bridge(${mode})`, 25000);
  };

  targetBot.on('photo', (ctx) => processPhotoWithVision(ctx, token));

  targetBot.on('text', async (ctx) => {
    const text = ctx.message?.text;
    if (!text || !text.trim()) return;
    const resp = await withTypingHeartbeat(ctx, () => dispatchInput(ctx, text));
    if (resp === FLEET_REDIRECT_MSG) {
      return await sendReply(ctx, resp, buildFleetRedirectKeyboard(false));
    }
    if (resp) await sendReply(ctx, resp);
  });

  targetBot.on(['voice', 'audio'], async (ctx) => {
    try {
      await ctx.sendChatAction('typing');
      const result = await transcribeTelegramAudio(ctx);
      if (!result?.text) return await ctx.reply('🎙️ Não foi possível reconhecer o áudio.');
      await ctx.reply(`🎙️ _"${result.text}"_`, { parse_mode: 'Markdown' }).catch(() => {});
      const resp = await withTypingHeartbeat(ctx, () => dispatchInput(ctx, result.text));
      if (resp === FLEET_REDIRECT_MSG) {
        return await sendReply(ctx, resp, buildFleetRedirectKeyboard(false));
      }
      if (resp) await sendReply(ctx, resp);
    } catch (err) {
      log.error(`Erro no áudio bridge [${mode}]:`, err.message);
    }
  });
}

function wireLegacySpecificBot(targetBot, cfg, deps) {
  const { sendReply, handleDev, handleImmo, handleGeral, handleNutricao, handleStatusCloud, getPlanoNutricional, getResumoHoje, handleAguaInput, handleCreatina, handleProteinaInput, safeExecute } = deps;

  if (cfg.mode === 'fleet_redirect') {
    const sendFleetRedirect = async (ctx) => {
      if (ctx.callbackQuery) await ctx.answerCbQuery('Migrou para @zeropaperfrotaBot').catch(() => {});
      await sendReply(
        ctx,
        `🔄 *Bot Atualizado para Arquitetura Cloud-Native Isolada!*\n\n${FLEET_REDIRECT_MSG}`,
        buildFleetRedirectKeyboard(false)
      );
    };
    targetBot.start(sendFleetRedirect);
    targetBot.on('callback_query', sendFleetRedirect);
    targetBot.on(['text', 'photo', 'voice', 'audio'], sendFleetRedirect);
    return;
  }

  if (cfg.mode === 'dev') {
    targetBot.start((ctx) =>
      sendReply(
        ctx,
        `💻 *Worker Dev & Cloud (@DesSofBot -> Cloud-Native)!*\n\nMigrado para o motor unificado \`@AndrePinheirobot\` (GitHub Actions, Vercel, Render & Drive):\n\n• \`/projetos\` — Repositórios GitHub\n• \`/apps\` — Catálogo 9 Mini Apps\n• \`/apks\` — APKs compilados\n• \`/status_cloud\` — Telemetria Cloud`,
        Markup.inlineKeyboard([
          [Markup.button.webApp('💻 Abrir Scaffold Bot', VERCEL_APPS.scaffold.url)],
          [Markup.button.callback('📂 Repositórios', 'dev_repos'), Markup.button.callback('📲 APKs', 'dev_apks')],
          [Markup.button.url('🎛️ Cockpit @AndrePinheirobot', 'https://t.me/AndrePinheirobot')]
        ])
      )
    );
    targetBot.command(['projetos', 'repos', 'compilar', 'build', 'status_cloud', 'status_nuvem', 'cloud'], async (ctx) => {
      await ctx.sendChatAction('typing');
      const isCloudStatus = /^\/(status_cloud|status_nuvem|cloud)\b/i.test(ctx.message.text);
      const out = isCloudStatus ? await handleStatusCloud() : await handleDev(ctx.message.text, ctx);
      await sendReply(ctx, out);
    });
    targetBot.command(['apps', 'catalogo'], (ctx) => sendReply(ctx, formatAllVercelAppsMarkdown(), buildTelegramAppsKeyboard()));
    targetBot.command(['apks', 'apk'], async (ctx) => sendReply(ctx, await handleDev('/apks', ctx)));
    targetBot.action('dev_repos', async (ctx) => {
      await ctx.answerCbQuery();
      await sendReply(ctx, await handleDev('/projetos', ctx));
    });
    targetBot.action('dev_apks', async (ctx) => {
      await ctx.answerCbQuery();
      await sendReply(ctx, await handleDev('/apks', ctx));
    });
  } else if (cfg.mode === 'immo') {
    targetBot.start((ctx) =>
      sendReply(
        ctx,
        `🏠 *Worker Immo & Radar 5 Frentes (@ppspppBot)!*\n\nLigado ao SQLite WAL + Radar CMVM + Carros + Tech + Amazon + Apple.`,
        Markup.inlineKeyboard([
          [Markup.button.webApp('🏠 ImmoEval Mini App', VERCEL_APPS.immo.url)],
          [Markup.button.callback('📡 Radar Agora', 'immo_radar_scan'), Markup.button.callback('📊 Relatório Diário', 'immo_daily_report')],
          [Markup.button.callback('🌐 12 Portais', 'immo_sites'), Markup.button.callback('🔔 Alertas', 'immo_alertas_status')],
          [Markup.button.callback('📍 Amarante T3 (120m²)', 'immo_amarante'), Markup.button.callback('📍 Felgueiras T2 (85m²)', 'immo_felgueiras')]
        ])
      )
    );
    targetBot.command(['radar', 'pesquisa', 'pesquisar', 'pesquisar_imoveis', 'varredura'], async (ctx) => {
      await ctx.sendChatAction('typing');
      await sendReply(ctx, await safeExecute(() => handleImmo('/radar', ctx), 'Immo Radar', 25000));
    });
    targetBot.command(['relatorio', 'relatorio_imoveis', 'resumo', 'casas', 'moradias_novas', 'avaliacao', 'carros', 'tech', 'amazon', 'apple', 'vigiar'], async (ctx) => {
      await ctx.sendChatAction('typing');
      await sendReply(ctx, await safeExecute(() => handleImmo(ctx.message.text, ctx), 'Immo', 25000));
    });
    targetBot.command(['sites', 'portais'], (ctx) => sendReply(ctx, formatarSitesImobiliariosMarkdown(), buildImmoSitesKeyboard()));
    targetBot.command(['alertas', 'agenda', 'meus_alertas'], async (ctx) => sendReply(ctx, await handleImmo('/alertas', ctx)));
    targetBot.action('immo_radar_scan', async (ctx) => {
      await ctx.answerCbQuery('📡 A pesquisar...');
      await sendReply(ctx, await safeExecute(() => handleImmo('/radar', ctx), 'Immo Radar', 25000));
    });
    targetBot.action('immo_daily_report', async (ctx) => {
      await ctx.answerCbQuery();
      await sendReply(ctx, await safeExecute(() => handleImmo('/relatorio', ctx), 'Immo Relatório', 25000));
    });
    targetBot.action('immo_sites', async (ctx) => {
      await ctx.answerCbQuery();
      await sendReply(ctx, formatarSitesImobiliariosMarkdown(), buildImmoSitesKeyboard());
    });
    registerMasterBackCompatHandlers(targetBot, deps);
  } else if (cfg.mode === 'geral') {
    targetBot.start((ctx) =>
      sendReply(
        ctx,
        `📋 *Assistente Pessoal & Familiar (@AndTrarBOT)!*\n\nLigado ao SQLite WAL & Email IMAP do \`@AndrePinheirobot\`.`,
        Markup.inlineKeyboard([
          [Markup.button.webApp('🏡 Abrir Mini App Família', VERCEL_APPS.familiar.url)],
          [Markup.button.callback('📧 Emails', 'pessoal_emails'), Markup.button.callback('⛽ Combustíveis', 'pessoal_combustiveis')],
          [Markup.button.callback('🛒 Compras', 'pessoal_compras'), Markup.button.callback('📋 Tarefas', 'pessoal_tarefas')],
          [Markup.button.callback('👧 Carolina', 'pessoal_carolina'), Markup.button.callback('☀️ Briefing', 'pessoal_briefing')]
        ])
      )
    );
    targetBot.command(['emails', 'email', 'correio', 'inbox', 'ler_email', 'resumo_email', 'email_status', 'compras', 'tarefas', 'carolina', 'nota', 'notas', 'lembrete', 'briefing', 'combustiveis', 'transito', 'farmacias', 'pesquisa', 'noticias', 'europa', 'amarante', 'governo'], async (ctx) => {
      await ctx.sendChatAction('typing');
      await sendReply(ctx, await safeExecute(() => handleGeral(ctx.message.text, ctx), 'Pessoal', 20000));
    });
    targetBot.command('moradias_novas', async (ctx) => sendReply(ctx, await deps.handleImmo('/moradias_novas', ctx)));
    const pessoais = { pessoal_emails: '/emails', pessoal_combustiveis: '/combustiveis', pessoal_compras: '/compras', pessoal_tarefas: '/tarefas', pessoal_carolina: '/carolina', pessoal_briefing: '/briefing' };
    for (const [act, cmd] of Object.entries(pessoais)) {
      targetBot.action(act, async (ctx) => {
        await ctx.answerCbQuery();
        await sendReply(ctx, await safeExecute(() => handleGeral(cmd, ctx), act, 20000));
      });
    }
  } else if (cfg.mode === 'nutricao') {
    targetBot.start((ctx) =>
      sendReply(
        ctx,
        `🥗 *Nutrição & Meta 160g Proteína (@Nutriainbot)!*\n\nLigado ao SQLite WAL do \`@AndrePinheirobot\` (+ receitas Airfryer & Monsieur Cuisine).`,
        Markup.inlineKeyboard([
          [Markup.button.callback('📋 Plano Alimentar', 'nutri_plano'), Markup.button.callback('📊 Progresso Hoje', 'nutri_hoje')],
          [Markup.button.callback('💧 +250ml Água', 'nutri_agua_250'), Markup.button.callback('💧 +500ml Água', 'nutri_agua_500')],
          [Markup.button.callback('⚡ Creatina', 'nutri_creatina'), Markup.button.callback('🍗 +30g Proteína', 'nutri_add_30')],
          [Markup.button.webApp('🏡 Abrir Mini App Família', VERCEL_APPS.familiar.url)]
        ])
      )
    );
    targetBot.command(['plano', 'dieta', 'receita', 'receita_airfryer', 'receita_mcc'], async (ctx) => {
      if (/^\/(plano|dieta)\b/i.test(ctx.message.text)) {
        return await sendReply(ctx, getPlanoNutricional());
      }
      await ctx.sendChatAction('typing');
      await sendReply(ctx, await handleNutricao(ctx.message.text, ctx));
    });
    targetBot.command(['hoje', 'macros', 'resumo', 'status'], (ctx) => sendReply(ctx, getResumoHoje()));
    targetBot.command('proteina', (ctx) => sendReply(ctx, handleProteinaInput(ctx.message.text.replace(/^\/proteina\s*/i, '').trim())));
    targetBot.command('agua', (ctx) => sendReply(ctx, handleAguaInput(ctx.message.text.replace(/^\/agua\s*/i, '').trim())));
    targetBot.command('creatina', (ctx) => sendReply(ctx, handleCreatina()));
    targetBot.action('nutri_plano', async (ctx) => { await ctx.answerCbQuery(); await sendReply(ctx, getPlanoNutricional()); });
    targetBot.action('nutri_hoje', async (ctx) => { await ctx.answerCbQuery(); await sendReply(ctx, getResumoHoje()); });
    targetBot.action('nutri_agua_250', async (ctx) => { await ctx.answerCbQuery('💧 +250ml!'); await sendReply(ctx, handleAguaInput('250')); });
    targetBot.action('nutri_agua_500', async (ctx) => { await ctx.answerCbQuery('💧 +500ml!'); await sendReply(ctx, handleAguaInput('500')); });
    targetBot.action('nutri_creatina', async (ctx) => { await ctx.answerCbQuery('⚡ Creatina 5g!'); await sendReply(ctx, handleCreatina()); });
    targetBot.action('nutri_add_30', async (ctx) => { await ctx.answerCbQuery('🍗 +30g Proteína!'); await sendReply(ctx, handleProteinaInput('30 : Snack/Refeição Proteica')); });
  }

  attachTextVoiceAndPhoto(targetBot, { mode: cfg.mode, token: cfg.token, deps });
}

/**
 * Instancia todas as pontes legacy cujo token exista no ambiente.
 * Bots secundários operam sobre o mesmo motor Cloud-Native, mantendo isolamento total de frota.
 */
export function createLegacyBridgeBots(deps, env = process.env) {
  const { authMiddleware, cleanChatMiddleware } = deps;
  const instances = [];

  for (const cfg of getLegacyBridgeConfigs(env)) {
    if (!cfg.token) continue;
    const bridgeBot = new Telegraf(cfg.token);
    bridgeBot.use(authMiddleware);
    bridgeBot.use(cleanChatMiddleware);
    wireLegacySpecificBot(bridgeBot, cfg, deps);
    bridgeBot.catch((err) => {
      log.error(`Erro no Bridge [${cfg.name}]:`, err?.message || err);
      try { recordExecutionError({ serviceName: `bridge_${cfg.key}`, error: err }); } catch {}
    });
    instances.push({ ...cfg, bot: bridgeBot });
  }

  return instances;
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Monta transporte Webhook (com retry em 429 e sem fallback destrutivo na nuvem) ou Polling local.
 */
export async function mountBotTransport({
  name,
  targetBot,
  webhookPath,
  webhookCallbacks,
  renderUrl,
  usePolling = process.env.USE_POLLING === 'true',
  isCloudEnv = Boolean(process.env.RENDER),
  sleepFn = defaultSleep
}) {
  if (renderUrl && !usePolling) {
    const webhookUrl = `${renderUrl.replace(/\/$/, '')}${webhookPath}`;
    const rawCallback = targetBot.webhookCallback(webhookPath);
    webhookCallbacks.set(webhookPath, (req, res) =>
      Promise.resolve(rawCallback(req, res)).catch((err) => {
        log.error(`Erro não tratado no webhook [${name}]:`, err?.message || err);
        try { recordExecutionError({ serviceName: `webhook_${name}`, error: err, context: { webhookPath } }); } catch {}
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'Webhook processing error' }));
        }
      })
    );

    if (!targetBot.botInfo && typeof targetBot.telegram.getMe === 'function') {
      try {
        targetBot.botInfo = await targetBot.telegram.getMe();
      } catch (err) {
        log.warn(`Aviso getMe [${name}]: ${err?.message || err}`);
      }
    }

    try {
      const info = await targetBot.telegram.getWebhookInfo().catch(() => null);
      if (info?.url === webhookUrl) {
        log.info(`✅ Webhook já ativo [${name}]: ${webhookUrl}`);
        return { mode: 'webhook', reused: true, webhookUrl };
      }
    } catch {}

    let lastErr = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await targetBot.telegram.setWebhook(webhookUrl, { allowed_updates: ['message', 'callback_query'] });
        log.info(`✅ Webhook registado [${name}]: ${webhookUrl}`);
        return { mode: 'webhook', reused: false, webhookUrl, attempts: attempt };
      } catch (err) {
        lastErr = err;
        const retryAfterSec = Number(err?.response?.parameters?.retry_after || 0);
        const waitMs = Math.min(Math.max(retryAfterSec || attempt, 1), 10) * 1000;
        log.warn(`Tentativa ${attempt}/3 setWebhook [${name}] falhou: ${err?.message || err}`);
        if (attempt < 3) await sleepFn(waitMs);
      }
    }

    log.error(`Webhook [${name}] mantido na rota HTTP após erro setWebhook (sem deleteWebhook em nuvem): ${lastErr?.message || lastErr}`);
    return { mode: 'webhook', error: lastErr?.message || String(lastErr), webhookUrl };
  }

  if (isCloudEnv && !usePolling) {
    log.warn(`[${name}] Ambiente cloud sem RENDER_EXTERNAL_URL — polling ignorado.`);
    return { mode: 'idle' };
  }

  try {
    await targetBot.telegram.deleteWebhook({ drop_pending_updates: false }).catch(() => {});
    targetBot.launch({ allowedUpdates: ['message', 'callback_query'] }).catch((err) => log.error(`Erro polling [${name}]:`, err.message));
    log.info(`✅ [${name}] ativo em modo Polling local!`);
    return { mode: 'polling' };
  } catch (err) {
    log.error(`Erro ao iniciar polling [${name}]:`, err.message);
    return { mode: 'error', error: err.message };
  }
}

export default {
  LEGACY_WEBHOOK_KEYS,
  LEGACY_BRIDGE_SPECS,
  LEGACY_FLEET_ACTIONS,
  getLegacyBridgeConfigs,
  buildFleetRedirectKeyboard,
  registerMasterBackCompatHandlers,
  createLegacyBridgeBots,
  mountBotTransport
};
