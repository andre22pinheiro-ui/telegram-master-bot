// src/workers/worker_geral.js — Assistente Pessoal & Mini App Família sincronizada
import axios from 'axios';
import { familyDb } from '../shared/familyDb.js';
import { createLogger } from '../utils/logger.js';
import { askAgent } from '../services/reasoningService.js';

const log = createLogger('WorkerGeral');
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

function dataHora() {
  return new Date().toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon', hour12: false });
}

// ─── Compras ─────────────────────────────────────────────────────────────────

function handleCompras(args, subCmd) {
  const shopping = familyDb.getShopping();

  if (subCmd === 'ver' || (!args && subCmd !== 'limpar')) {
    if (shopping.length === 0) {
      return '🛒 A lista de compras está vazia.\n\nAdiciona com: `/compras adicionar Leite, Pão` ou toca no botão da Mini App!';
    }
    const lista = shopping.map((item, i) => `${i + 1}. ${item.completed ? '✅ ~~' + item.item_text + '~~' : '☐ *' + item.item_text + '*'} _(${item.category})_`).join('\n');
    const pendentes = shopping.filter(i => !i.completed).length;
    return `🛒 *Lista de Compras Sincronizada:*\n\n${lista}\n\n_Total: ${shopping.length} items (${pendentes} pendentes)_\n\n📱 _Também acessível na Mini App Família_`;
  }

  if (subCmd === 'adicionar' && args) {
    const items = args.split(',').map(s => s.trim()).filter(Boolean);
    const criados = items.map(nome => familyDb.addShopping(nome, 'geral', { first_name: 'André' }));
    return `✅ Adicionado à lista de compras: *${items.join(', ')}*\n\nTotal na lista: ${familyDb.getShopping().length} items`;
  }

  if (subCmd === 'remover' && args) {
    const idx = parseInt(args) - 1;
    if (isNaN(idx) || idx < 0 || idx >= shopping.length) {
      return '❌ Número inválido. Consulta a lista com `/compras`';
    }
    const item = shopping[idx];
    familyDb.deleteShopping(item.id);
    return `🗑️ Removido das compras: *${item.item_text}*`;
  }

  if (subCmd === 'check' && args) {
    const idx = parseInt(args) - 1;
    if (!isNaN(idx) && idx >= 0 && idx < shopping.length) {
      const item = shopping[idx];
      familyDb.toggleShopping(item.id, !item.completed);
      const icon = !item.completed ? '✅' : '☐';
      return `${icon} *${item.item_text}* marcado como ${!item.completed ? 'comprado' : 'por comprar'}`;
    }
    return '❌ Número inválido. Ex: `/compras check 1`';
  }

  if (subCmd === 'limpar') {
    familyDb.clearCompletedShopping();
    return '🗑️ Compras concluídas foram removidas com sucesso.';
  }

  return `🛒 *Gestão de Compras Família*\n\n• \`/compras\` — Ver lista\n• \`/compras adicionar leite, pão\` — Adicionar\n• \`/compras check 1\` — Marcar como comprado\n• \`/compras remover 2\` — Apagar item\n• \`/compras limpar\` — Limpar comprados`;
}

// ─── Tarefas ─────────────────────────────────────────────────────────────────

function handleTarefas(args, subCmd) {
  const tasks = familyDb.getTasks();

  if (subCmd === 'ver' || (!args && subCmd !== 'limpar')) {
    if (tasks.length === 0) return '📋 Sem tarefas registadas.\n\nAdiciona com: `/tarefa Comprar bilhetes`';
    const pendentes = tasks.filter(t => !t.completed);
    const feitas = tasks.filter(t => t.completed);

    let txt = `📋 *Tarefas Domésticas & Pessoais:*\n\n`;
    if (pendentes.length > 0) {
      txt += `*Pendentes:*\n` + pendentes.map((t, i) => `${i + 1}. ☐ *${t.title}* _(resp: ${t.assigned_to})_`).join('\n') + `\n\n`;
    }
    if (feitas.length > 0) {
      txt += `*Concluídas:*\n` + feitas.map(t => `✅ ~~${t.title}~~`).join('\n');
    }
    return txt;
  }

  if (args && subCmd !== 'limpar') {
    const task = familyDb.addTask(args, 'André', { first_name: 'André' });
    return `✅ Tarefa adicionada: *"${task.title}"*\n\nSincronizada com a Mini App Família.`;
  }

  return `📋 *Tarefas*\n\n• \`/tarefas\` — Ver lista\n• \`/tarefa Descrição\` — Adicionar nova\n• \`/tarefas check 1\` — Concluir tarefa`;
}

// ─── Carolina (Escola, Faltas, Consultas, Actividades) ──────────────────────

function handleCarolina(args) {
  const logs = familyDb.getBabyLogs();

  if (!args || args.trim().length === 0) {
    if (logs.length === 0) {
      return `👧 *Carolina — Registo Escolar e Saúde*\n\nSem registos recentes.\n\nPara registar:\n\`/carolina falta Constipação e febre\`\n\`/carolina consulta Pediatra Dr. Ramos às 15h\`\n\`/carolina actividade Festa de anos da Maria\``;
    }

    const linhas = logs.slice(0, 8).map(l => {
      let icon = '🏫';
      if (l.event_type.includes('activid') || l.event_type.includes('arte')) icon = '🎨';
      if (l.event_type.includes('consult') || l.event_type.includes('saude') || l.event_type.includes('med')) icon = '🩺';
      const dataStr = new Date(l.logged_time).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      return `${icon} *[${l.event_type.toUpperCase()}]* ${l.details}\n   _${dataStr} por ${l.created_by_name}_`;
    }).join('\n\n');

    return `👧 *Carolina — Últimos Registos:*\n\n${linhas}\n\n📱 _Visualização completa e botões rápidos na Mini App Família!_`;
  }

  const parts = args.trim().split(/\s+/);
  const tipo = parts[0].toLowerCase();
  const detalhes = parts.slice(1).join(' ') || tipo;
  let eventType = 'actividades';
  if (/falta|atraso|escola/.test(tipo)) eventType = 'faltas';
  else if (/consulta|medico|médico|pediatra|saude|saúde/.test(tipo)) eventType = 'consultas';

  const criado = familyDb.addBabyLog(eventType, detalhes, '', { first_name: 'André' });
  return `👧 *Registo da Carolina Guardado!*\n\nTipo: \`${criado.event_type}\`\nDetalhes: *${criado.details}*\nData: _${dataHora()}_\n\nSincronizado automaticamente com a Mini App Família.`;
}

// ─── Notas ───────────────────────────────────────────────────────────────────

function handleNotas(args) {
  const notes = familyDb.getNotes();

  if (!args || args.trim().length === 0) {
    if (notes.length === 0) return '📝 Sem notas guardadas.\n\nAdiciona com: `/nota Ideia nova`';
    const lista = notes.slice(0, 10).map((n, i) => `*${i + 1}.* *${n.title}*: ${n.content}`).join('\n\n');
    return `📝 *Notas Rápidas:*\n\n${lista}`;
  }

  const nota = familyDb.addNote('Nota Rápida', args, 'blue', { first_name: 'André' });
  return `📝 Nota guardada com sucesso:\n*"${nota.content}"*`;
}

// ─── Briefing Diário Integrado ──────────────────────────────────────────────

async function handleBriefing() {
  const shopping = familyDb.getShopping();
  const tasks = familyDb.getTasks();
  const carolinaLogs = familyDb.getBabyLogs();
  const agora = dataHora();

  const comprasPendentes = shopping.filter(c => !c.completed);
  const tarefasPendentes = tasks.filter(t => !t.completed);

  let briefing = `☀️ *Briefing Diário — ${agora}*\n\n`;
  briefing += `📋 *Resumo de Hoje:*\n`;
  briefing += `• 🛒 Compras por fazer: **${comprasPendentes.length}**\n`;
  briefing += `• ✅ Tarefas pendentes: **${tarefasPendentes.length}**\n`;
  briefing += `• 👧 Registos Carolina: **${carolinaLogs.length}**\n`;

  if (tarefasPendentes.length > 0) {
    briefing += `\n*Prioridades de Hoje:*\n` + tarefasPendentes.slice(0, 3).map(t => `• ${t.title} _(${t.assigned_to})_`).join('\n');
  }

  if (comprasPendentes.length > 0) {
    briefing += `\n\n*Compras Urgentes:*\n` + comprasPendentes.slice(0, 4).map(c => `• ${c.item_text}`).join('\n');
  }

  if (carolinaLogs.length > 0) {
    const ult = carolinaLogs[0];
    briefing += `\n\n*Última nota Carolina:* ${ult.details} _(${ult.event_type})_`;
  }

  if (tarefasPendentes.length > 0 || comprasPendentes.length > 0) {
    try {
      const contexto = `Tarefas: ${tarefasPendentes.map(t => t.title).join(', ')}`;
      const dica = await askAgent({
        chatId: 'briefing_diario',
        workerTag: 'pessoal',
        prompt: `Dá uma frase executiva curta de 1 linha motivacional e pragmática (em português de Portugal) para foco nestas tarefas: ${contexto}`
      });
      if (dica && !dica.includes('⚠️')) {
        briefing += `\n\n💡 *Foco Estratégico do Dia:* ${dica.trim()}`;
      }
    } catch {}
  }

  return briefing;
}

// ─── Nutrição, Proteína e Ergonomia ─────────────────────────────────────────

function handleNutricao() {
  return `🥩 *Plano Nutricional de Alta Proteína*\n\n` +
    `🎯 *Meta Diária:* 160g Proteína (~2g/kg peso corporal)\n\n` +
    `*1. Cottage Cheese c/ Aveia ou Nestum PRO*\n` +
    `• 200g Cottage Milbona + 35g Aveia/Nestum PRO + Canela\n` +
    `• Macros: *28g Proteína* | 26g HC | 4g Gord | *252 kcal*\n\n` +
    `*2. Lombo de Porco em Air-Fryer*\n` +
    `• 250g Lombo limpo temperado com alho e orégãos (18-22 min a 180ºC)\n` +
    `• Macros: *54g Proteína* | 30g HC | 8g Gord | *408 kcal*\n\n` +
    `*3. Peito de Peru Salteado c/ Vegetais Freshona*\n` +
    `• 250g Peru + 200g Vegetais wok (8 min)\n` +
    `• Macros: *58g Proteína* | 14g HC | 6g Gord | *342 kcal*\n\n` +
    `💡 _Registar ingestão:_ \`/proteina 54 : Lombo de porco com arroz\``;
}

function handleErgonomia() {
  return `🏋️ *Diretrizes de Ergonomia, Postura & Coluna*\n\n` +
    `• *Lombar:* Apoio lombar ativo a 105º-110º de inclinação.\n` +
    `• *Pescoço & Olhos:* Topo do monitor exatamente na linha direta dos olhos.\n` +
    `• *Pausa Ativa:* A cada 2 horas de condução ou código, 5 minutos de descompressão.\n` +
    `• *Hidratação:* Mínimo de 2.5 Litros de água por dia.`;
}

function handleProteina(input) {
  const match = input.match(/^(\d+)\s*(?::\s*(.*))?$/);
  if (!match) {
    return `💡 *Como registar proteína:*\n\`/proteina <gramas> : <refeição>\`\nExemplo: \`/proteina 54 : Almoço lombo air-fryer\``;
  }
  const grams = parseInt(match[1], 10);
  const desc = match[2] || 'Refeição registada';
  const meta = 160;

  familyDb.addNote('🍗 Proteína', `${grams}g - ${desc}`, 'emerald', { first_name: 'André' });

  return `🍗 *Registo Nutricional Guardado!*\n\n` +
    `• Refeição: *${desc}* (+${grams}g Proteína)\n` +
    `• Meta diária: *${meta}g*\n\n` +
    `_Guardado nas notas e acessível no briefing de hoje!_`;
}

// ─── Lembretes Proativos ───────────────────────────────────────────────────

export function parseReminderInput(input) {
  const now = new Date();
  const trimmed = input.trim();

  // 1. Relativo: "daqui a X minutos / horas / dias" ou "+X min / +Xh"
  const relMatch = trimmed.match(/(?:daqui\s+a\s+|\+)(\d+)\s*(min(?:uto)?s?|m|h(?:ora)?s?|d(?:ia)?s?)\b(?:\s+(?:de\s+|para\s+)?(.*))?/i);
  if (relMatch) {
    const val = parseInt(relMatch[1], 10);
    const unit = relMatch[2].toLowerCase();
    const text = relMatch[3] || 'Lembrete';
    let ms = 0;
    if (unit.startsWith('m')) ms = val * 60 * 1000;
    else if (unit.startsWith('h')) ms = val * 60 * 60 * 1000;
    else if (unit.startsWith('d')) ms = val * 24 * 60 * 60 * 1000;
    const triggerAt = new Date(now.getTime() + ms);
    return { triggerAt, text: text.trim() };
  }

  // 2. Horário fixo hoje ou amanhã: "16:30 ligar ao médico", "às 16h30 ligar ao médico", "amanhã às 10:00..."
  const isAmanha = /amanh[aã]/i.test(trimmed);
  const clean = trimmed.replace(/(?:^|\s)amanh[aã](?:\s|$)/gi, ' ').trim();
  const timeMatch = clean.match(/^(?:(?:às|as)\s+)?(\d{1,2})(?:[:hH](\d{2}))?\s*(?:h|horas)?(?:\s+(?:de\s+|para\s+)?(.+))?$/i);
  if (timeMatch) {
    const hours = parseInt(timeMatch[1], 10);
    const minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    const text = (timeMatch[3] || 'Lembrete').trim();

    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      const target = new Date();
      if (isAmanha) {
        target.setDate(target.getDate() + 1);
      }
      target.setHours(hours, minutes, 0, 0);
      if (!isAmanha && target.getTime() <= now.getTime()) {
        target.setDate(target.getDate() + 1);
      }
      return { triggerAt: target, text };
    }
  }

  return {
    triggerAt: new Date(now.getTime() + 60 * 60 * 1000),
    text: trimmed
  };
}

function handleLembretes(rawInput, ctx) {
  const input = (rawInput || '').trim();
  const chatId = String(ctx.chat?.id || ctx.from?.id || '950415577');
  const user = { first_name: ctx.from?.first_name || 'André', username: ctx.from?.username };

  // Subcomando apagar / remover
  if (/^(apagar|remover|del)\s+/i.test(input)) {
    const idOrNum = input.replace(/^(apagar|remover|del)\s+/i, '').trim();
    const reminders = (familyDb.getReminders() || []).filter(r => !r.sent);
    const idx = parseInt(idOrNum, 10) - 1;
    let target = null;
    if (!isNaN(idx) && idx >= 0 && idx < reminders.length) {
      target = reminders[idx];
    } else {
      target = reminders.find(r => r.id === idOrNum);
    }
    if (target) {
      familyDb.deleteReminder(target.id);
      return `🗑️ Lembrete *"${target.text}"* cancelado com sucesso.`;
    }
    return `❌ Lembrete não encontrado. Usa \`/lembretes\` para ver a lista.`;
  }

  // Listar lembretes
  if (!input || input === 'ver' || input === 'listar') {
    const pending = (familyDb.getReminders() || []).filter(r => !r.sent).sort((a, b) => new Date(a.trigger_at) - new Date(b.trigger_at));
    if (pending.length === 0) {
      return `🔔 *Lembretes Proativos*\n\nNão tens nenhum lembrete ativo agendado.\n\nPara agendar:\n• \`/lembrete às 16:30 Ligar ao engenheiro\`\n• \`/lembrete daqui a 20 min Tirar o pão\`\n• \`/lembrete amanhã às 09:00 Rever orçamento\``;
    }
    let txt = `🔔 *Lembretes Ativos Agendados (${pending.length}):*\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    pending.forEach((r, i) => {
      const dt = new Date(r.trigger_at).toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon', hour12: false });
      txt += `${i + 1}. ⏰ *${dt}* — _"${r.text}"_\n`;
    });
    txt += `━━━━━━━━━━━━━━━━━━━━━━━━\n_Para cancelar um lembrete: \`/lembrete apagar 1\`_`;
    return txt;
  }

  // Criar novo lembrete
  const parsed = parseReminderInput(input);
  const reminder = familyDb.addReminder({
    text: parsed.text,
    triggerAt: parsed.triggerAt,
    chatId,
    user
  });

  const formattedDate = new Date(parsed.triggerAt).toLocaleString('pt-PT', {
    timeZone: 'Europe/Lisbon',
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  return `🔔 *Lembrete Proativo Agendado!*\n━━━━━━━━━━━━━━━━━━━━━━━━\n⏰ *Quando:* ${formattedDate}\n📋 *Assunto:* _"${parsed.text}"_\n━━━━━━━━━━━━━━━━━━━━━━━━\n_O bot enviará uma notificação push direta para este chat no momento exato._`;
}

// ─── Dispatcher Principal ───────────────────────────────────────────────────

export async function handle(text, ctx = {}) {
  const chatId = String(ctx.chat?.id || ctx.from?.id || '950415577');
  log.info('Processando pedido GERAL', { text: text.substring(0, 60), chatId });
  const trimmed = text.trim();

  if (/^\/(reset|limpar)\b/i.test(trimmed)) {
    return await askAgent({ chatId, workerTag: 'pessoal', prompt: '/reset' });
  }

  if (/^\/(start|menu|ajuda)\b/i.test(trimmed)) {
    return `🤖 *Assistente Familiar & Produtividade*\n\nComandos rápidos:\n\n🛒 \`/compras\` — Ver ou adicionar compras\n📋 \`/tarefas\` — Ver ou criar tarefas\n👧 \`/carolina\` — Escola, faltas e consultas\n📝 \`/nota Texto\` — Guardar nota rápida\n☀️ \`/briefing\` — Resumo geral do dia\n\n💡 *Conversa Aberta:* Fala livremente comigo sobre organização familiar, rotinas da Carolina ou planeamento do teu dia!`;
  }

  if (/^\/(briefing|resumo|dia)\b/i.test(trimmed)) return handleBriefing();
  if (/^\/(nutricao|dieta|macros)\b/i.test(trimmed)) return handleNutricao();
  if (/^\/ergonomia\b/i.test(trimmed)) return handleErgonomia();
  if (/^\/proteina\b/i.test(trimmed)) {
    const raw = trimmed.replace(/^\/proteina\s*/i, '').trim();
    return handleProteina(raw);
  }

  if (/^\/(compras?)\b/i.test(trimmed)) {
    const resto = trimmed.replace(/^\/(compras?)\s*/i, '').trim();
    const parts = resto.split(/\s+/);
    const subCmd = parts[0]?.toLowerCase() || '';
    const args = parts.slice(1).join(' ').trim() || (subCmd !== 'ver' && subCmd !== 'limpar' && subCmd !== 'check' && subCmd !== 'remover' ? subCmd : '');
    return handleCompras(args, subCmd);
  }

  if (/^\/(tarefa|tarefas)\b/i.test(trimmed)) {
    const args = trimmed.replace(/^\/(tarefa|tarefas)\s*/i, '').trim();
    return handleTarefas(args, args.split(/\s+/)[0]);
  }

  if (/^\/(carolina|bebe|bebé|escola)\b/i.test(trimmed)) {
    const args = trimmed.replace(/^\/(carolina|bebe|bebé|escola)\s*/i, '').trim();
    return handleCarolina(args);
  }

  if (/^\/(nota|notas)\b/i.test(trimmed)) {
    const args = trimmed.replace(/^\/(nota|notas)\s*/i, '').trim();
    return handleNotas(args);
  }

  if (/^\/(lembrete|lembretes)\b/i.test(trimmed)) {
    const args = trimmed.replace(/^\/(lembrete|lembretes)\s*/i, '').trim();
    return handleLembretes(args, ctx);
  }

  // Conversa contínua e resolução de problemas do dia a dia pessoal e familiar
  return await askAgent({
    chatId,
    workerTag: 'pessoal',
    prompt: trimmed
  });
}

export default { handle };
