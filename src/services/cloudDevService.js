// src/services/cloudDevService.js — DevOps 100% Cloud-Native (GitHub Octokit + GitHub Actions + Vercel + Render)
import { performance } from 'perf_hooks';
import { Octokit } from '@octokit/rest';
import { createLogger } from '../utils/logger.js';
import { formatAllVercelAppsMarkdown } from '../shared/appsCatalog.js';
import { sqliteMasterDb } from '../shared/sqliteMasterDb.js';
import { getDriveSyncStatus } from './googleDriveService.js';

const log = createLogger('CloudDevService');

export const REPO_ALIASES = {
  rotabus: 'smooth-bus-routes',
  'smooth-bus-routes': 'smooth-bus-routes',
  familiar: 'gestao-familiar-webapp',
  'gestao-familiar': 'gestao-familiar-webapp',
  pladur: 'pladur-pro',
  'pladur-pro': 'pladur-pro',
  matchpro: 'matchpro',
  master: 'telegram-master-bot',
  frotas: 'zeropaper-frota-bot',
  frota: 'zeropaper-frota-bot'
};

export function getGithubConfig() {
  return {
    token: process.env.GITHUB_TOKEN || '',
    owner: process.env.GITHUB_OWNER || 'andre22pinheiro-ui'
  };
}

export function getOctokitClient() {
  const { token } = getGithubConfig();
  if (!token) return null;
  return new Octokit({ auth: token });
}

/**
 * Diagnóstico Cloud-Native (/status_cloud): RAM, Uptime, GitHub API, SQLite WAL e Google Drive.
 */
export async function getCloudStatusReport({ measureNetwork = true } = {}) {
  const mem = process.memoryUsage();
  const rssMb = Math.round((mem.rss / 1024 / 1024) * 10) / 10;
  const heapUsedMb = Math.round((mem.heapUsed / 1024 / 1024) * 10) / 10;
  const heapTotalMb = Math.round((mem.heapTotal / 1024 / 1024) * 10) / 10;
  const uptimeSec = Math.floor(process.uptime());
  const uptimeMin = Math.floor(uptimeSec / 60);

  const sqlT0 = performance.now();
  const dbStats = sqliteMasterDb.getStats();
  const sqlMs = Math.round((performance.now() - sqlT0) * 100) / 100;

  const drive = getDriveSyncStatus();

  let githubPing = 'não testado';
  if (measureNetwork) {
    const netT0 = performance.now();
    try {
      const res = await fetch('https://api.github.com/zen', {
        headers: { 'User-Agent': 'telegram-master-bot' },
        signal: AbortSignal.timeout(4000)
      });
      const netMs = Math.round(performance.now() - netT0);
      githubPing = res.ok ? `${netMs} ms (HTTP ${res.status})` : `HTTP ${res.status} (${netMs} ms)`;
    } catch (err) {
      githubPing = `indisponível (${err.message})`;
    }
  }

  const totalRadar =
    (dbStats.tables.radar_casas || 0) +
    (dbStats.tables.radar_carros || 0) +
    (dbStats.tables.radar_tech || 0) +
    (dbStats.tables.radar_amazon || 0) +
    (dbStats.tables.radar_apple || 0);

  const driveLabel = !drive.configured
    ? '⚪ Sem credenciais'
    : drive.lastSyncOk === true
    ? `🟢 Sincronizado (${drive.lastSyncAt})`
    : drive.lastSyncOk === false
    ? `🔴 Erro: ${drive.lastError}`
    : drive.lastRestoreAt
    ? `🟢 Restaurado no arranque (${drive.lastRestoreAt})`
    : '🟡 Configurado (aguarda ciclo)';

  const renderUrl = process.env.RENDER_EXTERNAL_URL || 'local / não definido';

  return (
    `☁️ *STATUS CLOUD-NATIVE (@AndrePinheirobot)*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `• 🚀 *Runtime:* Node ${process.version} | Uptime: *${uptimeMin} min* (${uptimeSec}s)\n` +
    `• 💾 *RAM Container:* *${rssMb} MB* RSS (Heap: ${heapUsedMb} / ${heapTotalMb} MB)\n` +
    `• 🌐 *Endpoint Render:* \`${renderUrl}\`\n` +
    `• 📡 *Latência GitHub API:* ${githubPing}\n` +
    `• 🗄️ *SQLite WAL (${Object.keys(dbStats.tables).length} tabelas):* ${sqlMs} ms\n` +
    `  - Família: Compras(${dbStats.tables.shopping}) Tarefas(${dbStats.tables.tasks}) Carolina(${dbStats.tables.baby_logs}) Lembretes(${dbStats.tables.reminders})\n` +
    `  - Radar 5 Frentes: ${totalRadar} anúncios | Filtros(${dbStats.tables.radar_filtros}) | Receitas(${dbStats.tables.saved_recipes})\n` +
    `• ☁️ *Google Drive Write-Through (5s + 15m):* ${driveLabel}\n` +
    `• 🧠 *Cascata IA:* \`temperature: 0.0\` (Gemini ➔ Groq ➔ OpenRouter)\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `✅ _Arquitetura 100% Cloud-Native (zero dependência de PC local)._`
  );
}

/**
 * Consulta repositórios GitHub do utilizador na nuvem.
 */
export async function listGithubRepos({ octokitClient = null } = {}) {
  const octokit = octokitClient || getOctokitClient();
  if (!octokit) {
    return '⚠️ `GITHUB_TOKEN` não configurado no ambiente para listar repositórios.';
  }
  try {
    const { data } = await octokit.rest.repos.listForAuthenticatedUser({
      per_page: 12,
      sort: 'updated'
    });
    const list = data.map((r) => `• [${r.name}](${r.html_url}) — ${r.description || 'sem descrição'}`).join('\n');
    return `📂 *Repositórios GitHub na Nuvem (${data.length}):*\n\n${list}\n\n💡 _Compilar APK Cloud:_ \`/compilar <repo>\` | _Novo repo:_ \`/criar_app <nome>\``;
  } catch (err) {
    log.error('GitHub API falhou:', err.message);
    return `⚠️ Erro na API GitHub: ${err.message}`;
  }
}

/**
 * Cria repositório GitHub + aciona deploy Vercel Hook se configurado.
 */
export async function createCloudRepoAndDeploy(args, { octokitClient = null } = {}) {
  const cleanArgs = String(args || '').trim();
  if (cleanArgs.length < 2) {
    return (
      `📝 *Criar Repositório & App na Nuvem*\n\n` +
      `Formato: \`/criar_app <nome-repo> [descrição]\`\n` +
      `Exemplo: \`/criar_app notas-familia Gestor familiar Next.js\``
    );
  }
  const octokit = octokitClient || getOctokitClient();
  if (!octokit) {
    return '⚠️ `GITHUB_TOKEN` não configurado para criar repositórios no GitHub.';
  }

  const parts = cleanArgs.split(/\s+/);
  const name = parts[0].replace(/[^a-zA-Z0-9_-]/g, '-');
  const description = parts.slice(1).join(' ') || 'Projeto criado via Grok Bot Cloud (@AndrePinheirobot)';

  try {
    const { data } = await octokit.rest.repos.createForAuthenticatedUser({
      name,
      description,
      private: false,
      auto_init: true
    });

    let vercelNote = 'Liga este repositório na consola Vercel para deploy automático contínuo.';
    const vercelHook = process.env.VERCEL_DEPLOY_HOOK_URL;
    if (vercelHook) {
      try {
        const hookRes = await fetch(vercelHook, { method: 'POST', signal: AbortSignal.timeout(6000) });
        if (hookRes.ok) {
          vercelNote = 'Webhook Vercel acionado na nuvem com sucesso.';
        }
      } catch {}
    }

    return (
      `✅ *Repositório criado 100% na Nuvem!*\n\n` +
      `📦 *Nome:* \`${data.name}\`\n` +
      `🔗 *URL GitHub:* ${data.html_url}\n` +
      `☁️ *Deploy:* ${vercelNote}`
    );
  } catch (err) {
    return `❌ Erro ao criar repositório GitHub: ${err.response?.data?.message || err.message}`;
  }
}

/**
 * Monitorização assíncrona opcional da conclusão do workflow GitHub Actions.
 */
function watchGithubRunCompletion({ octokit, owner, repo, workflowId, baselineRunId, onBuildComplete }) {
  if (typeof onBuildComplete !== 'function' || !octokit?.rest?.actions?.listWorkflowRuns) return;
  let attempts = 0;
  const maxAttempts = 12; // ~6 minutos máx.
  const timer = setInterval(async () => {
    attempts++;
    try {
      const runs = await octokit.rest.actions.listWorkflowRuns({
        owner,
        repo,
        workflow_id: workflowId,
        per_page: 3
      });
      const targetRun = (runs.data?.workflow_runs || []).find((r) => !baselineRunId || r.id !== baselineRunId) || runs.data?.workflow_runs?.[0];
      if (targetRun && targetRun.status === 'completed') {
        clearInterval(timer);
        await onBuildComplete({
          owner,
          repo,
          conclusion: targetRun.conclusion || 'completed',
          htmlUrl: targetRun.html_url,
          runId: targetRun.id
        });
        return;
      }
    } catch {}
    if (attempts >= maxAttempts) {
      clearInterval(timer);
    }
  }, 30000);
  timer.unref();
}

/**
 * Dispara compilação remota GitHub Actions (/compilar <repo> [workflow] [branch]).
 */
export async function dispatchGithubBuild(rawArgs = '', { octokitClient = null, onBuildComplete = null } = {}) {
  const trimmed = String(rawArgs || '').trim();
  if (!trimmed) {
    return (
      `⚙️ *COMPILAR APK NA NUVEM (GitHub Actions)*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `Uso: \`/compilar <repositório> [workflow_file] [branch]\`\n` +
      `Exemplos:\n` +
      `• \`/compilar smooth-bus-routes\`\n` +
      `• \`/compilar appfrota android-apk.yml main\``
    );
  }

  const parts = trimmed.split(/\s+/);
  const rawProject = parts[0];
  const explicitWf = parts[1] || '';
  const explicitRef = parts[2] || '';

  const { owner } = getGithubConfig();
  const repo = REPO_ALIASES[rawProject.toLowerCase()] || rawProject.replace(/[^a-zA-Z0-9_.-]/g, '');

  const octokit = octokitClient || getOctokitClient();
  if (!octokit) {
    return (
      `⚠️ \`GITHUB_TOKEN\` não configurado no Render.\n` +
      `Configura \`GITHUB_TOKEN\` nas variáveis de ambiente para acionar compilações via GitHub Actions em \`${owner}/${repo}\`.`
    );
  }

  try {
    const repoRes = await octokit.rest.repos.get({ owner, repo });
    const ref = explicitRef || repoRes.data?.default_branch || 'main';

    const wfRes = await octokit.rest.actions.listRepoWorkflows({ owner, repo });
    const workflows = wfRes.data?.workflows || [];

    if (workflows.length === 0) {
      return (
        `⚠️ O repositório [${owner}/${repo}](https://github.com/${owner}/${repo}) ainda não tem workflows em \`.github/workflows/\`.\n` +
        `Adiciona um workflow \`android-apk.yml\` com trigger \`workflow_dispatch:\` para compilar APKs na nuvem.`
      );
    }

    const chosen =
      (explicitWf && workflows.find((w) => String(w.id) === explicitWf || w.path.endsWith(explicitWf) || w.name.toLowerCase().includes(explicitWf.toLowerCase()))) ||
      workflows.find((w) => /(android|apk|flutter|build|release)/i.test(`${w.name} ${w.path}`)) ||
      workflows[0];

    const workflowId = chosen.id || chosen.path.split('/').pop();
    let baselineRunId = null;
    try {
      const preRuns = await octokit.rest.actions.listWorkflowRuns({ owner, repo, workflow_id: workflowId, per_page: 1 });
      baselineRunId = preRuns.data?.workflow_runs?.[0]?.id || null;
    } catch {}

    await octokit.rest.actions.createWorkflowDispatch({
      owner,
      repo,
      workflow_id: workflowId,
      ref
    });

    const actionsUrl = `https://github.com/${owner}/${repo}/actions`;
    let latestRunUrl = actionsUrl;
    try {
      const runs = await octokit.rest.actions.listWorkflowRuns({
        owner,
        repo,
        workflow_id: workflowId,
        per_page: 1
      });
      if (runs.data?.workflow_runs?.[0]?.html_url) {
        latestRunUrl = runs.data.workflow_runs[0].html_url;
      }
    } catch {}

    if (typeof onBuildComplete === 'function') {
      watchGithubRunCompletion({ octokit, owner, repo, workflowId, baselineRunId, onBuildComplete });
    }

    return (
      `🚀 *BUILD ANDROID/CLOUD DISPARADA NO GITHUB ACTIONS!*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📦 *Repositório:* \`${owner}/${repo}\`\n` +
      `⚙️ *Workflow:* \`${chosen.name}\` (\`${chosen.path}\`)\n` +
      `🌿 *Branch:* \`${ref}\`\n` +
      `🔗 *Acompanhar Build & Artefacto APK:* ${actionsUrl}\n` +
      `${latestRunUrl !== actionsUrl ? `📌 *Última execução registada:* ${latestRunUrl}\n` : ''}` +
      `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `☁️ _Executado 100% nos servidores GitHub Actions (zero PC local)._`
    );
  } catch (err) {
    log.error('Erro ao disparar workflow GitHub Actions:', err.message);
    return `❌ Erro no GitHub Actions para \`${owner}/${repo}\`: ${err.response?.data?.message || err.message}`;
  }
}

/**
 * Consulta catálogo de Mini Apps + estado em tempo real na Vercel API quando VERCEL_TOKEN existir.
 */
export async function listVercelAppsOrDeployments() {
  let base = formatAllVercelAppsMarkdown();
  const vercelToken = process.env.VERCEL_TOKEN || '';
  if (!vercelToken) return base;

  try {
    const res = await fetch('https://api.vercel.com/v6/deployments?limit=4', {
      headers: { Authorization: `Bearer ${vercelToken}` },
      signal: AbortSignal.timeout(4500)
    });
    if (res.ok) {
      const data = await res.json();
      const deployments = data.deployments || [];
      if (deployments.length > 0) {
        base += `\n\n☁️ *Últimos Deployments Vercel (Ao Vivo):*\n`;
        for (const d of deployments) {
          base += `• \`${d.name}\` — *${d.state || d.readyState}* (https://${d.url})\n`;
        }
      }
    }
  } catch (err) {
    log.warn(`Vercel API indisponível: ${err.message}`);
  }
  return base;
}

export default {
  REPO_ALIASES,
  getGithubConfig,
  getOctokitClient,
  getCloudStatusReport,
  listGithubRepos,
  createCloudRepoAndDeploy,
  dispatchGithubBuild,
  listVercelAppsOrDeployments
};
