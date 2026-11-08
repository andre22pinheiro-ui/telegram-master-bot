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

// ─── Instância do Bot ────────────────────────────────────────────────────────

const bot = new Telegraf(TOKEN);

// ─── Middleware de Autenticação ──────────────────────────────────────────────

bot.use(async (ctx, next) => {
  const chatId = String(ctx.chat?.id || '');
  const userId = String(ctx.from?.id || '');

  if (chatId !== CHAT_ID_AUTORIZADO && userId !== CHAT_ID_AUTORIZADO) {
    log.warn('Acesso não autorizado bloqueado', { chatId, userId });
    await ctx.reply('⛔ Acesso não autorizado.');
    return;
  }
  return next();
});

// ─── Roteador de Intenções ───────────────────────────────────────────────────

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

// ─── Comando /start ──────────────────────────────────────────────────────────

bot.start(async (ctx) => {
  const nome = ctx.from?.first_name || 'André';
  await sendReply(ctx, `👋 Olá, *${nome}*!\n\nSou o teu Assistente Orquestrador Telegram.\n\n🧭 *Módulos Ativos:*\n\n🖥️ *Dev* — Código, GitHub, deploy\n🚛 *Frotas* — Rotas de pesados, tacógrafo\n🏠 *Imobiliário* — Avaliação por m² em Amarante\n📋 *Geral* — Notas, compras, tarefas, briefing\n\nFala comigo normalmente ou usa um dos comandos abaixo!\n\n━━━━━━━━━━━\n/ajuda — ver todos os comandos`);
});

// ─── Comando /ajuda ──────────────────────────────────────────────────────────

bot.command('ajuda', async (ctx) => {
  await sendReply(ctx, `📖 *Comandos Disponíveis:*\n\n*🖥️ Desenvolvimento:*\n\`/projetos\` — listar repos GitHub\n\`/criar_app NOME\` — criar repositório\n\n*🚛 Frotas:*\n\`/rota ORIGEM para DESTINO\`\n\`/tacografo HORAS\`\n\n*🏠 Imobiliário:*\n\`/avaliacao ÁREA ZONA TIPOLOGIA ESTADO\`\nEx: \`/avaliacao 120 Amarante T3 bom\`\n\n*📋 Pessoal:*\n\`/compras\` — lista de compras\n\`/nota TEXTO\` — guardar nota\n\`/tarefa TEXTO\` — adicionar tarefa\n\`/lembrete TEXTO\` — guardar lembrete\n\`/briefing\` — resumo do dia\n\n_Podes também escrever em linguagem natural!_`);
});

// ─── Handler de Texto ────────────────────────────────────────────────────────

bot.on('text', async (ctx) => {
  const text = ctx.message.text;
  if (!text || text.trim().length === 0) return;

  log.info('Mensagem recebida', { from: ctx.from?.first_name, text: text.substring(0, 80) });

  try {
    await ctx.sendChatAction('typing');
    const resposta = await rotear(ctx, text);
    await sendReply(ctx, resposta);
  } catch (err) {
    log.error('Erro ao processar mensagem', err.message);
    await ctx.reply('⚠️ Erro interno. Tenta novamente em instantes.');
  }
});

// ─── Handler de Outros Tipos de Mensagem ────────────────────────────────────

bot.on('sticker', (ctx) => ctx.reply('😄 Sticker recebido! Fala comigo em texto.'));
bot.on('photo', (ctx) => ctx.reply('📸 Foto recebida! Por agora só processo texto.'));
bot.on('voice', (ctx) => ctx.reply('🎙️ Mensagem de voz recebida! Por agora só processo texto.'));

// ─── Tratamento de Erros ─────────────────────────────────────────────────────

bot.catch((err, ctx) => {
  log.error('Erro não tratado no bot', err?.message || err);
  ctx?.reply('⚠️ Ocorreu um erro inesperado. O bot continua ativo.').catch(() => {});
});

// ─── Arranque ────────────────────────────────────────────────────────────────

process.on('uncaughtException', (err) => {
  log.error('uncaughtException', err?.message || err);
});

process.on('unhandledRejection', (reason) => {
  log.error('unhandledRejection', String(reason));
});

process.on('SIGINT', () => {
  log.info('Bot a terminar (SIGINT)...');
  bot.stop('SIGINT');
  process.exit(0);
});

process.on('SIGTERM', () => {
  log.info('Bot a terminar (SIGTERM)...');
  bot.stop('SIGTERM');
  process.exit(0);
});

// ─── Servidor HTTP para Render.com (mantém o serviço "acordado") ────────────
const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', bot: 'telegram-master-bot', uptime: process.uptime() }));
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  log.info(`Servidor HTTP ativo na porta ${PORT} (health check para Render.com)`);
});

async function startBotWithRetry(retries = 5, delayMs = 5000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      log.info(`A iniciar o Bot Orquestrador Telegram (tentativa ${attempt}/${retries})...`);
      await bot.launch({ allowedUpdates: ['message', 'callback_query'] });
      log.info('✅ Bot ativo e a escutar com sucesso no Telegram!');
      return;
    } catch (err) {
      log.error(`⚠️ Tentativa ${attempt} falhou: ${err?.message || err}`);
      if (attempt < retries) {
        log.info(`A aguardar ${delayMs / 1000}s antes de tentar novamente...`);
        await new Promise((r) => setTimeout(r, delayMs));
      } else {
        log.error('Todas as tentativas de ligação ao Telegram falharam. O servidor HTTP /health continua ativo.');
      }
    }
  }
}

startBotWithRetry();

