// src/workers/worker_immo.js — Radar Multi-Frente 5 Frentes (Casas CMVM, Carros, Tech, Amazon, Apple) & Vigilância
import { createLogger } from '../utils/logger.js';
import { sqliteMasterDb } from '../shared/sqliteMasterDb.js';
import { askAgent } from '../services/reasoningService.js';
import { avaliarImovelCmvm, formatarAvaliacaoMarkdown } from '../services/immoCmvmService.js';
import { VERCEL_IMMO_APP, formatarSitesImobiliariosMarkdown } from '../shared/immoSitesCatalog.js';
import {
  gerarRelatorioMultiFrenteMarkdown,
  executarVarreduraAmarante,
  pesquisarMoradiasNovasPlataformas,
  formatarMoradiasNovasMarkdown,
  dispararCicloRadarComAlertas
} from '../services/immoRadarService.js';
import { searchAutos, formatAutosMarkdown } from '../services/autoRadarService.js';
import { searchTech, formatTechMarkdown } from '../services/techRadarService.js';
import { searchAmazon, formatAmazonMarkdown } from '../services/amazonRadarService.js';
import { searchApple, formatAppleMarkdown } from '../services/appleRadarService.js';

const log = createLogger('WorkerImmo');

function handleAvaliacaoComando(args = '') {
  const trimmed = args.trim();
  if (!trimmed) {
    return (
      `🏠 *AVALIAÇÃO IMOBILIÁRIA NORMAS CMVM (AMARANTE)*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `Formato: \`/avaliacao ÁREA_ÚTIL ZONA TIPOLOGIA ESTADO [TERRENO] [CLASSE] [SEM_LICENCA]\`\n\n` +
      `📌 *Exemplos:*\n` +
      `• \`/avaliacao 135 "São Gonçalo" T3 bom 320 C\`\n` +
      `• \`/avaliacao 95 Lomba T3 ruina 780 F sem_licenca\`\n\n` +
      `🌐 _Calculadora Online:_ \`${VERCEL_IMMO_APP.url}\``
    );
  }

  const parts = trimmed.split(/\s+/);
  const areaUtil = parseFloat(parts[0]) || 100;
  const zona = parts[1] || 'Amarante';
  const tipologia = parts[2] || 'T3';
  const estado = parts[3] || 'bom';
  const areaTerreno = parseFloat(parts[4]) || 0;
  const classeEnergetica = parts[5] || 'D';
  const semLicenca = /sem_licen|sem-licen|sem\s+licen/i.test(trimmed);
  const isRuina = /ruina|ruína|restauro/i.test(trimmed);
  const precoMatch = trimmed.match(/\b(\d{5,6})\b/);
  const precoAnunciado = precoMatch ? parseFloat(precoMatch[1]) : 0;

  const resultado = avaliarImovelCmvm({
    precoAnunciado,
    areaUtil,
    areaTerreno,
    classeEnergetica,
    zona,
    semLicenca,
    isRuina,
    estado
  });

  return formatarAvaliacaoMarkdown(resultado);
}

function handleVigiarCommand(rawArgs = '', ctx = {}) {
  const trimmed = String(rawArgs || '').trim();
  if (!trimmed) {
    return (
      `🎯 *COMO ATIVAR VIGILÂNCIA DE PREÇO (\`/vigiar\`):*\n` +
      `\`/vigiar <categoria> <termo ou link> [preço_alvo]\`\n\n` +
      `Categorias válidas: \`casas\`, \`carros\`, \`tech\`, \`amazon\`, \`apple\`\n\n` +
      `📌 *Exemplos:*\n` +
      `• \`/vigiar casas Moradia T3 Telões 220000\`\n` +
      `• \`/vigiar carros BYD Atto 3 25000\`\n` +
      `• \`/vigiar apple iPhone 15 Pro 256GB 850\`\n` +
      `• \`/vigiar amazon https://www.amazon.es/dp/B0CHX 199\``
    );
  }

  const parts = trimmed.split(/\s+/);
  const allowed = ['casas', 'carros', 'tech', 'amazon', 'apple'];
  let categoria = parts[0].toLowerCase();
  let startIdx = 1;
  if (!allowed.includes(categoria)) {
    categoria = 'geral';
    startIdx = 0;
  }

  const lastToken = parts[parts.length - 1];
  let precoAlvo = null;
  let termParts = parts.slice(startIdx);
  if (parts.length > startIdx + 1 && /^\d+(?:[.,]\d+)?$/.test(lastToken)) {
    precoAlvo = parseFloat(lastToken.replace(',', '.'));
    termParts = parts.slice(startIdx, -1);
  }

  const termoFull = termParts.join(' ').trim();
  const urlMatch = termoFull.match(/https?:\/\/\S+/i);
  const url = urlMatch ? urlMatch[0] : null;
  const termo = termoFull || trimmed;

  const saved = sqliteMasterDb.addRadarFilter({
    categoria,
    termo,
    url,
    precoAlvo,
    chatId: String(ctx.chat?.id || ctx.from?.id || '950415577'),
    createdBy: ctx.from?.first_name || 'André'
  });

  return (
    `✅ *Alerta de Vigilância Ativado (#${saved.id})*\n` +
    `• Categoria: *${saved.categoria.toUpperCase()}*\n` +
    `• Termo: \`${saved.termo}\`\n` +
    `${saved.preco_alvo ? `• Preço-alvo: *<= ${Number(saved.preco_alvo).toLocaleString('pt-PT')} €*\n` : ''}` +
    `${saved.url ? `• Link direto monitorizado\n` : ''}\n` +
    `🔔 _Verificação silenciosa automática a cada 4 horas (08h-22h). Usa \`/meus_alertas\` para gerir._`
  );
}

function handleMeusAlertasCommand(args = '') {
  const trimmed = String(args || '').trim();
  const delMatch = trimmed.match(/^(?:apagar|remover|del)\s+#?(\d+)$/i);
  if (delMatch) {
    sqliteMasterDb.deleteRadarFilter(delMatch[1]);
    return `🗑️ Alerta *#${delMatch[1]}* removido da vigilância.`;
  }

  const list = sqliteMasterDb.getRadarFilters(true);
  if (list.length === 0) {
    return (
      `📋 *Sem filtros ativos em \`/vigiar\`.*\n\n` +
      `Cria o primeiro exemplo: \`/vigiar apple MacBook Air M3 950\``
    );
  }

  let md = `🎯 *ALERTAS ATIVOS DE VIGILÂNCIA (${list.length})*\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  for (const f of list) {
    const alvo = f.preco_alvo ? ` | 🎯 Alvo: *<= ${f.preco_alvo} €*` : '';
    const last = f.ultimo_preco ? ` | Último observado: ${f.ultimo_preco} €` : '';
    md += `• *#${f.id}* [${f.categoria.toUpperCase()}] \`${f.termo}\`${alvo}${last}\n`;
  }
  md += `\n🗑️ _Para remover:_ \`/meus_alertas apagar <ID>\``;
  return md;
}

function handleMenuImmo() {
  return (
    `📡 *RADAR DE OPORTUNIDADES MULTI-FRENTE (5 FRENTES)*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `1️⃣ *Frente Imobiliário Amarante (CMVM):*\n` +
    `• \`/casas [zona]\` ou \`/moradias_novas\` | \`/avaliacao\` | \`/sites\`\n\n` +
    `2️⃣ *Frente Automóvel PT (EV >300km, PHEV, Combustão):*\n` +
    `• \`/carros [modelo]\` (Standvirtual, Carmine, Piscapisca, OLX, CustoJusto)\n\n` +
    `3️⃣ *Frente Tech & Informática PT/ES:*\n` +
    `• \`/tech [produto]\` (PCDiga, Globaldata, PCComponentes, Chip7, Castro, OLX)\n\n` +
    `4️⃣ *Frente Amazon.es & Segunda Mano:*\n` +
    `• \`/amazon [produto]\` ou \`/ofertas [termo]\` (Keepa + Warehouse)\n\n` +
    `5️⃣ *Frente Apple (Novo 3A vs Recondicionado Grau A):*\n` +
    `• \`/apple [modelo]\` | \`/iphone_preco\` | \`/apple_refurb\`\n\n` +
    `🎯 *Vigilância & Relatórios:*\n` +
    `• \`/vigiar <categoria> <termo> [preço]\` | \`/meus_alertas\`\n` +
    `• \`/radar\` (Varrimento Global) | \`/relatorio\` (Consolidação Diária)`
  );
}

export async function handle(text = '', ctx = {}) {
  const chatId = String(ctx.chat?.id || ctx.from?.id || '950415577');
  const trimmed = text.trim();
  log.info('Processando pedido Radar 5 Frentes', { text: trimmed.substring(0, 60), chatId });

  if (/^\/(reset|limpar)\b/i.test(trimmed)) {
    return await askAgent({ chatId, workerTag: 'immo', prompt: '/reset' });
  }

  // Vigilância (/vigiar, /vigiar_amazon, /vigiar_apple e /meus_alertas)
  if (/^\/vigiar_amazon\b/i.test(trimmed)) {
    const rest = trimmed.replace(/^\/vigiar_amazon\s*/i, '').trim();
    return handleVigiarCommand(rest ? `amazon ${rest}` : '', ctx);
  }
  if (/^\/vigiar_apple\b/i.test(trimmed)) {
    const rest = trimmed.replace(/^\/vigiar_apple\s*/i, '').trim();
    return handleVigiarCommand(rest ? `apple ${rest}` : '', ctx);
  }
  if (/^\/vigiar\b/i.test(trimmed)) {
    return handleVigiarCommand(trimmed.replace(/^\/vigiar\s*/i, ''), ctx);
  }
  if (/^\/meus_alertas\b/i.test(trimmed)) {
    return handleMeusAlertasCommand(trimmed.replace(/^\/meus_alertas\s*/i, ''));
  }

  // Frente 2: Carros
  if (/^\/carros?\b/i.test(trimmed)) {
    const q = trimmed.replace(/^\/carros?\s*/i, '').trim() || 'carro eletrico usado 350km';
    return formatAutosMarkdown(await searchAutos(q));
  }

  // Frente 3: Tech
  if (/^\/tech\b/i.test(trimmed)) {
    const q = trimmed.replace(/^\/tech\s*/i, '').trim() || 'portatil ssd monitor';
    return formatTechMarkdown(await searchTech(q));
  }

  // Frente 4: Amazon.es & Ofertas
  if (/^\/(amazon|ofertas?)\b/i.test(trimmed)) {
    const q = trimmed.replace(/^\/(amazon|ofertas?)\s*/i, '').trim() || 'oferta tecnologia amazon';
    return formatAmazonMarkdown(await searchAmazon(q));
  }

  // Frente 5: Apple Novo vs Recondicionado
  if (/^\/(apple|iphone_preco|apple_refurb)\b/i.test(trimmed)) {
    const q = trimmed.replace(/^\/(apple|iphone_preco|apple_refurb)\s*/i, '').trim() || 'iPhone 15 128GB';
    return formatAppleMarkdown(await searchApple(q));
  }

  // Frente 1: Casas & Amarante CMVM
  if (/^\/(casas|moradias?_novas?|novas?|moradias?)\b/i.test(trimmed) || /moradias?\s+novas?|pesquisar?\s+moradias?/i.test(trimmed)) {
    const q = trimmed.replace(/^\/(casas|moradias?_novas?|novas?|moradias?)\s*/i, '').trim();
    const zona = q && !/^(novas?|moradias?)$/i.test(q) ? q : 'Amarante';
    const res = await pesquisarMoradiasNovasPlataformas({ zona });
    return formatarMoradiasNovasMarkdown(res, zona);
  }

  // Varredura Global 5 Frentes
  if (/^\/(radar|pesquisar|pesquisa|varredura)\b/i.test(trimmed)) {
    const [casasRes, cycleRes] = await Promise.all([
      executarVarreduraAmarante(),
      dispararCicloRadarComAlertas(null)
    ]);
    return (
      `📡 *VARRIMENTO GLOBAL MULTI-FRENTE CONCLUÍDO*\n` +
      `• Casas Amarante verificadas: ${casasRes.totalVarridos}\n` +
      `• Carros verificados: ${cycleRes.carros || 0}\n` +
      `• Tech verificados: ${cycleRes.tech || 0}\n` +
      `• Amazon verificados: ${cycleRes.amazon || 0}\n` +
      `• Apple verificados: ${cycleRes.apple || 0}\n\n` +
      gerarRelatorioMultiFrenteMarkdown()
    );
  }

  if (/^\/(relatorio|relat[oó]rio|resumo_imoveis)\b/i.test(trimmed)) {
    return gerarRelatorioMultiFrenteMarkdown();
  }

  if (/^\/(sites|sites_immo|portais|imobiliarias)\b/i.test(trimmed)) {
    return formatarSitesImobiliariosMarkdown();
  }

  if (/^\/(alertas|agenda_immo)\b/i.test(trimmed)) {
    return (
      `🔔 *RADAR AUTOMÁTICO 5 FRENTES ATIVO*\n` +
      `• 08:30 (Lisboa): Relatório Diário Consolidado\n` +
      `• 08h-22h (4h em 4h): Varredura silenciosa com alerta imediato apenas em novidades ou baixas de preço.\n` +
      `• Gestão de filtros: \`/vigiar\` e \`/meus_alertas\``
    );
  }

  if (/^\/(avaliacao|avaliac[aã]o|avaliar)\b/i.test(trimmed)) {
    return handleAvaliacaoComando(trimmed.replace(/^\/(avaliacao|avaliac[aã]o|avaliar)\s*/i, ''));
  }

  if (/^\/(start|menu|ajuda|immo|imobiliario)\b/i.test(trimmed)) {
    return handleMenuImmo();
  }

  // Linguagem Natural -> rotear inteligente para frente certa antes da IA
  if (/\b(standvirtual|piscapisca|carmine|autom[oó]vel|carro\s+el[eé]trico|phev|byd|tesla)\b/i.test(trimmed)) {
    return formatAutosMarkdown(await searchAutos(trimmed));
  }
  if (/\b(iphone|macbook|ipad|airpods|apple\s+watch|swappie|iservices|back\s*market|recondicionad)\b/i.test(trimmed)) {
    return formatAppleMarkdown(await searchApple(trimmed));
  }
  if (/\b(amazon|segunda\s+mano|warehouse|keepa)\b/i.test(trimmed)) {
    return formatAmazonMarkdown(await searchAmazon(trimmed));
  }
  if (/\b(pcdiga|globaldata|pccomponentes|chip7|port[aá]til|rtx|monitor\s+oled|wallapop)\b/i.test(trimmed)) {
    return formatTechMarkdown(await searchTech(trimmed));
  }

  return await askAgent({
    chatId,
    workerTag: 'immo',
    prompt: trimmed,
    extraContext: `Tens o Radar de 5 Frentes ativo no SQLite WAL (Casas CMVM Amarante, Carros, Tech PT/ES, Amazon.es/Warehouse, Apple Novo vs Recondicionado Grau A). Nunca inventes links nem preços.`
  });
}

export default { handle };
