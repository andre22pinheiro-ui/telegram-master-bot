// src/services/autoRadarService.js — Frente 2: Radar Automóvel PT (EV >300km, PHEV, Combustão)
import { sqliteMasterDb } from '../shared/sqliteMasterDb.js';
import { parsePriceEur, runWebFrontSearch } from './radarCommon.js';

export const AUTO_PORTALS = [
  { nome: 'Standvirtual', domain: 'standvirtual.com', buildUrl: (q) => `https://www.standvirtual.com/carros?search%5Bfilter_enum_fuel_type%5D=electric&q=${encodeURIComponent(q)}` },
  { nome: 'Piscapisca.pt', domain: 'piscapisca.pt', buildUrl: (q) => `https://www.piscapisca.pt/carros/usados?q=${encodeURIComponent(q)}` },
  { nome: 'Carmine.pt', domain: 'carmine.pt', buildUrl: (q) => `https://www.carmine.pt/pesquisa?q=${encodeURIComponent(q)}` },
  { nome: 'OLX Carros', domain: 'olx.pt', buildUrl: (q) => `https://www.olx.pt/carros-motos-e-barcos/carros/q-${encodeURIComponent(q)}/` },
  { nome: 'CustoJusto', domain: 'custojusto.pt', buildUrl: (q) => `https://www.custojusto.pt/portugal/carros-usados?q=${encodeURIComponent(q)}` }
];

function detectPortal(url = '') {
  const hit = AUTO_PORTALS.find((p) => url.includes(p.domain));
  return hit ? hit.nome : 'Portal Auto PT';
}

function classifyFuelAndRange(text = '') {
  const lower = text.toLowerCase();
  const rangeMatch = lower.match(/(\d{3})\s*km\s*(?:autonomia|wltp|alcance)/i);
  const autonomia = rangeMatch ? parseInt(rangeMatch[1], 10) : 0;

  if (/el[eé]trico|\bev\b|kwh|tesla|byd|mg4|id\.?3|id\.?4|kona|niro|zoe|leaf/i.test(lower)) {
    return {
      combustivel: 'eletrico',
      autonomia_km: autonomia || (/\b(byd|tesla|id\.?3|id\.?4|kona|niro|mg4)\b/i.test(lower) ? 400 : 0)
    };
  }
  if (/h[ií]brido\s*plug|phev|plug-in/i.test(lower)) {
    return { combustivel: 'phev', autonomia_km: autonomia || 60 };
  }
  return { combustivel: 'combustao', autonomia_km: autonomia };
}

export async function searchAutos(query = 'carro eletrico usado 400km autonomia') {
  const cleanQ = String(query || '').trim() || 'carro eletrico usado autonomia portugal';
  const queries = [
    `${cleanQ} site:standvirtual.com/carros`,
    `${cleanQ} site:piscapisca.pt/carros`,
    `${cleanQ} (site:carmine.pt OR site:olx.pt OR site:custojusto.pt)`
  ];

  const result = await runWebFrontSearch({
    queries,
    maxPerQuery: 3,
    parseHit: (hit) => {
      const combined = `${hit.title} ${hit.snippet}`;
      const preco = parsePriceEur(combined, { min: 1500, max: 250000 });
      const kmMatch = combined.match(/(\d{1,3}(?:[.\s]\d{3})+|\d{4,6})\s*km\b/i);
      const km = kmMatch ? parseInt(kmMatch[1].replace(/[.\s]/g, ''), 10) : null;
      const yearMatch = combined.match(/\b(20[12][0-9])\b/);
      const { combustivel, autonomia_km } = classifyFuelAndRange(combined);

      return {
        fingerprint: `${cleanQ}_${hit.url.slice(-24)}`,
        marca_modelo: hit.title.slice(0, 90),
        combustivel,
        autonomia_km,
        ano: yearMatch ? parseInt(yearMatch[1], 10) : null,
        km,
        preco,
        portal: detectPortal(hit.url),
        url: hit.url,
        classificacao: combustivel === 'eletrico' && autonomia_km >= 300 ? '⚡ EV >=300km' : combustivel === 'phev' ? '🔋 PHEV' : '🚗 AUTO',
        persistEvenZeroPrice: false
      };
    },
    saveHit: (item) => sqliteMasterDb.upsertRadarCarro(item)
  });

  return { query: cleanQ, ...result };
}

export async function scanAutos() {
  return await searchAutos('carro eletrico usado 350km EV carrinha PHEV');
}

export function formatAutosMarkdown({ query = '', items = [] }) {
  let md = `🚗 *RADAR AUTOMÓVEL PORTUGAL — FOCO EV / PHEV / COMBUSTÃO*\n`;
  md += `🔍 *Pesquisa:* \`${query}\` | *Fontes:* Standvirtual, Piscapisca, Carmine, OLX, CustoJusto\n`;
  md += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  if (items.length === 0) {
    md += `_Sem resultados web imediatos extraídos neste instante. Acede diretamente aos portais oficiais sem intermediários:_\n\n`;
    for (const p of AUTO_PORTALS) {
      md += `• [${p.nome}](${p.buildUrl(query)})\n`;
    }
    return md;
  }

  items.slice(0, 6).forEach((c, idx) => {
    const precoTxt = c.preco > 0 ? `*${Number(c.preco).toLocaleString('pt-PT')} €*` : '_Ver preço no anúncio_';
    const badges = [
      c.combustivel === 'eletrico' ? '⚡ Elétrico' : c.combustivel === 'phev' ? '🔋 PHEV' : '⛽ Combustão',
      c.autonomia_km > 0 ? `Autonomia ~${c.autonomia_km}km` : null,
      c.km ? `${Number(c.km).toLocaleString('pt-PT')} km` : null,
      c.ano ? `${c.ano}` : null
    ]
      .filter(Boolean)
      .join(' | ');

    md += `*${idx + 1}. [${c.marca_modelo}](${c.url})*\n`;
    md += `   🏢 ${c.portal} | 💰 ${precoTxt}\n`;
    if (badges) md += `   📊 ${badges}\n`;
    if (c.priceDropped && c.previousPrice) {
      md += `   📉 *BAIXA DE PREÇO:* ${Number(c.previousPrice).toLocaleString('pt-PT')} € ➔ *${Number(c.preco).toLocaleString('pt-PT')} €*\n`;
    }
    md += `\n`;
  });

  md += `💡 _Para vigiar um modelo específico:_ \`/vigiar carros ${query} 22000\``;
  return md;
}

export default {
  AUTO_PORTALS,
  searchAutos,
  scanAutos,
  formatAutosMarkdown
};

