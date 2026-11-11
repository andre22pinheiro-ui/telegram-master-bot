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
import { getPladurSpecifications } from '../services/pladurService.js';
import {
  getErrorStatusMarkdown,
  resolveOpenErrors,
  diagnoseAndRefineError
} from '../shared/selfRefineEngine.js';
import { sqliteMasterDb } from '../shared/sqliteMasterDb.js';
import { askAgent } from '../services/reasoningService.js';

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

async function handleCode(userMessage, chatId = '950415577') {
  return await askAgent({
    chatId,
    workerTag: 'dev',
    prompt: userMessage
  });
}

export async function handle(text, ctx = {}) {
  const chatId = String(ctx.chat?.id || ctx.from?.id || '950415577');
  const trimmed = String(text || '').trim();
  const lower = trimmed.toLowerCase();
  log.info('Processando pedido DEV Cloud', { text: trimmed.substring(0, 60), chatId });

  if (/^\/(reset|limpar)\b/i.test(lower)) {
    return await askAgent({ chatId, workerTag: 'dev', prompt: '/reset' });
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
            .catch(() => {});
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
  handleStatusCloud,
  handleCompilarCloud
};
