// src/workers/worker_dev.js — Engenharia DevOps 100% Cloud-Native (delegação limpa para cloudDevService.js)
import path from 'path';
import { createLogger } from '../utils/logger.js';
import {
  getGithubConfig,
  getCloudStatusReport,
  listGithubRepos,
  createCloudRepoAndDeploy,
  dispatchGithubBuild,
  listVercelAppsOrDeployments
} from '../services/cloudDevService.js';
import {
  harvestAndAdaptIdea,
  listHarvestedIdeas,
  getIdePromptForIdea,
  VALID_TARGET_PROJECTS
} from '../services/ideaHarvesterService.js';
import { getPladurSpecifications } from '../services/pladurService.js';
import {
  getErrorStatusMarkdown,
  resolveOpenErrors,
  diagnoseAndRefineError
} from '../shared/selfRefineEngine.js';
import { sqliteMasterDb } from '../shared/sqliteMasterDb.js';
import { askAgent } from '../services/reasoningService.js';
import iptvService from '../services/iptvService.js';
import obsidianService from '../services/obsidianService.js';
import hindsightMemoryService from '../services/hindsightMemoryService.js';
import nomadKnowledgeService from '../services/nomadKnowledgeService.js';
import agentReachService from '../services/agentReachService.js';
import homeAssistantService from '../services/homeAssistantService.js';
import notebookLmService from '../services/notebookLmService.js';

const log = createLogger('WorkerDevCloud');

export { getGithubConfig };

export async function handleStatusCloud(opts = {}) {
  return await getCloudStatusReport(opts);
}

export async function handleCompilarCloud(rawArgs = '', opts = {}) {
  return await dispatchGithubBuild(rawArgs, opts);
}

function handleApks() {
  return (
    `📲 *Distribuição de Ficheiros APK na Nuvem:*\n\n` +
    `🚌 *RotaBus (Navegação Pesados & Conforto VIP)*\n` +
    `• Versão: v1.0.0 (Anti-Sinuosidade & Tacógrafo)\n` +
    `• Arquiteturas: ARM64-v8a + ARMv7 (Android Nativo)\n` +
    `• Link Direto: [https://smooth-bus-routes.vercel.app/rotabus.apk](https://smooth-bus-routes.vercel.app/rotabus.apk)\n` +
    `• Atalho: [https://smooth-bus-routes.vercel.app/apk](https://smooth-bus-routes.vercel.app/apk)\n\n` +
    `⚙️ _Para gerar nova build APK na nuvem:_ \`/compilar smooth-bus-routes\``
  );
}

async function handleCode(userMessage, chatId = '') {
  return await askAgent({
    chatId: chatId || process.env.CHAT_ID_AUTORIZADO || process.env.AUTHORIZED_CHAT_ID || '',
    workerTag: 'dev',
    prompt: userMessage
  });
}

export function handleMemoria(rawArgs = '', userId = 'default_user') {
  const clean = String(rawArgs || '').trim();

  if (!clean || clean === 'listar' || clean === 'ver') {
    const facts = sqliteMasterDb.listMemoryFacts(userId, 10);
    if (!facts || facts.length === 0) {
      return (
        `🧠 *SECOND BRAIN (FTS5) — MEMÓRIA DURÁVEL*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `Sem factos registados na memória durável.\n\n` +
        `💡 Para guardar um facto permanente:\n` +
        `\`/memoria adicionar [categoria] <facto>\`\n` +
        `Exemplo: \`/memoria adicionar cafe Prefere café curto sem açúcar\``
      );
    }
    let msg = `🧠 *SECOND BRAIN (FTS5) — FACTOS DURÁVEIS:*\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    facts.forEach((f, i) => {
      const conf = Math.round(Number(f.confidence_score || 1.0) * 100);
      msg += `${i + 1}. [${f.category || 'geral'}] *${f.fact}* _(confiança: ${conf}%)_\n`;
    });
    msg += `\n🔍 _Para pesquisar com indexação FTS5:_ \`/memoria <termo>\``;
    return msg;
  }

  if (/^(adicionar|guardar|save|add)\b/i.test(clean)) {
    const resto = clean.replace(/^(adicionar|guardar|save|add)\s*/i, '').trim();
    if (!resto) return '⚠️ Indica o facto a guardar. Ex: `/memoria adicionar prefere café curto`';

    let category = 'geral';
    let factText = resto;
    const catMatch = resto.match(/^\[(.*?)\]\s*(.*)$/) || resto.match(/^(\w+):\s*(.*)$/);
    if (catMatch) {
      category = catMatch[1].toLowerCase();
      factText = catMatch[2];
    }

    const saved = sqliteMasterDb.saveMemoryFact({
      userId,
      category,
      fact: factText,
      confidenceScore: 1.0,
      source: 'manual'
    });
    return (
      `🧠 *Facto Indexado no Second Brain (FTS5)!*\n` +
      `• Categoria: *${saved.category}*\n` +
      `• Facto: *${saved.fact}*\n` +
      `• Confiança: 100% (Manual)\n\n` +
      `Pesquisa instantânea ativa com \`/memoria ${saved.fact.split(' ')[0]}\`.`
    );
  }

  if (clean === 'limpar' || clean === 'clear') {
    sqliteMasterDb.clearMemoryFacts(userId);
    return '🧠 *Second Brain:* Todos os factos da memória durável foram limpos.';
  }

  const results = sqliteMasterDb.searchMemoryFacts(userId, clean, 5);
  if (!results || results.length === 0) {
    return `🔍 *Second Brain (FTS5):* Nenhum facto encontrado para "${clean}".`;
  }

  let msg = `🔍 *RESULTADOS DA PESQUISA FTS5: "${clean}"*\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  results.forEach((f, i) => {
    const conf = Math.round(Number(f.confidence_score || 1.0) * 100);
    msg += `${i + 1}. [${f.category}] *${f.fact}* _(confiança: ${conf}%)_\n`;
  });
  return msg;
}

export function handleBudget(rawArgs = '') {
  const status = sqliteMasterDb.getTokenBudgetStatus();
  const limit = 100000;
  const used = status.totalTokens;
  const pct = Math.min(Math.round((used / limit) * 100), 100);
  const bars = Math.round(pct / 10);
  const barStr = '█'.repeat(bars) + '░'.repeat(10 - bars);

  let msg =
    `💰 *ORÇAMENTO DE TOKENS & IA (ADR-044)*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📅 *Data:* ${status.date}\n` +
    `🎯 *Tokens Consumidos Hoje:* ${used.toLocaleString('pt-PT')} / ${limit.toLocaleString('pt-PT')} (${pct}%)\n` +
    `[${barStr}] ${pct}%\n\n` +
    `💶 *Custo Estimado:* ~${status.totalCost.toFixed(4)} €\n` +
    `📞 *Total de Chamadas IA:* ${status.totalRequests}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n`;

  if (status.models && status.models.length > 0) {
    msg += `📊 *Consumo por Modelo:*\n`;
    status.models.forEach((m) => {
      msg += `• *${m.model}*: ${Number(m.tokens_used).toLocaleString('pt-PT')} tokens (~${Number(m.cost_estimate_eur).toFixed(4)}€ | ${m.requests_count} reqs)\n`;
    });
  } else {
    msg += `_Sem consumo registado hoje. Dentro do limite diário._\n`;
  }

  msg += `\n🔒 _Governação ADR-044: Threshold de 100k tokens/dia garante contenção de custos e zero estouro de quotas._`;
  return msg;
}

// ─── Motor Cloud-Native de Absorção & Adaptação de Ideias ──────────────────

export async function handleAbsorverIdeia(rawArgs = '') {
  const clean = String(rawArgs || '').trim();
  if (!clean) {
    return (
      `💡 *Como absorver e adaptar ideias Open-Source:*\n` +
      `\`/absorver_ideia <url_github_ou_web> [projeto_alvo] [notas]\`\n\n` +
      `*Projetos Alvo Disponíveis:*\n` +
      `• \`master-bot\` (Assistente Pessoal / Notícias / SQLite)\n` +
      `• \`frota-bot\` (ZeroPaperFrota / Supabase / Tacógrafo)\n` +
      `• \`appfrota\` (Frontend Next.js Vercel)\n` +
      `• \`rotabus\` (Navegação Android / OSM)\n` +
      `• \`android\` (Apps Móveis Nativas)\n\n` +
      `*Exemplo:*\n` +
      `\`/absorver_ideia https://github.com/exemplo/repo-odometro frota-bot "Adaptação para odómetro sem TUI"\``
    );
  }

  const parts = clean.split(/\s+/);
  const url = parts[0];
  let target = 'master-bot';
  let notes = '';

  if (parts.length > 1) {
    if (VALID_TARGET_PROJECTS.includes(parts[1].toLowerCase())) {
      target = parts[1].toLowerCase();
      notes = parts.slice(2).join(' ');
    } else {
      notes = parts.slice(1).join(' ');
    }
  }

  try {
    const idea = await harvestAndAdaptIdea({ sourceUrl: url, targetProject: target, userNotes: notes });
    const planText = idea.cloudPlan && idea.cloudPlan.length > 0
      ? idea.cloudPlan.map((c) => `• *${c.localPattern}*:\n  ↳ ${c.cloudAlternative}`).join('\n')
      : '• Arquitetura diretamente compatível.';

    return (
      `🚀 *Ideia Open-Source Absorvida com Sucesso!*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📌 *Origem:* ${idea.source_url} ${idea.repo_name ? `(${idea.repo_name})` : ''}\n` +
      `🎯 *Projeto Alvo:* \`${idea.target_project}\`\n` +
      `🔢 *ID no Radar:* \`#${idea.id}\`\n\n` +
      `🛡️ *Filtro Cloud-Native (Conversões Efetuadas):*\n` +
      `${planText}\n\n` +
      `📋 *Próximo Passo:* Para obter o prompt estruturado pronto para o Antigravity IDE:\n` +
      `👉 \`/gerar_prompt_ideia ${idea.id}\``
    );
  } catch (err) {
    log.error('Erro ao absorver ideia:', err.message);
    return `❌ Erro ao absorver ideia de "${url}": ${err.message}`;
  }
}

export function handleRadarIdeias(rawArgs = '') {
  const clean = String(rawArgs || '').trim();
  const target = clean && VALID_TARGET_PROJECTS.includes(clean.toLowerCase()) ? clean.toLowerCase() : null;
  const ideas = listHarvestedIdeas(target, 10);

  if (!ideas || ideas.length === 0) {
    return (
      `📡 *RADAR DE IDEIAS OPEN-SOURCE*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `Nenhuma ideia registada no radar ${target ? `para \`${target}\`` : ''}.\n\n` +
      `Para absorver uma ideia nova:\n` +
      `\`/absorver_ideia <url> [projeto_alvo]\``
    );
  }

  let msg = `📡 *RADAR DE IDEIAS OPEN-SOURCE (${ideas.length}):*\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  ideas.forEach((item) => {
    const nome = item.repo_name || item.source_url.replace(/^https?:\/\//i, '').slice(0, 30);
    const data = new Date(item.created_at).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' });
    msg += `• *#${item.id}* [${item.target_project}] *${nome}* _(${data})_\n  ↳ Status: \`${item.status}\` | \`/gerar_prompt_ideia ${item.id}\`\n`;
  });

  return msg;
}

export function handleGerarPromptIdeia(rawArgs = '') {
  const clean = String(rawArgs || '').replace('#', '').trim();
  const id = parseInt(clean, 10);

  if (isNaN(id) || id <= 0) {
    const list = listHarvestedIdeas(null, 5);
    if (list.length === 0) {
      return `⚠️ Indica o ID da ideia. Ex: \`/gerar_prompt_ideia 1\`. Usa \`/absorver_ideia <url>\` para registar uma nova.`;
    }
    return (
      `⚠️ *Indica o ID da ideia a gerar:*\n\n` +
      list.map((i) => `• ID **#${i.id}**: ${i.repo_name || i.source_url} (\`${i.target_project}\`)`).join('\n') +
      `\n\nExemplo: \`/gerar_prompt_ideia ${list[0].id}\``
    );
  }

  const prompt = getIdePromptForIdea(id);
  if (!prompt) {
    return `❌ Ideia #${id} não encontrada no radar. Consulta com \`/radar_ideias\`.`;
  }

  return (
    `🤖 *PROMPT ESTRUTURADO PARA O ANTIGRAVITY IDE (Ideia #${id})*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `_Copia o bloco abaixo para alimentar o teu agente no Antigravity IDE:_\n\n` +
    `\`\`\`markdown\n` +
    `${prompt}\n` +
    `\`\`\``
  );
}

export async function handleNotebookLm(text = '', opts = {}) {
  const trimmed = String(text || '').trim();
  const lower = trimmed.toLowerCase();
  const userId = opts.chatId || opts.userId || process.env.CHAT_ID_AUTORIZADO || '950415577';

  // 1. Atalho direto /podcast <caderno>
  if (lower.startsWith('/podcast')) {
    const target = trimmed.replace(/^\/podcast\s*/i, '').trim();
    if (!target) {
      return (
        `🎙️ *NOTEBOOKLM — AUDIO OVERVIEW (PODCAST)*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `Gera um diálogo aprofundado entre 2 apresentadores (Diogo e Inês) em Português Europeu baseado nas tuas notas.\n\n` +
        `💡 *Uso correto:*\n` +
        `\`/podcast <nome_do_caderno>\`\n` +
        `Exemplo: \`/podcast arquitetura\``
      );
    }
    const res = await notebookLmService.generateAudioOverview(target, { userId, completionFn: opts.completionFn });
    if (!res.success) return `⚠️ *Erro NotebookLM:* ${res.error}`;
    return (
      `🎙️ *NOTEBOOKLM AUDIO OVERVIEW — "${res.notebook.title}"*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📁 *Caderno:* ${res.notebook.title} (\`${res.sourcesCount}\` fontes analisadas)\n` +
      `👥 *Apresentadores:* Diogo & Inês | ⏱️ _Roteiro Conversacional PT-PT_\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `${res.script}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `✅ _Síntese 100% fundamentada nas fontes do caderno (Zero Alucinações)._`
    );
  }

  // 2. Atalho direto /estudo <caderno>
  if (lower.startsWith('/estudo')) {
    const target = trimmed.replace(/^\/estudo\s*/i, '').trim();
    if (!target) {
      return (
        `📝 *NOTEBOOKLM — GUIA DE ESTUDO & QUIZ*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `Gera resumo executivo, glossário de conceitos-chave e perguntas de autoavaliação com base nas fontes.\n\n` +
        `💡 *Uso correto:*\n` +
        `\`/estudo <nome_do_caderno>\`\n` +
        `Exemplo: \`/estudo medicina\``
      );
    }
    const res = await notebookLmService.generateStudyGuide(target, { userId, completionFn: opts.completionFn });
    if (!res.success) return `⚠️ *Erro NotebookLM:* ${res.error}`;
    return (
      `📚 *GUIA DE ESTUDO NOTEBOOKLM — "${res.notebook.title}"*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📁 *Caderno:* ${res.notebook.title} (\`${res.sourcesCount}\` fontes)\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `${res.guide}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `💡 _Para tirar dúvidas específicas sobre este caderno: \`/notebook perguntar ${res.notebook.title} <pergunta>\`_`
    );
  }

  // 3. Atalhos /notebooks ou /cadernos
  if (lower === '/notebooks' || lower === '/cadernos') {
    return notebookLmService.formatNotebooksListMarkdown(userId);
  }

  // 4. Comandos /notebook, /notebooklm ou /caderno
  const rawArgs = trimmed.replace(/^\/(?:notebooklm|notebook|caderno)\s*/i, '').trim();
  if (!rawArgs) {
    const nbs = notebookLmService.listUserNotebooks(userId);
    if (nbs && nbs.length > 0) {
      return notebookLmService.formatNotebooksListMarkdown(userId);
    }
    return notebookLmService.formatNotebookLmHelpMarkdown();
  }

  const parts = rawArgs.split(/\s+/);
  const subCmd = parts[0]?.toLowerCase();

  // /notebook listar
  if (subCmd === 'listar' || subCmd === 'list' || subCmd === 'ver') {
    return notebookLmService.formatNotebooksListMarkdown(userId);
  }

  // /notebook criar <nome> [descrição]
  if (subCmd === 'criar' || subCmd === 'create' || subCmd === 'novo') {
    const title = parts[1];
    if (!title) return '⚠️ Indica o nome do caderno. Ex: `/notebook criar nutricao`';
    const desc = parts.slice(2).join(' ') || '';
    const nb = notebookLmService.getOrCreateNotebook(title, userId, desc);
    return (
      `📓 *Caderno Criado com Sucesso!*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `• *Nome:* *${nb.title}*\n` +
      `• *ID:* \`${nb.id}\`\n` +
      (nb.description ? `• *Descrição:* _${nb.description}_\n` : '') +
      `\n💡 *Próximo passo — Adicionar fontes:*\n` +
      `\`/notebook adicionar ${nb.title} <url ou texto>\``
    );
  }

  // /notebook apagar <nome>
  if (subCmd === 'apagar' || subCmd === 'eliminar' || subCmd === 'delete' || subCmd === 'remover') {
    const title = parts.slice(1).join(' ').trim();
    if (!title) return '⚠️ Indica o nome do caderno a apagar. Ex: `/notebook apagar nutricao`';
    const ok = notebookLmService.deleteNotebook(title, userId);
    if (!ok) return `⚠️ Caderno "${title}" não encontrado.`;
    return `🗑️ *Caderno "${title}" e todas as suas fontes foram eliminados com sucesso.*`;
  }

  // /notebook fontes <caderno>
  if (subCmd === 'fontes' || subCmd === 'sources') {
    const title = parts.slice(1).join(' ').trim();
    if (!title) return '⚠️ Indica o caderno para ver as fontes. Ex: `/notebook fontes nutricao`';
    return notebookLmService.formatNotebookSourcesMarkdown(title, userId);
  }

  // /notebook adicionar <caderno> <url ou texto>
  if (subCmd === 'adicionar' || subCmd === 'add' || subCmd === 'fonte') {
    const title = parts[1];
    if (!title) return '⚠️ Indica o caderno. Ex: `/notebook adicionar nutricao https://exemplo.com/artigo`';
    const content = parts.slice(2).join(' ').trim();
    if (!content) return '⚠️ Fornece o URL ou o texto da fonte a anexar.';

    const res = await notebookLmService.addSourceToNotebook(title, content, { userId });
    return (
      `📥 *Fonte Anexada ao Caderno "${res.notebook.title}"!*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `• *Título da Fonte:* *${res.source.title}*\n` +
      `• *Tipo:* \`${res.source.source_type.toUpperCase()}\`\n` +
      `• *Palavras Indexadas (FTS5):* \`${res.source.word_count}\`\n` +
      (res.source.url ? `• *URL:* ${res.source.url}\n` : '') +
      `\n💡 *Experimenta agora:*\n` +
      `• \`/notebook perguntar ${res.notebook.title} <tua dúvida>\`\n` +
      `• \`/podcast ${res.notebook.title}\``
    );
  }

  // /notebook perguntar <caderno> <pergunta> ou /notebook qa <caderno> <pergunta>
  if (subCmd === 'perguntar' || subCmd === 'qa' || subCmd === 'pergunta' || subCmd === 'ask') {
    const title = parts[1];
    if (!title) return '⚠️ Indica o caderno. Ex: `/notebook perguntar nutricao quanta proteina consumir?`';
    const question = parts.slice(2).join(' ').trim();
    if (!question) return '⚠️ Escreve a pergunta sobre as fontes do caderno.';

    const res = await notebookLmService.askGroundedNotebook(title, question, { userId, completionFn: opts.completionFn });
    if (!res.success) return `⚠️ *Erro Grounded Q&A:* ${res.error}`;
    return (
      `🎯 *NOTEBOOKLM GROUNDED Q&A — "${res.notebook.title}"*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `❓ *Pergunta:* ${question}\n` +
      `📚 *Fontes Consultadas:* \`${res.sourcesCount}\`\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `${res.answer}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🔒 _temperature: 0.0 | Rigor factual absoluto baseado nas fontes anexadas._`
    );
  }

  // /notebook podcast <caderno>
  if (subCmd === 'podcast' || subCmd === 'audio') {
    const title = parts.slice(1).join(' ').trim();
    if (!title) return '⚠️ Indica o caderno para gerar o podcast. Ex: `/notebook podcast nutricao`';
    return await handleNotebookLm(`/podcast ${title}`, opts);
  }

  // /notebook estudo <caderno>
  if (subCmd === 'estudo' || subCmd === 'resumo' || subCmd === 'guia') {
    const title = parts.slice(1).join(' ').trim();
    if (!title) return '⚠️ Indica o caderno para gerar o guia de estudo. Ex: `/notebook estudo nutricao`';
    return await handleNotebookLm(`/estudo ${title}`, opts);
  }

  // /notebook procurar <termo>
  if (subCmd === 'procurar' || subCmd === 'search' || subCmd === 'buscar') {
    const query = parts.slice(1).join(' ').trim();
    if (!query) return '⚠️ Indica o termo a procurar nas fontes. Ex: `/notebook procurar creatina`';
    const results = notebookLmService.searchSources(query, null, userId);
    if (!results || results.length === 0) {
      return `🔍 Sem resultados para "*${query}*" nas fontes anexadas ao NotebookLM.`;
    }
    let msg = `🔍 *RESULTADOS FTS5 NOTEBOOKLM ("${query}")*\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    results.forEach((r, idx) => {
      msg += `${idx + 1}. 📄 *${r.title}* (\`${r.source_type}\`)\n`;
      if (r.snippet) msg += `   ↳ _${r.snippet.replace(/<\/?b>/g, '*')}_\n`;
      else msg += `   ↳ _${r.content.slice(0, 120)}..._\n`;
    });
    return msg;
  }

  // Fallback: se o primeiro argumento for o nome de um caderno existente, mostra as fontes dele
  const existingNb = sqliteMasterDb.getNotebook(subCmd, userId);
  if (existingNb) {
    return notebookLmService.formatNotebookSourcesMarkdown(existingNb.id, userId);
  }

  return notebookLmService.formatNotebookLmHelpMarkdown();
}

export async function handle(text, ctx = {}) {
  const chatId = String(ctx.chat?.id || ctx.from?.id || process.env.CHAT_ID_AUTORIZADO || process.env.AUTHORIZED_CHAT_ID || '');
  const trimmed = String(text || '').trim();
  const lower = trimmed.toLowerCase();
  log.info('Processando pedido DEV Cloud', { text: trimmed.substring(0, 60), chatId });

  if (/^\/(reset|limpar)\b/i.test(lower)) {
    return await askAgent({ chatId, workerTag: 'dev', prompt: '/reset' });
  }

  // ─── NotebookLM: Grounded Q&A, Cadernos FTS5, Podcast Audio Overview & Estudo ───
  if (/^\/(notebook|notebooks|notebooklm|caderno|cadernos|podcast|estudo)\b/i.test(lower)) {
    return await handleNotebookLm(trimmed, { chatId, userId: chatId, completionFn: ctx.completionFn });
  }

  // ─── Motor Cloud-Native de Absorção & Adaptação de Ideias ──────────────────
  if (/^\/absorver_ideia\b/i.test(lower)) {
    return await handleAbsorverIdeia(trimmed.replace(/^\/absorver_ideia\s*/i, '').trim());
  }

  if (/^\/radar_ideias\b/i.test(lower)) {
    return handleRadarIdeias(trimmed.replace(/^\/radar_ideias\s*/i, '').trim());
  }

  if (/^\/gerar_prompt_ideia\b/i.test(lower)) {
    return handleGerarPromptIdeia(trimmed.replace(/^\/gerar_prompt_ideia\s*/i, '').trim());
  }

  // ─── Padrões Mercury (Second Brain FTS5 + Token Budget ADR-044) ─────────────
  if (/^\/memoria\b/i.test(lower)) {
    return handleMemoria(trimmed.replace(/^\/memoria\s*/i, '').trim(), chatId);
  }

  if (/^\/budget\b/i.test(lower)) {
    return handleBudget(trimmed.replace(/^\/budget\s*/i, '').trim());
  }

  if (/^\/(status_cloud|cloud|diagnostico|status|pc|pc_status|hardware|pc_sistema)\b/i.test(lower)) {
    return await handleStatusCloud();
  }

  if (/^\/(print|screenshot|ecra|ecrã)\b/i.test(lower)) {
    return (
      `☁️ *Modo 100% Cloud-Native ativo:* o bot deixou de depender de qualquer PC Surface local.\n\n` +
      await handleStatusCloud({ measureNetwork: false })
    );
  }

  const onBuildComplete =
    ctx?.telegram && chatId
      ? async (info) => {
        await ctx.telegram
          .sendMessage(
            chatId,
            `✅ *Build Cloud Concluída (${info.repo})!*\n• Resultado: *${info.conclusion}*\n🔗 ${info.htmlUrl}`
          )
          .catch(() => { });
      }
      : null;

  const compilarCmdMatch = trimmed.match(/^\/(?:compilar|build)\s*(.*)$/i);
  if (compilarCmdMatch) {
    return await handleCompilarCloud(compilarCmdMatch[1], { onBuildComplete });
  }
  const natCompileMatch = trimmed.match(/\b(?:compilar?|gerar?\s+o?\s*apk(?:\s+do)?)\s+([a-zA-Z0-9_.-]+)/i);
  if (natCompileMatch) {
    return await handleCompilarCloud(natCompileMatch[1], { onBuildComplete });
  }

  if (/^\/(projetos?|github|repos?)\b/i.test(lower)) return await listGithubRepos();
  if (/^\/criar_app\b/i.test(lower)) return await createCloudRepoAndDeploy(trimmed.replace(/^\/criar_app\s*/i, ''));
  if (/^\/(apps?|links?|catalogo|catalogo_apps|vercel)\b/i.test(lower)) return await listVercelAppsOrDeployments();
  if (/^\/(apks?|download_apk|android)\b/i.test(lower)) return handleApks();

  // ─── Free-TV / IPTV Canais Abertos (Adaptado de Free-TV/IPTV) ──────────────
  if (/^\/(tv|iptv|canais|canais_tv)\b/i.test(lower)) {
    const rawArgs = trimmed.replace(/^\/(?:tv|iptv|canais|canais_tv)\s*/i, '').trim();
    if (!rawArgs || ['pt', 'news', 'todos', 'all'].includes(rawArgs.toLowerCase())) {
      return iptvService.formatIptvCatalogMarkdown(rawArgs || 'pt');
    }
    if (rawArgs.toLowerCase() === 'check' || rawArgs.toLowerCase() === 'status') {
      return await iptvService.runIptvHealthCheck();
    }
    return await iptvService.formatSingleChannelMarkdown(rawArgs);
  }

  // ─── Obsidian Skills & Visual Canvas (Adaptado de obsidianmd/obsidian-skills) ──
  if (/^\/(obsidian|canvas|nota_obsidian)\b/i.test(lower)) {
    const rawArgs = trimmed.replace(/^\/(?:obsidian|canvas|nota_obsidian)\s*/i, '').trim();
    const subCmd = rawArgs.split(/\s+/)[0]?.toLowerCase();

    if (lower.startsWith('/canvas') || subCmd === 'canvas') {
      const canvasJson = obsidianService.generateEcosystemCanvas();
      return (
        `🎨 *JSON Canvas do Ecossistema (@AndrePinheirobot & Frotas)*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `Ficheiro visual gerado segundo a especificação aberta de **JSON Canvas** do Obsidian.\n\n` +
        `\`\`\`json\n` +
        `${canvasJson.slice(0, 1400)}...\n` +
        `\`\`\`\n\n` +
        `💡 _Para importar: Guarda com a extensão \`.canvas\` dentro do teu Obsidian Vault._`
      );
    }

    if (subCmd === 'export' || subCmd === 'vault') {
      const files = obsidianService.exportSecondBrainToObsidianVault();
      let resp = `💎 *Exportação de Vault Obsidian Concluída*\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      resp += `Foram gerados *${files.length} ficheiros* estruturados com Frontmatter YAML e Wikilinks:\n\n`;
      files.forEach((f) => {
        resp += `• 📄 *\`${f.filename}\`*\n`;
      });
      resp += `\n📌 *Primeiro ficheiro (Map of Content):*\n\`\`\`markdown\n`;
      resp += `${files[0].content.slice(0, 600)}...\n\`\`\`\n`;
      resp += `✅ _Estrutura pronta para leitura pelo Obsidian Desktop, Mobile ou CLI._`;
      return resp;
    }

    if (lower.startsWith('/nota_obsidian') || subCmd === 'nota') {
      const noteBody = rawArgs.replace(/^nota\s*/i, '').trim();
      const parts = noteBody.split('|');
      const title = parts[0]?.trim() || 'Nova Nota Obsidian';
      const content = parts.slice(1).join('|').trim() || title;
      const res = obsidianService.createAndSaveObsidianNote({
        title,
        content,
        tags: ['segundo-cerebro', 'telegram'],
        user: ctx.from?.first_name || 'André Pinheiro'
      });
      return (
        `📝 *Nota Obsidian Guardada com Sucesso!*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `• *Título:* \`${res.title}\`\n\n` +
        `\`\`\`markdown\n${res.markdown.slice(0, 500)}...\n\`\`\`\n` +
        `✅ _Guardada em SQLite WAL (\`pessoal_master.db\`) e sincronizada para backup._`
      );
    }

    return obsidianService.formatObsidianMenuMarkdown();
  }

  // ─── Hindsight: Memória Biomimética (Retain, Recall, Reflect) ─────────────
  if (/^\/(hindsight|memoria_v2)\b/i.test(lower)) {
    const rawArgs = trimmed.replace(/^\/(?:hindsight|memoria_v2)\s*/i, '').trim();
    const parts = rawArgs.split(/\s+/);
    const subCmd = parts[0]?.toLowerCase();

    if (subCmd === 'banks' || subCmd === 'bancos') {
      const banks = hindsightMemoryService.listBanks();
      let resp = `🏛️ *Bancos de Memória Hindsight (Particionados)*\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      banks.forEach((b) => {
        resp += `• \`${b.id}\` — *${b.name}* (${b.memory_count} memórias)\n  ↳ _${b.description}_\n`;
      });
      return resp;
    }

    if (subCmd === 'retain' || subCmd === 'guardar' || subCmd === 'aprender') {
      const remainder = rawArgs.replace(/^(?:retain|guardar|aprender)\s*/i, '').trim();
      const [bankPart, ...contentParts] = remainder.split('|');
      const bankId = contentParts.length > 0 ? bankPart.trim() : 'pessoal_andre';
      const content = contentParts.length > 0 ? contentParts.join('|').trim() : bankPart.trim();

      if (!content) {
        return `⚠️ *Uso correto:* \`/hindsight retain <banco> | <conteudo>\`\nExemplo: \`/hindsight retain pessoal_andre | Prefere correr ao fim da tarde\``;
      }

      const saved = hindsightMemoryService.retain({ bankId, content, confidence: 1.0 });
      return (
        `🧠 *Memória Retida com Sucesso (Retain)*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `• *Banco:* \`${saved.bankId}\`\n` +
        `• *ID:* \`${saved.id}\`\n` +
        `• *Conteúdo:* _"${saved.content}"_\n` +
        `• *Confiança:* \`${Math.round(saved.confidence * 100)}%\`\n` +
        `✅ _Disponível imediatamente para evocação (Recall) e síntese (Reflect)._`
      );
    }

    if (subCmd === 'recall' || subCmd === 'evocar' || subCmd === 'lembrar') {
      const remainder = rawArgs.replace(/^(?:recall|evocar|lembrar)\s*/i, '').trim();
      const [bankPart, ...queryParts] = remainder.split('|');
      const bankId = queryParts.length > 0 ? bankPart.trim() : 'pessoal_andre';
      const query = queryParts.length > 0 ? queryParts.join('|').trim() : bankPart.trim();

      const results = hindsightMemoryService.recall({ bankId, query, limit: 5 });
      if (results.length === 0) {
        return `🔍 *Recall (${bankId}):* Nenhuma memória encontrada para "${query}".`;
      }

      let resp = `🔍 *Memórias Evocadas (Recall — ${bankId})*\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      results.forEach((m, idx) => {
        resp += `*${idx + 1}.* ${m.content}\n   ↳ Confiança: \`${Math.round(m.confidence * 100)}%\` | _${new Date(m.createdAt).toLocaleDateString('pt-PT')}_\n\n`;
      });
      return resp;
    }

    if (subCmd === 'reflect' || subCmd === 'refletir' || subCmd === 'sintetizar') {
      const remainder = rawArgs.replace(/^(?:reflect|refletir|sintetizar)\s*/i, '').trim();
      const [bankPart, ...queryParts] = remainder.split('|');
      const bankId = queryParts.length > 0 ? bankPart.trim() : 'pessoal_andre';
      const query = queryParts.length > 0 ? queryParts.join('|').trim() : bankPart.trim();

      const res = await hindsightMemoryService.reflect({ bankId, query, chatId });
      return (
        `💡 *Síntese Cognitiva Hindsight (Reflect)*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `• *Banco:* \`${res.bankId}\` | *Memórias Analisadas:* ${res.memoriesCount}\n` +
        `• *Tema:* _"${res.query || 'Geral'}"_\n\n` +
        `${res.reflection}`
      );
    }

    return hindsightMemoryService.formatHindsightMenuMarkdown();
  }

  // ─── Projeto NOMAD: Conhecimento Offline & Resiliência (ADR-044) ───────────
  if (/^\/(nomad|socorro|primeiros_socorros|kit72h|hash|b64)\b/i.test(lower)) {
    if (lower.startsWith('/socorro') || lower.startsWith('/primeiros_socorros')) {
      const proc = trimmed.replace(/^\/(?:socorro|primeiros_socorros)\s*/i, '').trim();
      return nomadKnowledgeService.formatFirstAidMarkdown(proc);
    }
    if (lower.startsWith('/kit72h')) {
      return nomadKnowledgeService.formatKit72hMarkdown();
    }
    if (lower.startsWith('/hash')) {
      const val = trimmed.replace(/^\/hash\s*/i, '').trim();
      return nomadKnowledgeService.runCyberChefTool('sha256', val);
    }
    if (lower.startsWith('/b64')) {
      const val = trimmed.replace(/^\/b64\s*/i, '').trim();
      return nomadKnowledgeService.runCyberChefTool('b64enc', val);
    }

    const rawArgs = trimmed.replace(/^\/nomad\s*/i, '').trim();
    const parts = rawArgs.split(/\s+/);
    const subCmd = parts[0]?.toLowerCase();

    if (subCmd === 'socorro' || subCmd === 'ajuda' || subCmd === 'sbv') {
      return nomadKnowledgeService.formatFirstAidMarkdown(parts[1] || '');
    }
    if (subCmd === 'kit' || subCmd === '72h') {
      return nomadKnowledgeService.formatKit72hMarkdown();
    }
    if (subCmd === 'contactos' || subCmd === 'contacto' || subCmd === 'emergencia') {
      return nomadKnowledgeService.formatEmergencyContactsMarkdown();
    }
    if (subCmd === 'map' || subCmd === 'mapas' || subCmd === 'pontos') {
      return nomadKnowledgeService.formatNomadMapPointsMarkdown();
    }
    if (subCmd === 'tools' || subCmd === 'cyberchef') {
      const tool = parts[1] || '';
      const input = parts.slice(2).join(' ');
      return nomadKnowledgeService.runCyberChefTool(tool, input);
    }

    return nomadKnowledgeService.formatNomadMenuMarkdown();
  }

  // ─── Agent-Reach: Inteligência Web Zero-API-Fee (ADR-044) ────────────────
  if (/^\/(reach|agent_reach|read|hn|reddit|wiki)\b/i.test(lower)) {
    // Atalhos diretos
    if (lower.startsWith('/read')) {
      const url = trimmed.replace(/^\/read\s*/i, '').trim();
      if (!url) return '⚠️ *Uso correto:* `/read <https://url>`';
      const env = await agentReachService.readWebPage(url);
      return agentReachService.formatReachEnvelopeMarkdown(env);
    }
    if (lower.startsWith('/hn')) {
      const env = await agentReachService.getHackerNewsTop({ limit: 5 });
      return agentReachService.formatReachEnvelopeMarkdown(env);
    }
    if (lower.startsWith('/reddit')) {
      const q = trimmed.replace(/^\/reddit\s*/i, '').trim();
      if (!q) return '⚠️ *Uso correto:* `/reddit <pesquisa>`';
      const env = await agentReachService.searchReddit(q);
      return agentReachService.formatReachEnvelopeMarkdown(env);
    }
    if (lower.startsWith('/wiki')) {
      const q = trimmed.replace(/^\/wiki\s*/i, '').trim();
      if (!q) return '⚠️ *Uso correto:* `/wiki <pesquisa>`';
      const env = await agentReachService.searchWikipedia(q);
      return agentReachService.formatReachEnvelopeMarkdown(env);
    }

    // Comando unificado /reach [canal] [argumento]
    const rawArgs = trimmed.replace(/^\/(?:reach|agent_reach)\s*/i, '').trim();
    if (!rawArgs) {
      return agentReachService.formatReachMenuMarkdown();
    }

    const parts = rawArgs.split(/\s+/);
    const subCmd = parts[0]?.toLowerCase();
    const queryPart = parts.slice(1).join(' ').trim();

    if (subCmd === 'doctor' || subCmd === 'status' || subCmd === 'diag') {
      const doc = await agentReachService.runAgentReachDoctor();
      return agentReachService.formatDoctorMarkdown(doc);
    }

    if (subCmd === 'read' || subCmd === 'web') {
      if (!queryPart) return '⚠️ *Uso correto:* `/reach read <https://url>`';
      const env = await agentReachService.readWebPage(queryPart);
      return agentReachService.formatReachEnvelopeMarkdown(env);
    }

    if (subCmd === 'reddit') {
      if (!queryPart) return '⚠️ *Uso correto:* `/reach reddit <pesquisa>`';
      const env = await agentReachService.searchReddit(queryPart);
      return agentReachService.formatReachEnvelopeMarkdown(env);
    }

    if (subCmd === 'hn' || subCmd === 'hackernews') {
      const env = await agentReachService.getHackerNewsTop({ limit: 5 });
      return agentReachService.formatReachEnvelopeMarkdown(env);
    }

    if (subCmd === 'gh' || subCmd === 'github') {
      if (!queryPart) return '⚠️ *Uso correto:* `/reach gh <pesquisa>`';
      const env = await agentReachService.searchGitHub(queryPart);
      return agentReachService.formatReachEnvelopeMarkdown(env);
    }

    if (subCmd === 'yt' || subCmd === 'youtube') {
      if (!queryPart) return '⚠️ *Uso correto:* `/reach yt <url_do_video>`';
      const env = await agentReachService.getYouTubeMetadata(queryPart);
      return agentReachService.formatReachEnvelopeMarkdown(env);
    }

    if (subCmd === 'wiki' || subCmd === 'wikipedia') {
      if (!queryPart) return '⚠️ *Uso correto:* `/reach wiki <pesquisa>`';
      const env = await agentReachService.searchWikipedia(queryPart);
      return agentReachService.formatReachEnvelopeMarkdown(env);
    }

    // Fallback inteligente: se for URL lê a página, senão pesquisa
    const env = await agentReachService.reach(subCmd, queryPart || subCmd);
    return agentReachService.formatReachEnvelopeMarkdown(env);
  }

  // ─── Home Assistant: Domótica Residencial & Quarto da Carolina (ADR-044) ───
  if (/^\/(casa|domotica|hass|luz|luzes|clima|cenario|carolina_quarto)\b/i.test(lower)) {
    // Atalho direto: Visão Geral Residencial
    if (lower === '/casa' || lower === '/domotica') {
      return homeAssistantService.formatHomeOverviewMarkdown();
    }

    // Atalho direto: Conforto Quarto Carolina
    if (lower === '/carolina_quarto') {
      return homeAssistantService.formatBabyComfortMarkdown();
    }

    // Atalho direto: Controlo de Iluminação (/luz [sala|quarto|cozinha|tudo] [on|off|toggle])
    if (lower.startsWith('/luz')) {
      const raw = trimmed.replace(/^\/(?:luzes|luz)\s*/i, '').trim();
      if (!raw) {
        const lights = sqliteMasterDb.listHomeEntities('light');
        let msg = `💡 *ESTADO DA ILUMINAÇÃO RESIDENCIAL*\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        lights.forEach((l) => {
          const icon = l.state === 'on' ? '🟡' : '⚪';
          msg += `${icon} *${l.friendly_name}:* \`${l.state.toUpperCase()}\` (\`${l.entity_id}\`)\n`;
        });
        msg += `\n_Uso: \`/luz sala on\` | \`/luz cozinha off\` | \`/luz tudo off\`_`;
        return msg;
      }

      const parts = raw.split(/\s+/);
      let target = 'sala';
      let action = 'toggle';

      if (['on', 'off', 'ligar', 'desligar', 'apagar', 'acender'].includes(parts[0].toLowerCase())) {
        action = parts[0].toLowerCase();
        target = parts[1] || 'sala';
      } else {
        target = parts[0];
        action = parts[1] || 'toggle';
      }

      const res = await homeAssistantService.controlLight(target, action);
      if (!res.success) return `⚠️ *Erro Domótica:* ${res.error}`;
      if (res.all) {
        return `💡 *Comando Geral Executado:*\nTodas as ${res.count} luzes foram alteradas para: \`${res.state.toUpperCase()}\`.`;
      }
      return `💡 *${res.entity.friendly_name}:* Estado alterado para \`${res.state.toUpperCase()}\` ✅`;
    }

    // Atalho direto: Controlo de Climatização (/clima [local] [temperatura])
    if (lower.startsWith('/clima')) {
      const raw = trimmed.replace(/^\/clima\s*/i, '').trim();
      if (!raw) {
        const baby = homeAssistantService.getBabyRoomComfortReport();
        return (
          `🌡️ *CLIMATIZAÇÃO RESIDENCIAL*\n━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `• *Quarto da Carolina:* \`${baby.temperature}°C\` (Alvo: \`${baby.targetTemp}°C\` | Modo: \`${baby.climateState}\`)\n` +
          `• *Ar Condicionado Sala:* ${sqliteMasterDb.getHomeEntity('climate.sala')?.state.toUpperCase() || 'OFF'}\n\n` +
          `_Uso: \`/clima 20.5\` | \`/clima sala 22\` | \`/clima bebe off\`_`
        );
      }

      const parts = raw.split(/\s+/);
      let target = 'bebe';
      let temp = null;
      let mode = null;

      if (!isNaN(Number(parts[0]))) {
        temp = Number(parts[0]);
      } else {
        target = parts[0];
        if (parts[1]) {
          if (!isNaN(Number(parts[1]))) temp = Number(parts[1]);
          else mode = parts[1];
        }
      }

      const res = await homeAssistantService.controlClimate(target, { targetTemperature: temp, hvacMode: mode });
      if (!res.success) return `⚠️ *Erro Clima:* ${res.error}`;
      return `🌡️ *${res.entity.friendly_name}:* Temperatura alvo \`${res.targetTemperature || res.entity.attributes.target_temperature}°C\` (Modo: \`${res.hvacMode}\`) ✅`;
    }

    // Atalho direto: Ativação de Cenário (/cenario <noite|bom_dia|sair|cinema>)
    if (lower.startsWith('/cenario')) {
      const sceneId = trimmed.replace(/^\/cenario\s*/i, '').trim();
      if (!sceneId) {
        const scenes = sqliteMasterDb.listHomeScenes();
        let msg = `🎬 *CENÁRIOS RESIDENCIAIS DISPONÍVEIS*\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        scenes.forEach((s) => {
          msg += `• \`/cenario ${s.id}\` — *${s.name}*\n  ↳ _${s.description}_\n`;
        });
        return msg;
      }

      const res = await homeAssistantService.triggerScene(sceneId);
      if (!res.success) return `⚠️ *Erro Cenário:* ${res.error}`;
      return (
        `🎬 *Cenário Ativado com Sucesso!*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `• *Cenário:* *${res.scene.name}*\n` +
        `• *Ações Executadas:* \`${res.actionsCount}\` dispositivos atualizados\n` +
        `• *Descrição:* _${res.scene.description}_\n` +
        `✅ _Ambiente configurado em SQLite WAL e propagado na nuvem._`
      );
    }

    // Menu geral /hass
    const rawArgs = trimmed.replace(/^\/hass\s*/i, '').trim();
    if (!rawArgs) return homeAssistantService.formatHassMenuMarkdown();

    const parts = rawArgs.split(/\s+/);
    const subCmd = parts[0]?.toLowerCase();

    if (subCmd === 'entidades' || subCmd === 'entities') {
      const domain = parts[1] || null;
      const entities = sqliteMasterDb.listHomeEntities(domain);
      let msg = `🏠 *ENTIDADES REGISTADAS ${domain ? `[${domain.toUpperCase()}]` : ''}*\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      entities.forEach((e) => {
        msg += `• *${e.friendly_name}* (\`${e.entity_id}\`): \`${e.state}\` ${e.unit_of_measurement || ''}\n`;
      });
      return msg;
    }

    if (subCmd === 'baby' || subCmd === 'carolina') {
      return homeAssistantService.formatBabyComfortMarkdown();
    }

    return homeAssistantService.formatHassMenuMarkdown();
  }

  if (/^\/pladur\b/i.test(lower) || /\b(pladur|en\s*520|en\s*14195|divis[oó]ria\s+gesso)\b/i.test(lower)) {
    const areaMatch = trimmed.match(/(\d+(?:[.,]\d+)?)\s*(?:m2|m²)?/i);
    return getPladurSpecifications(trimmed.startsWith('/pladur') ? trimmed.replace(/^\/pladur\s*/i, '') : areaMatch?.[1] || '');
  }

  if (/^\/erros?\b/i.test(lower)) {
    const sub = trimmed.replace(/^\/erros?\s*/i, '').trim().toLowerCase();
    if (sub === 'resolver' || sub === 'limpar' || sub === 'clear') {
      const res = resolveOpenErrors();
      return `✅ *Self-Refine:* ${res.resolvedCount} erro(s) marcado(s) como resolvido(s).\n\n${getErrorStatusMarkdown(10)}`;
    }
    return getErrorStatusMarkdown(10);
  }

  if (/^\/self_refine\b/i.test(lower)) {
    const rawTarget = trimmed.replace(/^\/self_refine\s*/i, '').trim();
    const reports = sqliteMasterDb.getErrorReports(10) || [];
    const latestOpen = reports.find((r) => !r.resolved) || reports[0];
    if (!latestOpen && !rawTarget) {
      return getErrorStatusMarkdown(10);
    }
    const safeTarget = rawTarget && !rawTarget.includes('..') ? path.resolve(rawTarget) : path.resolve('index.js');
    const diag = await diagnoseAndRefineError({
      filePath: safeTarget,
      errorMessage: latestOpen?.message || 'Verificação preventiva solicitada manualmente.',
      errorStack: latestOpen?.stack || ''
    });
    if (!diag.success) {
      return `⚠️ *Auto-Diagnóstico Self-Refine:* ${diag.error}\n\n${getErrorStatusMarkdown(5)}`;
    }
    return (
      `🧠 *DIAGNÓSTICO SELF-REFINE (${path.basename(safeTarget)})*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `• *Causa Raiz:* ${diag.rootCause}\n` +
      `• *Resumo Técnico:* ${diag.summary}\n` +
      `• _Nota:_ Código sugerido pronto para revisão antes de qualquer commit.`
    );
  }

  return await handleCode(trimmed, chatId);
}

export default {
  handle,
  handleNotebookLm,
  handleStatusCloud,
  handleCompilarCloud,
  handleMemoria,
  handleBudget,
  handleAbsorverIdeia,
  handleRadarIdeias,
  handleGerarPromptIdeia
};
