// src/services/agentReachService.js — Motor Multiplataforma Agent-Reach (Zero-API-Fee Web Intelligence | ADR-044)
import axios from 'axios';
import { createLogger } from '../utils/logger.js';
import { sqliteMasterDb } from '../shared/sqliteMasterDb.js';

const log = createLogger('AgentReach');

const DEFAULT_TIMEOUT_MS = 6000;
const USER_AGENT = 'AgentReach/2.0 (by /u/AndrePinheiroBot; Cloud-Native Agent Layer)';

/**
 * Cria envelope padronizado de dados (ReachEnvelope)
 */
export function buildReachEnvelope({
  platform,
  query = '',
  url = '',
  title = '',
  author = '',
  snippet = '',
  score = null,
  results = [],
  cached = false,
  status = 'success',
  raw = null
} = {}) {
  return {
    source: 'agent-reach',
    platform: String(platform || 'web').toLowerCase(),
    query: String(query || '').trim(),
    url: String(url || '').trim(),
    title: String(title || '').trim(),
    author: String(author || '').trim(),
    snippet: String(snippet || '').trim().slice(0, 1500),
    score: typeof score === 'number' ? score : null,
    results: Array.isArray(results) ? results : [],
    cached: Boolean(cached),
    status: String(status || 'success'),
    timestamp: new Date().toISOString(),
    raw: raw || null
  };
}

/**
 * Limpa HTML básico para extração de texto quando Jina Reader falha
 */
export function stripHtmlToText(html = '') {
  if (!html) return '';
  return String(html)
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '')
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Canal 1: Leitor Web em Markdown Limpo (Jina Reader com fallback)
 */
export async function readWebPage(rawUrl, { axiosClient = null, useCache = true } = {}) {
  const url = String(rawUrl || '').trim();
  if (!url || !/^https?:\/\//i.test(url)) {
    throw new Error('URL inválido para leitura web. Forneça um URL iniciado por http:// ou https://');
  }

  if (useCache) {
    const cached = sqliteMasterDb.getCachedReach('web', url);
    if (cached) {
      log.info(`[AgentReach] Leitura Web recuperada de cache (0ms): ${url}`);
      return cached;
    }
  }

  const start = Date.now();
  const http = axiosClient || axios;

  try {
    // 1. Tentar Jina Reader (converte páginas em Markdown limpo)
    const jinaUrl = `https://r.jina.ai/${url}`;
    const res = await http.get(jinaUrl, {
      timeout: DEFAULT_TIMEOUT_MS,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/plain, text/markdown'
      }
    });

    const text = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    const titleMatch = text.match(/^Title:\s*(.+)$/m) || text.match(/^#\s*(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : url;

    const envelope = buildReachEnvelope({
      platform: 'web',
      query: url,
      url,
      title,
      author: 'Web Author',
      snippet: text.slice(0, 1500),
      raw: text,
      status: 'success'
    });

    const latency = Date.now() - start;
    sqliteMasterDb.setCachedReach({
      platform: 'web',
      queryOrUrl: url,
      title: envelope.title,
      url,
      snippet: envelope.snippet,
      envelope,
      ttlSeconds: 86400 // 24 horas
    });
    sqliteMasterDb.logReachQuery({ platform: 'web', queryOrUrl: url, resultsCount: 1, latencyMs: latency, status: 'ok' });

    return envelope;
  } catch (err) {
    log.warn(`[AgentReach] Jina Reader falhou para ${url}: ${err.message}. A recorrer a fallback direto.`);
    // 2. Fallback direto HTTP com sanitização de texto
    try {
      const directRes = await http.get(url, {
        timeout: DEFAULT_TIMEOUT_MS,
        headers: { 'User-Agent': USER_AGENT }
      });
      const rawBody = typeof directRes.data === 'string' ? directRes.data : '';
      const cleanText = stripHtmlToText(rawBody).slice(0, 1500);

      const envelope = buildReachEnvelope({
        platform: 'web',
        query: url,
        url,
        title: url,
        snippet: cleanText || 'Não foi possível extrair texto legível.',
        status: 'fallback'
      });

      const latency = Date.now() - start;
      sqliteMasterDb.setCachedReach({
        platform: 'web',
        queryOrUrl: url,
        title: envelope.title,
        url,
        snippet: envelope.snippet,
        envelope,
        ttlSeconds: 43200 // 12 horas
      });
      sqliteMasterDb.logReachQuery({ platform: 'web', queryOrUrl: url, resultsCount: 1, latencyMs: latency, status: 'fallback' });

      return envelope;
    } catch (fallbackErr) {
      log.error(`[AgentReach] Falha total ao ler página ${url}: ${fallbackErr.message}`);
      return buildReachEnvelope({
        platform: 'web',
        query: url,
        url,
        title: 'Erro de Leitura Web',
        snippet: `Incapaz de ler ${url}: ${fallbackErr.message}`,
        status: 'error'
      });
    }
  }
}

/**
 * Canal 2: Reddit Community Reach (Zero API Key via Open JSON Endpoints)
 */
export async function searchReddit(query, { subreddit = null, limit = 5, axiosClient = null, useCache = true } = {}) {
  const cleanQuery = String(query || '').trim();
  if (!cleanQuery) throw new Error('Consulta de pesquisa Reddit é obrigatória.');

  const cacheKey = subreddit ? `r/${subreddit}:${cleanQuery}` : cleanQuery;
  if (useCache) {
    const cached = sqliteMasterDb.getCachedReach('reddit', cacheKey);
    if (cached) return cached;
  }

  const start = Date.now();
  const http = axiosClient || axios;

  try {
    const endpoint = subreddit
      ? `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/search.json?q=${encodeURIComponent(cleanQuery)}&restrict_sr=1&limit=${limit}&sort=relevance`
      : `https://www.reddit.com/search.json?q=${encodeURIComponent(cleanQuery)}&limit=${limit}&sort=relevance`;

    const res = await http.get(endpoint, {
      timeout: DEFAULT_TIMEOUT_MS,
      headers: { 'User-Agent': USER_AGENT }
    });

    const posts = res.data?.data?.children || [];
    const results = posts.map((p) => {
      const d = p.data || {};
      return {
        id: d.id,
        title: d.title || 'Sem título',
        author: d.author ? `u/${d.author}` : 'desconhecido',
        subreddit: d.subreddit_name_prefixed || (d.subreddit ? `r/${d.subreddit}` : 'r/reddit'),
        score: Number(d.score || 0),
        commentsCount: Number(d.num_comments || 0),
        url: d.permalink ? `https://reddit.com${d.permalink}` : (d.url || ''),
        snippet: (d.selftext || '').slice(0, 300)
      };
    });

    const first = results[0] || {};
    const envelope = buildReachEnvelope({
      platform: 'reddit',
      query: cleanQuery,
      title: first.title || `Resultados Reddit para "${cleanQuery}"`,
      author: first.author || 'Reddit Community',
      url: first.url || `https://reddit.com/search?q=${encodeURIComponent(cleanQuery)}`,
      snippet: first.snippet || (results.length ? `${results.length} discussões encontradas no Reddit.` : 'Nenhuma discussão encontrada.'),
      score: first.score || 0,
      results,
      status: 'success'
    });

    const latency = Date.now() - start;
    sqliteMasterDb.setCachedReach({
      platform: 'reddit',
      queryOrUrl: cacheKey,
      title: envelope.title,
      url: envelope.url,
      snippet: envelope.snippet,
      envelope,
      ttlSeconds: 1800 // 30 minutos
    });
    sqliteMasterDb.logReachQuery({ platform: 'reddit', queryOrUrl: cacheKey, resultsCount: results.length, latencyMs: latency, status: 'ok' });

    return envelope;
  } catch (err) {
    log.warn(`[AgentReach] Pesquisa Reddit falhou para "${cleanQuery}": ${err.message}`);
    return buildReachEnvelope({
      platform: 'reddit',
      query: cleanQuery,
      title: `Resultados Reddit: ${cleanQuery}`,
      snippet: `Serviço Reddit temporariamente indisponível (${err.message}). Tente mais tarde.`,
      status: 'error',
      results: []
    });
  }
}

/**
 * Canal 3: Hacker News Tech Pulse (Firebase REST API Oficial Zero-Auth)
 */
export async function getHackerNewsTop({ limit = 5, axiosClient = null, useCache = true } = {}) {
  const cacheKey = `top:${limit}`;
  if (useCache) {
    const cached = sqliteMasterDb.getCachedReach('hackernews', cacheKey);
    if (cached) return cached;
  }

  const start = Date.now();
  const http = axiosClient || axios;

  try {
    const topRes = await http.get('https://hacker-news.firebaseio.com/v0/topstories.json', {
      timeout: DEFAULT_TIMEOUT_MS,
      headers: { 'User-Agent': USER_AGENT }
    });

    const ids = (topRes.data || []).slice(0, limit);
    const itemPromises = ids.map(async (id) => {
      try {
        const itemRes = await http.get(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, {
          timeout: 4000,
          headers: { 'User-Agent': USER_AGENT }
        });
        const d = itemRes.data || {};
        return {
          id: d.id,
          title: d.title || 'Sem título',
          author: d.by || 'HN User',
          score: Number(d.score || 0),
          commentsCount: Number(d.descendants || 0),
          url: d.url || `https://news.ycombinator.com/item?id=${d.id}`,
          hnUrl: `https://news.ycombinator.com/item?id=${d.id}`,
          time: d.time ? new Date(d.time * 1000).toISOString() : new Date().toISOString()
        };
      } catch {
        return null;
      }
    });

    const items = (await Promise.all(itemPromises)).filter(Boolean);
    const first = items[0] || {};

    const envelope = buildReachEnvelope({
      platform: 'hackernews',
      query: 'top',
      title: first.title || 'Top Hacker News Tech Pulse',
      author: first.author || 'YCombinator',
      url: first.url || 'https://news.ycombinator.com',
      score: first.score || 0,
      snippet: `${items.length} principais destaques de tecnologia recolhidos do Hacker News.`,
      results: items,
      status: 'success'
    });

    const latency = Date.now() - start;
    sqliteMasterDb.setCachedReach({
      platform: 'hackernews',
      queryOrUrl: cacheKey,
      title: envelope.title,
      url: envelope.url,
      snippet: envelope.snippet,
      envelope,
      ttlSeconds: 900 // 15 minutos
    });
    sqliteMasterDb.logReachQuery({ platform: 'hackernews', queryOrUrl: cacheKey, resultsCount: items.length, latencyMs: latency, status: 'ok' });

    return envelope;
  } catch (err) {
    log.warn(`[AgentReach] Hacker News falhou: ${err.message}`);
    return buildReachEnvelope({
      platform: 'hackernews',
      query: 'top',
      title: 'Top Hacker News',
      snippet: `Indisponível no momento (${err.message}).`,
      status: 'error',
      results: []
    });
  }
}

/**
 * Canal 4: GitHub Developer Reach (Pesquisa de Repositórios e Metadados)
 */
export async function searchGitHub(query, { limit = 5, axiosClient = null, useCache = true } = {}) {
  const cleanQuery = String(query || '').trim();
  if (!cleanQuery) throw new Error('Consulta GitHub é obrigatória.');

  if (useCache) {
    const cached = sqliteMasterDb.getCachedReach('github', cleanQuery);
    if (cached) return cached;
  }

  const start = Date.now();
  const http = axiosClient || axios;
  const headers = { 'User-Agent': USER_AGENT, 'Accept': 'application/vnd.github.v3+json' };
  if (process.env.GITHUB_TOKEN) {
    headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;
  }

  try {
    const endpoint = `https://api.github.com/search/repositories?q=${encodeURIComponent(cleanQuery)}&per_page=${limit}`;
    const res = await http.get(endpoint, { timeout: DEFAULT_TIMEOUT_MS, headers });
    const items = res.data?.items || [];

    const results = items.map((r) => ({
      fullName: r.full_name,
      description: r.description || 'Sem descrição.',
      stars: Number(r.stargazers_count || 0),
      forks: Number(r.forks_count || 0),
      language: r.language || 'Geral',
      url: r.html_url,
      updatedAt: r.updated_at
    }));

    const first = results[0] || {};
    const envelope = buildReachEnvelope({
      platform: 'github',
      query: cleanQuery,
      title: first.fullName || `Repositórios para "${cleanQuery}"`,
      author: first.fullName ? first.fullName.split('/')[0] : 'GitHub',
      url: first.url || `https://github.com/search?q=${encodeURIComponent(cleanQuery)}`,
      score: first.stars || 0,
      snippet: first.description || `${results.length} repositórios encontrados.`,
      results,
      status: 'success'
    });

    const latency = Date.now() - start;
    sqliteMasterDb.setCachedReach({
      platform: 'github',
      queryOrUrl: cleanQuery,
      title: envelope.title,
      url: envelope.url,
      snippet: envelope.snippet,
      envelope,
      ttlSeconds: 3600 // 1 hora
    });
    sqliteMasterDb.logReachQuery({ platform: 'github', queryOrUrl: cleanQuery, resultsCount: results.length, latencyMs: latency, status: 'ok' });

    return envelope;
  } catch (err) {
    log.warn(`[AgentReach] GitHub Search falhou para "${cleanQuery}": ${err.message}`);
    return buildReachEnvelope({
      platform: 'github',
      query: cleanQuery,
      title: `GitHub: ${cleanQuery}`,
      snippet: `API GitHub indisponível ou rate-limited (${err.message}).`,
      status: 'error',
      results: []
    });
  }
}

/**
 * Canal 5: YouTube Video Metadata Reach (OEmbed Zero-Auth)
 */
export async function getYouTubeMetadata(videoUrl, { axiosClient = null, useCache = true } = {}) {
  const url = String(videoUrl || '').trim();
  if (!url || !/(?:youtube\.com|youtu\.be)/i.test(url)) {
    throw new Error('URL de vídeo YouTube inválido.');
  }

  if (useCache) {
    const cached = sqliteMasterDb.getCachedReach('youtube', url);
    if (cached) return cached;
  }

  const start = Date.now();
  const http = axiosClient || axios;

  try {
    const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const res = await http.get(endpoint, { timeout: DEFAULT_TIMEOUT_MS, headers: { 'User-Agent': USER_AGENT } });
    const d = res.data || {};

    const envelope = buildReachEnvelope({
      platform: 'youtube',
      query: url,
      url,
      title: d.title || 'Vídeo YouTube',
      author: d.author_name || 'Canal YouTube',
      snippet: `Vídeo por ${d.author_name || 'Desconhecido'} (${d.provider_name || 'YouTube'})`,
      raw: d,
      status: 'success'
    });

    const latency = Date.now() - start;
    sqliteMasterDb.setCachedReach({
      platform: 'youtube',
      queryOrUrl: url,
      title: envelope.title,
      author: envelope.author,
      url,
      snippet: envelope.snippet,
      envelope,
      ttlSeconds: 604800 // 7 dias
    });
    sqliteMasterDb.logReachQuery({ platform: 'youtube', queryOrUrl: url, resultsCount: 1, latencyMs: latency, status: 'ok' });

    return envelope;
  } catch (err) {
    log.warn(`[AgentReach] YouTube OEmbed falhou para ${url}: ${err.message}`);
    return buildReachEnvelope({
      platform: 'youtube',
      query: url,
      url,
      title: 'YouTube Vídeo',
      snippet: `Incapaz de obter metadados do vídeo (${err.message}).`,
      status: 'error'
    });
  }
}

/**
 * Canal 6: Wikipedia Knowledge & Encyclopedic Reach (API REST Pública)
 */
export async function searchWikipedia(query, { lang = 'pt', axiosClient = null, useCache = true } = {}) {
  const cleanQuery = String(query || '').trim();
  if (!cleanQuery) throw new Error('Consulta Wikipedia é obrigatória.');

  const cacheKey = `${lang}:${cleanQuery}`;
  if (useCache) {
    const cached = sqliteMasterDb.getCachedReach('wikipedia', cacheKey);
    if (cached) return cached;
  }

  const start = Date.now();
  const http = axiosClient || axios;

  try {
    const searchUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(cleanQuery)}&format=json&origin=*`;
    const sRes = await http.get(searchUrl, { timeout: DEFAULT_TIMEOUT_MS, headers: { 'User-Agent': USER_AGENT } });
    const items = sRes.data?.query?.search || [];

    if (items.length === 0) {
      return buildReachEnvelope({
        platform: 'wikipedia',
        query: cleanQuery,
        title: `Wikipédia: "${cleanQuery}"`,
        snippet: `Nenhum artigo encontrado na Wikipédia (${lang.toUpperCase()}) para "${cleanQuery}".`,
        results: [],
        status: 'success'
      });
    }

    const firstTitle = items[0].title;
    let extract = stripHtmlToText(items[0].snippet);
    let pageUrl = `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(firstTitle)}`;

    try {
      const summaryUrl = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(firstTitle)}`;
      const sumRes = await http.get(summaryUrl, { timeout: 4000, headers: { 'User-Agent': USER_AGENT } });
      if (sumRes.data?.extract) {
        extract = sumRes.data.extract;
      }
      if (sumRes.data?.content_urls?.desktop?.page) {
        pageUrl = sumRes.data.content_urls.desktop.page;
      }
    } catch {}

    const results = items.map((it) => ({
      title: it.title,
      snippet: stripHtmlToText(it.snippet),
      url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(it.title)}`
    }));

    const envelope = buildReachEnvelope({
      platform: 'wikipedia',
      query: cleanQuery,
      title: firstTitle,
      author: `Wikipédia (${lang.toUpperCase()})`,
      url: pageUrl,
      snippet: extract,
      results,
      status: 'success'
    });

    const latency = Date.now() - start;
    sqliteMasterDb.setCachedReach({
      platform: 'wikipedia',
      queryOrUrl: cacheKey,
      title: envelope.title,
      url: envelope.url,
      snippet: envelope.snippet,
      envelope,
      ttlSeconds: 86400 // 24 horas
    });
    sqliteMasterDb.logReachQuery({ platform: 'wikipedia', queryOrUrl: cacheKey, resultsCount: results.length, latencyMs: latency, status: 'ok' });

    return envelope;
  } catch (err) {
    log.warn(`[AgentReach] Wikipédia falhou para "${cleanQuery}": ${err.message}`);
    return buildReachEnvelope({
      platform: 'wikipedia',
      query: cleanQuery,
      title: `Wikipédia: ${cleanQuery}`,
      snippet: `Enciclopédia indisponível (${err.message}).`,
      status: 'error',
      results: []
    });
  }
}

/**
 * Diagnóstico de Saúde de Todos os Canais (Doctor)
 */
export async function runAgentReachDoctor({ axiosClient = null } = {}) {
  const http = axiosClient || axios;
  const backends = [
    { name: 'Web Reader (Jina)', checkUrl: 'https://r.jina.ai/https://example.com' },
    { name: 'Reddit JSON', checkUrl: 'https://www.reddit.com/r/technology/top.json?limit=1' },
    { name: 'Hacker News API', checkUrl: 'https://hacker-news.firebaseio.com/v0/maxitem.json' },
    { name: 'GitHub API', checkUrl: 'https://api.github.com/zen' },
    { name: 'YouTube OEmbed', checkUrl: 'https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=dQw4w9WgXcQ&format=json' },
    { name: 'Wikipédia API', checkUrl: 'https://pt.wikipedia.org/w/api.php?action=query&meta=siteinfo&format=json&origin=*' }
  ];

  const results = [];
  for (const b of backends) {
    const t0 = Date.now();
    try {
      await http.get(b.checkUrl, {
        timeout: 4000,
        headers: { 'User-Agent': USER_AGENT }
      });
      results.push({ name: b.name, status: 'healthy', latencyMs: Date.now() - t0 });
    } catch (err) {
      // 403/429 ainda indica que o host está online
      const isDegraded = err.response && [403, 429].includes(err.response.status);
      results.push({
        name: b.name,
        status: isDegraded ? 'rate_limited' : 'degraded',
        latencyMs: Date.now() - t0,
        error: err.message
      });
    }
  }

  const healthyCount = results.filter((r) => r.status === 'healthy').length;
  const stats = sqliteMasterDb.getReachStats();

  return {
    ok: healthyCount >= 3,
    timestamp: new Date().toISOString(),
    healthyCount,
    totalCount: results.length,
    backends: results,
    stats
  };
}

/**
 * Despacho Unificado de Reach
 */
export async function reach(action, queryOrUrl, options = {}) {
  const act = String(action || 'web').toLowerCase().trim();
  switch (act) {
    case 'read':
    case 'web':
      return await readWebPage(queryOrUrl, options);
    case 'reddit':
      return await searchReddit(queryOrUrl, options);
    case 'hn':
    case 'hackernews':
      return await getHackerNewsTop(options);
    case 'gh':
    case 'github':
      return await searchGitHub(queryOrUrl, options);
    case 'yt':
    case 'youtube':
      return await getYouTubeMetadata(queryOrUrl, options);
    case 'wiki':
    case 'wikipedia':
      return await searchWikipedia(queryOrUrl, options);
    case 'doctor':
      return await runAgentReachDoctor(options);
    default:
      if (/^https?:\/\//i.test(queryOrUrl || act)) {
        return await readWebPage(queryOrUrl || act, options);
      }
      return await searchReddit(queryOrUrl || act, options);
  }
}

/**
 * Formatador Markdown para Telegram de um Envelope de Reach
 */
export function formatReachEnvelopeMarkdown(env) {
  if (!env) return '⚠️ *Agent-Reach:* Nenhum dado retornado.';

  const cacheTag = env.cached ? ' _(⚡ Cache SQLite)_' : '';
  let msg = `🌐 *AGENT-REACH: [${env.platform.toUpperCase()}]*${cacheTag}\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;

  if (env.title) {
    msg += `📌 *${env.title}*\n`;
  }
  if (env.author) {
    msg += `👤 *Autor/Fonte:* \`${env.author}\`\n`;
  }
  if (env.score !== null) {
    msg += `⭐ *Pontuação/Score:* \`${env.score}\`\n`;
  }
  if (env.url) {
    msg += `🔗 *Link:* ${env.url}\n`;
  }

  msg += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;

  if (env.results && env.results.length > 0) {
    msg += `📑 *Resultados Principais:*\n`;
    env.results.slice(0, 5).forEach((r, idx) => {
      const title = r.title || r.fullName || 'Sem título';
      const link = r.url ? `([Abrir](${r.url}))` : '';
      const sc = r.score !== undefined ? ` • ⭐ ${r.score}` : (r.stars !== undefined ? ` • ⭐ ${r.stars}` : '');
      msg += `*${idx + 1}.* ${title} ${sc} ${link}\n`;
      if (r.snippet || r.description) {
        msg += `   ↳ _${(r.snippet || r.description).slice(0, 140)}..._\n`;
      }
    });
  } else if (env.snippet) {
    msg += `📝 *Excerto:* \n${env.snippet.slice(0, 1000)}\n`;
  }

  msg += `\n🔒 _Governação ADR-044: Zero API Fees • Cache SQLite WAL persistente._`;
  return msg;
}

/**
 * Formatador Markdown do Diagnóstico Doctor
 */
export function formatDoctorMarkdown(report) {
  let msg = `🩺 *DIAGNÓSTICO AGENT-REACH (Zero-API-Fee)*\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `📅 *Timestamp:* \`${new Date(report.timestamp).toLocaleTimeString('pt-PT')}\`\n`;
  msg += `📊 *Canais Ativos:* \`${report.healthyCount}/${report.totalCount}\` operacionais\n\n`;

  report.backends.forEach((b) => {
    const icon = b.status === 'healthy' ? '✅' : (b.status === 'rate_limited' ? '⚠️' : '❌');
    msg += `${icon} *${b.name}:* \`${b.latencyMs}ms\` (${b.status})\n`;
  });

  if (report.stats) {
    msg += `\n💾 *Cache & Telemetria SQLite:*\n`;
    msg += `• Entradas em Cache: \`${report.stats.cachedEntries}\`\n`;
    msg += `• Consultas Registadas: \`${report.stats.totalQueries}\`\n`;
    msg += `• Latência Média: \`${report.stats.averageLatencyMs}ms\`\n`;
  }

  msg += `\n🔒 _Todos os canais usam endpoints públicos abertos sem dependência de chaves pagas._`;
  return msg;
}

/**
 * Formatador do Menu Geral /reach
 */
export function formatReachMenuMarkdown() {
  return (
    `🌐 *AGENT-REACH — INTELIGÊNCIA WEB ZERO-API-FEE*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `Camada de pesquisa e leitura aberta na Internet sem chaves de API pagas (ADR-044):\n\n` +
    `🔹 \`/reach read <url>\` — Lê artigo/página limpa em Markdown\n` +
    `🔹 \`/reach reddit <pesquisa>\` — Discussões e tópicos no Reddit\n` +
    `🔹 \`/reach hn\` — Top 5 tendências do Hacker News\n` +
    `🔹 \`/reach gh <pesquisa>\` — Repositórios e estrelas no GitHub\n` +
    `🔹 \`/reach yt <url>\` — Metadados de vídeo YouTube (oembed)\n` +
    `🔹 \`/reach wiki <pesquisa>\` — Resumos factuais da Wikipédia\n` +
    `🔹 \`/reach doctor\` — Diagnóstico de latência dos 6 canais\n\n` +
    `⚡ *Atalhos Rápidos:*\n` +
    `• \`/read <url>\`\n` +
    `• \`/hn\`\n` +
    `• \`/reddit <pesquisa>\`\n` +
    `• \`/wiki <pesquisa>\`\n\n` +
    `💾 _Resultados são cacheados em SQLite WAL para resposta sub-5ms em chamadas repetidas._`
  );
}

export default {
  buildReachEnvelope,
  stripHtmlToText,
  readWebPage,
  searchReddit,
  getHackerNewsTop,
  searchGitHub,
  getYouTubeMetadata,
  searchWikipedia,
  runAgentReachDoctor,
  reach,
  formatReachEnvelopeMarkdown,
  formatDoctorMarkdown,
  formatReachMenuMarkdown
};
