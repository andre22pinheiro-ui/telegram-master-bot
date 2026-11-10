// src/shared/telegramAuth.js — Validação Criptográfica de Sessões Telegram WebApp (HMAC-SHA256)
import crypto from 'crypto';
import { isAuthorized } from './security.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('TelegramAuth');

/**
 * Valida os dados de autenticação de uma Telegram WebApp (initData) usando a assinatura HMAC-SHA256 oficial do Telegram.
 * 
 * @param {string} initData - String bruta de initData fornecida pelo Telegram WebApp
 * @param {string} botToken - Token do Bot Telegram
 * @returns {{ valid: boolean, user?: object, reason?: string }}
 */
export function validateTelegramWebAppData(initData, botToken = process.env.TELEGRAM_BOT_TOKEN_MASTER) {
  if (!initData || typeof initData !== 'string') {
    return { valid: false, reason: 'initData ausente' };
  }

  if (!botToken) {
    log.warn('Bot token ausente para validação HMAC');
    return { valid: false, reason: 'Token não configurado' };
  }

  try {
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    if (!hash) {
      return { valid: false, reason: 'hash ausente no initData' };
    }

    urlParams.delete('hash');

    // Ordenar parâmetros alfabeticamente
    const dataCheckArr = [];
    for (const [key, val] of Array.from(urlParams.entries()).sort(([a], [b]) => a.localeCompare(b))) {
      dataCheckArr.push(`${key}=${val}`);
    }
    const dataCheckString = dataCheckArr.join('\n');

    // Chave secreta: HMAC_SHA256('WebAppData', botToken)
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();

    // Hash calculado: HMAC_SHA256(secretKey, dataCheckString)
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    if (calculatedHash !== hash) {
      log.warn('Assinatura HMAC de initData inválida!');
      return { valid: false, reason: 'Assinatura inválida' };
    }

    // Verificar expiração do token (máximo 24 horas)
    const authDate = parseInt(urlParams.get('auth_date') || '0', 10);
    const now = Math.floor(Date.now() / 1000);
    if (now - authDate > 86400) {
      return { valid: false, reason: 'Sessão WebApp expirada (>24h)' };
    }

    // Extrair informações do utilizador
    const userRaw = urlParams.get('user');
    let user = null;
    if (userRaw) {
      try {
        user = JSON.parse(userRaw);
      } catch (_) {}
    }

    const userId = user?.id;
    if (userId && !isAuthorized(userId)) {
      log.warn(`Acesso à Mini App rejeitado para utilizador não autorizado: ${userId}`);
      return { valid: false, user, reason: 'Utilizador não autorizado na whitelist' };
    }

    return { valid: true, user, authDate };
  } catch (err) {
    log.error('Erro ao validar initData do Telegram:', err.message);
    return { valid: false, reason: err.message };
  }
}

