// src/router/intentRouter.js — Deteção de intenção por regex/keywords (PT-PT)
import { createLogger } from '../utils/logger.js';

const log = createLogger('IntentRouter');

/**
 * Mapa de intenções: cada entrada tem um array de padrões regex.
 * Ordem importa: padrões mais específicos primeiro.
 */
const INTENT_PATTERNS = [
  {
    intent: 'DEV',
    patterns: [
      /^\/(criar_app|build|projetos?|github|vercel|deploy|code|codigo|app|api|script|instalar|npm|node)\b/i,
      /\b(criar|cria|build|deploy|github|vercel|reposit[oó]rio|projeto|aplicação|app|api|script|código|instalar|programar|desenvolver)\b/i,
      /\b(erro|bug|debug|fix|corrigir|problema no código)\b/i,
    ],
  },
  {
    intent: 'FROTAS',
    patterns: [
      /^\/(frotas?|rota|tac[oó]grafo|caminhão|pesado|condutor|km|quilómetros?)\b/i,
      /\b(frota|pesados?|caminhão|caminhões|tacógrafo|tac[oó]grafo|condutor|motorista|rota|trajeto|percurso|km|quilómetros?|gasoleo|gasolina|consumo)\b/i,
      /\b(openroute|openrouteservice|ors)\b/i,
    ],
  },
  {
    intent: 'IMMO',
    patterns: [
      /^\/(immo|imovel|imóvel|avaliac[aã]o|m2|metro|amarante|casa|terreno|predio)\b/i,
      /\b(imov[eé]l|imóvel|imobi[lh]i[aá]rio|avaliac[aã]o|avalia|preço|m2|metro quadrado|amarante|casa|apartamento|terreno|prédio|lote|moradia|hab[iy]tação|comprar|vender)\b/i,
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
    intent: 'GERAL',
    patterns: [
      /^\/(compras?|notas?|briefing|tarefa|lembrete|lista|agenda|memo|carolina|nutricao|dieta|proteina|ergonomia)\b/i,
      /\b(comprar|compras|lista|supermercado|nota|notas|briefing|tarefa|tarefas|lembrete|lembretes|agenda|memo|recados?|carolina|escola|falta|consulta|pediatra|nutri[cç][aã]o|prote[ií]na|dieta|macros|ergonomia|postura|sa[uú]de)\b/i,
    ],
  },
];

/**
 * Deteta a intenção de uma mensagem de texto.
 * @param {string} text - O texto da mensagem do utilizador.
 * @returns {'DEV'|'FROTAS'|'IMMO'|'GERAL'} A intenção detetada.
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

