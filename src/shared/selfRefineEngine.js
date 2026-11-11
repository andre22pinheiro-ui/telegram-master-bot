// src/shared/selfRefineEngine.js — Motor de Registo de Erros (SQLite WAL) & Auto-Diagnóstico Cloud
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { Octokit } from '@octokit/rest';
import { sqliteMasterDb } from './sqliteMasterDb.js';
import { generateDeterministicCompletion } from '../services/reasoningService.js';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'andre22pinheiro-ui';
const GITHUB_REPO = process.env.GITHUB_REPO || 'telegram-master-bot';

const octokit = GITHUB_TOKEN ? new Octokit({ auth: GITHUB_TOKEN }) : null;

/**
 * 1. Trap estruturado de erros em SQLite WAL (`error_reports`).
 */
export function recordExecutionError({ serviceName = 'system', error, context = {} } = {}) {
  const message = error?.message || String(error || 'Erro desconhecido');
  const stack = error?.stack || null;
  try {
    return sqliteMasterDb.addErrorReport({
      service: serviceName || 'system',
      message,
      stack,
      context
    });
  } catch {
    return {
      id: `err_${Date.now()}`,
      created_at: new Date().toISOString(),
      service: serviceName || 'system',
      message,
      stack,
      context,
      resolved: false
    };
  }
}

/**
 * Lista relatórios de erros abertos/recentes formatados para Telegram.
 */
export function getErrorStatusMarkdown(limit = 10) {
  let reports = [];
  try {
    reports = sqliteMasterDb.getErrorReports(limit) || [];
  } catch (err) {
    return `⚠️ *Telemetria Self-Refine indisponível:* ${err.message}`;
  }

  const open = reports.filter((r) => !r.resolved);
  const resolved = reports.length - open.length;

  if (reports.length === 0) {
    return (
      `🛡️ *SELF-REFINE ENGINE — ESTADO LIMPO*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `• Erros em aberto: **0**\n` +
      `• Histórico recente: **0** registos na tabela \`error_reports\` (SQLite WAL).`
    );
  }

  const lines = reports.slice(0, limit).map((r, idx) => {
    const badge = r.resolved ? '✅' : '🔴';
    const dt = String(r.created_at || '').slice(0, 19).replace('T', ' ');
    const cleanMsg = String(r.message || '').replace(/[*_`]/g, ' ').slice(0, 120);
    return `${idx + 1}. ${badge} \`${r.id}\` [${r.service}] (${dt}): ${cleanMsg}`;
  });

  return (
    `🛠️ *SELF-REFINE ENGINE — REGISTO DE ERROS*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `• Em aberto: **${open.length}** | Resolvidos (amostra): **${resolved}**\n\n` +
    `${lines.join('\n')}\n\n` +
    `${open.length > 0 ? '💡 _Para marcar erros abertos como resolvidos:_ `/erros resolver`\n' : ''}` +
    `💡 _Para auto-diagnóstico por ficheiro:_ \`/self_refine src/caminho.js\``
  );
}

/**
 * Marca todos os erros abertos na amostra atual como resolvidos.
 */
export function resolveOpenErrors(limit = 30) {
  const reports = sqliteMasterDb.getErrorReports(limit) || [];
  const open = reports.filter((r) => !r.resolved);
  for (const r of open) {
    sqliteMasterDb.markErrorReportResolved(r.id);
  }
  return { resolvedCount: open.length };
}

/**
 * 2. Auto-diagnóstico determinístico usando a cascata IA (`temperature: 0.0`).
 */
export async function diagnoseAndRefineError({
  filePath,
  errorMessage,
  errorStack,
  completionFn = generateDeterministicCompletion
}) {
  let sourceCode = '';
  try {
    if (filePath && fs.existsSync(filePath)) {
      sourceCode = fs.readFileSync(filePath, 'utf-8');
    }
  } catch (e) {
    return { success: false, error: `Não foi possível ler o código-fonte em ${filePath}: ${e.message}` };
  }

  const prompt =
    `És o Engenheiro Sénior de Diagnóstico (Self-Refine Engine | temperature=0.0).\n` +
    `Ficheiro: "${path.basename(filePath || 'desconhecido')}".\n\n` +
    `ERRO:\n${errorMessage}\n\n` +
    `STACK:\n${errorStack || 'Sem stack'}\n\n` +
    `${sourceCode ? `CÓDIGO ATUAL:\n\`\`\`javascript\n${sourceCode.slice(0, 6000)}\n\`\`\`\n\n` : ''}` +
    `Responde APENAS em JSON válido (sem markdown extra):\n` +
    `{"rootCause":"...","summary":"...","patchedCode":"..."}`;

  try {
    const aiRes = await completionFn({
      systemPrompt: 'És o engenheiro sénior de diagnóstico determinístico. Responde apenas em JSON válido.',
      prompt,
      maxTokens: 2048
    });

    const rawText = aiRes?.text || (typeof aiRes === 'string' ? aiRes : '');
    if (!rawText) {
      return { success: false, error: 'Cascata IA indisponível ou sem chaves para auto-diagnóstico.' };
    }

    const cleaned = rawText.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
    const parsed = JSON.parse(cleaned);
    return {
      success: true,
      rootCause: parsed.rootCause,
      summary: parsed.summary,
      patchedCode: parsed.patchedCode,
      filePath
    };
  } catch (err) {
    return { success: false, error: `Falha no Auto-Diagnóstico: ${err.message}` };
  }
}

/**
 * 3. Commit remoto no GitHub via Octokit (quando GITHUB_TOKEN está configurado).
 */
export async function commitAndPushFix({ relativePath, newContent, commitMessage }) {
  const localAbsPath = path.resolve(relativePath);
  try {
    fs.writeFileSync(localAbsPath, newContent, 'utf-8');
  } catch (fsErr) {
    return { success: false, error: `Falha ao gravar correção localmente: ${fsErr.message}` };
  }

  if (!octokit) {
    return {
      success: true,
      githubUpdated: false,
      message: 'Ficheiro atualizado localmente. GitHub Token não configurado para push remoto.'
    };
  }

  try {
    const cleanRepoPath = relativePath.replace(/\\/g, '/').replace(/^\.\//, '');
    let currentSha = null;
    try {
      const { data } = await octokit.rest.repos.getContent({
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        path: cleanRepoPath
      });
      currentSha = data.sha;
    } catch {}

    const contentBase64 = Buffer.from(newContent, 'utf-8').toString('base64');
    const updateRes = await octokit.rest.repos.createOrUpdateFileContents({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      path: cleanRepoPath,
      message: commitMessage || `🤖 [Self-Refine Auto-Fix] Correção autónoma em ${cleanRepoPath}`,
      content: contentBase64,
      sha: currentSha || undefined,
      committer: {
        name: 'Self-Refine Agent',
        email: 'bot-autofix@antigravity.ai'
      }
    });

    return {
      success: true,
      githubUpdated: true,
      commitSha: updateRes.data.commit.sha,
      commitUrl: updateRes.data.commit.html_url,
      message: `Correção enviada para GitHub (SHA: ${updateRes.data.commit.sha.substring(0, 7)}).`
    };
  } catch (octoErr) {
    return {
      success: true,
      githubUpdated: false,
      message: `Ficheiro corrigido localmente, mas falha no GitHub: ${octoErr.message}`
    };
  }
}

export async function autoRefineWorkflow({ serviceName, error, filePath, completionFn }) {
  const report = recordExecutionError({ serviceName, error, context: { filePath } });
  const diagnosis = await diagnoseAndRefineError({
    filePath,
    errorMessage: error?.message || String(error),
    errorStack: error?.stack,
    completionFn
  });

  if (!diagnosis.success) {
    return { reportId: report.id, repaired: false, error: diagnosis.error };
  }

  const commitRes = await commitAndPushFix({
    relativePath: filePath,
    newContent: diagnosis.patchedCode,
    commitMessage: `🤖 [Self-Refine] Correção em ${path.basename(filePath)}: ${diagnosis.summary}`
  });

  return {
    reportId: report.id,
    repaired: true,
    rootCause: diagnosis.rootCause,
    summary: diagnosis.summary,
    commitDetails: commitRes
  };
}

export default {
  recordExecutionError,
  getErrorStatusMarkdown,
  resolveOpenErrors,
  diagnoseAndRefineError,
  commitAndPushFix,
  autoRefineWorkflow
};
