// src/workers/worker_immo.js — Avaliação Imobiliária Normas CMVM & Radar de Anúncios Diários
import { createLogger } from '../utils/logger.js';
import { askAgent } from '../services/reasoningService.js';
import { avaliarImovelCmvm, formatarAvaliacaoMarkdown } from '../services/immoCmvmService.js';
import {
  IMMO_SITES,
  VERCEL_IMMO_APP,
  formatarSitesImobiliariosMarkdown,
  buildImmoSitesKeyboard
} from '../shared/immoSitesCatalog.js';
import {
  gerarRelatorioDiarioMarkdown,
  executarVarreduraAmarante,
  pesquisarMoradiasNovasPlataformas,
  formatarMoradiasNovasMarkdown,
  obterOportunidades,
  formatarAlertaNovoImovel,
  listarImoveis
} from '../services/immoRadarService.js';

const log = createLogger('WorkerImmo');

// ─── Handlers Principais ─────────────────────────────────────────────────────

/**
 * Handler do comando /avaliacao com suporte a normas estritas CMVM
 * Exemplo: /avaliacao 140 Amarante T3 bom 350 D
 *          /avaliacao 110 Freixo T3 ruina 450 F sem_licenca
 */
function handleAvaliacaoComando(args = '') {
  const trimmed = args.trim();
  if (!trimmed) {
    return (
      `🏠 *AVALIAÇÃO IMOBILIÁRIA NORMAS CMVM (AMARANTE)*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `Formato flexível:\n` +
      `\`/avaliacao ÁREA_ÚTIL ZONA TIPOLOGIA ESTADO [TERRENO] [CLASSE_ENERGÉTICA] [SEM_LICENCA]\`\n\n` +
      `📌 *Exemplos Práticos:*\n` +
      `• \`/avaliacao 135 "São Gonçalo" T3 bom 320 C\`\n` +
      `• \`/avaliacao 150 Telões T4 excelente 650 D\`\n` +
      `• \`/avaliacao 95 Lomba T3 ruina 780 F sem_licenca\`\n\n` +
      `⚖️ *Normas Incorporadas da Mini App:*\n` +
      `• U.F. Amarante Centro: 1.350 €/m² base\n` +
      `• Coroa Periférica (Telões, Lomba, Freixo): 1.180 €/m²\n` +
      `• Escalonamento de terreno: 35 €/m² (≤500m²) | 8 €/m² (≤2000m²) | 2 €/m²\n` +
      `• Penalização por falta de licença de utilização (-25%)\n` +
      `• Provisão de obras térmicas e eficiência energética\n\n` +
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
  const isRuina = /ruina|ruína|restauro/i.test(estado) || /ruina|ruína/i.test(trimmed);

  // Preço anunciado opcional se tiver número de 5 dígitos ou mais
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

/**
 * Handler do Radar de Pesquisa Imediata
 */
async function handleRadarPesquisa() {
  const { totalVarridos, novosDetetados } = await executarVarreduraAmarante();
  return formatarMoradiasNovasMarkdown(novosDetetados, 'Amarante');
}

/**
 * Menu principal interativo do Worker Imobiliário
 */
function handleMenuImmo() {
  return (
    `🏠 *BOT IMOBILIÁRIO AMARANTE & NORMAS CMVM*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `Sistema especializado de monitorização de mercado, radar de novos anúncios e avaliação bancária de moradias.\n\n` +
    `🚀 *Comandos Disponíveis:*\n` +
    `• \`/radar\` — Disparar pesquisa de novos imóveis agora mesmo nos 12 portais\n` +
    `• \`/relatorio\` — Relatório diário de anúncios novos e melhores oportunidades\n` +
    `• \`/avaliacao [área] [zona] [tipo] [estado]\` — Avaliação bancária rigorosa por m²\n` +
    `• \`/sites\` — Ver os 12 portais e agências locais com links diretos\n` +
    `• \`/alertas\` — Estado do radar automático durante o dia (08:30, 13:30, 18:30)\n\n` +
    `💡 _Dica: Podes colar o link ou a descrição de qualquer moradia para eu calcular a viabilidade e o valor intrínseco CMVM!_\n\n` +
    `🌐 *Mini App Oficial:* [ImmoEval Vercel](${VERCEL_IMMO_APP.url})`
  );
}

/**
 * Informações e status do sistema de alertas diários
 */
function handleAlertasStatus() {
  return (
    `🔔 *ESTADO DOS ALERTAS DIÁRIOS & RADAR DE IMÓVEIS*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🟢 *Status:* **ATIVO E OPERACIONAL**\n\n` +
    `⏰ *Ciclo de Pesquisas Durante o Dia:*\n` +
    `• **08:30** — ☀️ Relatório Matinal com novas entradas das últimas 24h\n` +
    `• **13:30** — 🔍 Varredura de almoço nos portais (RE/MAX, ERA, Idealista, etc.)\n` +
    `• **18:30** — 🌆 Varredura de final de tarde e consolidação de oportunidades\n` +
    `• **A cada 4 horas** — Verificação em background para alertas imediatos\n\n` +
    `🎯 *Critérios de Alerta:* Moradias em Amarante (São Gonçalo, Cepelos, Telões, Fregim, Lomba, Madalena, Gatão, Freixo), com teto de referência até 250.000 € (ou 300.000 € negociáveis).\n\n` +
    `_Podes forçar uma pesquisa a qualquer segundo escrevendo \`/radar\`._`
  );
}

// ─── Dispatcher Principal ────────────────────────────────────────────────────

export async function handle(text = '', ctx = {}) {
  const chatId = String(ctx.chat?.id || ctx.from?.id || '950415577');
  const trimmed = text.trim();
  log.info('Processando pedido IMMO', { text: trimmed.substring(0, 60), chatId });

  if (/^\/(reset|limpar)\b/i.test(trimmed)) {
    return await askAgent({ chatId, workerTag: 'immo', prompt: '/reset' });
  }

  // 1. Moradias Novas nas Plataformas
  if (/^\/(moradias?_novas?|novas?|moradias?)\b/i.test(trimmed) || /moradias?\s+novas?|pesquisar?\s+moradias?|casas?\s+novas?|empreendimentos?/i.test(trimmed)) {
    const res = await pesquisarMoradiasNovasPlataformas({ zona: 'Amarante' });
    return formatarMoradiasNovasMarkdown(res, 'Amarante');
  }

  // 2. Radar e Pesquisa Imediata
  if (/^\/(radar|pesquisar|pesquisa|pesquisar_imoveis|varredura)\b/i.test(trimmed)) {
    return await handleRadarPesquisa();
  }

  // 2. Relatório Diário de Imóveis
  if (/^\/(relatorio|relat[oó]rio|relatorio_imoveis|resumo_imoveis|imoveis_novos|novos)\b/i.test(trimmed)) {
    return gerarRelatorioDiarioMarkdown();
  }

  // 3. Diretório de Sites e Portais
  if (/^\/(sites|sites_immo|portais|imobiliarias|agencias)\b/i.test(trimmed)) {
    return formatarSitesImobiliariosMarkdown();
  }

  // 4. Estado de Alertas Diários
  if (/^\/(alertas|alertas_immo|agenda_immo)\b/i.test(trimmed)) {
    return handleAlertasStatus();
  }

  // 5. Avaliação CMVM com argumentos
  if (/^\/(avaliacao|avaliac[aã]o|immo|imovel|avaliar)\s+/i.test(trimmed)) {
    const args = trimmed.replace(/^\/(avaliacao|avaliac[aã]o|immo|imovel|avaliar)\s+/i, '');
    return handleAvaliacaoComando(args);
  }

  // 6. Menu e Ajuda
  if (/^\/(start|menu|ajuda|immo|imobiliario)\b/i.test(trimmed)) {
    return handleMenuImmo();
  }

  // 7. Deteção de pedido de rever anúncios diariamente / pesquisa de imóveis
  if (/rever\s+an[uú]ncios|an[uú]ncios\s+diariamente|pesquisas?\s+durante\s+o\s+dia|alertas?\s+e\s+relat[oó]rio|im[oó]veis\s+novos/i.test(trimmed)) {
    let resposta = `✅ *CAPACITAÇÃO DE PESQUISA & ALERTAS ATIVADA COM SUCESSO!*\n\n`;
    resposta += `O bot de imobiliário foi totalmente integrado com a tua **Mini App Vercel** (\`${VERCEL_IMMO_APP.url}\`) e as normas periciais CMVM.\n\n`;
    resposta += `🔔 *Automação configurada para o teu Telegram:*\n`;
    resposta += `1. **Pesquisas ao Longo do Dia:** Varredura automática a cada 4 horas (08:30, 13:30, 18:30) nos 12 portais (Casa Yes, ERA, RE/MAX, Idealista, Imovirtual, Moramarante, etc.).\n`;
    resposta += `2. **Alertas Imediatos:** Sempre que uma moradia nova é publicada, recebes um alerta individual com o preço pedido vs a avaliação CMVM.\n`;
    resposta += `3. **Relatório Diário:** Resumo consolidado matinal às 08:30 com todas as oportunidades.\n\n`;
    resposta += `Aqui está o relatório do estado atual do mercado:\n\n`;
    resposta += gerarRelatorioDiarioMarkdown();
    return resposta;
  }

  // 8. Diálogo Avançado com Inteligência Artificial Especialista em Imobiliário
  return await askAgent({
    chatId,
    workerTag: 'immo',
    prompt: trimmed,
    extraContext: `Estás integrado com a app Vercel https://pesquisa-imobiliario.vercel.app. Conheces os 12 portais de Amarante e aplicas sempre as normas de peritagem CMVM (1.350€/m² centro urbano, 1.180€/m² periferia, terreno escalonado 35€/8€/2€, e penalização de 25% se não tiver licença de utilização). Teto de investimento: 250.000€.`
  });
}

export default { handle };
