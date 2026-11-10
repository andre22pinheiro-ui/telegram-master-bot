// src/services/zeroPaperDispatcher.js — Dispatcher Cognitivo Universal "ZeroPaper"
// Qualquer mensagem de voz (Whisper), texto ou foto é categorizada e persistida automaticamente no sítio certo.
import 'dotenv/config';
import axios from 'axios';
import { createLogger } from '../utils/logger.js';
import appFrotaService, { APPFROTA_WEB_URL } from './appFrotaService.js';
import { familyDb } from '../shared/familyDb.js';
import pcRemoteBridge from './pcRemoteBridge.js';

const log = createLogger('ZeroPaperDispatcher');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';

const DISPATCH_SYSTEM_PROMPT = `És o Motor de Despacho e Ingestão Cognitiva do ecossistema unificado de André Pinheiro e do ZeroPaperFrota (AppFrota).
A tua missão é interpretar qualquer instrução humana (texto, transcrição de áudio Whisper ou legenda de foto) e extrair os dados estruturados de forma rigorosa, factual e sem delírios.

DOMÍNIOS SUPORTADOS:
1. "APPFROTA" (Gestão de Frotas, Autocarros, Carrinhas, Oficina e Garagem):
   - Ações:
     * "KM": Registo de quilómetros, fim de turno, odómetro (ex: "Terminei com 155.200 km na viatura 39-HZ-66").
     * "ANOMALIA": Avaria mecânica, luz do painel, ruído, pneu furado, vidro partido, sinistro (ex: "A 55-TN-89 acendeu a luz do óleo e está parada").
     * "HIGIENIZACAO": Lavagem exterior, desinfeção interior, limpeza de viatura (ex: "Lavei e desinfetei o autocarro 01-AA-01").
     * "CHECKLIST": Vistoria de início/fim de serviço, luzes, níveis, pneus (ex: "Checklist feito na 39-HZ-66 tudo ok").
     * "SERVICO": Mudança de peças, reparação, revisão, custos de oficina (ex: "Mudei o óleo e pastilhas da 12-XE-34 por 180 euros").
     * "STOCK": Entrada ou saída de stock de peças/óleo (ex: "Chegaram 10 filtros de óleo").
     * "CONSULTA": Pedido de estado da frota, km atuais de uma viatura, avarias existentes (ex: "Como está a frota?", "Quantos km tem a 39-HZ-66?").

2. "PESSOAL" (Família & Casa):
   - Ações:
     * "COMPRAS": Adicionar itens à lista de supermercado (ex: "Comprar leite, ovos e bananas").
     * "TAREFA": Tarefas domésticas ou pessoais (ex: "Pagar a conta da água amanhã").

3. "LEMBRETE" (Alarmes e Lembretes Proativos):
   - Ações: "LEMBRETE" (ex: "Lembra-me às 18:30 de ligar ao mecânico", "Lembra-me amanhã às 9 de enviar a escala").

4. "PC_REMOTE" (Controlo Remoto do Surface / Portátil):
   - Ações: "PC" (ex: "Tira print do Surface", "Estado do PC", "Compila o APK").

5. "GERAL" (Conversa comum, dúvidas técnicas, legislação, saudações que NÃO alteram bases de dados).

SCHEMA DE RESPOSTA OBRIGATÓRIO (JSON PURO):
{
  "domain": "APPFROTA" | "PESSOAL" | "LEMBRETE" | "PC_REMOTE" | "GERAL",
  "action": "KM" | "ANOMALIA" | "HIGIENIZACAO" | "CHECKLIST" | "SERVICO" | "STOCK" | "CONSULTA" | "COMPRAS" | "TAREFA" | "LEMBRETE" | "PC" | "CONVERSA",
  "matricula": string ou null (identificador de viatura, ex: "39-HZ-66", "01-AA-01", "55-TN-89", "12-XE-34", "99-ZZ-99"),
  "km": número inteiro ou null,
  "descricao": string limpa e detalhada,
  "prioridade": "Baixa" | "Média" | "Alta" | "Urgente" ou null,
  "imobiliza": boolean ou null (true se a viatura não pode circular),
  "tipo_higienizacao": string ou null,
  "custo": número ou null,
  "items": array de strings ou null (se lista de compras/tarefas),
  "data_lembrete": string ou null (hora ou texto temporal do lembrete),
  "funcionario_nome": string ou null,
  "funcionario_num": string ou null,
  "confianca": número de 0.0 a 1.0
}`;

/**
 * Classifica a mensagem com LLM em JSON estruturado com fallback resiliente
 */
export async function classifyInput(rawText) {
  if (!rawText || typeof rawText !== 'string') return null;
  const text = rawText.trim();
  if (text.length < 2) return null;

  // 1. Tentar Gemini Flash Lite
  if (GEMINI_API_KEY) {
    const models = ['gemini-flash-lite-latest', 'gemini-flash-latest'];
    for (const model of models) {
      try {
        const payload = {
          contents: [{ parts: [{ text }] }],
          system_instruction: { parts: [{ text: DISPATCH_SYSTEM_PROMPT }] },
          generationConfig: {
            response_mime_type: 'application/json',
            temperature: 0.1
          }
        };

        const res = await axios.post(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
          payload,
          { timeout: 6000 }
        );

        const content = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (content) {
          const parsed = JSON.parse(content);
          if (parsed && parsed.domain) return parsed;
        }
      } catch (err) {
        log.warn(`Dispatcher Gemini [${model}] falhou:`, err.message);
      }
    }
  }

  // 2. Fallback Groq LPU
  if (GROQ_API_KEY) {
    const groqModels = ['qwen/qwen3.8-27b', 'openai/gpt-oss-20b'];
    for (const m of groqModels) {
      try {
        const res = await axios.post(
          'https://api.groq.com/openai/v1/chat/completions',
          {
            model: m,
            messages: [
              { role: 'system', content: DISPATCH_SYSTEM_PROMPT },
              { role: 'user', content: text }
            ],
            response_format: { type: 'json_object' },
            temperature: 0.1
          },
          {
            headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
            timeout: 6000
          }
        );

        const content = res.data?.choices?.[0]?.message?.content;
        if (content) {
          const parsed = JSON.parse(content);
          if (parsed && parsed.domain) return parsed;
        }
      } catch (err) {
        log.warn(`Dispatcher Groq [${m}] falhou:`, err.message);
      }
    }
  }

  // 3. Fallback Heurístico Rápido por Expressões Regulares
  return heuristicClassification(text);
}

/**
 * Heurística determinística ultrarrápida (caso as APIs de IA falhem)
 */
function heuristicClassification(text) {
  const t = text.toLowerCase();

  // Deteção de matrícula portuguesa (ex: 39-HZ-66 ou 39 HZ 66)
  const plateMatch = text.match(/\b([0-9]{2}[- ][A-Z]{2}[- ][0-9]{2}|[A-Z]{2}[- ][0-9]{2}[- ][A-Z]{2}|[0-9]{2}[- ][0-9]{2}[- ][A-Z]{2}|[A-Z]{2}[- ][0-9]{2}[- ][0-9]{2})\b/i);
  const matricula = plateMatch ? plateMatch[1].replace(' ', '-').toUpperCase() : null;

  // Quilometragem
  const kmMatch = text.match(/(\d{2,3}[\.\s]?\d{3})\s*km/i) || text.match(/(\d{4,6})\s*km/i);
  if (kmMatch && (matricula || t.includes('carro') || t.includes('carrinha') || t.includes('turno') || t.includes('viatura'))) {
    const cleanKm = parseInt(kmMatch[1].replace(/[\.\s]/g, ''), 10);
    return {
      domain: 'APPFROTA',
      action: 'KM',
      matricula,
      km: cleanKm,
      descricao: text,
      confianca: 0.85
    };
  }

  // Anomalia / Avaria
  if (/\b(avaria|avariava|avariarem|partid[ao]|estragad[ao]|luz.*painel|ru[ií]do|chiar|chiadeira|fumo|fuga|oficina|trav[aõ]es|pneu|furo)\b/i.test(t)) {
    return {
      domain: 'APPFROTA',
      action: 'ANOMALIA',
      matricula,
      descricao: text,
      prioridade: t.includes('urgente') ? 'Urgente' : 'Média',
      imobiliza: /\b(parada|imobilizada|imobilizar|reboque|n[aã]o anda)\b/i.test(t),
      confianca: 0.85
    };
  }

  // Higienização
  if (/\b(higieniza[cç][aã]o|lavagem|lavar|lavou|desinfe[cç][aã]o|limpeza)\b/i.test(t) && (matricula || t.includes('carrinha') || t.includes('autocarro'))) {
    return {
      domain: 'APPFROTA',
      action: 'HIGIENIZACAO',
      matricula,
      descricao: text,
      tipo_higienizacao: 'Lavagem e Desinfeção Completa',
      confianca: 0.85
    };
  }

  // Compras
  if (/^\b(comprar|compras|trazer do supermercado)\b/i.test(t)) {
    return {
      domain: 'PESSOAL',
      action: 'COMPRAS',
      items: [text.replace(/^\b(comprar|compras|trazer)\b/i, '').trim()],
      confianca: 0.9
    };
  }

  // Lembrete
  if (/^\b(lembra-me|lembrar|avisa-me)\b/i.test(t)) {
    return {
      domain: 'LEMBRETE',
      action: 'LEMBRETE',
      descricao: text,
      data_lembrete: text,
      confianca: 0.9
    };
  }

  // PC Remote
  if (/\b(print.*surface|ecr[aã].*pc|captura.*pc|estado.*surface|compilar|compila)\b/i.test(t)) {
    return {
      domain: 'PC_REMOTE',
      action: 'PC',
      descricao: text,
      confianca: 0.9
    };
  }

  return { domain: 'GERAL', action: 'CONVERSA', confianca: 0.5 };
}

/**
 * Extrai e normaliza o utilizador e número de funcionário
 */
function resolveOperator(ctx, classified) {
  const telegramId = String(ctx.from?.id || '');
  const isMaster = telegramId === '950415577';

  let nome = classified.funcionario_nome || (isMaster ? 'André Pinheiro' : ctx.from?.first_name || 'Operador Frota');
  let numero = classified.funcionario_num || (isMaster ? '1688' : 'N/A');

  return { nome, numero };
}

/**
 * EXECUTOR AUTOMÁTICO DE DISPATCH ("Coloca no Sítio")
 * Se for uma operação estruturada de dados, executa a escrita e devolve a resposta formatada.
 * Se for conversa geral, devolve null (permitindo que o agente conversacional responda).
 */
export async function tryAutoDispatch(text, ctx) {
  const classified = await classifyInput(text);
  if (!classified || classified.domain === 'GERAL' || classified.action === 'CONVERSA') {
    return null; // Deixa o bot conversacional tratar normalmente
  }

  const { nome, numero } = resolveOperator(ctx, classified);
  log.info(`[ZeroPaperDispatcher] Despachando ação: ${classified.domain} -> ${classified.action}`, {
    matricula: classified.matricula,
    operador: `${nome} (${numero})`
  });

  // ─── 1. DOMÍNIO APPFROTA (ZeroPaperFrota no Supabase) ──────────────────────
  if (classified.domain === 'APPFROTA') {
    // 1.1 REGISTO DE QUILOMETRAGEM
    if (classified.action === 'KM') {
      const res = await appFrotaService.registarKm({
        matricula: classified.matricula,
        km: classified.km,
        funcionario_nome: nome,
        funcionario_num: numero,
        observacoes: classified.descricao
      });

      if (!res.success) {
        return `⚠️ *Erro ao registar quilometragem:* ${res.error}\n\n_Exemplo de envio: "Turno concluído na 39-HZ-66 com 155300 km"_`;
      }

      return (
        `✅ *[ZeroPaperFrota] Quilometragem Atualizada!*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🚗 Viatura: **${res.viatura.matricula}** (${res.viatura.marca_modelo || 'Viatura'})\n` +
        `🔢 Novo Odómetro: **${res.novoKm.toLocaleString('pt-PT')} km**\n` +
        `📈 Distância no turno: **+${res.diferenca} km** (anterior: ${res.kmAnterior.toLocaleString('pt-PT')} km)\n` +
        `👤 Registado por: *${nome}* (N.º ${numero})\n` +
        `📅 Data: ${new Date().toLocaleDateString('pt-PT')}\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🌐 [Ver em tempo real no AppFrota Web](${APPFROTA_WEB_URL})`
      );
    }

    // 1.2 REGISTO DE ANOMALIA / AVARIA
    if (classified.action === 'ANOMALIA') {
      const res = await appFrotaService.registarAnomalia({
        matricula: classified.matricula,
        descricao: classified.descricao,
        prioridade: classified.prioridade || 'Média',
        imobiliza: Boolean(classified.imobiliza),
        tipo: 'avaria',
        funcionario_nome: nome,
        funcionario_num: numero
      });

      if (!res.success) {
        return `⚠️ *Erro ao registar anomalia:* ${res.error}`;
      }

      const imobTag = classified.imobiliza
        ? `⛔ *ATENÇÃO: VIATURA IMOBILIZADA (Colocada em Manutenção)*`
        : `🟡 *Viatura Operacional (Anomalia para triagem)*`;

      return (
        `🚨 *[ZeroPaperFrota] Anomalia Registada na Oficina!*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🚗 Viatura: **${res.anomalia.matricula || classified.matricula || 'Frota Geral'}**\n` +
        `⚠️ Descrição: _"${classified.descricao}"_\n` +
        `⚡ Prioridade: **${classified.prioridade || 'Média'}**\n` +
        `🚦 Estado: ${imobTag}\n` +
        `👤 Reportado por: *${nome}* (N.º ${numero})\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🔧 [Abrir painel da Oficina no AppFrota](${APPFROTA_WEB_URL}/oficina)`
      );
    }

    // 1.3 REGISTO DE HIGIENIZAÇÃO
    if (classified.action === 'HIGIENIZACAO') {
      const res = await appFrotaService.registarHigienizacao({
        matricula: classified.matricula,
        tipo: classified.tipo_higienizacao || 'Desinfeção e Lavagem Completa',
        observacoes: classified.descricao
      });

      if (!res.success) {
        return `⚠️ *Erro ao registar higienização:* ${res.error}`;
      }

      return (
        `🧼 *[ZeroPaperFrota] Higienização Concluída!*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🚗 Viatura: **${res.viatura.matricula}** (${res.viatura.marca_modelo || 'Viatura'})\n` +
        `✨ Serviço: *${res.higienizacao.tipo}*\n` +
        `📝 Detalhe: _${classified.descricao || 'Concluído conforme procedimentos' }_\n` +
        `📅 Data: ${new Date().toLocaleDateString('pt-PT')}\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🌐 [Painel de Higienização no AppFrota](${APPFROTA_WEB_URL})`
      );
    }

    // 1.4 REGISTO DE CHECKLIST DIÁRIO
    if (classified.action === 'CHECKLIST') {
      const res = await appFrotaService.registarChecklist({
        matricula: classified.matricula,
        observacoes: classified.descricao || 'Verificação diária concluída sem anomalias.',
        concluido: true,
        dados: { items: classified.items || [], horario: new Date().toISOString() }
      });

      if (!res.success) {
        return `⚠️ *Erro ao registar checklist:* ${res.error}`;
      }

      return (
        `📋 *[ZeroPaperFrota] Checklist Diário Validado!*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🚗 Viatura: **${res.viatura.matricula}** (${res.viatura.marca_modelo || 'Viatura'})\n` +
        `✅ Estado: **Aprovado para Circulação**\n` +
        `📝 Observações: _"${classified.descricao || 'Tudo conforme'}"_\n` +
        `👤 Inspecionado por: *${nome}* (N.º ${numero})\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🌐 [Ver Checklists no AppFrota](${APPFROTA_WEB_URL}/frota)`
      );
    }

    // 1.5 SERVIÇO / REPARAÇÃO
    if (classified.action === 'SERVICO') {
      const res = await appFrotaService.registarServico({
        matricula: classified.matricula,
        descricao: classified.descricao,
        custo: classified.custo || 0,
        motorista: nome
      });

      if (!res.success) {
        return `⚠️ *Erro ao registar serviço de oficina:* ${res.error}`;
      }

      return (
        `🔧 *[ZeroPaperFrota] Serviço de Oficina Registado!*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🚗 Viatura: **${res.viatura.matricula}**\n` +
        `🛠️ Serviço: *${classified.descricao}*\n` +
        `💶 Custo: **${classified.custo ? classified.custo + ' €' : 'Sob orçamento'}**\n` +
        `📅 Data: ${new Date().toLocaleDateString('pt-PT')}\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🌐 [Ver Oficina no AppFrota](${APPFROTA_WEB_URL}/oficina)`
      );
    }

    // 1.6 STOCK DE OFICINA
    if (classified.action === 'STOCK') {
      const res = await appFrotaService.atualizarStock({
        item: classified.descricao || 'Item de oficina',
        quantidade: classified.items?.length || 1,
        operacao: 'adicionar'
      });

      if (!res.success) {
        return `⚠️ *Erro ao atualizar stock:* ${res.error}`;
      }

      return (
        `📦 *[ZeroPaperFrota] Stock de Oficina Atualizado!*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `📦 Artigo: **${res.itemNome}**\n` +
        `📊 Quantidade Atual: **${res.novo} un.** (anterior: ${res.anterior})\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🌐 [Gerir Stock no AppFrota](${APPFROTA_WEB_URL}/oficina)`
      );
    }

    // 1.7 CONSULTA DO ESTADO DA FROTA
    if (classified.action === 'CONSULTA') {
      return await appFrotaService.getFrotaStatusReport();
    }
  }

  // ─── 2. DOMÍNIO PESSOAL & FAMÍLIA (familyDb) ──────────────────────────────
  if (classified.domain === 'PESSOAL') {
    if (classified.action === 'COMPRAS') {
      const rawItems = classified.items && classified.items.length > 0
        ? classified.items
        : [classified.descricao.replace(/^\b(comprar|compras|adicionar|lista)\b/i, '').trim()];

      const adicionados = [];
      for (const item of rawItems) {
        if (!item) continue;
        const subItems = item.split(/[,;\n]|\be\b/i).map(s => s.trim()).filter(Boolean);
        for (const sub of subItems) {
          familyDb.addShopping(sub);
          adicionados.push(sub);
        }
      }

      return (
        `🛒 *Lista de Compras Atualizada!*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        adicionados.map(i => `• ${i}`).join('\n') + `\n\n` +
        `💾 _Guardado e sincronizado com a Mini App Gestão Familiar!_`
      );
    }

    if (classified.action === 'TAREFA') {
      const t = classified.descricao || text;
      familyDb.addTask(t);
      return (
        `📋 *Nova Tarefa Registada!*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `📌 _"${t}"_\n\n` +
        `💾 _Adicionado às pendências com sucesso!_`
      );
    }
  }

  // ─── 3. DOMÍNIO LEMBRETE PROATIVO ─────────────────────────────────────────
  if (classified.domain === 'LEMBRETE') {
    // Importa o parser de tempo do worker geral
    const workerGeral = await import('../workers/worker_geral.js');
    if (workerGeral?.parseReminderInput) {
      const parsed = workerGeral.parseReminderInput(classified.descricao || text);
      if (parsed) {
        const item = familyDb.addReminder({
          reminderText: parsed.reminderText,
          dueAt: parsed.dueAt,
          createdBy: nome
        });

        const dataStr = new Date(item.due_at).toLocaleTimeString('pt-PT', {
          hour: '2-digit',
          minute: '2-digit',
          day: '2-digit',
          month: '2-digit'
        });

        return (
          `⏰ *Lembrete Proativo Ativado!*\n` +
          `━━━━━━━━━━━━━━━━━━━━━━\n` +
          `🔔 Alerta programado para: **${dataStr}**\n` +
          `📝 Conteúdo: _"${item.reminder_text}"_\n` +
          `👤 Criado por: *${nome}*\n\n` +
          `⚡ _O Master Bot emitirá um aviso sonoro direto aqui no chat assim que a hora chegar!_`
        );
      }
    }
  }

  // ─── 4. DOMÍNIO PC SURFACE REMOTE ─────────────────────────────────────────
  if (classified.domain === 'PC_REMOTE') {
    const isPrint = /\b(print|foto|ecr[aã]|captura)\b/i.test(classified.descricao || text);
    const isHealth = /\b(sa[uú]de|status|estado|cpu|ram|disco|temperatura)\b/i.test(classified.descricao || text);
    const isBuild = /\b(compilar|compila|build|gerar apk)\b/i.test(classified.descricao || text);

    if (isPrint) {
      const res = await pcRemoteBridge.executeOnPc('print', {}, 18000);
      if (!res.success) return `💻 *Surface PC:* ${res.error}`;
      if (res.data?.base64) {
        const buf = Buffer.from(res.data.base64, 'base64');
        await ctx.replyWithPhoto({ source: buf }, {
          caption: `📸 *Captura em Tempo Real do Surface PC*\n💻 ${res.data.hostname || 'DESKTOP-MS3QT49'} | ${new Date().toLocaleTimeString('pt-PT')}`,
          parse_mode: 'Markdown'
        });
        return null;
      }
    }

    if (isHealth) {
      const res = await pcRemoteBridge.executeOnPc('health', {}, 10000);
      if (!res.success) return `💻 *Surface PC:* ${res.error}`;
      const d = res.data || {};
      return (
        `💻 *Diagnóstico em Tempo Real — Surface PC*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🖥️ Hostname: **${d.hostname}**\n` +
        `⚡ CPU: **${d.cpuUsage || 'Normal'}**\n` +
        `🧠 Memória RAM: **${d.memUsedGb} GB / ${d.memTotalGb} GB (${d.memPercent}%)**\n` +
        `🔋 Bateria: **${d.battery || 'Alimentação Direta'}**\n` +
        `⏱️ Uptime: **${d.uptimeHours} horas**\n` +
        `🌐 Ponte Render: **Ligado & Ativo (Ping < 3s)**`
      );
    }

    if (isBuild) {
      const res = await pcRemoteBridge.executeOnPc('build', {}, 60000);
      if (!res.success) return `💻 *Surface PC:* ${res.error}`;
      return `🏗️ *Compilação no Surface PC:* Pedido iniciado com sucesso!\n${res.data?.message || 'A compilar...'}`;
    }
  }

  return null;
}

export default {
  classifyInput,
  tryAutoDispatch
};
