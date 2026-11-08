// index.js — Ponto de entrada principal do Bot Orquestrador Telegram
import 'dotenv/config';
import http from 'http';
import { Telegraf } from 'telegraf';
import { detectIntent } from './src/router/intentRouter.js';
import { handle as handleDev } from './src/workers/worker_dev.js';
import { handle as handleFrotas } from './src/workers/worker_frotas.js';
import { handle as handleImmo } from './src/workers/worker_immo.js';
import { handle as handleGeral } from './src/workers/worker_geral.js';
import { createLogger } from './src/utils/logger.js';
import { mkdirSync } from 'fs';

const log = createLogger('Master');

// ─── Validação de Configuração ───────────────────────────────────────────────

const TOKEN = process.env.TELEGRAM_BOT_TOKEN_MASTER || process.env.TELEGRAM_MASTER_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID_AUTORIZADO = process.env.CHAT_ID_AUTORIZADO || process.env.AUTHORIZED_CHAT_ID || process.env.TELEGRAM_CHAT_ID;

if (!TOKEN) {
  log.error('TELEGRAM_BOT_TOKEN_MASTER (ou TELEGRAM_MASTER_TOKEN) não definido no .env');
  process.exit(1);
}
if (!CHAT_ID_AUTORIZADO) {
  log.error('CHAT_ID_AUTORIZADO (ou AUTHORIZED_CHAT_ID) não definido no .env');
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
    await ctx.reply('⛔ Acesso não autorizado.');
    return;
  }
  return next();
};

// ─── Roteador de Intenções do Master ─────────────────────────────────────────

async function rotear(ctx, text) {
  const intent = detectIntent(text);
  log.info(`Roteando para worker: ${intent}`);

  let resposta;
  try {
    switch (intent) {
      case 'DEV':    resposta = await handleDev(text);    break;
      case 'FROTAS': resposta = await handleFrotas(text); break;
      case 'IMMO':   resposta = await handleImmo(text);   break;
      case 'GERAL':
      default:       resposta = await handleGeral(text);  break;
    }
  } catch (err) {
    log.error(`Erro no worker ${intent}`, err.message);
    resposta = `⚠️ Ocorreu um erro interno no módulo *${intent}*. Tenta novamente.`;
  }

  return resposta;
}

// ─── Helpers de Envio (chunking para limite 4096 chars) ─────────────────────

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

async function sendReply(ctx, text) {
  const chunks = splitText(text);
  for (const chunk of chunks) {
    await ctx.replyWithMarkdown(chunk);
  }
}

// ─── Instâncias Ativas de Bots ───────────────────────────────────────────────
const botInstances = [];

// 1. MASTER BOT (@AndrePinheirobot)
const bot = new Telegraf(TOKEN);
bot.use(authMiddleware);

bot.start(async (ctx) => {
  const nome = ctx.from?.first_name || 'André';
  await sendReply(ctx, `👋 Olá, *${nome}*!\n\nSou o teu Assistente Orquestrador Telegram.\n\n🧭 *Módulos Ativos na Nuvem:*\n\n🖥️ *Dev* — Código, GitHub, deploy\n🚛 *Frotas* — Rotas de pesados, tacógrafo\n🏠 *Imobiliário* — Avaliação por m² em Amarante\n📋 *Geral* — Notas, compras, tarefas, briefing\n\nFala comigo normalmente ou usa um dos comandos abaixo!\n\n━━━━━━━━━━━\n/ajuda — ver todos os comandos`);
});

bot.command('ajuda', async (ctx) => {
  await sendReply(ctx, `📖 *Comandos Disponíveis:*\n\n*🖥️ Desenvolvimento:*\n\`/projetos\` — listar repos GitHub\n\`/criar_app NOME\` — criar repositório\n\n*🚛 Frotas:*\n\`/rota ORIGEM para DESTINO\`\n\`/tacografo HORAS\`\n\n*🏠 Imobiliário:*\n\`/avaliacao ÁREA ZONA TIPOLOGIA ESTADO\`\nEx: \`/avaliacao 120 Amarante T3 bom\`\n\n*📋 Pessoal:*\n\`/compras\` — lista de compras\n\`/nota TEXTO\` — guardar nota\n\`/tarefa TEXTO\` — adicionar tarefa\n\`/lembrete TEXTO\` — guardar lembrete\n\`/briefing\` — resumo do dia\n\n_Podes também escrever em linguagem natural!_`);
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

bot.on('sticker', (ctx) => ctx.reply('😄 Sticker recebido! Fala comigo em texto.'));
bot.on('photo', (ctx) => ctx.reply('📸 Foto recebida! Por agora só processo texto.'));
bot.on('voice', (ctx) => ctx.reply('🎙️ Mensagem de voz recebida! Por agora só processo texto.'));

bot.catch((err, ctx) => {
  log.error('Erro não tratado no Master Bot', err?.message || err);
  ctx?.reply('⚠️ Ocorreu um erro inesperado no Master. O bot continua ativo.').catch(() => {});
});

botInstances.push({ name: 'Master (@AndrePinheirobot)', bot });

// 2. WORKER DEV (@DesSofBot)
const DEV_TOKEN = process.env.TELEGRAM_DEV_TOKEN || process.env.TELEGRAM_BOT_TOKEN_DEV || process.env.DEV_TOKEN;
if (DEV_TOKEN && DEV_TOKEN.trim()) {
  const botDev = new Telegraf(DEV_TOKEN.trim());
  botDev.use(authMiddleware);
  botDev.start(async (ctx) => {
    await sendReply(ctx, `💻 *Worker Dev & Cloud Ativo na Nuvem!*\n\nEspecialista em Engenharia de Software, GitHub e Vercel.\n\n• \`/projetos\` — Listar repositórios\n• \`/criar_app NOME : DESCRIÇÃO\` — Scaffold e deploy\n• Envia qualquer pergunta de código ou arquitetura!`);
  });
  botDev.command('projetos', async (ctx) => {
    await ctx.sendChatAction('typing');
    const resp = await handleDev('/projetos');
    await sendReply(ctx, resp);
  });
  botDev.on('text', async (ctx) => {
    await ctx.sendChatAction('typing');
    const resp = await handleDev(ctx.message.text);
    await sendReply(ctx, resp);
  });
  botDev.catch((err) => log.error('Erro no Worker Dev', err?.message || err));
  botInstances.push({ name: 'Dev (@DesSofBot)', bot: botDev });
}

// 3. WORKER FROTAS (@TrasFrotBot)
const FROTAS_TOKEN = process.env.TELEGRAM_FROTAS_TOKEN || process.env.TELEGRAM_BOT_TOKEN_FROTAS || process.env.FROTAS_TOKEN;
if (FROTAS_TOKEN && FROTAS_TOKEN.trim()) {
  const botFrotas = new Telegraf(FROTAS_TOKEN.trim());
  botFrotas.use(authMiddleware);
  botFrotas.start(async (ctx) => {
    await sendReply(ctx, `🚛 *Worker Frotas & Tacógrafo Ativo na Nuvem!*\n\nEspecialista em Logística, Tacógrafo e Rotas de Pesados.\n\n• \`/rota ORIGEM para DESTINO\`\n• \`/tacografo HORAS\`\n• Perguntas sobre tempos de condução e repouso (Regulamento 561/2006).`);
  });
  botFrotas.on('text', async (ctx) => {
    await ctx.sendChatAction('typing');
    const resp = await handleFrotas(ctx.message.text);
    await sendReply(ctx, resp);
  });
  botFrotas.catch((err) => log.error('Erro no Worker Frotas', err?.message || err));
  botInstances.push({ name: 'Frotas (@TrasFrotBot)', bot: botFrotas });
}

// 4. WORKER IMMO (@ppspppBot)
const IMMO_TOKEN = process.env.TELEGRAM_IMMO_TOKEN || process.env.TELEGRAM_BOT_TOKEN_IMMO || process.env.IMMO_TOKEN;
if (IMMO_TOKEN && IMMO_TOKEN.trim()) {
  const botImmo = new Telegraf(IMMO_TOKEN.trim());
  botImmo.use(authMiddleware);
  botImmo.start(async (ctx) => {
    await sendReply(ctx, `🏠 *Worker Imobiliário CMVM Ativo na Nuvem!*\n\nAvaliação imobiliária por m² para Amarante e Região Norte.\n\n• \`/avaliacao ÁREA ZONA TIPOLOGIA ESTADO\`\nEx: \`/avaliacao 120 Amarante T3 bom\`\n• Pergunta por métricas de viabilidade de construção e terrenos.`);
  });
  botImmo.on('text', async (ctx) => {
    await ctx.sendChatAction('typing');
    const resp = await handleImmo(ctx.message.text);
    await sendReply(ctx, resp);
  });
  botImmo.catch((err) => log.error('Erro no Worker Immo', err?.message || err));
  botInstances.push({ name: 'Immo (@ppspppBot)', bot: botImmo });
}

// 5. WORKER PESSOAL (@AndTrarBOT)
const PESSOAL_TOKEN = process.env.TELEGRAM_PESSOAL_TOKEN || process.env.TELEGRAM_BOT_TOKEN_PESSOAL || process.env.PESSOAL_TOKEN;
if (PESSOAL_TOKEN && PESSOAL_TOKEN.trim()) {
  const botPessoal = new Telegraf(PESSOAL_TOKEN.trim());
  botPessoal.use(authMiddleware);
  botPessoal.start(async (ctx) => {
    await sendReply(ctx, `📋 *Assistente Pessoal & Produtividade Ativo na Nuvem!*\n\n• \`/compras\` — Gerir lista de compras\n• \`/tarefa TEXTO\` — Adicionar tarefa\n• \`/nota TEXTO\` — Guardar nota rápida\n• \`/briefing\` — Resumo diário de compromissos`);
  });
  botPessoal.on('text', async (ctx) => {
    await ctx.sendChatAction('typing');
    const resp = await handleGeral(ctx.message.text);
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

// ─── Servidor HTTP para Render.com (mantém o serviço "acordado") ────────────
const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      service: 'telegram-master-bot',
      activeBots: botInstances.map((b) => b.name),
      uptime: process.uptime()
    }));
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  log.info(`Servidor HTTP ativo na porta ${PORT} (health check para Render.com)`);
});

// ─── Arranque Resiliente de Todos os Bots Ativos ─────────────────────────────

async function startAllBotsWithRetry(retries = 5, delayMs = 5000) {
  for (const { name, bot: b } of botInstances) {
    let launched = false;
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        log.info(`A iniciar [${name}] (tentativa ${attempt}/${retries})...`);
        await b.launch({ allowedUpdates: ['message', 'callback_query'] });
        log.info(`✅ [${name}] ativo e a escutar com sucesso no Telegram!`);
        launched = true;
        break;
      } catch (err) {
        log.error(`⚠️ Tentativa ${attempt} de [${name}] falhou: ${err?.message || err}`);
        if (attempt < retries) {
          log.info(`A aguardar ${delayMs / 1000}s antes de tentar [${name}] novamente...`);
          await new Promise((r) => setTimeout(r, delayMs));
        }
      }
    }
    if (!launched) {
      log.error(`Falha ao iniciar [${name}] após ${retries} tentativas. Os outros bots continuam operacionais.`);
    }
  }
}

startAllBotsWithRetry();

