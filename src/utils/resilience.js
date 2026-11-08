// src/utils/resilience.js — Mecanismo de Timeout Preventivo e Contenção de Erros
import { createLogger } from './logger.js';

const log = createLogger('Resilience');

/**
 * Envolve uma Promise num limite estrito de tempo (Preventive Timeout).
 * Evita que chamadas a APIs externas (GitHub, OpenRouteService, Gemini, Groq, Cloudinary)
 * fiquem penduradas indefinidamente ou bloqueiem o event loop.
 *
 * @param {Promise<any>} promise - A promessa assíncrona a executar.
 * @param {number} ms - Tempo limite em milissegundos (padrão: 8000ms).
 * @param {string} customMsg - Mensagem de erro descritiva caso exceda o tempo.
 * @returns {Promise<any>} O resultado da promessa original.
 */
export async function withTimeout(
  promise,
  ms = 8000,
  customMsg = '⏱️ O serviço externo demorou mais de 8s a responder. A operação foi cancelada preventivamente para manter o bot rápido.'
) {
  let timerId;
  const timeoutPromise = new Promise((_, reject) => {
    timerId = setTimeout(() => {
      const err = new Error(customMsg);
      err.name = 'TimeoutError';
      reject(err);
    }, ms);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timerId);
  }
}

/**
 * Executa qualquer função assíncrona garantindo que:
 * 1. Não ultrapassa o tempo estipulado (timeoutMs).
 * 2. Qualquer exceção de rede, parsing ou lógica é contida localmente.
 * 3. Nunca deita abaixo o processo principal do Node.js nem o PM2.
 *
 * @param {() => Promise<string>} asyncFn - Função que executa a lógica do handler.
 * @param {string} workerName - Nome amigável do worker para registo de log.
 * @param {number} timeoutMs - Tempo limite preventivo (padrão: 8000ms).
 * @returns {Promise<string>} Resposta pronta para envio ao Telegram.
 */
export async function safeExecute(
  asyncFn,
  workerName = 'Worker',
  timeoutMs = 8000
) {
  try {
    return await withTimeout(asyncFn(), timeoutMs);
  } catch (err) {
    log.error(`Exceção contida localmente em [${workerName}]`, {
      error: err?.message || err,
      name: err?.name
    });

    if (err.name === 'TimeoutError' || err.message?.includes('demorou')) {
      return `⏱️ *Tempo Limite Excedido (${Math.round(timeoutMs / 1000)}s)*\n\nO módulo *${workerName}* não obteve resposta a tempo da API externa. O bot continua 100% ativo. Tenta novamente em instantes.`;
    }

    return `⚠️ *Aviso temporário em ${workerName}*\n\nNão foi possível concluir esta operação específica neste momento. O bot principal continua operacional.`;
  }
}
