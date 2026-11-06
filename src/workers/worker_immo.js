// src/workers/worker_immo.js — Avaliação Imobiliária (Amarante + região)
import axios from 'axios';
import { createLogger } from '../utils/logger.js';

const log = createLogger('WorkerImmo');
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

// ─── Base de preços por zona (€/m²) — Amarante e concelhos limítrofes ────────
// Valores de referência (médias de mercado — atualizar periodicamente)
const PRECOS_ZONA = {
  'amarante centro': { min: 850, max: 1300, referencia: 'Centro histórico Amarante' },
  'amarante': { min: 700, max: 1100, referencia: 'Concelho de Amarante (geral)' },
  'fregim': { min: 600, max: 950, referencia: 'Fregim / Rebordelo' },
  'bustelo': { min: 550, max: 900, referencia: 'Bustelo / Telões' },
  'margaride': { min: 500, max: 850, referencia: 'Margaride (Felgueiras)' },
  'felgueiras': { min: 500, max: 900, referencia: 'Felgueiras' },
  'lousada': { min: 500, max: 900, referencia: 'Lousada' },
  'penafiel': { min: 600, max: 1000, referencia: 'Penafiel' },
  'marco canaveses': { min: 550, max: 900, referencia: 'Marco de Canaveses' },
  'pacos ferreira': { min: 500, max: 850, referencia: 'Paços de Ferreira' },
  'default': { min: 600, max: 1000, referencia: 'Região Norte de Portugal' },
};

function getPrecoZona(zona) {
  const zonaLower = (zona || '').toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const [key, val] of Object.entries(PRECOS_ZONA)) {
    if (zonaLower.includes(key.normalize('NFD').replace(/[\u0300-\u036f]/g, ''))) {
      return { ...val, zona: key };
    }
  }
  return { ...PRECOS_ZONA.default, zona: 'região' };
}

// ─── Helpers de Cálculo ──────────────────────────────────────────────────────

function calcularAvaliacao(area, zona, estado = 'bom') {
  const precos = getPrecoZona(zona);
  let multiplicador = 1.0;

  // Ajuste por estado do imóvel
  switch (estado.toLowerCase()) {
    case 'novo':       multiplicador = 1.3; break;
    case 'excelente':  multiplicador = 1.2; break;
    case 'bom':        multiplicador = 1.0; break;
    case 'razoavel':
    case 'razoável':   multiplicador = 0.85; break;
    case 'mau':
    case 'degradado':  multiplicador = 0.65; break;
    default:           multiplicador = 1.0;
  }

  const precoMin = Math.round(precos.min * multiplicador);
  const precoMax = Math.round(precos.max * multiplicador);
  const valorMin = Math.round(precoMin * area);
  const valorMax = Math.round(precoMax * area);
  const valorMedio = Math.round((valorMin + valorMax) / 2);

  return { precoMin, precoMax, valorMin, valorMax, valorMedio, referencia: precos.referencia };
}

async function analiseGemini(area, zona, tipologia, estado) {
  if (!GEMINI_API_KEY) return null;
  const prompt = `És um especialista imobiliário português. Faz uma breve análise de mercado (máx. 150 palavras, em PT-PT) para:
- Tipologia: ${tipologia}
- Área: ${area} m²
- Zona: ${zona}
- Estado: ${estado}
- Região de referência: Amarante e concelhos limítrofes (Norte de Portugal)
Comenta tendências de mercado, valorização e conselho prático para comprador/vendedor.`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`;
    const res = await axios.post(url, {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.5, maxOutputTokens: 300 },
    }, { timeout: 15000 });
    return res.data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch {
    return null;
  }
}

// ─── Handlers ────────────────────────────────────────────────────────────────

async function handleAvaliacao(args) {
  // Formato esperado: /avaliacao AREA ZONA [TIPOLOGIA] [ESTADO]
  // Ex: /avaliacao 120 Amarante T3 bom
  if (!args || args.trim().length === 0) {
    return `🏠 *Avaliação Imobiliária*\n\nFormato:\n\`/avaliacao ÁREA ZONA TIPOLOGIA ESTADO\`\n\nExemplo:\n\`/avaliacao 120 Amarante T3 bom\`\n\nEstados: novo, excelente, bom, razoável, mau\nZonas suportadas: Amarante, Felgueiras, Penafiel, Marco Canaveses, Lousada...`;
  }

  const parts = args.trim().split(/\s+/);
  const area = parseFloat(parts[0]);
  if (isNaN(area) || area <= 0) return '❌ Área inválida. Ex: `/avaliacao 120 Amarante T3 bom`';

  const zona = parts[1] || 'Amarante';
  const tipologia = parts[2] || 'T3';
  const estado = parts[3] || 'bom';

  const avaliacao = calcularAvaliacao(area, zona, estado);
  const analise = await analiseGemini(area, zona, tipologia, estado);

  let resposta = `🏠 *Avaliação Imobiliária*\n\n`;
  resposta += `📍 Zona: ${zona} _(${avaliacao.referencia})_\n`;
  resposta += `📐 Área: ${area} m² | Tipologia: ${tipologia} | Estado: ${estado}\n\n`;
  resposta += `💰 *Preço/m²:* ${avaliacao.precoMin}€ — ${avaliacao.precoMax}€\n`;
  resposta += `📊 *Valor estimado:*\n`;
  resposta += `  • Mínimo: **${avaliacao.valorMin.toLocaleString('pt-PT')}€**\n`;
  resposta += `  • Médio: **${avaliacao.valorMedio.toLocaleString('pt-PT')}€**\n`;
  resposta += `  • Máximo: **${avaliacao.valorMax.toLocaleString('pt-PT')}€**\n`;

  if (analise) {
    resposta += `\n🤖 *Análise de Mercado:*\n${analise}`;
  }

  return resposta;
}

function handleComandosPrincipais() {
  return `🏠 *Assistente Imobiliário — Amarante e região*\n\nComandos disponíveis:\n\n\`/avaliacao ÁREA ZONA TIPOLOGIA ESTADO\`\n_Avalia um imóvel por m²_\n\nExemplo:\n\`/avaliacao 120 Amarante T3 bom\`\n\`/avaliacao 85 Felgueiras T2 razoável\`\n\`/avaliacao 200 "Amarante Centro" V4 novo\``;
}

// ─── Dispatcher ──────────────────────────────────────────────────────────────

export async function handle(text) {
  log.info('Processando pedido IMMO', { text: text.substring(0, 60) });

  if (/^\/(avaliacao|avaliac[aã]o|immo|imovel)\s+/i.test(text)) {
    return handleAvaliacao(text.replace(/^\/(avaliacao|avaliac[aã]o|immo|imovel)\s+/i, ''));
  }

  return handleComandosPrincipais();
}

export default { handle };

