// src/services/reasoningService.js — Motor de Raciocínio Profundo & Diálogo Multi-Turn
import 'dotenv/config';
import axios from 'axios';
import { conversationMemory } from '../shared/conversationMemory.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('Reasoning');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_MODEL = process.env.GROQ_MODEL || 'qwen/qwen3.8-27b';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';

// ─── Personas Especialistas & Instruções de Sistema (PT-PT) ──────────────────

const SYSTEM_PROMPTS = {
  master: `És o Master Cockpit Executivo — Conselheiro Sénior Organizacional e Diretor de Operações de André Pinheiro (Amarante, Portugal).
Atuas sob os mais rigorosos padrões de Governança Corporativa e em total conformidade com as Diretrizes da União Europeia (Regulamento da IA - AI Act UE 2024/1689 e RGPD UE 2016/679).

DIRETIVAS OBRIGATÓRIAS DE OPERAÇÃO:
1. RIGOR FACTUAL ABSOLUTO (POLÍTICA ZERO DELÍRIOS / ANTI-HALLUCINATION):
   - Cada informação enviada DEVE ser comprovada, filtrada e 100% real.
   - É ESTRITAMENTE PROIBIDO inventar links de internet, anúncios imobiliários, notícias, leis ou estatísticas hipotéticas.
   - Se não dispuseres de dados em tempo real ou se uma informação for desconhecida, declara expressamente: "Informação não verificada / Sem dados em tempo real".
2. CONFORMIDADE COM A UNIÃO EUROPEIA:
   - Alinha todas as decisões e recomendações com o enquadramento regulamentar europeu e a legislação da República Portuguesa.
   - Transparência algorítmica: fundamenta respostas técnicas com referências legais e técnicas concretas (ex: Regulamento CE 561/2006, Normas CMVM, Diretivas UE).
3. PERFIL ORGANIZACIONAL:
   - Tom: Executivo, estratégico, altamente estruturado, pragmático e cortês em Português de Portugal.
   - Conhecimento total do ecossistema de André: as suas 9 Mini Apps Vercel, a gestão familiar/doméstica da filha Carolina, operações rodoviárias e metas de desempenho.
   - Formatação executiva: utiliza títulos, pontos de ação, tabelas e sínteses concisas para apoiar a tomada de decisão rápida.`,

  dev: `És o Engenheiro de Software Principal e Arquiteto Cloud Sénior de André Pinheiro.
Atuas em conformidade com os padrões europeus de segurança de software, RGPD (Privacy by Design) e EU AI Act.
DIRETRIZES:
- Código moderno, rigoroso, tipado e pronto para produção (Node.js, Express, Telegraf, React, Vite, Kotlin/Android).
- ZERO DELÍRIOS: Nunca inventes bibliotecas, funções inexistentes ou documentação falsa. Todo o código fornecido deve compilar e ser funcional.
- Explica a arquitetura, mitiga pontos únicos de falha e assegura alta disponibilidade.`,

  frotas: `És o Especialista Sénior de Operações Rodoviárias e Auditor de Frotas de André Pinheiro.
Atuas em conformidade estrita com o Regulamento (CE) n.º 561/2006, a Diretiva 2002/15/CE e o Pacote de Mobilidade I da União Europeia.
DIRETRIZES:
- Rigor matemático e legal no cálculo de tacógrafo digital:
  * Condução contínua: máx 4h30 ➔ pausa obrigatória de 45m (ou 15m + 30m).
  * Condução diária: máx 9h (extensível a 10h 2x por semana).
  * Repouso diário regular (11h ou 3h + 9h) e reduzido (9h, máx 3x por semana).
- Roteamento e alturas: A4, A1, A3, A7, A11, A28, IP4, Túnel do Marão e viadutos.
- ZERO DELÍRIOS: Se uma rota ou limite de altura (ex: gabarit de túneis) requerer confirmação local, emite alerta de segurança preventivo imediato.`,

  immo: `És o Perito Avaliador Imobiliário Oficial e Auditor de Investimentos de André Pinheiro.
Atuas segundo as Normas Oficiais da CMVM (Regulamento n.º 2/2015) e as Normas Europeias de Avaliação (EVS - TEGoVA).
DIRETRIZES:
- ZERO DELÍRIOS: É PROIBIDO inventar imóveis, moradias ou links falsos de portais imobiliários. Apenas analisa anúncios reais fornecidos pelo utilizador ou pesquisas diretas nos portais oficiais (Idealista, Imovirtual, Casa Sapo, ERA, RE/MAX).
- Critérios Periciais CMVM em Amarante: Construção nova/reconstruída: 1.350 €/m² (U.F. Amarante centro) e 1.180 €/m² (periferia); Terreno: 35 €/m² (<500m²); Eficiência energética (CAPEX obras); Desconto legal sem licença (-25%).
- Relatórios objetivos: discrimina preço pedido, valor intrínseco CMVM, encargos fiscais (IMT/Selo) e viabilidade financeira real.`,

  pessoal: `És o Gestor Executivo de Operações Familiares e Produtividade de André Pinheiro.
Atuas sob os princípios de discrição, confidencialidade (RGPD) e eficiência organizacional.
DIRETRIZES:
- Organização estrita de prioridades: compras, rotinas domésticas, saúde e escola da Carolina.
- Comunicação direta, estruturada em checklists práticas e orientada à resolução imediata de pendências.`,

  nutricao: `És o Consultor Desportivo e Nutricional de André Pinheiro.
Atuas com base na literatura científica europeia de nutrição desportiva (EFSA / ISSN).
DIRETRIZES:
- Meta: 160g de Proteína diária (~2g/kg), hidratação (2.5L a 3.0L) e 5g de Creatina.
- Sugestões práticas baseadas exclusivamente em produtos reais disponíveis no mercado português (Continente, Lidl, Mercadona, Pingo Doce).
- Factualidade total: contabilidade precisa de macronutrientes sem valores inventados.`
};

// ─── Chamada ao Google Gemini (Multi-Turn com Fallback Resiliente) ──────────

async function callGemini(chatId, workerTag, prompt, extraContext = '') {
  if (!GEMINI_API_KEY) return null;

  const systemInstruction = SYSTEM_PROMPTS[workerTag] || SYSTEM_PROMPTS.master;
  const history = conversationMemory.getGeminiHistory(chatId, workerTag);

  let userText = prompt;
  if (extraContext) {
    userText = `[Contexto adicional do sistema: ${extraContext}]\n\n${prompt}`;
  }

  const contents = [
    ...history,
    {
      role: 'user',
      parts: [{ text: userText }]
    }
  ];

  const payload = {
    system_instruction: {
      parts: [{ text: systemInstruction }]
    },
    contents,
    generationConfig: {
      temperature: 0.0,
      maxOutputTokens: 1400,
      topP: 0.1
    }
  };

  const models = ['gemini-flash-lite-latest', 'gemini-flash-latest'];
  for (const model of models) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      const res = await axios.post(endpoint, payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-goog-api-key': GEMINI_API_KEY
        },
        timeout: 5000
      });
      const reply = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (reply && reply.trim().length > 0) {
        conversationMemory.addTurn(chatId, workerTag, 'user', prompt);
        conversationMemory.addTurn(chatId, workerTag, 'model', reply.trim());
        return reply.trim();
      }
    } catch (err) {
      log.warn(`Gemini [${model}] falhou [${workerTag}]: ${err.response?.data?.error?.message || err.message}`);
    }
  }

  return null;
}

// ─── Fallback ao Groq LPU (GPT-OSS-20B / Qwen 3.8) ──────────────────────────

async function callGroqFallback(chatId, workerTag, prompt, extraContext = '') {
  if (!GROQ_API_KEY) return null;

  const systemInstruction = SYSTEM_PROMPTS[workerTag] || SYSTEM_PROMPTS.master;
  const history = conversationMemory.getOpenAiHistory(chatId, workerTag);

  let userText = prompt;
  if (extraContext) {
    userText = `[Contexto adicional: ${extraContext}]\n\n${prompt}`;
  }

  const messages = [
    { role: 'system', content: systemInstruction },
    ...history,
    { role: 'user', content: userText }
  ];

  const groqModels = ['qwen/qwen3.8-27b', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b'];
  for (const model of groqModels) {
    try {
      const payload = {
        model,
        messages,
        temperature: 0.0,
        max_tokens: 850
      };

      const res = await axios.post('https://api.groq.com/openai/v1/chat/completions', payload, {
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 6000
      });

      const reply = res.data?.choices?.[0]?.message?.content;
      if (reply && reply.trim().length > 0) {
        conversationMemory.addTurn(chatId, workerTag, 'user', prompt);
        conversationMemory.addTurn(chatId, workerTag, 'assistant', reply.trim());
        return reply.trim();
      }
    } catch (err) {
      log.warn(`Groq [${model}] falhou [${workerTag}]: ${err.response?.data?.error?.message || err.message}`);
    }
  }

  return null;
}

// ─── Fallback ao OpenRouter (Modelos Gratuitos Multi-Provedor) ──────────────

async function callOpenRouterFallback(chatId, workerTag, prompt, extraContext = '') {
  if (!OPENROUTER_API_KEY) return null;

  const systemInstruction = SYSTEM_PROMPTS[workerTag] || SYSTEM_PROMPTS.master;
  const history = conversationMemory.getOpenAiHistory(chatId, workerTag);

  let userText = prompt;
  if (extraContext) {
    userText = `[Contexto adicional: ${extraContext}]\n\n${prompt}`;
  }

  const messages = [
    { role: 'system', content: systemInstruction },
    ...history,
    { role: 'user', content: userText }
  ];

  const orModels = ['openrouter/free', 'liquid/lfm-3-1.7b:free', 'nvidia/nemotron-3.5-lightning:free'];
  for (const model of orModels) {
    try {
      const res = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
        model,
        messages,
        temperature: 0.0,
        max_tokens: 850
      }, {
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/andre22pinheiro-ui/telegram-master-bot',
          'X-Title': 'Telegram Master Bot'
        },
        timeout: 9000
      });

      const reply = res.data?.choices?.[0]?.message?.content;
      if (reply && reply.trim().length > 0) {
        conversationMemory.addTurn(chatId, workerTag, 'user', prompt);
        conversationMemory.addTurn(chatId, workerTag, 'assistant', reply.trim());
        return reply.trim();
      }
    } catch (err) {
      log.warn(`OpenRouter [${model}] falhou [${workerTag}]: ${err.response?.data?.error?.message || err.message}`);
    }
  }

  return null;
}

// ─── Ponto de Entrada Central para Resolução de Problemas Complexos ──────────

export async function askAgent({ chatId = '950415577', workerTag = 'master', prompt, extraContext = '' }) {
  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    return 'Por favor, escreve uma pergunta ou desafio para eu analisar.';
  }

  const trimmed = prompt.trim();

  // Comandos de controle de memória
  if (/^\/(reset|limpar|novo|nova_conversa)\b/i.test(trimmed)) {
    conversationMemory.clear(chatId, workerTag);
    return '🔄 *Memória da conversa reiniciada!* Podes iniciar um novo tema ou desafio do zero.';
  }

  // 1. Motor Principal de Alta Performance: Groq LPU (~230ms de latência)
  let answer = await callGroqFallback(chatId, workerTag, trimmed, extraContext);

  // 2. Fallback Secundário de Resiliência: OpenRouter (Multi-provedor gratuito)
  if (!answer) {
    log.info(`A recorrer ao OpenRouter Free para [${workerTag}]...`);
    answer = await callOpenRouterFallback(chatId, workerTag, trimmed, extraContext);
  }

  // 3. Fallback Terciário: Google Gemini
  if (!answer && GEMINI_API_KEY) {
    log.info(`A recorrer ao Google Gemini para [${workerTag}]...`);
    answer = await callGemini(chatId, workerTag, trimmed, extraContext);
  }

  if (answer) {
    return answer;
  }

  return (
    '⚠️ Os motores de inteligência artificial na nuvem estão temporariamente sobrecarregados.\n\n' +
    'Tenta reformular a tua pergunta ou utiliza os comandos específicos do menu.'
  );
}

export default {
  askAgent,
  conversationMemory,
  SYSTEM_PROMPTS
};
