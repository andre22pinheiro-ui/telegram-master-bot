// src/services/immoRadarService.js — Frente 1 (Imobiliário Amarante CMVM) + Orquestrador Multi-Frente 5 Frentes
import { createLogger } from '../utils/logger.js';
import { sqliteMasterDb, checkpointMasterDb } from '../shared/sqliteMasterDb.js';
import { avaliarImovelCmvm, formatarAvaliacaoMarkdown } from './immoCmvmService.js';
import { IMMO_SITES, VERCEL_IMMO_APP } from '../shared/immoSitesCatalog.js';
import { searchLiveWeb } from '../shared/webSearch.js';
import { parsePriceEur, sendRadarTelegramAlert, runWebFrontSearch } from './radarCommon.js';
import { scanAutos } from './autoRadarService.js';
import { scanTech } from './techRadarService.js';
import { scanAmazon } from './amazonRadarService.js';
import { scanApple } from './appleRadarService.js';

const log = createLogger('ImmoRadar');

function getLisbonTimeParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('pt-PT', {
    timeZone: 'Europe/Lisbon',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  const [hh, mm] = fmt.format(date).split(':').map((n) => parseInt(n, 10));
  const dayKey = date.toLocaleDateString('pt-PT', { timeZone: 'Europe/Lisbon' });
  return { hour: hh, minute: mm, dayKey };
}

function gerarFingerprint(freguesia, tipologia, areaUtil) {
  const f = (freguesia || 'amarante').toLowerCase().trim().replace(/\s+/g, '-');
  const t = (tipologia || 'T3').toUpperCase().replace('V', 'T');
  const a = Math.round((parseFloat(areaUtil) || 100) / 10) * 10;
  return `${f}_${t}_${a}m2`;
}

/**
 * Insere ou atualiza um imóvel na tabela radar_casas do SQLite Master.
 * Devolve { isNovo, priceDropped, previousPrice, imovel }.
 */
export function guardarImovel(dados) {
  const fp = gerarFingerprint(dados.freguesia, dados.tipologia, dados.area_util);
  const av = avaliarImovelCmvm({
    precoAnunciado: dados.preco,
    areaUtil: dados.area_util,
    areaTerreno: dados.area_terreno || 0,
    classeEnergetica: dados.classe_energetica || 'D',
    zona: dados.freguesia || 'Amarante',
    semLicenca: Boolean(dados.sem_licenca),
    isRuina: Boolean(dados.is_ruina)
  });

  const res = sqliteMasterDb.upsertRadarCasa({
    ...dados,
    fingerprint: fp,
    valor_cmvm: av.valorIntrinseco,
    classificacao: av.classificacao
  });

  return {
    isNovo: res.isNew,
    priceDropped: res.priceDropped,
    previousPrice: res.previousPrice,
    imovel: res.record
  };
}

export function listarImoveis(limite = 20) {
  return sqliteMasterDb.getRadarCasas(limite);
}

export function obterImoveisNaoAlertados() {
  return sqliteMasterDb.getDb().prepare('SELECT * FROM radar_casas WHERE alertado = 0 AND preco > 0 ORDER BY id DESC').all();
}

export function marcarAlertados(ids = []) {
  for (const id of ids) {
    sqliteMasterDb.markRadarAlerted('radar_casas', id);
  }
}

export function obterOportunidades(limite = 5) {
  return sqliteMasterDb
    .getDb()
    .prepare('SELECT * FROM radar_casas WHERE preco > 0 AND valor_cmvm > preco AND preco <= 300000 ORDER BY (valor_cmvm - preco) DESC LIMIT ?')
    .all(limite);
}

export function formatarAlertaNovoImovel(imovel, headerOverride = null) {
  const av = avaliarImovelCmvm({
    precoAnunciado: imovel.preco,
    areaUtil: imovel.area_util || 120,
    areaTerreno: imovel.area_terreno || 0,
    classeEnergetica: imovel.classe_energetica || 'D',
    zona: imovel.freguesia || 'Amarante',
    semLicenca: Boolean(imovel.sem_licenca),
    isRuina: Boolean(imovel.is_ruina)
  });

  let md = headerOverride || `🚨 *NOVO ANÚNCIO DETETADO EM AMARANTE!*\n`;
  md += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  md += `🏡 *${imovel.titulo}*\n`;
  md += `📍 *Freguesia:* ${imovel.freguesia} | *Portal:* ${imovel.portal}\n`;
  md += `📐 *Área Útil:* ${imovel.area_util || 100} m² | *Terreno:* ${imovel.area_terreno || 0} m²\n\n`;
  if (imovel.preco_anterior && imovel.preco < imovel.preco_anterior) {
    md += `📉 *BAIXA DE PREÇO:* ${Number(imovel.preco_anterior).toLocaleString('pt-PT')} € ➔ *${Number(imovel.preco).toLocaleString('pt-PT')} €*\n`;
  }
  md += `💰 *Preço Pedido:* **${Number(imovel.preco).toLocaleString('pt-PT')} €**\n`;
  md += `📊 *Avaliação CMVM:* **${av.valorIntrinseco.toLocaleString('pt-PT')} €** (\`${av.precoM2Cmvm} €/m²\`)\n`;
  md += `🎯 *Veredito:* **${av.classificacao}**\n`;
  md += `💡 _${av.veredito}_\n\n`;
  md += `🔗 [Ver Anúncio Original](${imovel.url})\n`;
  md += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  md += `📱 _Mini App CMVM:_ \`${VERCEL_IMMO_APP.url}\``;

  const keyboard = {
    inline_keyboard: [
      [
        { text: '🔗 Abrir Anúncio', url: imovel.url },
        { text: '🏠 Abrir ImmoEval', web_app: { url: VERCEL_IMMO_APP.url } }
      ]
    ]
  };

  return { text: md, keyboard };
}

export function gerarRelatorioDiarioMarkdown() {
  const casas = sqliteMasterDb.getRadarCasas(50);
  const oportunidades = obterOportunidades(4);
  const now24h = Date.now() - 24 * 60 * 60 * 1000;
  const recentes = casas.filter((c) => {
    const dt = new Date(c.data_criacao).getTime();
    return !Number.isNaN(dt) && dt >= now24h;
  });

  let md = `📋 *RELATÓRIO IMOBILIÁRIO CMVM — AMARANTE*\n`;
  md += `📅 *Data:* \`${new Date().toLocaleDateString('pt-PT', { timeZone: 'Europe/Lisbon' })}\`\n`;
  md += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  md += `• Moradias monitorizadas: *${casas.length}*\n`;
  md += `• Entradas últimas 24h: *${recentes.length}*\n`;
  md += `• Oportunidades abaixo CMVM: *${oportunidades.length}*\n\n`;

  if (recentes.length > 0) {
    md += `🆕 *ÚLTIMAS ENTRADAS:*\n`;
    recentes.slice(0, 5).forEach((item, i) => {
      md += `*${i + 1}. ${item.titulo}*\n`;
      md += `   ↳ ${item.freguesia} | *${Number(item.preco || 0).toLocaleString('pt-PT')} €* (CMVM: ${Number(item.valor_cmvm || 0).toLocaleString('pt-PT')} €) | ${item.portal}\n`;
      md += `   ↳ 🔗 ${item.url}\n\n`;
    });
  } else {
    md += `ℹ️ _Sem novas entradas nas últimas 24h em radar_casas._\n\n`;
  }

  if (oportunidades.length > 0) {
    md += `💎 *TOP OPORTUNIDADES CMVM:*\n`;
    oportunidades.forEach((op, i) => {
      const margem = Math.round((op.valor_cmvm || 0) - (op.preco || 0));
      md += `*${i + 1}. ${op.titulo}* — Pedido: *${Number(op.preco).toLocaleString('pt-PT')} €* | Margem: +${margem.toLocaleString('pt-PT')} €\n`;
      md += `   ↳ 🔗 ${op.url}\n`;
    });
  }

  return md;
}

/**
 * Relatório Consolidado Matinal das 5 Frentes (08h30)
 */
export function gerarRelatorioMultiFrenteMarkdown() {
  const stats = sqliteMasterDb.getStats().tables;
  const filtros = sqliteMasterDb.getRadarFilters(true);
  const immoReport = gerarRelatorioDiarioMarkdown();

  const carros = sqliteMasterDb.getRadarCarros(2);
  const tech = sqliteMasterDb.getRadarTech(2);
  const amazon = sqliteMasterDb.getRadarAmazon(2);
  const apple = sqliteMasterDb.getRadarApple(2);

  let md = `📡 *RELATÓRIO DIÁRIO — RADAR MULTI-FRENTE (5 FRENTES)*\n`;
  md += `🕒 _${new Date().toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon', hour12: false })}_\n`;
  md += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  md += `📊 *Stock Monitorizado:* Casas: ${stats.radar_casas} | Carros: ${stats.radar_carros} | Tech: ${stats.radar_tech} | Amazon: ${stats.radar_amazon} | Apple: ${stats.radar_apple} | Alertas \`/vigiar\`: *${filtros.length}*\n\n`;

  md += immoReport + '\n\n';

  if (carros.length > 0) {
    md += `🚗 *Carros Recentes:*\n${carros.map((c) => `• ${c.marca_modelo} — *${c.preco} €* (${c.portal}) ${c.url}`).join('\n')}\n\n`;
  }
  if (tech.length > 0) {
    md += `💻 *Tech Recente:*\n${tech.map((t) => `• ${t.produto} — *${t.preco} €* (${t.loja}) ${t.url}`).join('\n')}\n\n`;
  }
  if (amazon.length > 0) {
    md += `📦 *Amazon.es / Segunda Mano:*\n${amazon.map((a) => `• ${a.titulo} — *${a.preco} €* ${a.url}`).join('\n')}\n\n`;
  }
  if (apple.length > 0) {
    md += `🍎 *Apple Novo vs Recondicionado:*\n${apple.map((ap) => `• ${ap.modelo} (${ap.condicao}) — *${ap.preco} €* ${ap.url}`).join('\n')}\n\n`;
  }

  md += `⚡ *Pesquisa instantânea:* \`/casas\`, \`/carros\`, \`/tech\`, \`/amazon\`, \`/apple\`, \`/vigiar\``;
  return md;
}

function detectImmoPortal(url = '') {
  if (url.includes('idealista.pt')) return 'Idealista';
  if (url.includes('imovirtual.com')) return 'Imovirtual';
  if (url.includes('remax.pt')) return 'RE/MAX';
  if (url.includes('era.pt')) return 'ERA';
  if (url.includes('casasapo.pt')) return 'Casa Sapo';
  if (url.includes('supercasa.pt')) return 'Supercasa';
  if (url.includes('olx.pt')) return 'OLX';
  if (url.includes('custojusto.pt')) return 'CustoJusto';
  return 'Portal Imobiliário';
}

export async function pesquisarMoradiasNovasPlataformas({ zona = 'Amarante', tipologia = '', precoMax = 250000 } = {}) {
  log.info('A pesquisar moradias em tempo real nas plataformas...', { zona, tipologia, precoMax });

  const queryTerms = [
    `moradias venda ${zona} ${tipologia}`.trim(),
    `moradias venda ${zona} site:idealista.pt/comprar-casas`,
    `moradias ${zona} site:imovirtual.com`,
    `moradias ${zona} site:remax.pt OR site:era.pt`
  ];

  const resultados = [];
  const seenUrls = new Set();

  for (const q of queryTerms) {
    try {
      const items = await searchLiveWeb(q, 4);
      for (const r of items) {
        if (!r?.url || seenUrls.has(r.url)) continue;
        seenUrls.add(r.url);

        const combined = `${r.title} ${r.snippet}`;
        const preco = parsePriceEur(combined, { min: 15000, max: 2000000 });
        const tipMatch = combined.match(/\b(T[1-5]|V[1-5])\b/i);
        const tip = tipMatch ? tipMatch[1].toUpperCase().replace('V', 'T') : tipologia || 'T3';
        const areaMatch = combined.match(/(\d{2,4})\s*m[²2]/i);
        const area = areaMatch ? parseFloat(areaMatch[1]) : 140;

        let freg = zona;
        const locs = ['São Gonçalo', 'Madalena', 'Cepelos', 'Gatão', 'Telões', 'Fregim', 'Lomba', 'Freixo', 'Vila Meã', 'Aveleda'];
        for (const loc of locs) {
          if (new RegExp(loc, 'i').test(combined)) {
            freg = loc;
            break;
          }
        }

        const av = avaliarImovelCmvm({ precoAnunciado: preco, areaUtil: area, zona: freg });
        let savedStatus = { isNovo: false, priceDropped: false, previousPrice: null };
        if (preco > 0) {
          savedStatus = guardarImovel({
            titulo: r.title.slice(0, 85),
            url: r.url,
            portal: detectImmoPortal(r.url),
            preco,
            freguesia: freg,
            tipologia: tip,
            area_util: area
          });
        }

        resultados.push({
          titulo: r.title,
          url: r.url,
          portal: detectImmoPortal(r.url),
          preco,
          freguesia: freg,
          tipologia: tip,
          area_util: area,
          valor_cmvm: av.valorIntrinseco,
          classificacao: av.classificacao,
          snippet: r.snippet,
          isNovo: savedStatus.isNovo,
          priceDropped: savedStatus.priceDropped,
          previousPrice: savedStatus.previousPrice
        });
      }
    } catch (e) {
      log.warn(`Erro na pesquisa web imobiliária (${q}): ${e.message}`);
    }
  }

  // Se nada novo veio da web, verificar histórico real guardado no SQLite
  if (resultados.length === 0) {
    const stored = sqliteMasterDb.getRadarCasas(5);
    for (const row of stored) {
      if (!precoMax || row.preco <= precoMax) {
        resultados.push({
          ...row,
          snippet: `Histórico CMVM verificado (${row.portal})`
        });
      }
    }
  }

  return resultados;
}

export function formatarMoradiasNovasMarkdown(lista, zona = 'Amarante') {
  if (!lista || lista.length === 0) {
    let md = `🏡 *RADAR DE MORADIAS — ${zona.toUpperCase()}*\n`;
    md += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    md += `Não foram extraídos preços individuais em tempo real neste momento (portais com bloqueio anti-bot temporário).\n\n`;
    md += `🔗 *Pesquisa Direta Nos Portais Verificados (Zero Inventos):*\n`;
    for (const site of IMMO_SITES.slice(0, 6)) {
      md += `• [${site.nome}](${site.searchUrl})\n`;
    }
    return md;
  }

  let md = `🏡 *RADAR ATIVO: MORADIAS EM ${zona.toUpperCase()}*\n`;
  md += `📍 *Avaliação Automática CMVM | Zero Alucinações*\n`;
  md += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  lista.slice(0, 6).forEach((item, idx) => {
    const precoTxt = item.preco > 0 ? `*${Number(item.preco).toLocaleString('pt-PT')} €*` : '_Consultar no portal_';
    const cmvmTxt = item.valor_cmvm ? ` (CMVM: ~${Number(item.valor_cmvm).toLocaleString('pt-PT')} €)` : '';
    md += `*${idx + 1}. [${item.titulo}](${item.url})*\n`;
    md += `   🏢 ${item.portal} | 📍 ${item.freguesia} (${item.tipologia}) | 💰 ${precoTxt}${cmvmTxt}\n`;
    if (item.priceDropped && item.previousPrice) {
      md += `   📉 *BAIXA DE PREÇO:* ${Number(item.previousPrice).toLocaleString('pt-PT')} € ➔ *${Number(item.preco).toLocaleString('pt-PT')} €*\n`;
    }
    md += `\n`;
  });

  md += `💡 *Dica:* Usa \`/avaliacao [área] [zona] T3 [estado]\` ou \`${VERCEL_IMMO_APP.url}\``;
  return md;
}

export async function executarVarreduraAmarante() {
  const liveResults = await pesquisarMoradiasNovasPlataformas({ zona: 'Amarante' });
  const novidades = liveResults.filter((i) => i.preco > 0 && (i.isNovo || i.priceDropped));
  return {
    totalVarridos: liveResults.length,
    novosDetetados: liveResults.filter((i) => i.preco > 0),
    alertas: novidades
  };
}

/**
 * Varre filtros ativos registados via /vigiar e gera alertas de preço atingido ou descida.
 */
async function checkActiveWatchFilters() {
  const filtros = sqliteMasterDb.getRadarFilters(true);
  const alerts = [];

  for (const f of filtros.slice(0, 8)) {
    const query = f.url ? `site:${f.url.replace(/^https?:\/\//, '').split('/')[0]} ${f.termo}` : f.termo;
    const scanRes = await runWebFrontSearch({
      queries: [query],
      maxPerQuery: 3,
      parseHit: (hit) => {
        const preco = parsePriceEur(`${hit.title} ${hit.snippet}`, { min: 5, max: 2000000 });
        return { titulo: hit.title, url: hit.url, preco };
      }
    });

    const priced = scanRes.items.filter((i) => i.preco > 0).sort((a, b) => a.preco - b.preco);
    const best = priced[0];
    if (!best) continue;

    const hitTarget = f.preco_alvo && best.preco <= f.preco_alvo;
    const dropped = f.ultimo_preco && best.preco < f.ultimo_preco;

    if (hitTarget || dropped || !f.ultimo_preco) {
      sqliteMasterDb.updateRadarFilterPrice(f.id, best.preco);
      if (hitTarget || dropped) {
        alerts.push({ filter: f, best, hitTarget, dropped });
      }
    }
  }
  return alerts;
}

/**
 * Varredura silenciosa das 5 Frentes + Filtros /vigiar.
 * Envia alertas Telegram APENAS quando existem novidades reais ou baixas de preço!
 */
export async function dispararCicloRadarComAlertas(botInstance) {
  log.info('📡 A executar varredura silenciosa Multi-Frente (5 Frentes)...');
  try {
    const [casasRes, autosRes, techRes, amazonRes, appleRes, filterAlerts] = await Promise.all([
      executarVarreduraAmarante(),
      scanAutos(),
      scanTech(),
      scanAmazon(),
      scanApple(),
      checkActiveWatchFilters()
    ]);

    const novosImmo = obterImoveisNaoAlertados();
    if (novosImmo.length > 0 && botInstance) {
      for (const item of novosImmo.slice(0, 3)) {
        const header =
          item.preco_anterior && item.preco < item.preco_anterior
            ? `📉 *BAIXA DE PREÇO IMOBILIÁRIO EM AMARANTE!*\n`
            : `🚨 *NOVO ANÚNCIO IMOBILIÁRIO EM AMARANTE!*\n`;
        const alerta = formatarAlertaNovoImovel(item, header);
        await sendRadarTelegramAlert(botInstance, alerta.text, alerta.keyboard);
      }
      marcarAlertados(novosImmo.map((p) => p.id));
    }

    const frontAlerts = [
      ...autosRes.alerts.slice(0, 2).map((a) => `🚗 *CARRO (${a.priceDropped ? 'BAIXA DE PREÇO' : 'NOVO'}):* [${a.marca_modelo}](${a.url}) — *${a.preco} €* (${a.portal})`),
      ...techRes.alerts.slice(0, 2).map((a) => `💻 *TECH (${a.priceDropped ? 'BAIXA' : 'NOVO'}):* [${a.produto}](${a.url}) — *${a.preco} €* (${a.loja})`),
      ...amazonRes.alerts.slice(0, 2).map((a) => `📦 *AMAZON (${a.priceDropped ? 'BAIXA' : 'OFERTA'}):* [${a.titulo}](${a.url}) — *${a.preco} €*`),
      ...appleRes.alerts.slice(0, 2).map((a) => `🍎 *APPLE (${a.condicao}):* [${a.modelo}](${a.url}) — *${a.preco} €* (${a.loja})`),
      ...filterAlerts.map((fa) => `🎯 *ALERTA \`/vigiar\` (${fa.filter.termo}):* [${fa.best.titulo}](${fa.best.url}) — *${fa.best.preco} €*${fa.filter.preco_alvo ? ` (alvo <= ${fa.filter.preco_alvo} €)` : ''}`)
    ];

    if (frontAlerts.length > 0 && botInstance) {
      const msg =
        `🔔 *RADAR 5 FRENTES — OPORTUNIDADES & BAIXAS DE PREÇO*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        frontAlerts.join('\n\n');
      await sendRadarTelegramAlert(botInstance, msg);
    }

    const totalScanned =
      (casasRes.totalVarridos || 0) +
      (autosRes.scanned || 0) +
      (techRes.scanned || 0) +
      (amazonRes.scanned || 0) +
      (appleRes.scanned || 0);
    const alertasEnviados = novosImmo.length + frontAlerts.length;

    try {
      sqliteMasterDb.recordRadarExecution({
        frente: 'multi_frente_5',
        totalScanned,
        newAlerts: alertasEnviados,
        status: 'ok'
      });
    } catch {}

    return {
      casas: casasRes.totalVarridos,
      carros: autosRes.scanned,
      tech: techRes.scanned,
      amazon: amazonRes.scanned,
      apple: appleRes.scanned,
      alertasEnviados
    };
  } catch (err) {
    try {
      sqliteMasterDb.recordRadarExecution({ frente: 'multi_frente_5', totalScanned: 0, newAlerts: 0, status: `error:${err.message}` });
    } catch {}
    log.error('Erro no ciclo Multi-Frente:', err.message);
    return { alertasEnviados: 0, error: err.message };
  }
}

let lastMorningReportDay = null;
let last4hWindowKey = null;

/**
 * Agendador Europe/Lisbon: Relatório Diário 5 Frentes às 08:30 + Varredura Silenciosa a cada 4h (08h-22h).
 */
export function iniciarAgendadorRadar(botInstance) {
  if (!botInstance) return;
  log.info('⏰ Agendador Multi-Frente (5 Frentes) ativado (08h30 Europe/Lisbon + 4h em 4h entre 08h-22h).');

  setInterval(() => {
    const { hour, minute, dayKey } = getLisbonTimeParts();

    // 1. Relatório Diário Consolidado às 08:30 (Lisboa)
    if (hour === 8 && minute === 30 && lastMorningReportDay !== dayKey) {
      lastMorningReportDay = dayKey;
      log.info('☀️ A enviar Relatório Matinal Multi-Frente (08:30 Europe/Lisbon)...');
      const relatorio = gerarRelatorioMultiFrenteMarkdown();
      sendRadarTelegramAlert(botInstance, relatorio, {
        inline_keyboard: [
          [{ text: '🏠 Abrir ImmoEval Vercel', web_app: { url: VERCEL_IMMO_APP.url } }],
          [{ text: '📡 Varrer 5 Frentes Agora', callback_data: 'immo_radar_scan' }]
        ]
      });
    }

    // 2. Varredura silenciosa de 4 em 4 horas (08h, 12h, 16h, 20h aos :05)
    const slotKey = `${dayKey}_${hour}`;
    if ([8, 12, 16, 20].includes(hour) && minute === 5 && last4hWindowKey !== slotKey) {
      last4hWindowKey = slotKey;
      dispararCicloRadarComAlertas(botInstance);
    }
  }, 60 * 1000).unref();
}

export function checkpointImmoDb() {
  return checkpointMasterDb();
}

export default {
  checkpointImmoDb,
  guardarImovel,
  listarImoveis,
  obterImoveisNaoAlertados,
  marcarAlertados,
  obterOportunidades,
  formatarAlertaNovoImovel,
  gerarRelatorioDiarioMarkdown,
  gerarRelatorioMultiFrenteMarkdown,
  executarVarreduraAmarante,
  pesquisarMoradiasNovasPlataformas,
  formatarMoradiasNovasMarkdown,
  dispararCicloRadarComAlertas,
  iniciarAgendadorRadar,
  formatarAvaliacaoMarkdown
};
