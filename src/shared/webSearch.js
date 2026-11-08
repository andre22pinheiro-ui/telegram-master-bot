import "dotenv/config";
import { VERCEL_APPS, getAppByKeyword } from "./appsCatalog.js";

// Procura links oficiais na internet ou no ecossistema das tuas apps
export async function searchOnlineLinks(query) {
  const clean = query.trim();
  const lower = clean.toLowerCase();
  const results = [];

  // 1. Procura primeiro nas apps Vercel do André
  const matchedApp = getAppByKeyword(clean);
  if (matchedApp) {
    results.push({
      title: `⚡ ${matchedApp.name} (Vercel Oficial)`,
      url: matchedApp.url,
      snippet: matchedApp.description
    });
  }

  // 2. Procura em Portais Oficiais Conhecidos e Dicionário de Recursos
  if (lower.includes("dre") || lower.includes("lei") || lower.includes("codigo da estrada")) {
    results.push({
      title: "Diário da República Eletrónico (DRE.pt)",
      url: "https://diariodarepublica.pt",
      snippet: "Legislação oficial de Portugal, Código da Estrada e diplomas legais."
    });
    results.push({
      title: "EUR-Lex (Legislação da União Europeia)",
      url: "https://eur-lex.europa.eu",
      snippet: "Regulamento CE 561/2006 (tacógrafo e tempos de condução)."
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

  if (lower.includes("groq") || lower.includes("lpu")) {
    results.push({
      title: "Groq Cloud Developer Console",
      url: "https://console.groq.com",
      snippet: "Acesso à API ultrarrápida LPU para inferência determinística."
    });
  }

  if (lower.includes("gemini") || lower.includes("google ai")) {
    results.push({
      title: "Google AI Studio",
      url: "https://aistudio.google.com/app/apikey",
      snippet: "Chaves de API e modelos multimodais Gemini 2.5/Flash."
    });
  }

  // 3. Pesquisa na Wikipédia / DuckDuckGo Instant Answer API
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

  // Se nenhum resultado específico, providencia busca Google direta
  if (results.length === 0) {
    const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(clean)}`;
    results.push({
      title: `🔍 Pesquisa Google: "${clean}"`,
      url: googleSearchUrl,
      snippet: "Resultados em tempo real na Web."
    });
  }

  return results.slice(0, 4);
}

// Formatar botões inline (Markup) para o Telegraf a partir de links
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

