// src/services/pcRemoteBridge.js — Ponte de Comunicação Remota Telegram <-> PC Surface
import EventEmitter from 'events';
import { createLogger } from '../utils/logger.js';

const log = createLogger('PcRemoteBridge');

class PcRemoteBridge extends EventEmitter {
  constructor() {
    super();
    this.orders = new Map(); // id -> { id, order, targetProject, chatId, status, createdAt, resolve, reject, timer }
    this.pcInfo = null;
    this.lastHeartbeat = 0;
  }

  recordHeartbeat(info = {}) {
    this.lastHeartbeat = Date.now();
    this.pcInfo = {
      ...info,
      lastSeen: new Date().toISOString(),
      lastSeenFormatted: new Date().toLocaleTimeString('pt-PT', { timeZone: 'Europe/Lisbon' })
    };
  }

  isPcOnline(timeoutMs = 60000) {
    if (!this.lastHeartbeat) return false;
    return Date.now() - this.lastHeartbeat < timeoutMs;
  }

  getPcInfo() {
    return this.pcInfo;
  }

  getPendingOrders() {
    const list = [];
    for (const [id, order] of this.orders.entries()) {
      if (order.status === 'pending') {
        list.push({
          id: order.id,
          order: order.order,
          targetProject: order.targetProject || null,
          createdAt: order.createdAt
        });
      }
    }
    return list;
  }

  // Envia uma ordem ao PC e aguarda a conclusão (com timeout)
  executeOnPc({ orderText, targetProject = null, chatId = '950415577', timeoutMs = 25000 }) {
    return new Promise((resolve, reject) => {
      if (!this.isPcOnline()) {
        return resolve({
          success: false,
          offline: true,
          output: '⚠️ *O teu PC Surface está offline ou em suspensão.*'
        });
      }

      const id = Date.now().toString() + '-' + Math.random().toString(36).slice(2, 6);
      const timer = setTimeout(() => {
        if (this.orders.has(id)) {
          const ord = this.orders.get(id);
          this.orders.delete(id);
          log.warn(`Ordem #${id} expirou por timeout (${timeoutMs / 1000}s)`);
          resolve({
            success: false,
            timeout: true,
            output: '⏱️ *Tempo limite excedido:* O PC não respondeu a tempo à execução.'
          });
        }
      }, timeoutMs);

      this.orders.set(id, {
        id,
        order: orderText,
        targetProject,
        chatId,
        status: 'pending',
        createdAt: new Date().toISOString(),
        resolve,
        reject,
        timer
      });

      log.info(`Ordem #${id} colocada na fila para o PC: "${orderText}"`);
    });
  }

  completeOrder(id, result = {}) {
    if (!this.orders.has(id)) {
      log.warn(`Ordem #${id} reportada mas não existe na fila (ou expirou)`);
      return false;
    }

    const order = this.orders.get(id);
    clearTimeout(order.timer);
    this.orders.delete(id);

    log.info(`✅ Ordem #${id} concluída com sucesso pelo PC`);
    order.resolve(result);
    return true;
  }
}

export const pcRemoteBridge = new PcRemoteBridge();
export default pcRemoteBridge;

