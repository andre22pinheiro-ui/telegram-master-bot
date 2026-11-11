import "dotenv/config";
import fs from "fs";
import path from "path";
import { Markup } from "telegraf";
import { createLogger } from "../utils/logger.js";

const log = createLogger("Security");

// ─── Contactos Telefónicos Autorizados ──────────────────────────────────────
export const AUTHORIZED_PHONES = [
  "919115655",
  "933276221",
  "351919115655",
  "351933276221"
];

const CHAT_ID_AUTORIZADO = process.env.CHAT_ID_AUTORIZADO || process.env.AUTHORIZED_CHAT_ID || "950415577";

const AUTH_FILE = path.resolve("./data/autorizados.json");

// Garantir ficheiro de autorizações persistente
function loadAuthStore() {
  try {
    if (fs.existsSync(AUTH_FILE)) {
      return JSON.parse(fs.readFileSync(AUTH_FILE, "utf-8"));
    }
  } catch (err) {
    log.error("Erro ao ler autorizados.json:", err.message);
  }

  // Estado inicial padrão
  const initial = {
    authorizedUserIds: [String(CHAT_ID_AUTORIZADO)],
    phoneMapping: {
      [String(CHAT_ID_AUTORIZADO)]: "919115655"
    }
  };
  saveAuthStore(initial);
  return initial;
}

function saveAuthStore(data) {
  try {
    const dir = path.dirname(AUTH_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(AUTH_FILE, JSON.stringify(data, null, 2), "utf-8");
    // Sincronizar quase em tempo real para o Google Drive
    import("../services/googleDriveService.js")
      .then(m => m.triggerDebouncedDriveSync?.(10000))
      .catch(() => {});
  } catch (err) {
    log.error("Erro ao guardar autorizados.json:", err.message);
  }
}

let authStore = loadAuthStore();

export function isAuthorized(userId, chatId) {
  const uid = String(userId || "");
  const cid = String(chatId || "");

  if (uid === String(CHAT_ID_AUTORIZADO) || cid === String(CHAT_ID_AUTORIZADO)) {
    return true;
  }

  return (
    authStore.authorizedUserIds.includes(uid) ||
    authStore.authorizedUserIds.includes(cid)
  );
}

export function authorizeContact(userId, chatId, rawPhone, name = "Utilizador") {
  const uid = String(userId || "");
  const cid = String(chatId || "");
  const cleanPhone = String(rawPhone || "").replace(/\D/g, "");

  const match = AUTHORIZED_PHONES.some(p => cleanPhone.endsWith(p) || cleanPhone === p);
  if (!match) {
    return { success: false, reason: "Número não autorizado", phone: cleanPhone };
  }

  if (!authStore.authorizedUserIds.includes(uid)) {
    authStore.authorizedUserIds.push(uid);
  }
  if (cid && !authStore.authorizedUserIds.includes(cid)) {
    authStore.authorizedUserIds.push(cid);
  }

  authStore.phoneMapping[uid] = cleanPhone;
  saveAuthStore(authStore);

  log.info(`✅ Novo contacto validado e autorizado com sucesso: ${name} (${cleanPhone}) [ID: ${uid}]`);
  return { success: true, phone: cleanPhone, name };
}

export function addAuthorizedId(id, phone = "manual") {
  const strId = String(id).trim();
  if (!authStore.authorizedUserIds.includes(strId)) {
    authStore.authorizedUserIds.push(strId);
  }
  authStore.phoneMapping[strId] = phone;
  saveAuthStore(authStore);
  return true;
}

export function removeAuthorizedId(id) {
  const strId = String(id).trim();
  authStore.authorizedUserIds = authStore.authorizedUserIds.filter(x => x !== strId);
  delete authStore.phoneMapping[strId];
  saveAuthStore(authStore);
  return true;
}

export function listAuthorized() {
  return {
    authorizedUserIds: authStore.authorizedUserIds,
    phoneMapping: authStore.phoneMapping
  };
}

/**
 * Middleware de autorização estrita por contacto / Telegram ID
 */
export async function authMiddleware(ctx, next) {
  const userId = String(ctx.from?.id || "");
  const chatId = String(ctx.chat?.id || "");
  const username = ctx.from?.username || ctx.from?.first_name || "Desconhecido";

  // 1. Verificar se já está autenticado
  if (isAuthorized(userId, chatId)) {
    return next();
  }

  // 2. Intercetar envio de contacto oficial para validação
  if (ctx.message?.contact) {
    const contact = ctx.message.contact;
    const isSenderOwn = !contact.user_id || String(contact.user_id) === userId;

    if (!isSenderOwn) {
      await ctx.reply(
        "⛔ *Segurança:* Por motivos de verificação antifraude, tens de partilhar o teu próprio contacto através do botão oficial.",
        { parse_mode: "Markdown" }
      );
      return;
    }

    const res = authorizeContact(userId, chatId, contact.phone_number, ctx.from?.first_name);
    if (res.success) {
      await ctx.reply(
        `✅ *Acesso Concedido com Sucesso!*\n━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `O teu número (*+${contact.phone_number}*) foi validado e registado no sistema de segurança.\n\n` +
        `Tens agora acesso total e permanente ao **Grok Bot (@AndrePinheirobot)** (Pessoal, Família, Notícias Certificadas, Nutrição, Radar 5 Frentes & Dev).\n` +
        `_(Nota: Gestão operacional de frotas corre em separado no bot @zeropaperfrotaBot)_\n\n` +
        `Usa \`/menu\` para acederes ao Cockpit!`,
        {
          parse_mode: "Markdown",
          ...Markup.removeKeyboard()
        }
      );
      return;
    } else {
      log.warn(`⛔ Tentativa de validação falhada com número não autorizado: ${contact.phone_number} (ID: ${userId})`);
      await ctx.reply(
        `⛔ *Acesso Recusado*\n━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `O número (*+${contact.phone_number}*) não consta da lista restrita de contactos autorizados (*919 115 655* e *933 276 221*).\n\n` +
        `Se és o proprietário deste número e necessitas de acesso, contacta o administrador do sistema.`,
        {
          parse_mode: "Markdown",
          ...Markup.removeKeyboard()
        }
      );
      return;
    }
  }

  // 3. Utilizador não autorizado — Apresentar bloqueio e botão de autenticação
  log.warn(`⛔ [SEGURANÇA] Acesso bloqueado para @${username} (ID: ${userId}, Chat: ${chatId})`);
  await ctx.reply(
    `🔒 *Acesso Privado e Restrito*\n━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `Este ecossistema de bots é de uso pessoal e estritamente reservado a dois números autorizados:\n` +
    `• *+351 919 115 655*\n` +
    `• *+351 933 276 221*\n\n` +
    `Para desbloquear o teu acesso no Telegram, clica no botão abaixo para validar o teu número de telemóvel:`,
    {
      parse_mode: "Markdown",
      ...Markup.keyboard([
        [Markup.button.contactRequest("📱 Validar Acesso com o meu Telemóvel")]
      ]).resize().oneTime()
    }
  );
}

/**
 * Middleware para manter o chat limpo e sem "lixo"
 */
export async function cleanChatMiddleware(ctx, next) {
  const isCommand = ctx.message?.text?.startsWith("/");
  const messageId = ctx.message?.message_id;
  const chatId = ctx.chat?.id;

  try {
    await next();
  } finally {
    if (isCommand && messageId && chatId) {
      ctx.telegram.deleteMessage(chatId, messageId).catch(() => {});
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

