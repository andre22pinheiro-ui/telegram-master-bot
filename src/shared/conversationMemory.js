// src/shared/conversationMemory.js — Gestor de Memória Conversacional Multi-Turn por Chat e Bot com Persistência
import { createLogger } from '../utils/logger.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const log = createLogger('Memory');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data');
const HISTORY_FILE = path.resolve(DATA_DIR, 'conversas_historico.json');

// Máximo de mensagens por sessão ativa em memória (ex: 6 pares user-assistente)
const MAX_TURNS = 12;
// Tempo de expiração de sessão inativa: 3 horas (em milissegundos)
const SESSION_TTL_MS = 3 * 60 * 60 * 1000;

class ConversationMemory {
  constructor() {
    this.sessions = new Map();
    this._loadFromDisk();
    // Limpeza periódica de sessões expiradas a cada 30 minutos
    setInterval(() => this.cleanupExpired(), 30 * 60 * 1000).unref();
  }

  _loadFromDisk() {
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      if (fs.existsSync(HISTORY_FILE)) {
        const raw = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
        if (typeof raw === 'object' && raw !== null) {
          for (const [key, session] of Object.entries(raw)) {
            if (session && Array.isArray(session.messages)) {
              this.sessions.set(key, session);
            }
          }
          log.info(`Histórico de conversas carregado do disco: ${this.sessions.size} sessões ativas.`);
        }
      }
    } catch (err) {
      log.warn('Aviso ao carregar histórico de conversas do disco:', err.message);
    }
  }

  _saveToDisk() {
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      const obj = {};
      for (const [key, session] of this.sessions.entries()) {
        obj[key] = session;
      }
      fs.writeFileSync(HISTORY_FILE, JSON.stringify(obj, null, 2), 'utf-8');
    } catch (err) {
      log.error('Erro ao guardar histórico de conversas no disco:', err.message);
    }
  }

  _getKey(chatId, workerTag = 'master') {
    return `${String(chatId || '950415577')}_${workerTag}`;
  }

  // Obtém histórico formatado para o Gemini API: [{ role: 'user'|'model', parts: [{ text }] }]
  getGeminiHistory(chatId, workerTag = 'master') {
    const key = this._getKey(chatId, workerTag);
    const session = this.sessions.get(key);
    if (!session) return [];

    // Verificar se expirou
    if (Date.now() - session.lastActive > SESSION_TTL_MS) {
      this.sessions.delete(key);
      return [];
    }

    return session.messages.map((m) => ({
      role: m.role === 'assistant' || m.role === 'model' ? 'model' : 'user',
      parts: [{ text: m.text }]
    }));
  }

  // Obtém histórico formatado para o OpenAI / Groq: [{ role: 'user'|'assistant', content: string }]
  getOpenAiHistory(chatId, workerTag = 'master') {
    const key = this._getKey(chatId, workerTag);
    const session = this.sessions.get(key);
    if (!session) return [];

    if (Date.now() - session.lastActive > SESSION_TTL_MS) {
      this.sessions.delete(key);
      return [];
    }

    return session.messages.map((m) => ({
      role: m.role === 'model' || m.role === 'assistant' ? 'assistant' : 'user',
      content: m.text
    }));
  }

  // Adiciona uma mensagem ao histórico da sessão
  addTurn(chatId, workerTag, role, text) {
    if (!text || typeof text !== 'string') return;
    const key = this._getKey(chatId, workerTag);
    let session = this.sessions.get(key);

    if (!session || Date.now() - session.lastActive > SESSION_TTL_MS) {
      session = {
        messages: [],
        createdAt: Date.now(),
        lastActive: Date.now()
      };
      this.sessions.set(key, session);
    }

    session.lastActive = Date.now();
    session.messages.push({
      role: role === 'assistant' || role === 'model' ? 'model' : 'user',
      text: text.trim(),
      timestamp: Date.now()
    });

    // Manter janela deslizante (sliding window)
    if (session.messages.length > MAX_TURNS) {
      session.messages = session.messages.slice(-MAX_TURNS);
    }

    // Persistir em disco
    this._saveToDisk();
  }

  // Limpa o histórico de uma conversa específica
  clear(chatId, workerTag = 'master') {
    const key = this._getKey(chatId, workerTag);
    this.sessions.delete(key);
    this._saveToDisk();
    log.info(`Histórico limpo para ${key}`);
  }

  // Retorna quantidade de interações da sessão ativa
  getTurnCount(chatId, workerTag = 'master') {
    const key = this._getKey(chatId, workerTag);
    const session = this.sessions.get(key);
    return session?.messages?.length || 0;
  }

  cleanupExpired() {
    const now = Date.now();
    for (const [key, session] of this.sessions.entries()) {
      if (now - session.lastActive > SESSION_TTL_MS) {
        this.sessions.delete(key);
      }
    }
  }
}

export const conversationMemory = new ConversationMemory();
export default conversationMemory;

