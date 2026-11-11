// src/services/appleRadarService.js — Frente 5: Ecossistema Apple (Novo 3A vs Recondicionado Grau A)
import { sqliteMasterDb } from '../shared/sqliteMasterDb.js';
import { parsePriceEur, runWebFrontSearch } from './radarCommon.js';

export const APPLE_RETAIL_PORTALS = [
  { nome: 'Apple Oficial Refurbished PT', tipo: 'Recondicionado Oficial', garantiaMeses: 24, buildUrl: () => 'https://www.apple.com/pt/shop/refurbished' },
  { nome: 'iServices (Recondicionados PT)', tipo: 'Recondicionado Grau A', garantiaMeses: 36, buildUrl: (q) => `https://iservices.pt/pesquisa?s=${encodeURIComponent(q)}` },
  { nome: 'Swappie', tipo: 'Recondicionado Grau A', garantiaMeses: 24, buildUrl: (q) => `https://swappie.com/pt/?s=${encodeURIComponent(q)}` },
  { nome: 'Back Market PT', tipo: 'Recondicionado Grau A', garantiaMeses: 12, buildUrl: (q) => `https://www.backmarket.pt/pt-pt/search?q=${encodeURIComponent(q)}` },
  { nome: 'Forall Phones', tipo: 'Recondicionado Grau A', garantiaMeses: 36, buildUrl: (q) => `https://forallphones.com/pt/search?q=${encodeURIComponent(q)}` },
  { nome: 'Amazon.es (Apple / Renewed)', tipo: 'Novo / Renewed', garantiaMeses: 36, buildUrl: (q) => `https://www.amazon.es/s?k=${encodeURIComponent(q)}` },
  { nome: 'PCDiga (Novo Selado 3A)', tipo: 'Novo Selado', garantiaMeses: 36, buildUrl: (q) => `https://www.pcdiga.com/catalogsearch/result/?q=${encodeURIComponent(q)}` }
];

function detectAppleChannel(url = '', text = '') {
  const lower = `${url} ${text}`.toLowerCase();
  if (lower.includes('iservices')) return { loja: 'iServices', condicao: 'Recondicionado Grau A', garantia: 36, bateria: '>=85% (ou nova)' };
  if (lower.includes('swappie')) return { loja: 'Swappie', condicao: 'Recondicionado Grau A', garantia: 24, bateria: '>=86%' };
  if (lower.includes('backmarket')) return { loja: 'Back Market', condicao: 'Recondicionado Grau A', garantia: 12, bateria: '>=85%' };
  if (lower.includes('forallphones')) return { loja: 'Forall Phones', condicao: 'Recondicionado Grau A', garantia: 36, bateria: '>=85%' };
  if (lower.includes('apple.com/pt/shop/refurbished')) return { loja: 'Apple Refurbished Oficial', condicao: 'Recondicionado Oficial', garantia: 24, bateria: '100% Nova' };
  if (lower.includes('amazon.es') && /renewed|reacondicionad/i.test(lower)) return { loja: 'Amazon Renewed', condicao: 'Recondicionado', garantia: 12, bateria: '>=80%' };
  if (lower.includes('pcdiga')) return { loja: 'PCDiga', condicao: 'Novo Selado', garantia: 36, bateria: '100%' };
  if (lower.includes('fnac')) return { loja: 'Fnac PT', condicao: 'Novo Selado', garantia: 36, bateria: '100%' };
  if (lower.includes('worten')) return { loja: 'Worten', condicao: 'Novo Selado', garantia: 36, bateria: '100%' };
  if (lower.includes('amazon.es')) return { loja: 'Amazon.es', condicao: 'Novo Selado', garantia: 36, bateria: '100%' };
  return {
    loja: 'Retalho Apple PT',
    condicao: /recondicionad|refurb|grau\s*a|usado/i.test(lower) ? 'Recondicionado Grau A' : 'Novo Selado',
    garantia: /recondicionad|refurb/i.test(lower) ? 24 : 36,
    bateria: /recondicionad|refurb/i.test(lower) ? '>=85%' : '100%'
  };
}

/**
 * Analisa comparativamente Novo vs Recondicionado Grau A com base em preços observados reais.
 */
export function evaluateAppleComparison(novoPrice, refurbPrice) {
  if (!novoPrice || !refurbPrice || novoPrice <= 0 || refurbPrice <= 0) {
    return { diferenca: 0, pctPoupanca: 0, recomenda: 'Consultar preço novo vs Grau A antes de decidir.' };
  }
  const diferenca = Math.round((novoPrice - refurbPrice) * 100) / 100;
  const pct = Math.round((diferenca / novoPrice) * 100);
  if (pct >= 20 && diferenca >= 120) {
    return { diferenca, pctPoupanca: pct, recomenda: `✅ COMPENSA RECONDICIONADO GRAU A (Poupa ${diferenca} € | -${pct}%)` };
  }
  if (diferenca < 80) {
    return { diferenca, pctPoupanca: pct, recomenda: `🆕 PREFERIR NOVO SELADO (Diferença de apenas ${diferenca} € vale 3 anos garantia DL 84/2021 + bateria 100%)` };
  }
  return { diferenca, pctPoupanca: pct, recomenda: `⚖️ EQUILIBRADO (Poupança ${diferenca} € / ${pct}% — validar garantia DL 84/2021, bateria >=85% e peças originais)` };
}

export async function searchApple(query = 'iPhone 15 Pro 256GB') {
  const cleanQ = String(query || '').trim() || 'iPhone 15 128GB';
  const capMatch = cleanQ.match(/\b(64GB|128GB|256GB|512GB|1TB|16GB)\b/i);
  const capacidade = capMatch ? capMatch[1].toUpperCase() : 'Standard';

  const queries = [
    `${cleanQ} novo preco (site:pcdiga.com OR site:amazon.es OR site:worten.pt OR site:fnac.pt)`,
    `${cleanQ} recondicionado (site:iservices.pt OR site:swappie.com OR site:backmarket.pt OR site:forallphones.com)`
  ];

  const result = await runWebFrontSearch({
    queries,
    maxPerQuery: 3,
    parseHit: (hit) => {
      const combined = `${hit.title} ${hit.snippet}`;
      const preco = parsePriceEur(combined, { min: 90, max: 5000 });
      const channel = detectAppleChannel(hit.url, combined);

      return {
        fingerprint: `apple_${cleanQ}_${channel.condicao}_${hit.url.slice(-20)}`,
        modelo: hit.title.slice(0, 85),
        capacidade,
        condicao: channel.condicao,
        loja: channel.loja,
        bateria_pct: channel.bateria,
        garantia_meses: channel.garantia,
        preco,
        diferenca_novo_eur: 0,
        recomendacao: `${channel.condicao} | Garantia ${channel.garantia}m`,
        url: hit.url
      };
    },
    saveHit: (item) => sqliteMasterDb.upsertRadarApple(item)
  });

  // Calcular comparação objetiva Novo vs Recondicionado apenas quando houver preços reais em ambos
  const novos = result.items.filter((i) => i.preco > 0 && /Novo/i.test(i.condicao)).sort((a, b) => a.preco - b.preco);
  const refurbs = result.items.filter((i) => i.preco > 0 && /Recondicionado/i.test(i.condicao)).sort((a, b) => a.preco - b.preco);
  const comparison =
    novos[0] && refurbs[0]
      ? evaluateAppleComparison(novos[0].preco, refurbs[0].preco)
      : evaluateAppleComparison(0, 0);

  return { query: cleanQ, novos, refurbs, comparison, ...result };
}

export async function scanApple() {
  return await searchApple('iPhone 15 128GB MacBook Air M3');
}

export function formatAppleMarkdown({ query = '', items = [], novos = [], refurbs = [], comparison = null }) {
  let md = `🍎 *RADAR APPLE: NOVO SELADO (3A DL 84/2021) vs RECONDICIONADO GRAU A*\n`;
  md += `🔍 *Modelo:* \`${query}\` | ⚖️ *Conformidade:* DL n.º 84/2021 & Dir. Omnibus (UE) 2019/2161\n`;
  md += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  if (novos.length > 0 && refurbs.length > 0 && comparison?.diferenca > 0) {
    md += `⚖️ *VEREDITO COMPARATIVO:*\n`;
    md += `• Novo mais baixo (${novos[0].loja}): *${novos[0].preco} €*\n`;
    md += `• Grau A mais baixo (${refurbs[0].loja}): *${refurbs[0].preco} €*\n`;
    md += `• ${comparison.recomenda}\n\n`;
  }

  if (items.length === 0) {
    md += `_Sem preços individuais extraídos neste segundo. Compara diretamente entre Novos 3A e Recondicionados Grau A:_\n\n`;
    for (const p of APPLE_RETAIL_PORTALS) {
      md += `• **${p.nome}** _(${p.tipo}, Garantia ${p.garantiaMeses}m)_: ${p.buildUrl(query)}\n`;
    }
    return md;
  }

  items.slice(0, 6).forEach((it, idx) => {
    const precoTxt = it.preco > 0 ? `*${Number(it.preco).toLocaleString('pt-PT')} €*` : '_Consultar preço na loja_';
    const icon = /Novo/i.test(it.condicao) ? '🆕' : '♻️';
    md += `*${idx + 1}. [${it.modelo}](${it.url})*\n`;
    md += `   ${icon} *${it.condicao}* (${it.loja}) | 💰 ${precoTxt}\n`;
    md += `   🔋 Bateria: ${it.bateria_pct} | 🛡️ Garantia: ${it.garantia_meses} meses\n`;
    if (it.priceDropped && it.previousPrice) {
      md += `   📉 *BAIXA DE PREÇO:* ${it.previousPrice} € ➔ *${it.preco} €*\n`;
    }
    md += `\n`;
  });

  md += `💡 _Monitorizar este modelo:_ \`/vigiar apple ${query} 650\``;
  return md;
}

export default {
  APPLE_RETAIL_PORTALS,
  evaluateAppleComparison,
  searchApple,
  scanApple,
  formatAppleMarkdown
};

