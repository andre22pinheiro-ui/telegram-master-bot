// src/services/amazonRadarService.js — Frente 4: Radar Amazon.es & Segunda Mano (Warehouse)
import { sqliteMasterDb } from '../shared/sqliteMasterDb.js';
import { parsePriceEur, runWebFrontSearch } from './radarCommon.js';

export const AMAZON_LINKS = [
  { nome: 'Amazon.es (Pesquisa Direta)', buildUrl: (q) => `https://www.amazon.es/s?k=${encodeURIComponent(q)}` },
  { nome: 'Amazon Segunda Mano (Warehouse)', buildUrl: (q) => `https://www.amazon.es/s?k=${encodeURIComponent(q)}&rh=n%3A3582001031` },
  { nome: 'Keepa (Histórico de Preços Amazon.es)', buildUrl: (q) => `https://keepa.com/#!search/9-${encodeURIComponent(q)}` },
  { nome: 'Chollometro (Chollos Amazon.es)', buildUrl: (q) => `https://www.chollometro.com/search?q=${encodeURIComponent(q)}` }
];

/**
 * Validação Diretiva Omnibus (UE) 2019/2161: compara preço atual vs menor preço real dos últimos 90 dias no SQLite.
 */
export function validateOmnibus90DayDeal(item = {}, historicalRows = []) {
  const precoAtual = Number(item.preco) || 0;
  if (precoAtual <= 0) {
    return { status: 'unknown', min90d: 0, label: 'Consultar preço atual (Omnibus UE 2019/2161)' };
  }

  const nowMs = Date.now();
  const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
  const matches = historicalRows.filter((row) => {
    const sameUrl = item.url && row.url === item.url;
    const sameAsin = item.asin && row.asin && row.asin === item.asin;
    const within90d = !row.data_atualizacao || nowMs - new Date(row.data_atualizacao).getTime() <= ninetyDaysMs;
    return (sameUrl || sameAsin) && Number(row.preco) > 0 && within90d;
  });

  if (matches.length === 0) {
    return { status: 'baseline', min90d: precoAtual, label: '1.º registo histórico (base 90 dias Omnibus)' };
  }

  const prices = matches.map((r) => Number(r.preco)).concat(precoAtual);
  const min90d = Math.min(...prices);
  const prevMin = Math.min(...matches.map((r) => Number(r.preco)));

  if (precoAtual <= min90d && precoAtual < prevMin) {
    return { status: 'true_min_90d', min90d, label: `✅ Mínimo real 90 dias (Omnibus UE 2019/2161 — antes min. ${prevMin} €)` };
  }
  if (precoAtual > min90d) {
    return { status: 'not_lowest_90d', min90d, label: `⚠️ Não é mínimo 90d (já esteve a ${min90d} €)` };
  }
  return { status: 'matched_min_90d', min90d, label: `ℹ️ Igual ao mínimo conhecido 90d (${min90d} €)` };
}

export async function searchAmazon(query = 'chollos tecnologia casa airfryer') {
  const cleanQ = String(query || '').trim() || 'oferta flash tecnologia amazon';
  const queries = [
    `${cleanQ} site:amazon.es/dp`,
    `${cleanQ} "segunda mano" OR oferta site:amazon.es`,
    `${cleanQ} amazon site:chollometro.com`
  ];

  const historySnapshot = sqliteMasterDb.getRadarAmazon(80);
  const result = await runWebFrontSearch({
    queries,
    maxPerQuery: 3,
    parseHit: (hit) => {
      const combined = `${hit.title} ${hit.snippet}`;
      const preco = parsePriceEur(combined, { min: 5, max: 6000 });
      const asinMatch = hit.url.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
      const isWarehouse = /segunda mano|warehouse|reacondicionad/i.test(combined);
      const pctMatch = combined.match(/-(\d{1,2})\s*%/);
      const item = {
        fingerprint: `amz_${asinMatch ? asinMatch[1] : cleanQ}_${hit.url.slice(-20)}`,
        titulo: hit.title.slice(0, 95),
        asin: asinMatch ? asinMatch[1].toUpperCase() : null,
        categoria: isWarehouse ? 'warehouse' : 'amazon_es',
        condicao: isWarehouse ? 'Amazon Segunda Mano' : 'Novo',
        preco,
        preco_habitual: 0,
        desconto_pct: pctMatch ? parseFloat(pctMatch[1]) : 0,
        fonte: hit.url.includes('chollometro.com') ? 'Chollometro' : 'Amazon.es',
        url: hit.url
      };
      item.omnibus = validateOmnibus90DayDeal(item, historySnapshot);
      return item;
    },
    saveHit: (item) => sqliteMasterDb.upsertRadarAmazon(item)
  });

  return { query: cleanQ, ...result };
}

export async function scanAmazon() {
  return await searchAmazon('oferta tecnologia casa ssd amazon.es');
}

export function formatAmazonMarkdown({ query = '', items = [] }) {
  let md = `📦 *RADAR AMAZON.ES & SEGUNDA MANO (WAREHOUSE)*\n`;
  md += `🔍 *Pesquisa:* \`${query}\` | ⚖️ *Validação:* Diretiva Omnibus (UE) 2019/2161\n`;
  md += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  if (items.length === 0) {
    md += `_Sem resultados web imediatos extraídos neste instante. Verifica diretamente preços e histórico Keepa:_\n\n`;
    for (const a of AMAZON_LINKS) {
      md += `• [${a.nome}](${a.buildUrl(query)})\n`;
    }
    return md;
  }

  items.slice(0, 6).forEach((it, idx) => {
    const precoTxt = it.preco > 0 ? `*${Number(it.preco).toLocaleString('pt-PT')} €*` : '_Ver preço atual na Amazon_';
    const badge = it.condicao === 'Amazon Segunda Mano' ? '♻️ Amazon Segunda Mano (Warehouse)' : '🆕 Novo (Amazon.es)';
    const asinTxt = it.asin ? ` | ASIN: \`${it.asin}\`` : '';
    const omnibusTxt = it.omnibus?.label ? `\n   🛡️ _${it.omnibus.label}_` : '';
    md += `*${idx + 1}. [${it.titulo}](${it.url})*\n`;
    md += `   📦 ${it.fonte} (${badge}${asinTxt}) | 💰 ${precoTxt}${omnibusTxt}\n`;
    if (it.priceDropped && it.previousPrice) {
      md += `   📉 *BAIXA DE PREÇO:* ${it.previousPrice} € ➔ *${it.preco} €*\n`;
    }
    md += `\n`;
  });

  md += `💡 _Monitorizar ASIN ou produto:_ \`/vigiar_amazon ${query} 150\``;
  return md;
}

export default {
  AMAZON_LINKS,
  validateOmnibus90DayDeal,
  searchAmazon,
  scanAmazon,
  formatAmazonMarkdown
};

