// src/workers/worker_geral.js — Assistente Pessoal (Notas, Compras, Briefing)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { createLogger } from '../utils/logger.js';

const log = createLogger('WorkerGeral');

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../../data');
const DATA_FILE = join(DATA_DIR, 'geral_data.json');
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

// ─── Persistência JSON ───────────────────────────────────────────────────────

function loadData() {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    if (!existsSync(DATA_FILE)) {
      writeFileSync(DATA_FILE, JSON.stringify({ compras: [], notas: [], tarefas: [] }, null, 2));
    }
    return JSON.parse(readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return { compras: [], notas: [], tarefas: [] };
  }
}

function saveData(data) {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (err) {
    log.error('Erro ao guardar dados', err.message);
    return false;
  }
}

// ─── Helpers de Formatação ───────────────────────────────────────────────────

function dataHora() {
  return new Date().toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon', hour12: false });
}

// ─── Handlers de Compras ─────────────────────────────────────────────────────

function handleCompras(args, subCmd) {
  const data = loadData();

  if (subCmd === 'ver' || (!args && subCmd !== 'limpar')) {
    if (data.compras.length === 0) return '🛒 A lista de compras está vazia.\n\nAdiciona com: `/compras adicionar leite`';
    const lista = data.compras.map((item, i) => `${i + 1}. ${item.checked ? '✅' : '☐'} ${item.nome}`).join('\n');
    return `🛒 *Lista de Compras:*\n\n${lista}\n\n_Total: ${data.compras.length} items_`;
  }

  if (subCmd === 'adicionar' && args) {
    const items = args.split(',').map(s => s.trim()).filter(Boolean);
    items.forEach(nome => data.compras.push({ nome, checked: false, adicionado: dataHora() }));
    saveData(data);
    return `✅ Adicionado à lista: *${items.join(', ')}*\n\nTotal: ${data.compras.length} items`;
  }

  if (subCmd === 'remover' && args) {
    const idx = parseInt(args) - 1;
    if (isNaN(idx) || idx < 0 || idx >= data.compras.length) return '❌ Número inválido. Vê a lista com `/compras`';
    const removed = data.compras.splice(idx, 1)[0];
    saveData(data);
    return `🗑️ Removido: *${removed.nome}*`;
  }

  if (subCmd === 'check' && args) {
    const idx = parseInt(args) - 1;
    if (!isNaN(idx) && idx >= 0 && idx < data.compras.length) {
      data.compras[idx].checked = !data.compras[idx].checked;
      saveData(data);
      const icon = data.compras[idx].checked ? '✅' : '☐';
      return `${icon} *${data.compras[idx].nome}* marcado como ${data.compras[idx].checked ? 'comprado' : 'por comprar'}`;
    }
  }

  if (subCmd === 'limpar') {
    data.compras = [];
    saveData(data);
    return '🗑️ Lista de compras apagada.';
  }

  return `🛒 *Lista de Compras*\n\nComandos:\n• \`/compras\` — ver lista\n• \`/compras adicionar leite, pão\` — adicionar\n• \`/compras remover 2\` — remover item nº2\n• \`/compras check 1\` — marcar como comprado\n• \`/compras limpar\` — apagar tudo`;
}

// ─── Handlers de Notas ───────────────────────────────────────────────────────

function handleNotas(args, subCmd) {
  const data = loadData();

  if (subCmd === 'ver' || (!args && subCmd !== 'limpar')) {
    if (data.notas.length === 0) return '📝 Sem notas guardadas.\n\nAdiciona com: `/nota Texto da nota`';
    const lista = data.notas.map((n, i) => `*${i + 1}.* ${n.texto}\n   _${n.data}_`).join('\n\n');
    return `📝 *Notas:*\n\n${lista}`;
  }

  if (args) {
    // Adicionar nota
    data.notas.push({ texto: args, data: dataHora() });
    saveData(data);
    return `📝 Nota guardada:\n*"${args}"*`;
  }

  if (subCmd === 'limpar') {
    data.notas = [];
    saveData(data);
    return '🗑️ Todas as notas apagadas.';
  }

  return `📝 *Notas*\n\nUso:\n• \`/nota Texto aqui\` — guardar nota\n• \`/notas\` — ver todas\n• \`/nota limpar\` — apagar tudo`;
}

// ─── Handlers de Tarefas ─────────────────────────────────────────────────────

function handleTarefa(args, subCmd) {
  const data = loadData();

  if (subCmd === 'ver' || (!args && subCmd !== 'limpar')) {
    const pendentes = data.tarefas.filter(t => !t.feita);
    const feitas = data.tarefas.filter(t => t.feita);
    if (data.tarefas.length === 0) return '✅ Sem tarefas. Adiciona com: `/tarefa Descrição da tarefa`';
    let resposta = `✅ *Tarefas:*\n\n`;
    if (pendentes.length) resposta += `*Pendentes:*\n${pendentes.map((t, i) => `${i + 1}. ☐ ${t.texto}`).join('\n')}\n\n`;
    if (feitas.length) resposta += `*Concluídas:*\n${feitas.map(t => `✅ ~~${t.texto}~~`).join('\n')}`;
    return resposta;
  }

  if (args && subCmd !== 'limpar') {
    data.tarefas.push({ texto: args, feita: false, criada: dataHora() });
    saveData(data);
    return `✅ Tarefa adicionada: *"${args}"*`;
  }

  if (subCmd === 'limpar') {
    data.tarefas = data.tarefas.filter(t => !t.feita);
    saveData(data);
    return '🗑️ Tarefas concluídas removidas.';
  }

  return `✅ *Tarefas*\n\nUso:\n• \`/tarefa Descrição\` — adicionar tarefa\n• \`/tarefas\` — ver lista\n• \`/tarefa limpar\` — remover concluídas`;
}

// ─── Briefing Diário ─────────────────────────────────────────────────────────

async function handleBriefing() {
  const data = loadData();
  const agora = dataHora();

  const comprasPendentes = data.compras.filter(c => !c.checked).length;
  const tarefasPendentes = data.tarefas.filter(t => !t.feita).length;
  const totalNotas = data.notas.length;

  let briefing = `☀️ *Briefing Diário — ${agora}*\n\n`;
  briefing += `📋 **Resumo:**\n`;
  briefing += `• 🛒 Compras por fazer: **${comprasPendentes}** items\n`;
  briefing += `• ✅ Tarefas pendentes: **${tarefasPendentes}**\n`;
  briefing += `• 📝 Notas guardadas: **${totalNotas}**\n`;

  if (tarefasPendentes > 0) {
    const primeiras = data.tarefas.filter(t => !t.feita).slice(0, 3);
    briefing += `\n*Próximas Tarefas:*\n${primeiras.map(t => `• ${t.texto}`).join('\n')}`;
  }

  if (comprasPendentes > 0) {
    const primeiras = data.compras.filter(c => !c.checked).slice(0, 5);
    briefing += `\n\n*Lista de Compras (top 5):*\n${primeiras.map(c => `• ${c.nome}`).join('\n')}`;
  }

  // Adiciona análise do Gemini se disponível
  if (GEMINI_API_KEY && (tarefasPendentes > 0 || comprasPendentes > 0)) {
    try {
      const contexto = `Tarefas pendentes: ${data.tarefas.filter(t => !t.feita).map(t => t.texto).join(', ')}`;
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`;
      const res = await axios.post(url, {
        contents: [{ parts: [{ text: `Em 2 frases, dá uma dica motivacional de produtividade para alguém com estas tarefas pendentes: ${contexto}` }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 100 },
      }, { timeout: 8000 });
      const dica = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (dica) briefing += `\n\n💡 *Dica do dia:* ${dica}`;
    } catch { /* silencioso */ }
  }

  return briefing;
}

// ─── Dispatcher ──────────────────────────────────────────────────────────────

export async function handle(text) {
  log.info('Processando pedido GERAL', { text: text.substring(0, 60) });

  const trimmed = text.trim();

  // Briefing
  if (/^\/(briefing|resumo|dia)\b/i.test(trimmed)) return handleBriefing();

  // Compras
  if (/^\/(compras?)\b/i.test(trimmed)) {
    const resto = trimmed.replace(/^\/(compras?)\s*/i, '').trim();
    const parts = resto.split(/\s+/);
    const subCmd = parts[0]?.toLowerCase() || '';
    const args = parts.slice(1).join(' ').trim() || (subCmd !== 'ver' && subCmd !== 'limpar' && subCmd !== 'check' && subCmd !== 'remover' ? subCmd : '');
    return handleCompras(args, subCmd);
  }

  // Notas
  if (/^\/(nota|notas)\b/i.test(trimmed)) {
    const cmd = trimmed.match(/^\/(nota|notas)/i)[0].replace('/', '');
    const args = trimmed.replace(/^\/(nota|notas)\s*/i, '').trim();
    const isVer = cmd === 'notas' || args === 'ver' || args === '';
    return handleNotas(isVer ? '' : args, isVer ? 'ver' : args.split(/\s+/)[0]);
  }

  // Tarefas
  if (/^\/(tarefa|tarefas)\b/i.test(trimmed)) {
    const cmd = trimmed.match(/^\/(tarefa|tarefas)/i)[0].replace('/', '');
    const args = trimmed.replace(/^\/(tarefa|tarefas)\s*/i, '').trim();
    const isVer = cmd === 'tarefas' || args === '';
    return handleTarefa(isVer ? '' : args, isVer ? 'ver' : args.split(/\s+/)[0]);
  }

  // Lembrete (simples — guarda como nota)
  if (/^\/(lembrete)\s+/i.test(trimmed)) {
    const args = trimmed.replace(/^\/lembrete\s+/i, '').trim();
    const data = loadData();
    data.notas.push({ texto: `🔔 LEMBRETE: ${args}`, data: dataHora() });
    saveData(data);
    return `🔔 Lembrete guardado:\n*"${args}"*`;
  }

  // Fallback: menu de ajuda
  return `🤖 *Assistente Pessoal*\n\nComandos disponíveis:\n\n🛒 \`/compras\` — Lista de compras\n📝 \`/nota Texto\` — Guardar nota\n✅ \`/tarefa Descrição\` — Adicionar tarefa\n🔔 \`/lembrete Texto\` — Guardar lembrete\n☀️ \`/briefing\` — Resumo do dia`;
}

export default { handle };

