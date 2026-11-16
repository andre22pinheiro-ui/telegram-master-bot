// src/services/ideaHarvesterService.js — Motor Cloud-Native de Absorção e Adaptação de Ideias Open-Source
import axios from 'axios';
import { Octokit } from '@octokit/rest';
import { createLogger } from '../utils/logger.js';
import { sqliteMasterDb } from '../shared/sqliteMasterDb.js';

const log = createLogger('IdeaHarvester');

export const VALID_TARGET_PROJECTS = ['master-bot', 'frota-bot', 'appfrota', 'rotabus', 'android'];

/**
 * Sanitiza conteúdos externos segundo a diretriz de segurança ADR-044
 */
export function sanitizeUntrustedData(rawText = '') {
  if (!rawText) return '';
  return String(rawText)
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/javascript:/gi, '')
    .trim();
}

/**
 * Extrai owner e repo se for URL do GitHub
 */
export function parseGithubUrl(rawUrl = '') {
  const match = String(rawUrl).match(/github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/i);
  if (match) {
    return { owner: match[1], repo: match[2].replace(/\.git$/i, '') };
  }
  return null;
}

/**
 * Analisa e rejeita requisitos puramente locais, convertendo-os para padrões Cloud-Native (Render/Vercel)
 */
export function convertToCloudNativeArchitecture(content = '', userNotes = '') {
  const combined = `${content} ${userNotes}`.toLowerCase();
  const conversions = [];

  // 1. TUI / Ink / Interface de Terminal
  if (/\b(ink|blessed|terminal-kit|inquirer|prompts|raw\s*mode|ansi-escapes)\b/i.test(combined)) {
    conversions.push({
      localPattern: 'Interface de Terminal Interativa (TUI / Ink / Blessed)',
      cloudAlternative: 'Convertido para Teclados Inline Telegraf (`Markup.inlineKeyboard`), comandos slash ou Mini Apps Web na Vercel.',
      status: 'REJEITADO_E_CONVERTIDO'
    });
  }

  // 2. Daemons Locais / Systemd / Background workers de SO
  if (/\b(daemon|systemd|launchd|windows-service|forever|nohup|win32|powershell\s*service)\b/i.test(combined)) {
    conversions.push({
      localPattern: 'Daemon de Máquina Local / Processo de Fundo no SO',
      cloudAlternative: 'Convertido para rotinas assíncronas do Node.js (`node-cron`), Render Background Workers ou Crons HTTP periódicos.',
      status: 'REJEITADO_E_CONVERTIDO'
    });
  }

  // 3. Pacotes Nativos Desktop / GUI / X11 / Electron
  if (/\b(electron|robotjs|node-notifier|desktop-gui|x11|applescript)\b/i.test(combined)) {
    conversions.push({
      localPattern: 'Pacote Nativo de Desktop / GUI Local / Notificações de SO',
      cloudAlternative: 'Convertido para Webhooks assíncronos da Telegram Bot API e Cloudinary CDN para ficheiros visuais.',
      status: 'REJEITADO_E_CONVERTIDO'
    });
  }

  // 4. Acesso direto a Filesystem persistente local
  if (/\b(fs\.watch|chokidar|local-storage|c:\/|c:\\|\/var\/log)\b/i.test(combined)) {
    conversions.push({
      localPattern: 'Dependência de Filesystem Local Absoluto',
      cloudAlternative: 'Convertido para SQLite WAL (`better-sqlite3`) no container Render com ganchos Write-Through para Google Drive.',
      status: 'REJEITADO_E_CONVERTIDO'
    });
  }

  if (conversions.length === 0) {
    conversions.push({
      localPattern: 'Nenhum bloqueio local detetado',
      cloudAlternative: 'Arquitetura já 100% compatível com Node.js no Render (Serviço Web 24/7) e Edge/Serverless na Vercel.',
      status: 'APROVADO_DIRETO'
    });
  }

  return conversions;
}

/**
 * Gera o bloco determinístico de instruções para o Antigravity IDE
 */
export function buildIdePromptBlock({
  sourceUrl,
  repoName,
  targetProject,
  userNotes,
  extractedSummary,
  cloudPlan
}) {
  const planLines = Array.isArray(cloudPlan)
    ? cloudPlan.map((c) => `  • [${c.status}] ${c.localPattern} -> ${c.cloudAlternative}`).join('\n')
    : `  • ${cloudPlan}`;

  return (
    `### Antigravity IDE Implementation Prompt (Diretiva Cloud-Native)\n\n` +
    `1. **Origem:** ${sourceUrl} ${repoName ? `(${repoName})` : ''}\n` +
    `2. **Projeto Alvo:** \`${targetProject}\`\n` +
    `3. **Notas do Utilizador:** ${userNotes || 'Nenhuma nota adicional'}\n\n` +
    `4. **Resumo Factual Sanitizado (ADR-044):**\n` +
    `<untrusted_data source="${sourceUrl}">\n` +
    `${extractedSummary.slice(0, 1200)}\n` +
    `</untrusted_data>\n\n` +
    `5. **Plano de Adaptação Cloud-Native Obrigatório:**\n` +
    `${planLines}\n\n` +
    `6. **Regras de Engenharia Invioláveis:**\n` +
    `• Execução 100% Cloud-Native (Render 24/7 + Vercel Mini Apps) com zero dependência de PC local.\n` +
    `• Preservar o isolamento estrito de bases de dados (SQLite WAL no Master Bot vs Supabase no Frota Bot).\n` +
    `• Temperatura 0.0 determinística, zero alucinações e verificação factual obrigatória.`
  );
}

/**
 * Serviço Principal: Absorve e adapta uma ideia open-source para a infraestrutura Cloud
 */
export async function harvestAndAdaptIdea({
  sourceUrl,
  targetProject = 'master-bot',
  userNotes = '',
  octokitClient = null,
  axiosClient = null
} = {}) {
  const cleanUrl = String(sourceUrl || '').trim();
  if (!cleanUrl) {
    throw new Error('URL de origem é obrigatório para absorver uma ideia.');
  }

  const normalizedTarget = VALID_TARGET_PROJECTS.includes(String(targetProject).toLowerCase())
    ? String(targetProject).toLowerCase()
    : 'master-bot';

  log.info(`A absorver ideia de: ${cleanUrl} para projeto alvo: ${normalizedTarget}`);

  let repoName = null;
  let extractedSummary = '';
  const gh = parseGithubUrl(cleanUrl);

  if (gh) {
    repoName = `${gh.owner}/${gh.repo}`;
    try {
      const client = octokitClient || (process.env.GITHUB_TOKEN ? new Octokit({ auth: process.env.GITHUB_TOKEN }) : new Octokit());
      const repoData = await client.rest.repos.get({ owner: gh.owner, repo: gh.repo });
      const desc = repoData.data?.description || 'Sem descrição fornecida';
      const topics = (repoData.data?.topics || []).join(', ');
      const stars = repoData.data?.stargazers_count || 0;
      const lang = repoData.data?.language || 'JavaScript';

      let readmeSnippet = '';
      try {
        const readmeRes = await client.rest.repos.getReadme({ owner: gh.owner, repo: gh.repo });
        if (readmeRes.data?.content) {
          const rawReadme = Buffer.from(readmeRes.data.content, 'base64').toString('utf8');
          readmeSnippet = rawReadme.slice(0, 1500);
        }
      } catch {}

      extractedSummary =
        `Repositório: ${repoName} (${lang} | ⭐ ${stars})\n` +
        `Descrição: ${desc}\n` +
        `Tópicos: ${topics || 'geral'}\n\n` +
        (readmeSnippet ? `Excerto do README:\n${readmeSnippet}` : '');
    } catch (ghErr) {
      log.warn(`Aviso ao consultar GitHub API para ${cleanUrl}: ${ghErr.message}. Recorrendo a fallback estruturado.`);
      extractedSummary = `Repositório GitHub ${repoName}. URL: ${cleanUrl}. Notas: ${userNotes || 'Ideia para análise'}`;
    }
  } else {
    try {
      const client = axiosClient || axios;
      const res = await client.get(cleanUrl, { timeout: 5000, headers: { 'User-Agent': 'IdeaHarvester/1.0' } });
      const bodyText = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
      extractedSummary = sanitizeUntrustedData(bodyText).slice(0, 1500);
    } catch (httpErr) {
      log.warn(`Aviso ao ler URL web ${cleanUrl}: ${httpErr.message}`);
      extractedSummary = `Conteúdo web em ${cleanUrl}. Referência técnica para adaptação cloud.`;
    }
  }

  const cleanSummary = sanitizeUntrustedData(extractedSummary);
  const cloudPlan = convertToCloudNativeArchitecture(cleanSummary, userNotes);
  const planText = cloudPlan.map((c) => `[${c.status}] ${c.localPattern} -> ${c.cloudAlternative}`).join(' | ');

  const idePrompt = buildIdePromptBlock({
    sourceUrl: cleanUrl,
    repoName,
    targetProject: normalizedTarget,
    userNotes,
    extractedSummary: cleanSummary,
    cloudPlan
  });

  const savedRecord = sqliteMasterDb.saveIdeaRecord({
    sourceUrl: cleanUrl,
    repoName,
    targetProject: normalizedTarget,
    userNotes,
    extractedSummary: cleanSummary,
    cloudAdaptationPlan: planText,
    idePrompt,
    status: 'pending'
  });

  log.info(`Ideia absorvida com sucesso (ID: ${savedRecord.id}) para ${normalizedTarget}`);

  return {
    ...savedRecord,
    cloudPlan
  };
}

/**
 * Consulta ideias absorvidas no radar
 */
export function listHarvestedIdeas(targetProject = null, limit = 10) {
  return sqliteMasterDb.listIdeaRecords(targetProject, limit);
}

/**
 * Recupera o prompt pronto para o Antigravity IDE
 */
export function getIdePromptForIdea(ideaId) {
  const record = sqliteMasterDb.getIdeaRecord(ideaId);
  if (!record) return null;
  return record.ide_prompt || buildIdePromptBlock({
    sourceUrl: record.source_url,
    repoName: record.repo_name,
    targetProject: record.target_project,
    userNotes: record.user_notes,
    extractedSummary: record.extracted_summary,
    cloudPlan: record.cloud_adaptation_plan
  });
}

export default {
  VALID_TARGET_PROJECTS,
  sanitizeUntrustedData,
  parseGithubUrl,
  convertToCloudNativeArchitecture,
  buildIdePromptBlock,
  harvestAndAdaptIdea,
  listHarvestedIdeas,
  getIdePromptForIdea
};

