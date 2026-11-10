// src/shared/whisperAudio.js — Pipeline de Transcrição de Voz com Groq Whisper para Telegram
import axios from 'axios';
import { createLogger } from '../utils/logger.js';

const log = createLogger('WhisperAudio');

/**
 * Transcreve uma mensagem de voz ou áudio do Telegram utilizando o Groq Whisper LPU (latência ultrabaixa).
 * 
 * @param {object} ctx - Contexto do Telegraf com mensagem de voz ou áudio
 * @returns {Promise<{ text: string, duration: number } | null>}
 */
export async function transcribeTelegramAudio(ctx) {
  const voice = ctx.message?.voice || ctx.message?.audio;
  if (!voice || !voice.file_id) {
    return null;
  }

  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) {
    log.error('GROQ_API_KEY não configurada para transcrição de áudio.');
    return null;
  }

  try {
    const fileId = voice.file_id;
    const duration = voice.duration || 0;
    const mimeType = voice.mime_type || 'audio/ogg';
    const ext = mimeType.includes('mpeg') || mimeType.includes('mp3') ? 'mp3' : 'ogg';

    log.info(`🎙️ A descarregar nota de voz do Telegram [ID: ${fileId}] (duração: ${duration}s, tipo: ${mimeType})...`);
    const fileLink = await ctx.telegram.getFileLink(fileId);

    const audioRes = await axios.get(fileLink.href, {
      responseType: 'arraybuffer',
      timeout: 15000
    });

    const audioBuffer = Buffer.from(audioRes.data);
    if (!audioBuffer || audioBuffer.length === 0) {
      throw new Error('Buffer de áudio vazio');
    }

    log.info(`Enviando áudio para Groq Whisper LPU (${audioBuffer.length} bytes)...`);

    const formData = new FormData();
    const blob = new Blob([audioBuffer], { type: mimeType });
    formData.append('file', blob, `voice.${ext}`);
    formData.append('model', 'whisper-large-v3-turbo');
    formData.append('language', 'pt');
    formData.append('response_format', 'json');

    const groqRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${groqKey}`
      },
      body: formData
    });

    if (!groqRes.ok) {
      const errText = await groqRes.text();
      throw new Error(`Erro API Groq Whisper (${groqRes.status}): ${errText}`);
    }

    const data = await groqRes.json();
    const text = (data.text || '').trim();

    log.info(`✅ Transcrição concluída com sucesso: "${text.substring(0, 60)}..."`);
    return { text, duration };
  } catch (err) {
    log.error('Erro na transcrição de áudio:', err.message);
    return null;
  }
}

