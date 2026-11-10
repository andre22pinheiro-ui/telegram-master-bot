import "dotenv/config";
import { VERCEL_APPS, getAppByKeyword } from "./appsCatalog.js";

/**
 * Pesquisa Real e em Tempo Real na Web (sem limites de quota)
 */
export async function searchLiveWeb(query, maxResults = 5) {
  try {
    const clean = String(query || '').trim();
    if (!clean) return [];

    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(clean)}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-PT,pt;q=0.9,en;q=0.8'
      }
    });

    if (!res.ok) return [];
    const text = await res.text();

    const results = [];
    const blocks = text.split(/class="[^"]*results_links[^"]*"/);

    for (let i = 1; i < blocks.length; i++) {
      const block = blocks[i];
      const titleMatch = block.match(/<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i)
        || block.match(/<a[^>]+href="([^"]+)"[^>]+class="[^"]*result__a[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
      const snipMatch = block.match(/class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:a|td|div|span)>/i);

      if (titleMatch) {
        let rawUrl = titleMatch[1];
        if (rawUrl.includes('uddg=')) {
          const u = rawUrl.match(/uddg=([^&]+)/);
          if (u) rawUrl = decodeURIComponent(u[1]);
        }
        const title = titleMatch[2].replace(/<[^>]+>/g, '').trim();
        const snippet = snipMatch ? snipMatch[1].replace(/<[^>]+>/g, '').trim() : '';

        if (title && rawUrl && !rawUrl.includes('duckduckgo.com/y.js')) {
          results.push({ title, url: rawUrl, snippet });
        }
      }
      if (results.length >= maxResults) break;
    }

    return results;
  } catch (err) {
    return [];
  }
}

/**
 * Procura links oficiais na internet ou no ecossistema das tuas apps
 */
export async function searchOnlineLinks(query) {
  const clean = query.trim();
  const lower = clean.toLowerCase();
  const results = [];

  // 1. Procura primeiro nas apps Vercel do André
  if (typeof getAppByKeyword === 'function') {
    const matchedApp = getAppByKeyword(clean);
    if (matchedApp) {
      results.push({
        title: `⚡ ${matchedApp.name} (Vercel Oficial)`,
        url: matchedApp.url,
        snippet: matchedApp.description
      });
    }
  }

  // 2. Procura em Portais Oficiais Conhecidos e Dicionário de Recursos
  if (lower.includes("dre") || lower.includes("lei") || lower.includes("codigo da estrada")) {
    results.push({
      title: "Diário da República Eletrónico (DRE.pt)",
      url: "https://diariodarepublica.pt",
      snippet: "Legislação oficial de Portugal, Código da Estrada e diplomas legais."
    });
  }

  if (lower.includes("cmvm") || lower.includes("banco de portugal") || lower.includes("imobiliario")) {
    results.push({
      title: "CMVM - Regulamento de Avaliação de Imóveis",
      url: "https://www.cmvm.pt",
      snippet: "Critérios oficiais de peritagem e avaliação bancária/patrimonial."
    });
  }

  if (lower.includes("github") || lower.includes("repo") || lower.includes("codigo")) {
    results.push({
      title: "GitHub - André Pinheiro UI",
      url: "https://github.com/andre22pinheiro-ui",
      snippet: "Repositórios de código fonte e pipelines de CI/CD."
    });
  }

  // 3. Pesquisa em Tempo Real na Web
  const liveResults = await searchLiveWeb(clean, 4);
  for (const item of liveResults) {
    if (!results.some(r => r.url === item.url)) {
      results.push(item);
    }
  }

  // 4. Se a busca ao vivo falhou, tenta Wikipédia
  if (results.length === 0) {
    try {
      const wikiUrl = `https://pt.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(clean)}&limit=3&namespace=0&format=json`;
      const res = await fetch(wikiUrl);
      const data = await res.json();
      if (Array.isArray(data) && data[1]?.length > 0) {
        for (let i = 0; i < data[1].length; i++) {
          if (data[3][i]) {
            results.push({
              title: data[1][i],
              url: data[3][i],
              snippet: data[2][i] || "Enciclopédia & Referência Oficial"
            });
          }
        }
      }
    } catch (e) {}
  }

  // 5. Fallback para Google Search
  if (results.length === 0) {
    const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(clean)}`;
    results.push({
      title: `🔍 Pesquisa Google: "${clean}"`,
      url: googleSearchUrl,
      snippet: "Resultados em tempo real na Web."
    });
  }

  return results.slice(0, 5);
}

/**
 * Formatar botões inline (Markup) para o Telegraf a partir de links
 */
export function buildInlineLinkKeyboard(links) {
  if (!links || links.length === 0) return null;
  return {
    inline_keyboard: links.map((l) => [
      {
        text: l.title.length > 35 ? l.title.slice(0, 32) + "..." : l.title,
        url: l.url
      }
    ])
  };
}

export default {
  searchLiveWeb,
  searchOnlineLinks,
  buildInlineLinkKeyboard
};
