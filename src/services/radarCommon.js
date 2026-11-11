// src/services/radarCommon.js — Helpers partilhados do Radar Multi-Frente (Zero Alucinações)
import { searchLiveWeb } from '../shared/webSearch.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('RadarCommon');

export function getRadarRecipients() {
  const mainId = String(process.env.CHAT_ID_AUTORIZADO || process.env.AUTHORIZED_CHAT_ID || process.env.TELEGRAM_ADMIN_ID || '950415577').trim();
  const wifeId = String(process.env.CHAT_ID_ESPOSA || '').trim();
  const list = [mainId];
  if (wifeId && wifeId !== mainId) list.push(wifeId);
  return list.filter(Boolean);
}

/**
 * Extrai preço realista em Euros a partir de texto/snippet PT/ES.
 * Devolve 0 se não existir preço verificável no texto.
 */
export function parsePriceEur(text = '', { min = 1, max = 5000000 } = {}) {
  const clean = String(text || '');
  const patterns = [
    /(?:€|eur|euros?)\s*(\d{1,3}(?:[.\s]\d{3})*(?:,\d{1,2})?|\d{2,7})/i,
    /(\d{1,3}(?:[.\s]\d{3})*(?:,\d{1,2})?|\d{2,7})\s*(?:€|eur|euros?)/i
  ];
  for (const re of patterns) {
    const m = clean.match(re);
    if (m && m[1]) {
      const normalized = m[1].replace(/[.\s]/g, '').replace(',', '.');
      const val = parseFloat(normalized);
      if (!Number.isNaN(val) && val >= min && val <= max) {
        return Math.round(val * 100) / 100;
      }
    }
  }
  return 0;
}

export async function sendRadarTelegramAlert(botInstance, text, replyMarkup = null) {
  if (!botInstance?.telegram) return false;
  const recipients = getRadarRecipients();
  let delivered = false;

  for (const chatId of recipients) {
    const opts = { parse_mode: 'Markdown', disable_web_page_preview: true };
    if (replyMarkup) opts.reply_markup = replyMarkup;
    try {
      await botInstance.telegram.sendMessage(chatId, text, opts);
      delivered = true;
    } catch {
      try {
        await botInstance.telegram.sendMessage(
          chatId,
          text.replace(/[*_`[\]]/g, ''),
          replyMarkup ? { reply_markup: replyMarkup, disable_web_page_preview: true } : { disable_web_page_preview: true }
        );
        delivered = true;
      } catch (err) {
        log.warn(`Falha ao enviar alerta radar para ${chatId}: ${err.message}`);
      }
    }
  }
  return delivered;
}

/**
 * Motor partilhado de pesquisa web real e persistência com deteção de novidades e baixas de preço.
 */
export async function runWebFrontSearch({
  queries = [],
  maxPerQuery = 4,
  parseHit,
  saveHit
}) {
  const seenUrls = new Set();
  const items = [];
  const alerts = [];

  for (const q of queries) {
    try {
      const rawHits = await searchLiveWeb(q, maxPerQuery);
      for (const hit of rawHits) {
        if (!hit?.url || seenUrls.has(hit.url)) continue;
        seenUrls.add(hit.url);

        const parsed = parseHit(hit);
        if (!parsed) continue;

        let status = { isNew: false, priceDropped: false, previousPrice: null, record: parsed };
        if (typeof saveHit === 'function' && (parsed.preco > 0 || parsed.persistEvenZeroPrice)) {
          try {
            status = saveHit(parsed);
          } catch (err) {
            log.warn(`Erro ao persistir item radar (${parsed.url}): ${err.message}`);
          }
        }

        const enriched = { ...parsed, ...status.record, isNew: status.isNew, priceDropped: status.priceDropped, previousPrice: status.previousPrice };
        items.push(enriched);

        if (status.isNew || status.priceDropped) {
          alerts.push(enriched);
        }
      }
    } catch (err) {
      log.warn(`Erro na query radar "${q}": ${err.message}`);
    }
  }

  return {
    scanned: seenUrls.size,
    items,
    alerts
  };
}

