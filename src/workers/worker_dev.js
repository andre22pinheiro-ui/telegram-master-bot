// src/workers/worker_dev.js — Engenharia DevOps 100% Cloud-Native (GitHub Octokit + GitHub Actions + Vercel + Render)
import { performance } from 'perf_hooks';
import { Octokit } from '@octokit/rest';
import { createLogger } from '../utils/logger.js';
import { formatAllVercelAppsMarkdown } from '../shared/appsCatalog.js';
import { sqliteMasterDb } from '../shared/sqliteMasterDb.js';
import { getDriveSyncStatus } from '../services/googleDriveService.js';
import { askAgent } from '../services/reasoningService.js';

const log = createLogger('WorkerDevCloud');

const REPO_ALIASES = {
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

function getOctokitClient() {
  const { token } = getGithubConfig();
  if (!token) return null;
  return new Octokit({ auth: token });
}

// ─── 1. /status_cloud (Métricas Render + SQLite WAL + Google Drive + Latência) ─

export async function handleStatusCloud({ measureNetwork = true } = {}) {
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

// ─── 2. /projetos & /criar_app (GitHub Octokit + Vercel API) ──────────────────

async function handleProjetos() {
  const octokit = getOctokitClient();
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

async function handleCriarApp(args) {
  const cleanArgs = String(args || '').trim();
  if (cleanArgs.length < 2) {
    return (
      `📝 *Criar Repositório & App na Nuvem*\n\n` +
      `Formato: \`/criar_app <nome-repo> [descrição]\`\n` +
      `Exemplo: \`/criar_app notas-familia Gestor familiar Next.js\``
    );
  }
  const octokit = getOctokitClient();
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

// ─── 3. /compilar <projeto> (GitHub Actions Workflow Dispatch APK/Flutter) ─────

export async function handleCompilarCloud(rawArgs = '', { octokitClient = null } = {}) {
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

    await octokit.rest.actions.createWorkflowDispatch({
      owner,
      repo,
      workflow_id: chosen.id || chosen.path.split('/').pop(),
      ref
    });

    const actionsUrl = `https://github.com/${owner}/${repo}/actions`;
    let latestRunUrl = actionsUrl;
    try {
      const runs = await octokit.rest.actions.listWorkflowRuns({
        owner,
        repo,
        workflow_id: chosen.id || chosen.path.split('/').pop(),
        per_page: 1
      });
      if (runs.data?.workflow_runs?.[0]?.html_url) {
        latestRunUrl = runs.data.workflow_runs[0].html_url;
      }
    } catch {}

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

// ─── 4. /apps & /apks ────────────────────────────────────────────────────────

function handleApps() {
  return formatAllVercelAppsMarkdown();
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

// ─── Dispatcher Principal ────────────────────────────────────────────────────

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

  const compilarCmdMatch = trimmed.match(/^\/(?:compilar|build)\s*(.*)$/i);
  if (compilarCmdMatch) {
    return await handleCompilarCloud(compilarCmdMatch[1]);
  }
  const natCompileMatch = trimmed.match(/\b(?:compilar?|gerar?\s+o?\s*apk(?:\s+do)?)\s+([a-zA-Z0-9_.-]+)/i);
  if (natCompileMatch) {
    return await handleCompilarCloud(natCompileMatch[1]);
  }

  if (/^\/(projetos?|github|repos?)\b/i.test(lower)) return await handleProjetos();
  if (/^\/criar_app\b/i.test(lower)) return await handleCriarApp(trimmed.replace(/^\/criar_app\s*/i, ''));
  if (/^\/(apps?|links?|catalogo|catalogo_apps|vercel)\b/i.test(lower)) return handleApps();
  if (/^\/(apks?|download_apk|android)\b/i.test(lower)) return handleApks();

  return await handleCode(trimmed, chatId);
}

export default {
  handle,
  handleStatusCloud,
  handleCompilarCloud
};
