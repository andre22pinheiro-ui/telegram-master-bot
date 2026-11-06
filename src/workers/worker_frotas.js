// src/workers/worker_frotas.js — Módulo de Gestão de Frotas (ORS + Tacógrafo)
import axios from 'axios';
import { createLogger } from '../utils/logger.js';

const log = createLogger('WorkerFrotas');
const ORS_API_KEY = process.env.ORS_API_KEY || '';

// ─── Helpers de Geocoding ────────────────────────────────────────────────────

async function geocode(place) {
  try {
    const url = `https://api.openrouteservice.org/geocode/search?api_key=${ORS_API_KEY}&text=${encodeURIComponent(place)}&boundary.country=PT&size=1`;
    const res = await axios.get(url, { timeout: 10000 });
    const coords = res.data?.features?.[0]?.geometry?.coordinates;
    if (!coords) return null;
    return { lon: coords[0], lat: coords[1] };
  } catch (err) {
    log.error('Geocode falhou', err.message);
    return null;
  }
}

async function calcularRota(origem, destino, perfil = 'driving-hgv') {
  if (!ORS_API_KEY) return { error: 'ORS_API_KEY não configurado no .env' };

  const [coordOrigem, coordDestino] = await Promise.all([geocode(origem), geocode(destino)]);
  if (!coordOrigem) return { error: `Não encontrei "${origem}"` };
  if (!coordDestino) return { error: `Não encontrei "${destino}"` };

  try {
    const url = `https://api.openrouteservice.org/v2/directions/${perfil}`;
    const res = await axios.post(url, {
      coordinates: [[coordOrigem.lon, coordOrigem.lat], [coordDestino.lon, coordDestino.lat]],
      instructions: false,
    }, {
      headers: { Authorization: ORS_API_KEY, 'Content-Type': 'application/json' },
      timeout: 15000,
    });

    const summary = res.data?.routes?.[0]?.summary;
    if (!summary) return { error: 'Resposta inválida do ORS' };

    const km = (summary.distance / 1000).toFixed(1);
    const horas = Math.floor(summary.duration / 3600);
    const mins = Math.floor((summary.duration % 3600) / 60);
    const duracao = horas > 0 ? `${horas}h ${mins}min` : `${mins} min`;

    return { km, duracao, origem, destino };
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    return { error: `ORS: ${msg}` };
  }
}

// ─── Helpers de Tacógrafo ────────────────────────────────────────────────────

function calcularTacografo(horasConducao) {
  const h = parseFloat(horasConducao);
  if (isNaN(h) || h <= 0) return null;

  // Regras EU básicas (Reg. 561/2006):
  // Max. 4.5h contínuas → pausa 45min
  // Max. 9h/dia (extensível a 10h 2x/semana)
  // Max. 56h/semana, 90h/quinzena

  const pausasNecessarias = Math.floor(h / 4.5);
  const tempoPausa = pausasNecessarias * 45;
  const tempoTotal = h * 60 + tempoPausa;
  const hTotal = Math.floor(tempoTotal / 60);
  const mTotal = Math.round(tempoTotal % 60);

  return {
    horasConducao: h,
    pausasObrigatorias: pausasNecessarias,
    tempoPausaMin: tempoPausa,
    tempoTotalViagem: `${hTotal}h ${mTotal}min`,
    legal: h <= 9 ? '✅ Dentro do limite diário' : '⚠️ Excede limite diário (máx. 9h)',
  };
}

// ─── Handlers ────────────────────────────────────────────────────────────────

async function handleRota(args) {
  if (!args || !args.includes(' para ')) {
    return `🗺️ *Calcular Rota de Pesados*\n\nFormato:\n\`/rota ORIGEM para DESTINO\`\n\nExemplo:\n\`/rota Porto para Lisboa\``;
  }

  const [origem, destino] = args.split(' para ').map(s => s.trim());
  if (!origem || !destino) return '❌ Formato inválido. Usa: `/rota Porto para Lisboa`';

  const resultado = await calcularRota(origem, destino);
  if (resultado.error) return `❌ Erro ao calcular rota: ${resultado.error}`;

  return `🚛 *Rota de Pesados:*\n\n📍 Origem: ${resultado.origem}\n📍 Destino: ${resultado.destino}\n📏 Distância: **${resultado.km} km**\n⏱️ Duração estimada: **${resultado.duracao}**\n\n_Perfil: HGV (veículo pesado de mercadorias)_`;
}

function handleTacografo(args) {
  const horasStr = args?.trim();
  if (!horasStr) {
    return `📋 *Calculadora de Tacógrafo*\n\nFormato:\n\`/tacografo HORAS_CONDUCAO\`\n\nExemplo:\n\`/tacografo 8.5\`\n\n_Calcula pausas obrigatórias segundo o Reg. EU 561/2006_`;
  }

  const resultado = calcularTacografo(horasStr);
  if (!resultado) return '❌ Valor inválido. Usa um número de horas, ex: `/tacografo 8.5`';

  return `📋 *Análise de Tacógrafo (EU 561/2006):*\n\n⏱️ Horas de condução: **${resultado.horasConducao}h**\n⛔ Pausas obrigatórias: **${resultado.pausasObrigatorias}** (45 min cada)\n🕐 Tempo total de pausa: **${resultado.tempoPausaMin} min**\n🏁 Tempo total de viagem: **${resultado.tempoTotalViagem}**\n\n${resultado.legal}`;
}

// ─── Dispatcher ──────────────────────────────────────────────────────────────

export async function handle(text) {
  log.info('Processando pedido FROTAS', { text: text.substring(0, 60) });

  if (/^\/rota\s+/i.test(text)) return handleRota(text.replace(/^\/rota\s+/i, ''));
  if (/^\/tacografo\s*/i.test(text)) return handleTacografo(text.replace(/^\/tacografo\s*/i, ''));

  // Texto livre sobre frotas
  return `🚛 *Gestão de Frotas*\n\nComandos disponíveis:\n\n\`/rota ORIGEM para DESTINO\` — Calcular rota de pesados\n\`/tacografo HORAS\` — Verificar limites de tacógrafo\n\nExemplo: \`/rota Porto para Amarante\``;
}

export default { handle };

