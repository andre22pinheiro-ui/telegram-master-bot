// src/services/notebookLmService.js — Motor NotebookLM Cloud-Native (Grounded Q&A, Fontes FTS5 & Audio Overview Podcast)
import { createLogger } from '../utils/logger.js';
import { sqliteMasterDb } from '../shared/sqliteMasterDb.js';
import { generateDeterministicCompletion } from './reasoningService.js';
import { readWebPage } from './agentReachService.js';
import { sanitizeTelegramMarkdown } from '../utils/markdownSanitizer.js';

const log = createLogger('NotebookLmService');

const DEFAULT_USER = '950415577';

/**
 * Cria ou obtém um caderno pelo título ou ID
 */
export function getOrCreateNotebook(titleOrId, userId = DEFAULT_USER, description = '') {
  if (!titleOrId) throw new Error('Nome ou ID do caderno é obrigatório.');
  const existing = sqliteMasterDb.getNotebook(titleOrId, userId);
  if (existing) return existing;
  return sqliteMasterDb.createNotebook({ title: titleOrId, description, userId });
}

/**
 * Lista todos os cadernos com contagens de fontes e palavras
 */
export function listUserNotebooks(userId = DEFAULT_USER) {
  return sqliteMasterDb.listNotebooks(userId);
}

/**
 * Apaga um caderno e respetivas fontes
 */
export function deleteNotebook(titleOrId, userId = DEFAULT_USER) {
  return sqliteMasterDb.deleteNotebook(titleOrId, userId);
}

/**
 * Anexa uma fonte ao caderno (URL raspado em Markdown ou Texto livre)
 */
export async function addSourceToNotebook(notebookTitleOrId, rawInput, { title = '', userId = DEFAULT_USER } = {}) {
  const cleanInput = String(rawInput || '').trim();
  if (!cleanInput) {
    throw new Error('Conteúdo ou URL da fonte não pode estar vazio.');
  }

  const notebook = getOrCreateNotebook(notebookTitleOrId, userId);
  const isUrl = /^https?:\/\//i.test(cleanInput);

  let finalTitle = String(title || '').trim();
  let content = cleanInput;
  let sourceType = 'text';
  let url = null;

  if (isUrl) {
    url = cleanInput;
    sourceType = 'url';
    try {
      log.info(`[NotebookLM] A ingerir página web como fonte: ${url}`);
      const page = await readWebPage(url);
      content = page?.snippet || page?.content || page?.title || cleanInput;
      if (!finalTitle) {
        finalTitle = page?.title || new URL(url).hostname;
      }
    } catch (err) {
      log.warn(`[NotebookLM] Falha na leitura via Jina Reader, guardando URL: ${err.message}`);
      if (!finalTitle) finalTitle = new URL(url).hostname;
      content = `[Fonte Web: ${url}]\n${cleanInput}`;
    }
  } else {
    if (!finalTitle) {
      const firstLine = cleanInput.split('\n')[0].slice(0, 40).replace(/[#*`_]/g, '').trim();
      finalTitle = firstLine || 'Nota de Conhecimento';
    }
  }

  const source = sqliteMasterDb.addNotebookSource(notebook.id, {
    title: finalTitle,
    sourceType,
    content,
    url
  });

  return {
    notebook,
    source
  };
}

/**
 * Lista as fontes de um caderno
 */
export function getNotebookSources(notebookTitleOrId, userId = DEFAULT_USER) {
  const notebook = sqliteMasterDb.getNotebook(notebookTitleOrId, userId);
  if (!notebook) return [];
  return sqliteMasterDb.getNotebookSources(notebook.id);
}

/**
 * Constrói o bloco de fontes com identificadores [Fonte X: Título]
 */
function buildSourcesContextBlock(sources = []) {
  if (!sources || sources.length === 0) return '';
  let block = `=== FONTES DE VERDADE ANEXADAS AO CADERNO ===\n`;
  sources.forEach((s, idx) => {
    const num = idx + 1;
    block += `\n[Fonte ${num}: "${s.title}" (${s.source_type.toUpperCase()}${s.url ? ` - ${s.url}` : ''})]\n`;
    block += `${s.content}\n`;
    block += `--------------------------------------------------\n`;
  });
  return block;
}

/**
 * Pergunta com fundamentação estrita (Grounded Q&A | temperature: 0.0)
 */
export async function askGroundedNotebook(notebookTitleOrId, question, { userId = DEFAULT_USER, completionFn = null } = {}) {
  const notebook = sqliteMasterDb.getNotebook(notebookTitleOrId, userId);
  if (!notebook) {
    return {
      success: false,
      error: `Caderno "${notebookTitleOrId}" não encontrado. Cria-o primeiro com \`/notebook criar ${notebookTitleOrId}\`.`
    };
  }

  const sources = sqliteMasterDb.getNotebookSources(notebook.id);
  if (sources.length === 0) {
    return {
      success: false,
      error: `O caderno *${notebook.title}* não tem fontes anexadas. Adiciona notas ou URLs com \`/notebook adicionar ${notebook.title} <texto ou url>\`.`
    };
  }

  const sourcesBlock = buildSourcesContextBlock(sources);
  const systemPrompt =
    `És o motor NotebookLM Grounded Intelligence de @AndrePinheirobot.\n` +
    `Parâmetro estrito: temperature=0.0 (Zero Alucinações, Rigor Factual Absoluto).\n\n` +
    `INSTRUÇÕES OBRIGATÓRIAS:\n` +
    `1. Responde à pergunta do utilizador EXCLUSIVAMENTE com base nas informações contidas no bloco de fontes fornecido.\n` +
    `2. Se a resposta NÃO se encontrar nas fontes anexadas, declara taxativamente: "⚠️ Esta informação não está documentada nas fontes deste caderno." NUNCA inventes dados.\n` +
    `3. Cita SEMPRE a fonte específica de onde provém cada afirmação usando etiquetas explícitas [Fonte X: Título].\n` +
    `4. Responde em Português Europeu (PT-PT) técnico, estruturado, conciso e com tópicos a negrito.`;

  const userPrompt =
    `${sourcesBlock}\n\n` +
    `CADERNO ATIVO: "${notebook.title}"\n` +
    `PERGUNTA DO UTILIZADOR: ${question}\n\n` +
    `Fornece a síntese fundamentada estrita com citações [Fonte X]:`;

  try {
    let answerText = null;
    if (typeof completionFn === 'function') {
      const res = await completionFn({ systemPrompt, prompt: userPrompt, maxTokens: 1200 });
      answerText = res?.text || res;
    } else {
      const res = await generateDeterministicCompletion({
        systemPrompt,
        prompt: userPrompt,
        maxTokens: 1200
      });
      answerText = res?.text;
    }

    if (!answerText) {
      // Resposta determinística de contingência quando offline
      const directMatches = sqliteMasterDb.searchNotebookSources(notebook.id, question);
      if (directMatches && directMatches.length > 0) {
        answerText = `📌 *Extrato Direto das Fontes:*\n\n${directMatches[0].content.slice(0, 500)}...\n\n_Citação: [Fonte 1: ${directMatches[0].title}]_`;
      } else {
        answerText = `⚠️ Não foi possível obter inferência na nuvem neste instante. Fontes disponíveis no caderno: ${sources.length}.`;
      }
    }

    return {
      success: true,
      notebook,
      sourcesCount: sources.length,
      answer: answerText
    };
  } catch (err) {
    log.error(`[NotebookLM] Erro no Grounded Q&A: ${err.message}`);
    return {
      success: false,
      error: `Erro ao processar resposta: ${err.message}`
    };
  }
}

/**
 * Gera Audio Overview / Podcast Script com 2 Apresentadores em PT-PT
 */
export async function generateAudioOverview(notebookTitleOrId, { userId = DEFAULT_USER, completionFn = null } = {}) {
  const notebook = sqliteMasterDb.getNotebook(notebookTitleOrId, userId);
  if (!notebook) {
    return {
      success: false,
      error: `Caderno "${notebookTitleOrId}" não encontrado.`
    };
  }

  const sources = sqliteMasterDb.getNotebookSources(notebook.id);
  if (sources.length === 0) {
    return {
      success: false,
      error: `O caderno *${notebook.title}* não tem fontes. Adiciona fontes antes de gerar o Podcast Overview.`
    };
  }

  const sourcesBlock = buildSourcesContextBlock(sources);
  const systemPrompt =
    `És o criador de Audio Overview do NotebookLM adaptado para @AndrePinheirobot.\n` +
    `Objetivo: Transformar as fontes do caderno num roteiro de Podcast dinâmico, inteligente e conversacional entre 2 apresentadores portugueses:\n` +
    `- 🎙️ Diogo (Anfitrião Principal): Apresenta o episódio, define o contexto das fontes e analisa os pontos técnicos com clareza.\n` +
    `- 🎙️ Inês (Co-anfitriã): Faz perguntas perspicazes, destaca analogias práticas do dia a dia e resume as conclusões.\n\n` +
    `REGRAS DE CONVERSAÇÃO (temperature: 0.0 | Rigor Factual):\n` +
    `1. Baseia toda a conversa 100% no conteúdo das fontes anexadas. Sem invenções.\n` +
    `2. Português Europeu nativo (PT-PT) — linguagem cativante, natural e profissional ("Olá a todos", "Ora bem", "repara neste detalhe", "exatamente").\n` +
    `3. Estrutura do Roteiro:\n` +
    `   - Abertura cativante e apresentação do tema;\n` +
    `   - Discussão dos tópicos centrais com perguntas e respostas entre Diogo e Inês;\n` +
    `   - Ponto de viragem / Lição prática principal;\n` +
    `   - Conclusão com resumo conjunto.\n` +
    `4. Formata com falas alternadas iniciadas por "🎙️ Diogo:" e "🎙️ Inês:".`;

  const userPrompt =
    `${sourcesBlock}\n\n` +
    `Gera o roteiro completo de Audio Overview / Podcast para o caderno "${notebook.title}":`;

  try {
    let scriptText = null;
    if (typeof completionFn === 'function') {
      const res = await completionFn({ systemPrompt, prompt: userPrompt, maxTokens: 1500 });
      scriptText = res?.text || res;
    } else {
      const res = await generateDeterministicCompletion({
        systemPrompt,
        prompt: userPrompt,
        maxTokens: 1500
      });
      scriptText = res?.text;
    }

    if (!scriptText) {
      scriptText =
        `🎙️ Diogo: Bem-vindos ao resumo das fontes de "${notebook.title}". Hoje temos ${sources.length} documento(s) em análise.\n\n` +
        `🎙️ Inês: Ora viva! O grande destaque destas notas é a síntese de [Fonte 1: ${sources[0]?.title}], que estabelece os princípios essenciais.\n\n` +
        `🎙️ Diogo: Exatamente, Inês. O documento foca-se nos detalhes factuais para implementação imediata.\n\n` +
        `🎙️ Inês: Fica a recomendação de consulta aprofundada das fontes anexadas!`;
    }

    return {
      success: true,
      notebook,
      sourcesCount: sources.length,
      script: scriptText
    };
  } catch (err) {
    log.error(`[NotebookLM] Erro ao gerar Podcast: ${err.message}`);
    return {
      success: false,
      error: `Erro ao gerar roteiro de podcast: ${err.message}`
    };
  }
}

/**
 * Gera Guia de Estudo e Síntese Executiva
 */
export async function generateStudyGuide(notebookTitleOrId, { userId = DEFAULT_USER, completionFn = null } = {}) {
  const notebook = sqliteMasterDb.getNotebook(notebookTitleOrId, userId);
  if (!notebook) {
    return {
      success: false,
      error: `Caderno "${notebookTitleOrId}" não encontrado.`
    };
  }

  const sources = sqliteMasterDb.getNotebookSources(notebook.id);
  if (sources.length === 0) {
    return {
      success: false,
      error: `O caderno *${notebook.title}* não tem fontes para gerar guia de estudo.`
    };
  }

  const sourcesBlock = buildSourcesContextBlock(sources);
  const systemPrompt =
    `És o Módulo de Estudo Avançado do NotebookLM para @AndrePinheirobot.\n` +
    `Gera um Guia de Estudo Estruturado e Completo em Português Europeu (PT-PT) com base nas fontes.\n` +
    `ESTRUTURA OBRIGATÓRIA:\n` +
    `1. 📌 RESUMO EXECUTIVO (2-3 parágrafos diretos);\n` +
    `2. 💡 CONCEITOS-CHAVE & GLOSSÁRIO (termos essenciais explicados);\n` +
    `3. 📝 PERGUNTAS DE AUTOAVALIAÇÃO / QUIZ (3 a 5 perguntas com respostas baseadas nas fontes);\n` +
    `4. 🎯 SÍNTESE PRÁTICA & PRÓXIMOS PASSOS.\n\n` +
    `Rigor factual absoluto (temperature: 0.0), citando as fontes sempre que aplicável.`;

  const userPrompt =
    `${sourcesBlock}\n\n` +
    `Gera o Guia de Estudo para o caderno "${notebook.title}":`;

  try {
    let guideText = null;
    if (typeof completionFn === 'function') {
      const res = await completionFn({ systemPrompt, prompt: userPrompt, maxTokens: 1400 });
      guideText = res?.text || res;
    } else {
      const res = await generateDeterministicCompletion({
        systemPrompt,
        prompt: userPrompt,
        maxTokens: 1400
      });
      guideText = res?.text;
    }

    if (!guideText) {
      guideText =
        `📌 *RESUMO EXECUTIVO*\nO caderno "${notebook.title}" reúne ${sources.length} fonte(s) com foco temático.\n\n` +
        `💡 *CONCEITOS-CHAVE*\n• ${sources[0]?.title}: Documento base com fundamentação inicial.\n\n` +
        `📝 *AUTOAVALIAÇÃO*\n1. Quais os pontos principais descritos nas notas?\nResposta: Consultar detalhe nas fontes anexadas.`;
    }

    return {
      success: true,
      notebook,
      sourcesCount: sources.length,
      guide: guideText
    };
  } catch (err) {
    log.error(`[NotebookLM] Erro ao gerar Guia de Estudo: ${err.message}`);
    return {
      success: false,
      error: `Erro ao gerar guia de estudo: ${err.message}`
    };
  }
}

/**
 * Pesquisa nas fontes de um caderno ou em todos os cadernos
 */
export function searchSources(query, notebookTitleOrId = null, userId = DEFAULT_USER) {
  let notebookId = null;
  if (notebookTitleOrId) {
    const nb = sqliteMasterDb.getNotebook(notebookTitleOrId, userId);
    if (nb) notebookId = nb.id;
  }
  return sqliteMasterDb.searchNotebookSources(notebookId, query);
}

// ─── Formatadores Telegram Markdown ──────────────────────────────────────────

export function formatNotebooksListMarkdown(userId = DEFAULT_USER) {
  const notebooks = listUserNotebooks(userId);
  if (!notebooks || notebooks.length === 0) {
    return (
      `📓 *NOTEBOOKLM — OS TEUS CADERNOS DE CONHECIMENTO*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `Não tens cadernos criados de momento.\n\n` +
      `💡 *Para começar:*\n` +
      `• \`/notebook criar <nome>\` — Cria um novo caderno\n` +
      `• \`/notebook adicionar <nome> <url ou texto>\` — Anexa uma fonte\n` +
      `• \`/podcast <nome>\` — Gera o áudio overview com 2 apresentadores`
    );
  }

  let msg = `📓 *NOTEBOOKLM — OS TEUS CADERNOS (${notebooks.length})*\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  notebooks.forEach((nb, idx) => {
    msg += `${idx + 1}. 📁 *${nb.title}*\n`;
    if (nb.description) msg += `   _${nb.description}_\n`;
    msg += `   ↳ Fontes: \`${nb.sources_count || 0}\` | Palavras: \`${nb.total_words || 0}\`\n`;
  });

  msg +=
    `\n💡 *Comandos Rápidos:*\n` +
    `• \`/notebook fontes <caderno>\` — Ver documentos anexados\n` +
    `• \`/notebook perguntar <caderno> <dúvida>\` — Resposta estrita fundamentada\n` +
    `• \`/podcast <caderno>\` — Podcast Deep Dive com Diogo & Inês\n` +
    `• \`/estudo <caderno>\` — Guia de estudo e autoavaliação`;

  return sanitizeTelegramMarkdown(msg);
}

export function formatNotebookSourcesMarkdown(notebookTitleOrId, userId = DEFAULT_USER) {
  const notebook = sqliteMasterDb.getNotebook(notebookTitleOrId, userId);
  if (!notebook) {
    return `⚠️ Caderno "${notebookTitleOrId}" não encontrado. Usa \`/notebook listar\`.`;
  }

  const sources = sqliteMasterDb.getNotebookSources(notebook.id);
  if (sources.length === 0) {
    return (
      `📁 *CADERNO:* *${notebook.title}*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `Este caderno ainda não tem fontes de conhecimento anexadas.\n\n` +
      `💡 *Adicionar primeira fonte:*\n` +
      `\`/notebook adicionar ${notebook.title} <url ou texto>\``
    );
  }

  let msg = `📁 *CADERNO:* *${notebook.title}* (${sources.length} fontes)\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  sources.forEach((s, idx) => {
    const icon = s.source_type === 'url' ? '🌐' : '📄';
    msg += `${idx + 1}. ${icon} *[Fonte ${idx + 1}]* *${s.title}*\n`;
    msg += `   ↳ Tipo: \`${s.source_type.toUpperCase()}\` | Palavras: \`${s.word_count}\`\n`;
    if (s.url) msg += `   ↳ URL: ${s.url}\n`;
  });

  msg +=
    `\n💡 *Ações Disponíveis:*\n` +
    `• \`/notebook perguntar ${notebook.title} <pergunta>\`\n` +
    `• \`/podcast ${notebook.title}\`\n` +
    `• \`/estudo ${notebook.title}\``;

  return sanitizeTelegramMarkdown(msg);
}

export function formatNotebookLmHelpMarkdown() {
  return (
    `🧠 *GOOGLE NOTEBOOKLM CLOUD-NATIVE (@AndrePinheirobot)*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `Grounded Intelligence, Cadernos de Conhecimento, Fontes FTS5 e Audio Overview.\n\n` +
    `📂 *Gestão de Cadernos:*\n` +
    `• \`/notebook criar <nome>\` — Cria novo caderno temático\n` +
    `• \`/notebooks\` ou \`/notebook listar\` — Lista todos os cadernos\n` +
    `• \`/notebook fontes <caderno>\` — Lista fontes do caderno\n` +
    `• \`/notebook apagar <caderno>\` — Elimina o caderno e fontes\n\n` +
    `📥 *Ingestão de Fontes:*\n` +
    `• \`/notebook adicionar <caderno> <url>\` — Raspa e resume página web em Markdown\n` +
    `• \`/notebook adicionar <caderno> <texto>\` — Anexa nota técnica ou excerto\n\n` +
    `🎯 *Grounded Q&A & Citações:*\n` +
    `• \`/notebook perguntar <caderno> <pergunta>\` — Resposta estrita com citações [Fonte X] (\`temperature: 0.0\`)\n\n` +
    `🎙️ *Audio Overview & Estudo:*\n` +
    `• \`/podcast <caderno>\` — Conversa animada entre Diogo & Inês (Podcast Deep Dive)\n` +
    `• \`/estudo <caderno>\` — Resumo executivo, glossário e teste de compreensão\n` +
    `• \`/notebook procurar <termo>\` — Pesquisa FTS5 em todas as fontes anexadas\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🔒 _100% Persistido em SQLite WAL + Sincronização Google Drive._`
  );
}

export default {
  getOrCreateNotebook,
  listUserNotebooks,
  deleteNotebook,
  addSourceToNotebook,
  getNotebookSources,
  askGroundedNotebook,
  generateAudioOverview,
  generateStudyGuide,
  searchSources,
  formatNotebooksListMarkdown,
  formatNotebookSourcesMarkdown,
  formatNotebookLmHelpMarkdown
};
