// src/shared/conversationMemory.js — Memória Conversacional Multi-Turn persistida no SQLite WAL (pessoal_master.db)
import { sqliteMasterDb } from './sqliteMasterDb.js';

const MAX_TURNS = 12; // 12 pares (24 mensagens máx por sessão/agente)
const SESSION_TTL_MS = 3 * 60 * 60 * 1000; // 3 horas

class ConversationMemory {
  _key(chatId, workerTag = 'master') {
    return `${String(chatId || 'default')}:${String(workerTag || 'master')}`;
  }

  addTurn(chatId, workerTag = 'master', role, content) {
    if (!content) return;
    const key = this._key(chatId, workerTag);
    const normalizedRole = role === 'assistant' ? 'model' : role;
    sqliteMasterDb.appendConversationTurn(key, chatId, workerTag, normalizedRole, content, MAX_TURNS);
  }

  getHistory(chatId, workerTag = 'master') {
    const key = this._key(chatId, workerTag);
    return sqliteMasterDb.getConversationTurns(key, SESSION_TTL_MS);
  }

  getGeminiHistory(chatId, workerTag = 'master') {
    return this.getHistory(chatId, workerTag).map((t) => ({
      role: t.role === 'assistant' || t.role === 'model' ? 'model' : 'user',
      parts: [{ text: t.content }]
    }));
  }

  getOpenAiHistory(chatId, workerTag = 'master') {
    return this.getHistory(chatId, workerTag).map((t) => ({
      role: t.role === 'model' ? 'assistant' : t.role,
      content: t.content
    }));
  }

  clear(chatId, workerTag = 'master') {
    sqliteMasterDb.clearConversationSession(this._key(chatId, workerTag));
  }

  clearAll() {
    sqliteMasterDb.clearAllConversations();
  }

  getStats() {
    return sqliteMasterDb.getConversationStats();
  }
}

export const conversationMemory = new ConversationMemory();
export default conversationMemory;
