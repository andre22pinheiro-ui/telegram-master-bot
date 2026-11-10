// src/router/intentRouter.js — Deteção de intenção por regex/keywords (PT-PT)
import { createLogger } from '../utils/logger.js';

const log = createLogger('IntentRouter');

/**
 * Mapa de intenções: cada entrada tem um array de padrões regex.
 * Ordem importa: padrões mais específicos primeiro.
 */
const INTENT_PATTERNS = [
  {
    intent: 'FROTAS',
    patterns: [
      /^\/(frotas?|frota|veiculos?|viaturas?|rota|tac[oó]grafo|km|anomalia|avaria|checklist|higienizac[aã]o|stock|pesados?|motorista)\b/i,
      /\b([0-9]{2}[- ][A-Z]{2}[- ][0-9]{2}|[A-Z]{2}[- ][0-9]{2}[- ][A-Z]{2}|[0-9]{2}[- ][0-9]{2}[- ][A-Z]{2}|[A-Z]{2}[- ][0-9]{2}[- ][0-9]{2})\b/i,
      /\b(39-hz-66|01-aa-01|55-tn-89|12-xe-34|99-zz-99|volvo\s*b12b|citaro|iveco\s*daily|lion'?s\s*city)\b/i,
      /\b(frota|viatura|viaturas|carrinha|carrinhas|autocarro|autocarros|pesados?|tac[oó]grafo|motorista|condutor|rota|trajeto|km|quil[oó]metros?|od[oó]metro|gas[oó]leo|consumo|turno)\b/i,
      /\b(oficina|anomalia|avaria|avarias|higieniza[cç][aã]o|lavagem|desinfe[cç][aã]o|checklist|vistoria|pe[cç]as|repara[cç][aã]o|imobilizad[ao]|reboque|trav[oõ]es)\b/i,
      /\b(openroute|openrouteservice|ors|rotabus|appfrota|zeropaperfrota)\b/i,
    ],
  },
  {
    intent: 'IMMO',
    patterns: [
      /^\/(immo|imovel|imóvel|avaliac[aã]o|avaliacao|radar|pesquisar_imoveis|relatorio_imoveis|sites_immo|alertas_immo)\b/i,
      /\b(imov[eé]l|imóveis|imoveis|imobi[lh]i[aá]rio|avaliac[aã]o|avalia|m2|metro quadrado|amarante|casa|apartamento|terreno|moradia|habita[cç][aã]o|comprar\s+casa|vender\s+casa)\b/i,
      /\b(rever\s+an[uú]ncios|an[uú]ncios\s+diariamente|pesquisas?\s+durante\s+o\s+dia|alertas?\s+de\s+im[oó]veis|relat[oó]rio\s+de\s+im[oó]veis|novos\s+im[oó]veis|radar\s+imobili[aá]rio)\b/i,
      /\b(pesquisa-imobiliario|immoeval|cmvm)\b/i,
    ],
  },
  {
    intent: 'DEV',
    patterns: [
      /^\/(criar_app|build|projetos?|github|vercel|deploy|code|codigo|app|api|script|instalar|npm|node|pc|print|surface)\b/i,
      /\b(criar|cria|build|deploy|github|vercel|reposit[oó]rio|projeto|aplicação|app|api|script|código|instalar|programar|desenvolver)\b/i,
      /\b(erro|bug|debug|fix|corrigir|problema no código|surface|print.*pc|captura.*ecr[aã])\b/i,
    ],
  },
  {
    intent: 'TV',
    patterns: [
      /^\/(tv|iptv|canais|canal|matchpro_tv|vlc|stream)\b/i,
      /\b(tv|iptv|canais|canal|televis[aã]o|vlc|m3u|sport\s*tv|dazn|desenhos\s*animados|filmes|tvcine|xtream|matchpro)\b/i,
    ],
  },
  {
    intent: 'NUTRICAO',
    patterns: [
      /^\/(nutricao|dieta|macros?|calorias?|proteina|agua|creatina|refeic[aã]o|refeicoes|receita|alimento|hoje|status)\b/i,
      /\b(nutri[cç][aã]o|dieta|macros?|calorias?|prote[ií]na|creatina|refei[cç][aã]o|refei[cç][oõ]es|almo[cç]o|jantar|pequeno[- ]almo[cç]o|lanche|receita|shake|cottage|lombo|air[- ]?fryer|continente|pingo\s*doce|lidl|mercadona|auchan|comer)\b/i,
    ],
  },
  {
    intent: 'GERAL',
    patterns: [
      /^\/(compras?|notas?|briefing|tarefa|lembrete|lembretes|lista|agenda|memo|carolina|ergonomia)\b/i,
      /\b(comprar|compras|lista|supermercado|nota|notas|briefing|tarefa|tarefas|lembrete|lembretes|agenda|memo|recados?|carolina|escola|falta|consulta|pediatra|ergonomia|postura|sa[uú]de)\b/i,
    ],
  },
];

/**
 * Deteta a intenção de uma mensagem de texto.
 * @param {string} text - O texto da mensagem do utilizador.
 * @returns {'IMMO'|'DEV'|'FROTAS'|'TV'|'NUTRICAO'|'GERAL'} A intenção detetada.
 */
export function detectIntent(text) {
  if (!text || typeof text !== 'string') return 'GERAL';

  const normalized = text.trim().toLowerCase();

  for (const { intent, patterns } of INTENT_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(normalized)) {
        log.info(`Intenção detetada: ${intent}`, { input: text.substring(0, 60) });
        return intent;
      }
    }
  }

  log.info('Intenção não reconhecida → fallback GERAL', { input: text.substring(0, 60) });
  return 'GERAL';
}

export default detectIntent;
