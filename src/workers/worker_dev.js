// src/workers/worker_dev.js — Módulo de Desenvolvimento (GitHub + Vercel)
import axios from 'axios';
import { createLogger } from '../utils/logger.js';

const log = createLogger('WorkerDev');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const VERCEL_TOKEN = process.env.VERCEL_TOKEN || '';
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
    const res = await axios.get('https://api.github.com/user/repos?per_page=10&sort=updated', {
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
  return `📂 *Últimos Repositórios GitHub:*\n\n${repos}`;
}

async function handleCriarApp(args) {
  if (!args || args.trim().length < 2) {
    return '📝 *Criar App*\n\nUsa o formato:\n`/criar_app NomeDoProjeto Descrição opcional`\n\nExemplo:\n`/criar_app meu-site Landing page pessoal`';
  }
  const parts = args.trim().split(' ');
  const name = parts[0].replace(/[^a-zA-Z0-9_-]/g, '-');
  const description = parts.slice(1).join(' ') || 'Projeto criado via Telegram Bot';

  const result = await createGithubRepo(name, description);
  if (result.error) return `❌ Erro ao criar repositório: ${result.error}`;

  return `✅ *Repositório criado com sucesso!*\n\n📦 Nome: \`${name}\`\n🔗 URL: ${result.url}\n📋 Clone: \`git clone ${result.clone}\`\n\n_Deploy no Vercel: faz push e liga o repo em vercel.com_`;
}

async function handleCode(userMessage) {
  const prompt = `Responde em Português de Portugal. ${userMessage}\n\nSe for código, usa blocos de código markdown. Resposta concisa e prática.`;
  const answer = await askGemini(prompt);
  if (!answer) return '⚠️ Gemini indisponível. Configura `GEMINI_API_KEY` no `.env`.';
  return `🤖 *Assistente Dev:*\n\n${answer}`;
}

// ─── Dispatcher Principal ────────────────────────────────────────────────────

/**
 * Processa uma mensagem do utilizador no contexto DEV.
 * @param {string} text - Mensagem completa
 * @returns {Promise<string>} Resposta formatada
 */
export async function handle(text) {
  log.info('Processando pedido DEV', { text: text.substring(0, 60) });

  const lower = text.trim().toLowerCase();

  if (/^\/(projetos?|github)/.test(lower)) return handleProjetos();
  if (/^\/criar_app/.test(lower)) return handleCriarApp(text.replace(/^\/criar_app\s*/i, ''));

  // Qualquer outra coisa do domínio dev → Gemini
  return handleCode(text);
}

export default { handle };

