// src/services/hindsightMemoryService.js — Motor Biomimético de Memória Hindsight (Retain, Recall, Reflect)
import crypto from 'crypto';
import { sqliteMasterDb } from '../shared/sqliteMasterDb.js';
import { createLogger } from '../utils/logger.js';
import { askAgent } from './reasoningService.js';

const log = createLogger('HindsightMemory');

export const CANONICAL_BANKS = {
  PESSOAL: 'pessoal_andre',
  FAMILIA: 'familia',
  DEV: 'dev_cloud',
  FROTA: 'frota_municipal'
};

/**
 * Normaliza o ID de banco
 */
export function resolveBankId(rawBank = '') {
  const b = String(rawBank || '').toLowerCase().trim();
  if (!b) return CANONICAL_BANKS.PESSOAL;
  if (['pessoal', 'andre', 'andré', 'habitos', 'hábitos'].includes(b)) return CANONICAL_BANKS.PESSOAL;
  if (['familia', 'família', 'carolina', 'casa'].includes(b)) return CANONICAL_BANKS.FAMILIA;
  if (['dev', 'cloud', 'devops', 'codigo', 'código'].includes(b)) return CANONICAL_BANKS.DEV;
  if (['frota', 'frotas', 'autocarros', 'transporte'].includes(b)) return CANONICAL_BANKS.FROTA;
  return b;
}

function getDb() {
  if (typeof sqliteMasterDb.getDb === 'function') return sqliteMasterDb.getDb();
  if (typeof sqliteMasterDb.getRawDb === 'function') return sqliteMasterDb.getRawDb();
  return sqliteMasterDb;
}

/**
 * Lista todos os bancos de memória registados e a respetiva contagem de memórias
 */
export function listBanks() {
  const db = getDb();
  const rows = db.prepare(`
    SELECT b.id, b.name, b.description, b.created_at, COUNT(m.id) as memory_count
    FROM hindsight_banks b
    LEFT JOIN hindsight_memories m ON b.id = m.bank_id
    GROUP BY b.id
    ORDER BY b.created_at ASC
  `).all();
  return rows;
}

/**
 * OPERAÇÃO 1: RETAIN
 * Armazena factos, observações e comportamentos aprendidos num banco de memória
 */
export function retain({
  bankId = CANONICAL_BANKS.PESSOAL,
  content = '',
  category = 'observacao',
  confidence = 1.0,
  metadata = {}
}) {
  const cleanContent = String(content || '').trim();
  if (!cleanContent) throw new Error('Conteúdo da memória não pode ser vazio');

  const resolvedBank = resolveBankId(bankId);
  const db = getDb();

  // Garante que o banco existe
  const exists = db.prepare('SELECT id FROM hindsight_banks WHERE id = ?').get(resolvedBank);
  if (!exists) {
    db.prepare('INSERT INTO hindsight_banks (id, name, description, created_at) VALUES (?, ?, ?, ?)')
      .run(resolvedBank, resolvedBank, 'Banco de memória criado dinamicamente', new Date().toISOString());
  }

  const id = `mem_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const metaStr = JSON.stringify(metadata || {});

  db.prepare(`
    INSERT INTO hindsight_memories (id, bank_id, content, category, confidence, metadata, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, resolvedBank, cleanContent, category, Number(confidence) || 1.0, metaStr, now, now);

  log.info(`[Retain] Memória guardada [${resolvedBank}]: "${cleanContent.slice(0, 50)}..."`);

  return {
    id,
    bankId: resolvedBank,
    content: cleanContent,
    category,
    confidence: Number(confidence) || 1.0,
    createdAt: now
  };
}

/**
 * OPERAÇÃO 2: RECALL
 * Recuperação semântica e contextual de memórias filtradas por banco e palavras-chave
 */
export function recall({
  bankId = CANONICAL_BANKS.PESSOAL,
  query = '',
  limit = 10
}) {
  const resolvedBank = resolveBankId(bankId);
  const db = getDb();
  const cleanQuery = String(query || '').toLowerCase().trim();

  let rows;
  if (!cleanQuery) {
    rows = db.prepare(`
      SELECT * FROM hindsight_memories
      WHERE bank_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(resolvedBank, Number(limit) || 10);
  } else {
    // Pesquisa ponderada por tokens de palavras
    const tokens = cleanQuery.split(/\s+/).filter((t) => t.length > 2);
    if (tokens.length === 0) {
      rows = db.prepare(`
        SELECT * FROM hindsight_memories
        WHERE bank_id = ? AND LOWER(content) LIKE ?
        ORDER BY created_at DESC
        LIMIT ?
      `).all(resolvedBank, `%${cleanQuery}%`, Number(limit) || 10);
    } else {
      const conditions = tokens.map(() => 'LOWER(content) LIKE ?').join(' OR ');
      const params = [resolvedBank, ...tokens.map((t) => `%${t}%`), Number(limit) || 10];
      rows = db.prepare(`
        SELECT * FROM hindsight_memories
        WHERE bank_id = ? AND (${conditions})
        ORDER BY confidence DESC, created_at DESC
        LIMIT ?
      `).all(...params);
    }
  }

  return rows.map((r) => ({
    id: r.id,
    bankId: r.bank_id,
    content: r.content,
    category: r.category,
    confidence: r.confidence,
    metadata: JSON.parse(r.metadata || '{}'),
    createdAt: r.created_at
  }));
}

/**
 * OPERAÇÃO 3: REFLECT
 * Síntese biomimética de alto nível: analisa o conjunto de memórias evocadas e extrai conclusões orientadas a ação
 */
export async function reflect({
  bankId = CANONICAL_BANKS.PESSOAL,
  query = '',
  chatId = ''
}) {
  const resolvedBank = resolveBankId(bankId);
  const memories = recall({ bankId: resolvedBank, query, limit: 12 });

  if (memories.length === 0) {
    return {
      bankId: resolvedBank,
      query,
      memoriesCount: 0,
      reflection: `_Ainda não existem memórias suficientes registadas no banco \`${resolvedBank}\` sobre "${query || 'este tema'}" para sintetizar uma reflexão._\n\nUsa \`/hindsight retain ${resolvedBank} | <observação>\` para ensinar o bot!`
    };
  }

  const memoryContext = memories.map((m, i) => `${i + 1}. [${m.category}] ${m.content} (confiança: ${Math.round(m.confidence * 100)}%)`).join('\n');

  const prompt =
    `És o Módulo de Reflexão Cognitiva Hindsight do ecossistema de André Pinheiro.\n` +
    `Analisa as seguintes ${memories.length} memórias aprendidas no banco "${resolvedBank}":\n\n` +
    `${memoryContext}\n\n` +
    `Tema da Reflexão: "${query || 'Síntese Geral de Hábitos e Padrões'}"\n\n` +
    `Instruções Fatais (temperature: 0.0):\n` +
    `1. Resume em 3 tópicos claros os padrões ou factos observados sem alucinar.\n` +
    `2. Aponta 1 recomendação prática e determinística de ação para o utilizador.\n` +
    `3. Responde em Português Europeu de forma direta, concisa e estruturada.`;

  try {
    const aiResp = await askAgent({
      chatId: chatId || 'default_user',
      workerTag: 'dev',
      prompt
    });

    return {
      bankId: resolvedBank,
      query,
      memoriesCount: memories.length,
      reflection: aiResp || 'Síntese gerada com base nas memórias evocadas.'
    };
  } catch (err) {
    log.error('Erro na reflexão IA Hindsight:', err.message);
    // Fallback estruturado
    const fallback =
      `🧠 *Reflexão Síntese Hindsight (${resolvedBank})*\n` +
      `• Memórias analisadas: ${memories.length}\n` +
      `• Observações recolhidas:\n${memories.slice(0, 3).map((m) => `  ↳ ${m.content}`).join('\n')}\n` +
      `• Recomendação: Manter o registo sistemático de novos factos para reforço biomimético.`;
    return {
      bankId: resolvedBank,
      query,
      memoriesCount: memories.length,
      reflection: fallback
    };
  }
}

/**
 * Formata o menu principal Hindsight para Telegram
 */
export function formatHindsightMenuMarkdown() {
  const banks = listBanks();
  const totalMemories = banks.reduce((acc, b) => acc + (b.memory_count || 0), 0);

  let text = `🧠 *Hindsight: Memória Biomimética de Agentes (ADR-044)*\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `O teu ecossistema de bots opera com o paradigma triplo **Retain**, **Recall** e **Reflect** inspirado no [vectorize-io/hindsight](https://github.com/vectorize-io/hindsight).\n\n`;
  text += `📊 *Bancos de Memória Particionados:* (${totalMemories} memórias ativas)\n`;

  banks.forEach((b) => {
    text += `• \`${b.id}\` — *${b.name}* (${b.memory_count} memórias)\n  ↳ _${b.description}_\n`;
  });

  text += `\n🛠️ *As 3 Operações Canónicas no Telegram:*\n`;
  text += `1️⃣ *Retain (Aprender):*\n   \`/hindsight retain <banco> | <observação>\`\n   _Exemplo:_ \`/hindsight retain pessoal_andre | Prefere reuniões de alinhamento antes das 10h_\n\n`;
  text += `2️⃣ *Recall (Evocar Contexto):*\n   \`/hindsight recall <banco> | <pergunta>\`\n   _Exemplo:_ \`/hindsight recall pessoal_andre | café_\n\n`;
  text += `3️⃣ *Reflect (Sintetizar & Pensar):*\n   \`/hindsight reflect <banco> | <tema>\`\n   _Exemplo:_ \`/hindsight reflect dev_cloud | compilações apk_\n`;

  return text;
}

export default {
  CANONICAL_BANKS,
  resolveBankId,
  listBanks,
  retain,
  recall,
  reflect,
  formatHindsightMenuMarkdown
};
