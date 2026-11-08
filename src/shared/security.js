import "dotenv/config";

/**
 * Middleware de autorização estrita por chat ID
 * Suporta múltiplos IDs separados por vírgula no AUTHORIZED_CHAT_ID
 */
export function authMiddleware(ctx, next) {
  const rawAuth = process.env.AUTHORIZED_CHAT_ID || "";
  const allowedIds = rawAuth.split(",").map(id => id.trim()).filter(Boolean);
  const fromId = ctx.from?.id ? String(ctx.from.id) : null;
  const username = ctx.from?.username || ctx.from?.first_name || "Desconhecido";

  if (allowedIds.length === 0 || (fromId && allowedIds.includes(fromId))) {
    return next();
  }

  console.warn(`[SEGURANÇA] Acesso bloqueado para utilizador @${username} (ID: ${fromId})`);
  return ctx.reply(
    "⛔ <b>Acesso Restrito</b>\n━━━━━━━━━━━━━━━━━━━━━━━━\nEste sistema de bots e microsserviços é de uso estritamente privado.",
    { parse_mode: "HTML" }
  );
}

/**
 * Middleware para manter o chat limpo e sem "lixo":
 * Apaga automaticamente as mensagens de comandos enviadas pelos utilizadores (ex: /start, /links, etc.)
 */
export async function cleanChatMiddleware(ctx, next) {
  const isCommand = ctx.message?.text?.startsWith("/");
  const messageId = ctx.message?.message_id;
  const chatId = ctx.chat?.id;

  try {
    await next();
  } finally {
    if (isCommand && messageId && chatId) {
      ctx.telegram.deleteMessage(chatId, messageId).catch(() => {
        // Ignora silenciosamente se já tiver sido apagada ou sem permissão
      });
    }
  }
}

/**
 * Helper utilitário para apagar mensagens de utilizador de forma segura
 */
export async function deleteUserMessage(ctx) {
  try {
    if (ctx.message?.message_id && ctx.chat?.id) {
      await ctx.telegram.deleteMessage(ctx.chat.id, ctx.message.message_id);
    }
  } catch (_) {}
}

export function splitMessage(text, maxLen = 3900) {
  if (!text || text.length <= maxLen) return [text || ""];
  const chunks = [];
  let remaining = String(text);
  while (remaining.length > maxLen) {
    let splitIdx = remaining.lastIndexOf("\n\n", maxLen);
    if (splitIdx === -1 || splitIdx < maxLen / 2) {
      splitIdx = remaining.lastIndexOf("\n", maxLen);
    }
    if (splitIdx === -1 || splitIdx < maxLen / 2) {
      splitIdx = remaining.lastIndexOf(" ", maxLen);
    }
    if (splitIdx === -1) splitIdx = maxLen;
    chunks.push(remaining.substring(0, splitIdx).trim());
    remaining = remaining.substring(splitIdx).trim();
  }
  if (remaining.length > 0) chunks.push(remaining);
  return chunks;
}

