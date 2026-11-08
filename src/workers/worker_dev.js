// src/workers/worker_dev.js — Módulo de Desenvolvimento, GitHub, Vercel e Cloud
import axios from 'axios';
import { createLogger } from '../utils/logger.js';
import { VERCEL_APPS, formatAllVercelAppsMarkdown } from '../shared/appsCatalog.js';

const log = createLogger('WorkerDev');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

// ─── Helpers ────────────────────────────────────────────────────────────────

async function askGemini(prompt) {
  if (!GEMINI_API_KEY) return null;
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`;
    const res = await axios.post(url, {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 1024 },
    }, { timeout: 15000 });
    return res.data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch (err) {
    log.error('Gemini API falhou', err.message);
    return null;
  }
}

async function listGithubRepos() {
  if (!GITHUB_TOKEN) return null;
  try {
    const res = await axios.get('https://api.github.com/user/repos?per_page=12&sort=updated', {
      headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' },
      timeout: 10000,
    });
    return res.data.map(r => `• [${r.name}](${r.html_url}) — ${r.description || 'sem descrição'}`).join('\n');
  } catch (err) {
    log.error('GitHub API falhou', err.message);
    return null;
  }
}

async function createGithubRepo(name, description = '') {
  if (!GITHUB_TOKEN) return { error: 'GITHUB_TOKEN não configurado no .env' };
  try {
    const res = await axios.post('https://api.github.com/user/repos', {
      name, description, private: false, auto_init: true,
    }, {
      headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' },
      timeout: 10000,
    });
    return { url: res.data.html_url, clone: res.data.clone_url };
  } catch (err) {
    const msg = err.response?.data?.message || err.message;
    return { error: msg };
  }
}

// ─── Handlers de Comandos ────────────────────────────────────────────────────

async function handleProjetos() {
  const repos = await listGithubRepos();
  if (!repos) return '⚠️ Não consegui aceder ao GitHub. Verifica o `GITHUB_TOKEN` no `.env`.';
  return `📂 *Últimos Repositórios GitHub:*\n\n${repos}\n\n_Dica: Usa \`/criar_app Nome\` para iniciar um novo repo!_`;
}

async function handleCriarApp(args) {
  if (!args || args.trim().length < 2) {
    return '📝 *Criar Novo Repositório GitHub*\n\nFormato:\n`/criar_app NomeDoProjeto Descrição`\n\nExemplo:\n`/criar_app nova-dashboard Sistema de métricas web`';
  }
  const parts = args.trim().split(' ');
  const name = parts[0].replace(/[^a-zA-Z0-9_-]/g, '-');
  const description = parts.slice(1).join(' ') || 'Projeto criado via Telegram Bot';

  const result = await createGithubRepo(name, description);
  if (result.error) return `❌ Erro ao criar repositório: ${result.error}`;

  return `✅ *Repositório criado no GitHub!*\n\n📦 Nome: \`${name}\`\n🔗 URL: ${result.url}\n📋 Clone: \`git clone ${result.clone}\`\n\n_Para deploy: liga o repo na consola Vercel ou Render._`;
}

function handleApps() {
  return formatAllVercelAppsMarkdown();
}

function handleApks() {
  return (
    `📲 *Distribuição de Ficheiros APK Compilados:*\n\n` +
    `🚌 *RotaBus (Navegação Pesados & Conforto VIP)*\n` +
    `• Versão: v1.0.0 (Anti-Sinuosidade & Tacógrafo)\n` +
    `• Arquiteturas: ARM64-v8a + ARMv7 (Android Nativo)\n` +
    `• Link Direto: [https://smooth-bus-routes.vercel.app/rotabus.apk](https://smooth-bus-routes.vercel.app/rotabus.apk)\n` +
    `• Atalho: [https://smooth-bus-routes.vercel.app/apk](https://smooth-bus-routes.vercel.app/apk)\n\n` +
    `_Basta tocar no link no telemóvel para instalar diretamente!_`
  );
}

async function handleCode(userMessage) {
  const prompt = `Responde em Português de Portugal como um Engenheiro de Software Senior e Arquiteto Cloud. Pergunta:\n${userMessage}\n\nResponde de forma clara, usando blocos de código markdown quando apropriado.`;
  const answer = await askGemini(prompt);
  if (!answer) return '⚠️ Assistente de código temporariamente indisponível. Configura `GEMINI_API_KEY`.';
  return `💻 *Engenharia de Software & Cloud:*\n\n${answer}`;
}

// ─── Dispatcher Principal ────────────────────────────────────────────────────

export async function handle(text) {
  log.info('Processando pedido DEV', { text: text.substring(0, 60) });
  const lower = text.trim().toLowerCase();

  if (/^\/(projetos?|github|repos?)\b/.test(lower)) return handleProjetos();
  if (/^\/criar_app/.test(lower)) return handleCriarApp(text.replace(/^\/criar_app\s*/i, ''));
  if (/^\/(apps?|links?|catalogo|catalogo_apps|vercel)\b/.test(lower)) return handleApps();
  if (/^\/(apks?|download_apk|android)\b/.test(lower)) return handleApks();

  return handleCode(text);
}

export default { handle };
