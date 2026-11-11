// src/services/newsService.js — Notícias Certificadas, Institucionais e Regionais de Amarante (Whitelist ERC/Oficial)
import axios from 'axios';
import { createLogger } from '../utils/logger.js';
import { searchLiveWeb } from '../shared/webSearch.js';

const log = createLogger('NewsService');

// Domínios estritamente permitidos (Entidades Oficiais PT/UE e Imprensa Registada ERC)
export const TRUSTED_SOURCES = [
  { domain: 'portugal.gov.pt', label: 'Governo de Portugal', badge: 'Fonte Oficial', scope: 'governo' },
  { domain: 'diariodarepublica.pt', label: 'Diário da República', badge: 'Fonte Oficial', scope: 'governo' },
  { domain: 'ipma.pt', label: 'IPMA Meteorologia', badge: 'Fonte Oficial', scope: 'alertas' },
  { domain: 'prociv.gov.pt', label: 'Proteção Civil (ANEPC)', badge: 'Fonte Oficial', scope: 'alertas' },
  { domain: 'infraestruturasdeportugal.pt', label: 'Infraestruturas de Portugal', badge: 'Fonte Oficial', scope: 'alertas' },
  { domain: 'ec.europa.eu', label: 'Comissão Europeia', badge: 'Fonte Oficial UE', scope: 'europa' },
  { domain: 'lusa.pt', label: 'Agência Lusa', badge: 'Agência Lusa', scope: 'nacional' },
  { domain: 'rtp.pt', label: 'RTP Notícias (Serviço Público)', badge: 'Imprensa ERC', scope: 'nacional' },
  { domain: 'jn.pt', label: 'Jornal de Notícias', badge: 'Imprensa ERC', scope: 'regional' },
  { domain: 'cm-amarante.pt', label: 'CM Amarante', badge: 'Fonte Oficial Local', scope: 'regional' },
  { domain: 'cimtamegaesousa.pt', label: 'CIM Tâmega e Sousa', badge: 'Fonte Oficial Regional', scope: 'regional' },
  { domain: 'averdade.com', label: 'Jornal A Verdade', badge: 'Imprensa ERC', scope: 'regional' },
  { domain: 'tamegasousa.pt', label: 'TâmegaSousa.pt', badge: 'Imprensa Regional', scope: 'regional' },
  { domain: 'expressodeamarante.pt', label: 'Expresso de Amarante', badge: 'Imprensa Regional', scope: 'regional' }
];

const RSS_FEEDS = {
  pais: { url: 'https://www.rtp.pt/noticias/rss/pais', label: 'RTP Notícias (País / Lusa)', badge: 'Imprensa ERC' },
  economia: { url: 'https://www.rtp.pt/noticias/rss/economia', label: 'RTP Economia', badge: 'Imprensa ERC' },
  comissao_ue: { url: 'https://ec.europa.eu/commission/presscorner/api/rss?language=pt', label: 'Comissão Europeia', badge: 'Fonte Oficial UE' },
  averdade: { url: 'https://www.averdade.com/feed/', label: 'Jornal A Verdade (Amarante)', badge: 'Imprensa ERC' },
  tamegasousa: { url: 'https://www.tamegasousa.pt/feed/', label: 'TâmegaSousa.pt', badge: 'Imprensa Regional' },
  expressodeamarante: { url: 'https://www.expressodeamarante.pt/feed/', label: 'Expresso de Amarante', badge: 'Imprensa Regional' }
};

const cacheStore = {
  briefing: { text: null, ts: 0 },
  regional: { text: null, ts: 0 },
  gov: { text: null, ts: 0 }
};
const CACHE_TTL_MS = 15 * 60 * 1000;

export function isTrustedSource(url = '') {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    return TRUSTED_SOURCES.find((src) => host === src.domain || host.endsWith(`.${src.domain}`)) || null;
  } catch {
    return null;
  }
}

function cleanText(str = '') {
  return String(str || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatDatePt(rawDate) {
  if (!rawDate) {
    return new Date().toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon', dateStyle: 'short', timeStyle: 'short' });
  }
  const dt = new Date(rawDate);
  if (Number.isNaN(dt.getTime())) return cleanText(rawDate);
  return dt.toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon', dateStyle: 'short', timeStyle: 'short' });
}

function parseRssOrAtom(xml = '', max = 3, defaultSource = null) {
  const items = [];
  const itemMatches = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)];
  const entryMatches = itemMatches.length > 0 ? itemMatches : [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi)];

  for (const match of entryMatches) {
    if (items.length >= max) break;
    const block = match[1];

    const title = cleanText((block.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
    const linkTag = (block.match(/<link[^>]*>([\s\S]*?)<\/link>/i) || [])[1] || '';
    const linkHref = (block.match(/<link[^>]+href=["']([^"']+)["']/i) || [])[1] || '';
    const link = cleanText(linkTag || linkHref);
    const pubDate = cleanText(
      (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i) ||
        block.match(/<published>([\s\S]*?)<\/published>/i) ||
        block.match(/<updated>([\s\S]*?)<\/updated>/i) || [])[1] || ''
    );

    if (!title || title.includes('RTP Notícias /') || !link.startsWith('http')) continue;
    const trusted = isTrustedSource(link) || defaultSource;
    if (!trusted) continue;

    items.push({
      title: title.slice(0, 130),
      link,
      sourceLabel: trusted.label,
      badge: trusted.badge,
      publishedAt: formatDatePt(pubDate)
    });
  }

  return items;
}

async function fetchRssSafe(feedCfg, max = 3) {
  try {
    const res = await axios.get(feedCfg.url, {
      timeout: 7000,
      headers: {
        'User-Agent': 'GrokBot-Portugal/2.0 (+https://telegram-master-bot-0h2h.onrender.com)'
      }
    });
    return parseRssOrAtom(res.data || '', max, { label: feedCfg.label, badge: feedCfg.badge });
  } catch (err) {
    log.warn(`Feed indisponível (${feedCfg.label}): ${err.message}`);
    return [];
  }
}

async function fetchTrustedWebItems(query, max = 3) {
  const results = await searchLiveWeb(query, max * 2);
  const nowStr = formatDatePt(new Date());
  const verified = [];

  for (const item of results) {
    if (verified.length >= max) break;
    const itemUrl = item?.url || item?.link || '';
    const trusted = isTrustedSource(itemUrl);
    if (!trusted) continue;
    verified.push({
      title: cleanText(item.title).slice(0, 130),
      link: itemUrl,
      sourceLabel: trusted.label,
      badge: trusted.badge,
      publishedAt: nowStr
    });
  }
  return verified;
}

function renderItemLines(items, emptyHintUrl) {
  if (!items || items.length === 0) {
    return `• Sem atualizações RSS diretas neste instante. Consulta direta oficial: ${emptyHintUrl}\n`;
  }
  return (
    items
      .map(
        (it) =>
          `• **${it.title}**\n  _[${it.badge}: ${it.sourceLabel}] | ${it.publishedAt}_\n  🔗 ${it.link}`
      )
      .join('\n') + '\n'
  );
}

/**
 * Briefing Regional de Amarante & Tâmega e Sousa (/noticias_regiao | /amarante)
 */
export async function getRegionalNews(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cacheStore.regional.text && now - cacheStore.regional.ts < CACHE_TTL_MS) {
    return cacheStore.regional.text;
  }

  const [averdade, tamega, expresso, cmAmaranteWeb, jnAmaranteWeb] = await Promise.all([
    fetchRssSafe(RSS_FEEDS.averdade, 2),
    fetchRssSafe(RSS_FEEDS.tamegasousa, 2),
    fetchRssSafe(RSS_FEEDS.expressodeamarante, 2),
    fetchTrustedWebItems('site:cm-amarante.pt OR site:cimtamegaesousa.pt avisos noticias amarante', 3),
    fetchTrustedWebItems('site:jn.pt Amarante noticias', 2)
  ]);

  const ts = formatDatePt(new Date());
  let msg = `🏘️ *NOTÍCIAS CERTIFICADAS — AMARANTE & TÂMEGA E SOUSA*\n`;
  msg += `🕒 _Atualizado (Europe/Lisbon): ${ts}_\n\n`;

  msg += `🏛️ *Câmara Municipal de Amarante & CIM Tâmega e Sousa:*\n`;
  msg += renderItemLines(cmAmaranteWeb, 'https://www.cm-amarante.pt');
  msg += '\n';

  msg += `🗞️ *Imprensa Regional Credenciada (ERC):*\n`;
  const imprensa = [...averdade, ...tamega, ...expresso, ...jnAmaranteWeb].slice(0, 6);
  msg += renderItemLines(imprensa, 'https://www.averdade.com');

  msg += `\n🛡️ _Whitelist estrita: CM Amarante, CIM Tâmega e Sousa, A Verdade, TâmegaSousa, Expresso de Amarante e JN._`;

  cacheStore.regional = { text: msg, ts: now };
  return msg;
}

/**
 * Briefing Institucional do Governo, Diário da República e Proteção Civil/IPMA (/governo | /leis)
 */
export async function getGovNews(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cacheStore.gov.text && now - cacheStore.gov.ts < CACHE_TTL_MS) {
    return cacheStore.gov.text;
  }

  const [govItems, dreItems, alertasItems, ueItems] = await Promise.all([
    fetchTrustedWebItems('site:portugal.gov.pt comunicados medidas conselho ministros', 3),
    fetchTrustedWebItems('site:diariodarepublica.pt decreto lei portaria recente', 2),
    fetchTrustedWebItems('site:ipma.pt OR site:prociv.gov.pt OR site:infraestruturasdeportugal.pt aviso amarante porto', 3),
    fetchRssSafe(RSS_FEEDS.comissao_ue, 2)
  ]);

  const ts = formatDatePt(new Date());
  let msg = `🏛️ *BOLETIM OFICIAL — GOVERNO, LEIS & PROTEÇÃO CIVIL*\n`;
  msg += `🕒 _Atualizado (Europe/Lisbon): ${ts}_\n\n`;

  msg += `🇵🇹 *Portal do Governo (portugal.gov.pt):*\n`;
  msg += renderItemLines(govItems, 'https://www.portugal.gov.pt');
  msg += '\n';

  msg += `⚖️ *Diário da República (diariodarepublica.pt):*\n`;
  msg += renderItemLines(dreItems, 'https://diariodarepublica.pt');
  msg += '\n';

  msg += `🌦️ *IPMA, Proteção Civil (ANEPC) & Estradas (IP):*\n`;
  msg += renderItemLines(alertasItems, 'https://www.ipma.pt');
  msg += '\n';

  msg += `🇪🇺 *Comissão Europeia:*\n`;
  msg += renderItemLines(ueItems, 'https://ec.europa.eu/commission/presscorner/home/pt');

  cacheStore.gov = { text: msg, ts: now };
  return msg;
}

/**
 * Previsão meteorológica e avisos IPMA em tempo real para o Porto / Tâmega e Sousa (globalIdLocal 1131200, PTO).
 */
export async function fetchIpmaPortoWeather() {
  const result = {
    source: 'IPMA (api.ipma.pt — Distrito do Porto / Tâmega e Sousa)',
    globalIdLocal: 1131200,
    forecast: null,
    warnings: [],
    error: null
  };

  try {
    const [forecastRes, warningsRes] = await Promise.all([
      fetch('https://api.ipma.pt/open-data/forecast/meteorology/cities/daily/1131200.json', {
        signal: AbortSignal.timeout(4000)
      }),
      fetch('https://api.ipma.pt/open-data/forecast/warnings/warnings_www.json', {
        signal: AbortSignal.timeout(4000)
      }).catch(() => null)
    ]);

    if (forecastRes?.ok) {
      const json = await forecastRes.json();
      const today = Array.isArray(json?.data) && json.data.length > 0 ? json.data[0] : null;
      if (today) {
        result.forecast = {
          forecastDate: today.forecastDate || null,
          tMin: today.tMin ?? null,
          tMax: today.tMax ?? null,
          precipitaProb: today.precipitaProb ?? null,
          predWindDir: today.predWindDir || null,
          idWeatherType: today.idWeatherType ?? null,
          classPrecInt: today.classPrecInt ?? null
        };
      }
    }

    if (warningsRes?.ok) {
      const wJson = await warningsRes.json();
      if (Array.isArray(wJson)) {
        result.warnings = wJson
          .filter(
            (w) =>
              w?.idAreaAviso === 'PTO' &&
              w?.awarenessLevelID &&
              String(w.awarenessLevelID).toLowerCase() !== 'green'
          )
          .map((w) => ({
            idAreaAviso: w.idAreaAviso,
            awarenessLevelID: w.awarenessLevelID,
            awarenessTypeName: w.awarenessTypeName || 'Aviso Meteorológico',
            text: w.text || ''
          }));
      }
    }
  } catch (err) {
    result.error = err.message;
  }

  return result;
}

/**
 * Briefing Matinal Unificado das 08h00 & Comando /noticias
 */
export async function getDailyNewsBriefing(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cacheStore.briefing.text && now - cacheStore.briefing.ts < CACHE_TTL_MS) {
    return cacheStore.briefing.text;
  }

  const [pais, economia, amaranteRss, amaranteCm, governo, alertas, ipmaLive] = await Promise.all([
    fetchRssSafe(RSS_FEEDS.pais, 3),
    fetchRssSafe(RSS_FEEDS.economia, 2),
    fetchRssSafe(RSS_FEEDS.averdade, 2),
    fetchTrustedWebItems('site:cm-amarante.pt OR "CIM Tâmega e Sousa" OR "A4" "Marão" OR "EN15" amarante', 2),
    fetchTrustedWebItems('site:portugal.gov.pt OR site:diariodarepublica.pt comunicados noticias', 2),
    fetchTrustedWebItems('site:ipma.pt OR site:prociv.gov.pt OR site:cm-amarante.pt avisos meteorologicos amarante norte', 2),
    fetchIpmaPortoWeather()
  ]);
  const amarante = [...amaranteRss, ...amaranteCm].slice(0, 3);

  const ts = formatDatePt(new Date());
  let msg = `🗞️ *BRIEFING OFICIAL CERTIFICADO*\n`;
  msg += `🕒 _Lisboa: ${ts} | Zero fontes não verificadas_\n\n`;

  if (ipmaLive?.forecast) {
    const f = ipmaLive.forecast;
    msg += `🌤️ *IPMA Porto/Amarante (${f.forecastDate || 'Hoje'}):* ${f.tMin ?? '?'}°C a ${f.tMax ?? '?'}°C | Precip.: ${f.precipitaProb ?? '?'}% | Vento: ${f.predWindDir || 'N/D'}\n`;
  }
  if (Array.isArray(ipmaLive?.warnings) && ipmaLive.warnings.length > 0) {
    for (const w of ipmaLive.warnings.slice(0, 2)) {
      msg += `⚠️ *Aviso IPMA PTO (${String(w.awarenessLevelID).toUpperCase()}):* ${w.awarenessTypeName}${w.text ? ` — ${w.text}` : ''}\n`;
    }
  }
  if (ipmaLive?.forecast || (ipmaLive?.warnings && ipmaLive.warnings.length > 0)) {
    msg += '\n';
  }

  msg += `🇵🇹 *Portugal & Serviço Público (RTP / Lusa):*\n`;
  msg += renderItemLines(pais, 'https://www.rtp.pt/noticias');
  msg += '\n';

  msg += `🏘️ *Região de Amarante (A Verdade / Local):*\n`;
  msg += renderItemLines(amarante, 'https://www.cm-amarante.pt');
  msg += '\n';

  msg += `🏛️ *Governo & Leis:*\n`;
  msg += renderItemLines(governo, 'https://www.portugal.gov.pt');
  msg += '\n';

  msg += `🌦️ *Meteorologia & Proteção Civil (IPMA / ANEPC):*\n`;
  msg += renderItemLines(alertas, 'https://www.ipma.pt');
  msg += '\n';

  msg += `💶 *Economia:*\n`;
  msg += renderItemLines(economia, 'https://www.rtp.pt/noticias/economia');

  msg += `\n📌 _Mais detalhes:_ \`/noticias_regiao\` | \`/governo\``;

  cacheStore.briefing = { text: msg, ts: now };
  return msg;
}

export default {
  TRUSTED_SOURCES,
  isTrustedSource,
  fetchIpmaPortoWeather,
  getDailyNewsBriefing,
  getRegionalNews,
  getGovNews
};
