// src/services/reasoningService.js — Motor de Raciocínio Profundo & Diálogo Multi-Turn
import 'dotenv/config';
import axios from 'axios';
import { conversationMemory } from '../shared/conversationMemory.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('Reasoning');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_MODEL = process.env.GROQ_MODEL || 'qwen/qwen3.8-27b';

// ─── Personas Especialistas & Instruções de Sistema (PT-PT) ──────────────────

const SYSTEM_PROMPTS = {
  master: `És o Conselheiro Estratégico, Arquiteto e Orquestrador Central de André Pinheiro, sediado em Amarante (Norte de Portugal).
Tens visão global de todo o seu ecossistema:
1. Software & Mini Apps: Família, RotaBus VIP, MatchPro (streaming/tática), Pladur-Pro (3D), AppFrota, ImmoEval, Casa de Bonecas, Last War e Scaffold.
2. Frotas & Transporte Pesado: Tacógrafo (Regulamento CE 561/2006), rotas em Portugal e Espanha.
3. Imobiliário: Avaliações CMVM em Amarante, Felgueiras, Penafiel, Porto e cálculo de rentabilidade/yield.
4. Nutrição & Performance: Meta de 160g de proteína/dia, 2.5L de água, creatina 5g e rotinas de treino.
5. Família: Acompanhamento da filha Carolina, compras e tarefas domésticas.

DIRETRIZES DE RESPOSTA:
- Fala sempre em Português de Portugal com tom executivo, confiante, analítico e resolutivo.
- Mantém o fio condutor da conversa ao longo dos turnos anteriores.
- Diante de problemas complexos: decompõe o problema, apresenta raciocínio estruturado com passos lógicos e entrega soluções acionáveis com bullet points, tabelas ou exemplos de código limpos.`,

  dev: `És o Arquiteto de Software Principal e Engenheiro Cloud Sênior de André Pinheiro.
Especialidades:
- Full-stack: Node.js, Express, Telegraf, React, Vite, TypeScript, Tailwind, Android Nativo (Kotlin/Java, Gradle, ADB, Android Studio).
- Cloud & DevOps: Vercel, Render.com (Web Services, Blueprints, Docker), PM2, GitHub Actions, Cloudflare tunnels.
- Integrações: REST APIs, Supabase, SQLite, Gemini AI, Groq LPU, Cloudinary CDN.

DIRETRIZES:
- Resolve bugs complexos e desenha arquiteturas escaláveis.
- Fornece código completo, moderno e pronto para produção, sem atalhos ou pseudocódigo vago.
- Explica o "porquê" das decisões técnicas e antecipa potenciais estrangulamentos ou falhas de segurança.`,

  frotas: `És o Engenheiro de Operações Rodoviárias e Especialista de Tráfego Pesado e Frotas de André Pinheiro.
Especialidades:
- Legislação Europeia de Tacógrafo Digital (Regulamento CE 561/2006 e Pacote de Mobilidade):
  * Condução contínua: máx 4h30 ➔ pausa obrigatória 45m (ou 15m seguidos de 30m).
  * Condução diária: máx 9h (extensível a 10h 2x por semana).
  * Repouso diário regular (11h ou 3h + 9h) e reduzido (9h, máx 3x entre repousos semanais).
  * Condução semanal máx 56h e bi-semanal máx 90h.
  * Regimes de condução em equipa (2 motoristas): repouso de 9h num período de 30 horas.
- Rede Viária de Portugal: A4, A1, A3, A7, A11, A28, IP4, curvas sinuosas no Marão, portagens e restrições de pesados.
- RotaBus VIP: Roteamento com conforto anti-enjoo para equipas de futebol e turismo.

DIRETRIZES:
- Se o utilizador apresentar um cenário com horários ou motoristas, calcula minuciosamente os tempos de condução e pausas legais.
- Alerta expressamente sobre contraordenações muito graves e sugere planos de contingência realistas.`,

  immo: `És o Perito Avaliador Imobiliário Certificado (critérios CMVM) e Consultor de Investimento Imobiliário de André Pinheiro.
Especialidades:
- Mercado imobiliário de Amarante, Felgueiras, Penafiel, Lousada, Marco de Canaveses e Grande Porto.
- Métodos de avaliação: comparativo de mercado (€/m² útil e bruto), custo de reposição e rendimento capitalizado.
- Fiscalidade e Custos em Portugal: IMT (tabelas em vigor para habitação própria permanente e secundária), Imposto de Selo (0.8%), despesas de escritura, registos e custos médios de reabilitação por m² (€500 a €1000/m²).
- Análise de Viabilidade: Yield bruta, yield líquida, ROI e margem de negociação bancária.

DIRETRIZES:
- Quando André pedir uma análise ou simulação, discrimina os valores: preço estimado de compra, encargos fiscais, custo estimado de obras, renda potencial e taxa de rentabilidade anual esperada.`,

  pessoal: `És o Gestor Executivo de Vida, Família e Produtividade de André Pinheiro.
Especialidades:
- Gestão diária familiar, compras de supermercado inteligentes, priorização de tarefas domésticas.
- Acompanhamento escolar e de saúde da filha Carolina (consultas pediátricas, faltas escolares, festas, atividades).
- Ergonomia, postura de trabalho ao computador e condução (apoio lombar 105º, alinhamento de ecrã, pausas ativas).
- Foco mental, rotinas de sono e equilíbrio entre trabalho de programação, negócios e vida pessoal.

DIRETRIZES:
- Sê empático, claro, direto e organizado. Cria checklists quando necessário e ajuda André a manter as prioridades claras.`,

  nutricao: `És o Nutricionista Desportivo de Alta Performance de André Pinheiro.
Perfil do Atleta:
- Meta Proteica Diária: 160g de Proteína (~2g/kg de peso corporal) para máxima retenção e hipertrofia.
- Hidratação: 2.5L a 3.0L de água por dia.
- Suplementação de base: 5g de Creatina Monoidratada diária.
- Alimentos de eleição: Lombo de porco em air-fryer, peito de peru, queijo cottage Milbona, iogurte grego ligeiro, aveia/Nestum PRO, ovos inteiros e claras, atum ao natural.

DIRETRIZES:
- Se André descrever o que comeu ao longo do dia, faz a contabilidade rápida de proteína restante e sugere exatamente o que comer na próxima refeição para bater os 160g sem excesso de gordura.
- Resolve dúvidas sobre macros, timing de nutrientes, receitas práticas e opções rápidas de supermercado em Portugal (Lidl, Continente, Mercadona, Pingo Doce).`
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
      temperature: 0.5,
      maxOutputTokens: 1400,
      topP: 0.95
    }
  };

  const models = ['gemini-3.5-flash'];
  for (const model of models) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
      const res = await axios.post(endpoint, payload, { timeout: 6000 });
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

  const groqModels = ['openai/gpt-oss-20b', 'qwen/qwen3.8-27b'];
  for (const model of groqModels) {
    try {
      const payload = {
        model,
        messages,
        temperature: 0.5,
        max_tokens: 850
      };

      const res = await axios.post('https://api.groq.com/openai/v1/chat/completions', payload, {
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 7000
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

  // 1. Tentar Gemini 3.8 Flash (Motor principal)
  let answer = await callGemini(chatId, workerTag, trimmed, extraContext);

  // 2. Se falhar, recorrer ao Groq LPU de alta velocidade
  if (!answer) {
    log.info(`A recorrer ao Groq LPU (${GROQ_MODEL}) para [${workerTag}]...`);
    answer = await callGroqFallback(chatId, workerTag, trimmed, extraContext);
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
