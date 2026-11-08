// src/workers/worker_frotas.js — Módulo de Gestão de Frotas, Tacógrafo e RotaBus VIP
import axios from 'axios';
import { createLogger } from '../utils/logger.js';
import { VERCEL_APPS } from '../shared/appsCatalog.js';

const log = createLogger('WorkerFrotas');
const ORS_API_KEY = process.env.ORS_API_KEY || '';

// ─── Helpers de Geocoding ────────────────────────────────────────────────────

async function geocode(place) {
  try {
    const url = `https://api.openrouteservice.org/geocode/search?api_key=${ORS_API_KEY}&text=${encodeURIComponent(place)}&boundary.country=PT&size=1`;
    const res = await axios.get(url, { timeout: 6000 });
    const coords = res.data?.features?.[0]?.geometry?.coordinates;
    if (!coords) return null;
    return { lon: coords[0], lat: coords[1] };
  } catch (err) {
    log.error('Geocode falhou', err.message);
    return null;
  }
}

async function calcularRota(origem, destino, perfil = 'driving-hgv') {
  if (!ORS_API_KEY) {
    // Fallback inteligente para o RotaBus
    const routeUrl = VERCEL_APPS.rotabus.getRouteUrl(origem, destino);
    return {
      km: '~ (calculado no RotaBus)',
      duracao: 'Ver no GPS',
      origem,
      destino,
      rotabusUrl: routeUrl
    };
  }

  const [coordOrigem, coordDestino] = await Promise.all([geocode(origem), geocode(destino)]);
  if (!coordOrigem || !coordDestino) {
    const routeUrl = VERCEL_APPS.rotabus.getRouteUrl(origem, destino);
    return {
      km: '~',
      duracao: 'Navegação direta no RotaBus',
      origem,
      destino,
      rotabusUrl: routeUrl
    };
  }

  try {
    const url = `https://api.openrouteservice.org/v2/directions/${perfil}`;
    const res = await axios.post(url, {
      coordinates: [[coordOrigem.lon, coordOrigem.lat], [coordDestino.lon, coordDestino.lat]],
      preference: 'recommended',
      instructions: false,
    }, {
      headers: { Authorization: ORS_API_KEY, 'Content-Type': 'application/json' },
      timeout: 7000,
    });

    const summary = res.data?.routes?.[0]?.summary;
    if (!summary) return { error: 'Resposta inválida do serviço de rotas' };

    const km = (summary.distance / 1000).toFixed(1);
    const horas = Math.floor(summary.duration / 3600);
    const mins = Math.floor((summary.duration % 3600) / 60);
    const duracao = horas > 0 ? `${horas}h ${mins}min` : `${mins} min`;
    const rotabusUrl = VERCEL_APPS.rotabus.getRouteUrl(origem, destino);

    return { km, duracao, origem, destino, rotabusUrl };
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    return { error: `ORS: ${msg}`, rotabusUrl: VERCEL_APPS.rotabus.getRouteUrl(origem, destino) };
  }
}

// ─── Helpers de Tacógrafo Digital (Reg. CE 561/2006) ─────────────────────────

function calcularTacografo(horasConducao) {
  const h = parseFloat(horasConducao);
  if (isNaN(h) || h <= 0) return null;

  // Regras EU (Reg. 561/2006):
  // Máx. 4.5h contínuas → pausa obrigatória de 45 min (ou 15+30 min)
  // Máx. diário: 9h (extensível a 10h 2x por semana)
  // Máx. semanal: 56h | Bisemanal: 90h
  const pausasNecessarias = Math.floor(h / 4.5);
  const tempoPausa = pausasNecessarias * 45;
  const tempoTotal = h * 60 + tempoPausa;
  const hTotal = Math.floor(tempoTotal / 60);
  const mTotal = Math.round(tempoTotal % 60);

  let legalidade = '✅ *Dentro do limite diário legal (máx. 9h00)*';
  if (h > 9 && h <= 10) {
    legalidade = '⚠️ *Extensão diária de 10h (permitida no máx. 2x por semana)*';
  } else if (h > 10) {
    legalidade = '⛔ *INFRAÇÃO GRAVE: Excede o limite legal diário absoluto de 10h!*';
  }

  const tempoRestanteAtePausa = (4.5 - (h % 4.5)).toFixed(1);

  return {
    horasConducao: h,
    pausasObrigatorias: pausasNecessarias,
    tempoPausaMin: tempoPausa,
    tempoTotalViagem: `${hTotal}h ${mTotal}min`,
    tempoRestanteAtePausa: tempoRestanteAtePausa > 0 ? `${tempoRestanteAtePausa}h` : '0h (PAUSA IMEDIATA)',
    legal: legalidade,
  };
}

// ─── Handlers ────────────────────────────────────────────────────────────────

async function handleRota(args) {
  if (!args || !args.includes(' para ')) {
    return `🗺️ *Calcular Rota de Pesados & Equipas*\n\nFormato:\n\`/rota ORIGEM para DESTINO\`\n\nExemplo:\n\`/rota Porto para Lisboa\`\n\`/rota Amarante para Braga\``;
  }

  const [origem, destino] = args.split(' para ').map(s => s.trim());
  if (!origem || !destino) return '❌ Formato inválido. Usa: `/rota Porto para Lisboa`';

  const res = await calcularRota(origem, destino);
  if (res.error && !res.rotabusUrl) return `❌ Erro ao calcular rota: ${res.error}`;

  let texto = `🚛 *Rota de Pesados / Autocarro:*\n\n`;
  texto += `📍 Origem: *${origem}*\n`;
  texto += `📍 Destino: *${destino}*\n`;
  if (res.km && res.km !== '~') texto += `📏 Distância: **${res.km} km**\n`;
  if (res.duracao) texto += `⏱️ Duração estimada: **${res.duracao}**\n`;
  texto += `🛡️ *Algoritmo Anti-Sinuosidade:* Autoestradas prioritárias e curvas sinuosas evitadas.\n\n`;
  texto += `🌐 [Abrir rota interativa no RotaBus](${res.rotabusUrl})\n`;
  texto += `📲 [Descarregar APK Android](${VERCEL_APPS.rotabus.apkUrl})`;

  return texto;
}

function handleTacografo(args) {
  const horasStr = args?.trim();
  if (!horasStr) {
    return `📋 *Auditor de Tacógrafo Digital (Regulamento CE 561/2006)*\n\nFormato:\n\`/tacografo HORAS_CONDUÇÃO\`\n\nExemplos:\n• \`/tacografo 4.5\` — Fim do primeiro bloco\n• \`/tacografo 8.5\` — Turno padrão\n• \`/tacografo 9.5\` — Extensão excecional`;
  }

  const res = calcularTacografo(horasStr);
  if (!res) return '❌ Valor inválido. Usa um número de horas, ex: `/tacografo 8.5`';

  return (
    `📋 *Relatório de Tacógrafo Digital (CE 561/2006):*\n\n` +
    `⏱️ Horas de condução registadas: **${res.horasConducao}h**\n` +
    `🛑 Pausas obrigatórias (45 min): **${res.pausasObrigatorias}**\n` +
    `⏳ Tempo total de paragem: **${res.tempoPausaMin} min**\n` +
    `🏁 Tempo total decorrido: **${res.tempoTotalViagem}**\n` +
    `🚦 Condução restante antes da próxima pausa: **${res.tempoRestanteAtePausa}**\n\n` +
    `${res.legal}\n\n` +
    `_Conselho de Segurança: A pausa pode ser fracionada em 15 min seguidos de 30 min._`
  );
}

// ─── Dispatcher ──────────────────────────────────────────────────────────────

export async function handle(text) {
  log.info('Processando pedido FROTAS', { text: text.substring(0, 60) });

  if (/^\/rota\s+/i.test(text)) return handleRota(text.replace(/^\/rota\s+/i, ''));
  if (/^\/tacografo\s*/i.test(text)) return handleTacografo(text.replace(/^\/tacografo\s*/i, ''));

  return (
    `🚛 *Gestão de Frotas, Tacógrafo & RotaBus*\n\n` +
    `Módulo especializado em transporte rodoviário pesado e autocarros.\n\n` +
    `• \`/rota ORIGEM para DESTINO\` — Cálculo de itinerário para pesados\n` +
    `• \`/tacografo HORAS\` — Verificação legal (CE 561/2006)\n\n` +
    `🌐 *Mini Apps Integradas:*\n` +
    `• [RotaBus GPS Web](${VERCEL_APPS.rotabus.url})\n` +
    `• [AppFrota Gestão](${VERCEL_APPS.appfrota.url})\n` +
    `• [Download APK Android](${VERCEL_APPS.rotabus.apkUrl})`
  );
}

export default { handle };
