// src/services/techRadarService.js — Frente 3: Radar Tech & Informática PT/ES
import { sqliteMasterDb } from '../shared/sqliteMasterDb.js';
import { parsePriceEur, runWebFrontSearch } from './radarCommon.js';

export const TECH_STORES = [
  { nome: 'PCDiga', domain: 'pcdiga.com', buildUrl: (q) => `https://www.pcdiga.com/catalogsearch/result/?q=${encodeURIComponent(q)}` },
  { nome: 'Globaldata', domain: 'globaldata.pt', buildUrl: (q) => `https://www.globaldata.pt/?q=${encodeURIComponent(q)}` },
  { nome: 'PCComponentes PT', domain: 'pccomponentes.pt', buildUrl: (q) => `https://www.pccomponentes.pt/buscar/?query=${encodeURIComponent(q)}` },
  { nome: 'Chip7', domain: 'chip7.pt', buildUrl: (q) => `https://www.chip7.pt/pesquisa?controller=search&s=${encodeURIComponent(q)}` },
  { nome: 'Castro Electrónica', domain: 'castroelectronica.pt', buildUrl: (q) => `https://www.castroelectronica.pt/pt/catalogsearch/result/?q=${encodeURIComponent(q)}` },
  { nome: 'OLX Tech', domain: 'olx.pt', buildUrl: (q) => `https://www.olx.pt/tecnologia-e-informatica/q-${encodeURIComponent(q)}/` },
  { nome: 'Wallapop', domain: 'wallapop.com', buildUrl: (q) => `https://pt.wallapop.com/app/search?keywords=${encodeURIComponent(q)}` }
];

function detectStore(url = '') {
  const s = TECH_STORES.find((st) => url.includes(st.domain));
  return s ? s.nome : 'Loja Tech';
}

export async function searchTech(query = 'portatil oled rtx') {
  const cleanQ = String(query || '').trim() || 'portatil ssd monitor promocao';
  const queries = [
    `${cleanQ} (site:pcdiga.com OR site:globaldata.pt OR site:pccomponentes.pt)`,
    `${cleanQ} (site:chip7.pt OR site:castroelectronica.pt OR site:olx.pt OR site:wallapop.com)`
  ];

  const result = await runWebFrontSearch({
    queries,
    maxPerQuery: 4,
    parseHit: (hit) => {
      const combined = `${hit.title} ${hit.snippet}`;
      const preco = parsePriceEur(combined, { min: 15, max: 15000 });
      const loja = detectStore(hit.url);
      const estado = /olx|wallapop|usad|recondicionad/i.test(combined) ? 'usado/recondicionado' : 'novo';
      const pctMatch = combined.match(/-(\d{1,2})\s*%/);

      return {
        fingerprint: `tech_${cleanQ}_${hit.url.slice(-24)}`,
        categoria: 'tech',
        produto: hit.title.slice(0, 95),
        loja,
        estado,
        preco,
        desconto_pct: pctMatch ? parseFloat(pctMatch[1]) : 0,
        url: hit.url,
        classificacao: estado === 'novo' ? '💻 NOVO (Garantia 3A)' : '♻️ USADO / OPORTUNIDADE'
      };
    },
    saveHit: (item) => sqliteMasterDb.upsertRadarTech(item)
  });

  return { query: cleanQ, ...result };
}

export async function scanTech() {
  return await searchTech('portatil monitor ssd nvme promocao');
}

export function formatTechMarkdown({ query = '', items = [] }) {
  let md = `💻 *RADAR TECH & INFORMÁTICA (PT / ES)*\n`;
  md += `🔍 *Pesquisa:* \`${query}\`\n`;
  md += `🏬 *Lojas:* PCDiga, Globaldata, PCComponentes, Chip7, Castro Electrónica, OLX, Wallapop\n`;
  md += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  if (items.length === 0) {
    md += `_Sem resultados web extraídos neste momento. Pesquisa diretamente nas lojas oficiais:_\n\n`;
    for (const s of TECH_STORES) {
      md += `• [${s.nome}](${s.buildUrl(query)})\n`;
    }
    return md;
  }

  items.slice(0, 6).forEach((it, idx) => {
    const precoTxt = it.preco > 0 ? `*${Number(it.preco).toLocaleString('pt-PT')} €*` : '_Ver preço na loja_';
    const descTxt = it.desconto_pct > 0 ? ` (-${it.desconto_pct}%)` : '';
    md += `*${idx + 1}. [${it.produto}](${it.url})*\n`;
    md += `   🏪 ${it.loja} (${it.estado}) | 💰 ${precoTxt}${descTxt}\n`;
    if (it.priceDropped && it.previousPrice) {
      md += `   📉 *BAIXOU:* ${it.previousPrice} € ➔ *${it.preco} €*\n`;
    }
    md += `\n`;
  });

  md += `💡 _Monitorizar produto:_ \`/vigiar tech ${query} 800\``;
  return md;
}

export default {
  TECH_STORES,
  searchTech,
  scanTech,
  formatTechMarkdown
};

