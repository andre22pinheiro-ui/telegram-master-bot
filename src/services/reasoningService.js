// src/services/reasoningService.js — Motor Grok Bot (@AndrePinheirobot) | Cascata IA temperature: 0.0
import 'dotenv/config';
import axios from 'axios';
import { conversationMemory } from '../shared/conversationMemory.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('Reasoning');

function getKeys() {
  return {
    gemini: process.env.GEMINI_API_KEY || '',
    groq: process.env.GROQ_API_KEY || '',
    groqModel: process.env.GROQ_MODEL || 'qwen/qwen3.8-27b',
    openrouter: process.env.OPENROUTER_API_KEY || ''
  };
}

// ─── Personas Grok Bot Pessoal (ver AGENTS.md) ───────────────────────────────
const PERSONAL_POLICY = `POLÍTICA OBRIGATÓRIA DE OPERAÇÃO (AGENTS.md | temperature=0.0):
1. RIGOR FACTUAL ABSOLUTO (ZERO ALUCINAÇÕES):
   - Nunca inventes links, URLs, preços, áreas, notícias, decretos-lei, valores nutricionais ou resultados de ferramentas não executadas.
   - Se faltarem dados em tempo real, declara exatamente o que foi verificado e o que está indisponível.
2. DOMÍNIO ESTRITO PESSOAL & FAMILIAR:
   - Este bot (@AndrePinheirobot) trata APENAS vida pessoal, família, casa, nutrição, notícias oficiais, radar de oportunidades e PC/dev pessoal.
   - Gestão profissional de frotas, ZeroPaperFrota, AppFrota, rotas de camiões/autocarros ou tacógrafo pertencem EXCLUSIVAMENTE ao bot @zeropaperfrotaBot. Redireciona cordialmente se perguntarem sobre trabalho/frotas.
3. IDIOMA & CONFORMIDADE: Português de Portugal (PT-PT) claro e rigoroso, em conformidade com EU AI Act (UE 2024/1689) e RGPD (UE 2016/679).`;

const PESSOAL_PROMPT = `És o Gestor Executivo de Operações Familiares e Domésticas de André Pinheiro e Família (Amarante, Portugal).
${PERSONAL_POLICY}
- Geres compras, tarefas, diário da bebé Carolina, notas, lembretes (fuso Europe/Lisbon), notícias oficiais certificadas e receitas do dia a dia.`;

export const SYSTEM_PROMPTS = {
  master: `És o Grok Bot (@AndrePinheirobot) — Assistente Pessoal Executivo Sénior 100% Cloud-Native de André Pinheiro (Amarante, Portugal).
${PERSONAL_POLICY}
- Tens visão global sobre compras, tarefas, Carolina, email pessoal (IMAP), notícias certificadas, nutrição (160g proteína), radar de compras 5 frentes e DevOps Cloud (GitHub, GitHub Actions, Vercel e Render).`,

  geral: PESSOAL_PROMPT,
  pessoal: PESSOAL_PROMPT,

  dev: `És o Engenheiro de Software Principal e Arquiteto Cloud 100% Cloud-Native de André Pinheiro.
${PERSONAL_POLICY}
- Especialista em Node.js, Telegraf, SQLite WAL + Google Drive Write-Through, GitHub Octokit API, GitHub Actions (compilação Android APK na nuvem), Vercel e Render.
- Fornece apenas código válido e verificável, sem bibliotecas nem funções inventadas.`,

  immo: `És o Auditor de Oportunidades e Perito Avaliador Imobiliário CMVM de André Pinheiro.
${PERSONAL_POLICY}
- Avalias 5 Frentes: (1) Moradias/Terrenos Amarante (norma CMVM: 1.350 €/m² centro U.F. Amarante, 1.180 €/m² periferia, 1.120 €/m² limítrofes; terreno escalonado 35/8/2 €/m²; desconto sem licença -25%), (2) Carros (EV >300km, PHEV, combustão), (3) Tech PT/ES, (4) Amazon.es & Segunda Mano, (5) Apple Novo (3 anos garantia) vs Recondicionado Grau A.
- NUNCA inventes anúncios nem URLs de portais.`,

  nutricao: `És o Especialista em Nutrição Desportiva e Alta Proteína de André Pinheiro (normas EFSA/ISSN).
${PERSONAL_POLICY}
- Meta diária: 160g proteína (~2g/kg), 2.5L água (2500ml), 5g creatina diária.
- Quando gerares receitas (Airfryer, Monsieur Cuisine Connect ou Gerais), usa ingredientes reais de supermercados portugueses (Lidl, Continente, Pingo Doce, Mercadona) e garante sempre cálculo transparente de macronutrientes por dose incluindo a % da meta de 160g.`
};

// ─── Cascata Unificada (1. Gemini -> 2. Groq -> 3. OpenRouter | temp = 0.0) ──

async function callGemini({ systemInstruction, history = [], userText, maxTokens = 1600 }) {
  const { gemini } = getKeys();
  if (!gemini) return null;

  const contents = [...history, { role: 'user', parts: [{ text: userText }] }];
  const payload = {
    system_instruction: { parts: [{ text: systemInstruction }] },
    contents,
    generationConfig: {
      temperature: 0.0,
      maxOutputTokens: maxTokens,
      topP: 0.1
    }
  };

  for (const model of ['gemini-flash-latest', 'gemini-flash-lite-latest']) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      const res = await axios.post(endpoint, payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-goog-api-key': gemini
        },
        timeout: 9000
      });
      const reply = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (reply && reply.trim().length > 0) {
        return { text: reply.trim(), provider: `gemini:${model}` };
      }
    } catch (err) {
      log.warn(`Gemini [${model}] falhou: ${err.response?.data?.error?.message || err.message}`);
    }
  }
  return null;
}

async function callOpenAiCompatible({ url, headers, models, systemInstruction, history = [], userText, maxTokens = 1600, providerName }) {
  const messages = [
    { role: 'system', content: systemInstruction },
    ...history,
    { role: 'user', content: userText }
  ];

  for (const model of models) {
    try {
      const res = await axios.post(
        url,
        {
          model,
          messages,
          temperature: 0.0,
          max_tokens: maxTokens
        },
        { headers, timeout: 9000 }
      );
      const reply = res.data?.choices?.[0]?.message?.content;
      if (reply && reply.trim().length > 0) {
        return { text: reply.trim(), provider: `${providerName}:${model}` };
      }
    } catch (err) {
      log.warn(`${providerName} [${model}] falhou: ${err.response?.data?.error?.message || err.message}`);
    }
  }
  return null;
}

async function callGroq({ systemInstruction, history = [], userText, maxTokens = 1600 }) {
  const { groq, groqModel } = getKeys();
  if (!groq) return null;
  const models = [...new Set([groqModel, 'qwen/qwen3.8-27b', 'openai/gpt-oss-120b'].filter(Boolean))];
  return await callOpenAiCompatible({
    url: 'https://api.groq.com/openai/v1/chat/completions',
    headers: { Authorization: `Bearer ${groq}`, 'Content-Type': 'application/json' },
    models,
    systemInstruction,
    history,
    userText,
    maxTokens,
    providerName: 'groq'
  });
}

async function callOpenRouter({ systemInstruction, history = [], userText, maxTokens = 1600 }) {
  const { openrouter } = getKeys();
  if (!openrouter) return null;
  return await callOpenAiCompatible({
    url: 'https://openrouter.ai/api/v1/chat/completions',
    headers: {
      Authorization: `Bearer ${openrouter}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/andre22pinheiro-ui/telegram-master-bot',
      'X-Title': 'Grok Bot (@AndrePinheirobot)'
    },
    models: ['openrouter/free', 'liquid/lfm-3-1.7b:free', 'nvidia/nemotron-3.5-lightning:free'],
    systemInstruction,
    history,
    userText,
    maxTokens,
    providerName: 'openrouter'
  });
}

/**
 * Inferência sem histórico conversacional (usado por routers JSON e formatadores determinísticos).
 */
export async function generateDeterministicCompletion({ systemPrompt, prompt, maxTokens = 1200 }) {
  const sys = systemPrompt || SYSTEM_PROMPTS.master;
  const trimmed = String(prompt || '').trim();
  if (!trimmed) return null;

  return (
    (await callGemini({ systemInstruction: sys, userText: trimmed, maxTokens })) ||
    (await callGroq({ systemInstruction: sys, userText: trimmed, maxTokens })) ||
    (await callOpenRouter({ systemInstruction: sys, userText: trimmed, maxTokens })) ||
    null
  );
}

/**
 * Ponto de Entrada Conversacional com Memória Multi-Turn SQLite.
 */
export async function askAgent({ chatId = '950415577', workerTag = 'master', prompt, extraContext = '' }) {
  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    return 'Por favor, escreve uma pergunta ou tarefa para eu analisar.';
  }

  const trimmed = prompt.trim();
  if (/^\/(reset|limpar|novo|nova_conversa)\b/i.test(trimmed)) {
    conversationMemory.clear(chatId, workerTag);
    return '🔄 *Memória da conversa reiniciada!* Podes iniciar um novo tema do zero.';
  }

  const systemInstruction = SYSTEM_PROMPTS[workerTag] || SYSTEM_PROMPTS.master;
  const userText = extraContext ? `[Contexto verificado do sistema: ${extraContext}]\n\n${trimmed}` : trimmed;

  // 1. Primário: Google Gemini (temp = 0.0)
  const geminiHistory = conversationMemory.getGeminiHistory(chatId, workerTag);
  let result = await callGemini({ systemInstruction, history: geminiHistory, userText });

  // 2. Secundário: Groq LPU (temp = 0.0)
  if (!result) {
    const openAiHistory = conversationMemory.getOpenAiHistory(chatId, workerTag);
    result = await callGroq({ systemInstruction, history: openAiHistory, userText });

    // 3. Terciário: OpenRouter (temp = 0.0)
    if (!result) {
      result = await callOpenRouter({ systemInstruction, history: openAiHistory, userText });
    }
  }

  if (result?.text) {
    conversationMemory.addTurn(chatId, workerTag, 'user', trimmed);
    conversationMemory.addTurn(chatId, workerTag, 'model', result.text);
    return result.text;
  }

  return (
    '⚠️ Os motores de inteligência artificial na nuvem estão temporariamente indisponíveis ou sem chaves configuradas.\n\n' +
    'Tenta novamente em instantes ou utiliza os comandos diretos (`/ajuda`).'
  );
}

export default {
  askAgent,
  generateDeterministicCompletion,
  conversationMemory,
  SYSTEM_PROMPTS
};
