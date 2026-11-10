// src/services/emailService.js — Assistente Executivo de Leitura e Resumo de Emails por IA
import 'dotenv/config';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { askAgent } from './reasoningService.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('EmailAssistant');

const EMAIL_USER = process.env.EMAIL_USER || '';
const EMAIL_PASS = process.env.EMAIL_PASS || '';
const EMAIL_HOST = process.env.EMAIL_HOST || 'imap.gmail.com';
const EMAIL_PORT = parseInt(process.env.EMAIL_PORT, 10) || 993;
const EMAIL_SECURE = process.env.EMAIL_SECURE !== 'false';

/**
 * Verifica o estado da configuração de email
 */
export function getEmailStatus() {
  if (!EMAIL_USER || !EMAIL_PASS) {
    return {
      configured: false,
      message: 'Configuração de email em falta no ficheiro .env (EMAIL_USER e EMAIL_PASS)'
    };
  }

  // Mascarar email para segurança nos logs/respostas
  const parts = EMAIL_USER.split('@');
  const maskedName = parts[0].length > 3 ? parts[0].slice(0, 2) + '***' + parts[0].slice(-1) : '***';
  const masked = `${maskedName}@${parts[1] || 'gmail.com'}`;

  return {
    configured: true,
    maskedEmail: masked,
    host: EMAIL_HOST,
    port: EMAIL_PORT
  };
}

/**
 * Conecta à caixa de correio via IMAP e obtém os emails mais recentes
 */
export async function fetchRecentEmails(max = 5, unreadOnly = false) {
  const status = getEmailStatus();
  if (!status.configured) {
    log.warn('Tentativa de ler emails sem credenciais configuradas');
    return {
      success: false,
      configured: false,
      emails: [],
      error: 'Credenciais de email não configuradas no servidor.'
    };
  }

  const client = new ImapFlow({
    host: EMAIL_HOST,
    port: EMAIL_PORT,
    secure: EMAIL_SECURE,
    auth: {
      user: EMAIL_USER,
      pass: EMAIL_PASS
    },
    logger: false
  });

  const emails = [];

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');

    try {
      // Procura por não lidos ou pelas mensagens mais recentes
      const searchCriteria = unreadOnly ? { unseen: true } : { all: true };
      const messages = await client.search(searchCriteria, { uid: true });

      if (messages && messages.length > 0) {
        // Obter os últimos N emails (os mais recentes estão no fim da lista)
        const recentUids = messages.slice(-max).reverse();

        for (const uid of recentUids) {
          const fetched = await client.fetchOne(uid, {
            envelope: true,
            source: true,
            internalDate: true,
            flags: true
          });

          if (fetched && fetched.source) {
            const parsed = await simpleParser(fetched.source);

            emails.push({
              uid,
              messageId: parsed.messageId || String(uid),
              from: parsed.from?.text || parsed.from?.value?.[0]?.address || 'Desconhecido',
              fromAddress: parsed.from?.value?.[0]?.address || '',
              fromName: parsed.from?.value?.[0]?.name || '',
              to: parsed.to?.text || '',
              subject: parsed.subject || '(Sem Assunto)',
              date: parsed.date || fetched.internalDate,
              text: parsed.text ? parsed.text.trim().slice(0, 3000) : '',
              isUnread: fetched.flags ? !fetched.flags.has('\\Seen') : true
            });
          }
        }
      }
    } finally {
      lock.release();
    }

    await client.logout();
    return { success: true, configured: true, emails };
  } catch (err) {
    log.error('Erro na ligação IMAP:', err.message);
    try { await client.logout(); } catch (_) {}
    return {
      success: false,
      configured: true,
      emails: [],
      error: `Erro ao ligar ao servidor de email: ${err.message}`
    };
  }
}

/**
 * Gera um resumo executivo por IA para um email específico
 */
export async function summarizeEmailWithAI(email) {
  const prompt = 
    `Age como Assistente Executivo Pessoal Sénior de André Pinheiro.\n` +
    `Analisa o seguinte email recebido e gera um resumo executivo em português de Portugal:\n\n` +
    `De: ${email.from}\n` +
    `Data: ${new Date(email.date).toLocaleString('pt-PT')}\n` +
    `Assunto: ${email.subject}\n\n` +
    `Conteúdo:\n${email.text || '(Sem conteúdo em texto simples)'}\n\n` +
    `Gera o seguinte formato estrito:\n` +
    `1. Resumo em 2 tópicos objetivos (o que realmente interessa).\n` +
    `2. Urgência: 🔴 Alta (se exigir ação imediata), 🟡 Média ou 🟢 Informativo.\n` +
    `3. Ação Requerida: [O que o André precisa de fazer, ou "Nenhuma ação necessária"].\n` +
    `4. Minuta de Resposta Rápida (1-2 frases profissionais se o email pedir resposta).`;

  try {
    const summary = await askAgent({
      chatId: '950415577',
      workerTag: 'master',
      prompt
    });
    return summary;
  } catch (err) {
    log.error('Erro ao gerar resumo de email por IA:', err.message);
    return `Assunto: ${email.subject}\nRemetente: ${email.from}\n\n(Não foi possível processar o resumo automático)`;
  }
}

/**
 * Produz o Briefing Geral de Emails para o Telegram
 */
export async function getEmailBriefing(max = 5) {
  const status = getEmailStatus();

  // Caso ainda não configurado, apresentar guia de ativação amigável
  if (!status.configured) {
    return (
      `📧 *Assistente Pessoal de Email*\n\n` +
      `⚠️ *A tua conta de email ainda não está associada ao bot.*\n\n` +
      `Para o bot ler os teus emails e gerar resumos automáticos por IA:\n\n` +
      `1️⃣ Acede a: [Google App Passwords](https://myaccount.google.com/apppasswords)\n` +
      `2️⃣ Cria uma palavra-passe com o nome *"TelegramBot"*\n` +
      `3️⃣ Adiciona ao ficheiro \`.env\`:\n` +
      `\`EMAIL_USER=teu_email@gmail.com\`\n` +
      `\`EMAIL_PASS=xxxx xxxx xxxx xxxx\`\n\n` +
      `💡 _Assim que definires estas variáveis, podes usar \`/emails\` ou \`/resumo_emails\` a qualquer momento!_`
    );
  }

  const { success, emails, error } = await fetchRecentEmails(max);

  if (!success) {
    return `❌ *Erro ao aceder à Caixa de Correio:*\n${error}\n\nVerifica se a palavra-passe de aplicação ou o servidor IMAP estão corretos.`;
  }

  if (emails.length === 0) {
    return `📭 *Caixa de Entrada Vazia ou Sem Mensagens Recentes*\nConta: \`${status.maskedEmail}\``;
  }

  let text = `📬 *Caixa de Entrada — ${status.maskedEmail}*\n`;
  text += `A analisar os últimos ${emails.length} emails com Inteligência Artificial:\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  for (let i = 0; i < emails.length; i++) {
    const e = emails[i];
    const dt = new Date(e.date).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const unreadBadge = e.isUnread ? '🔵 *NÃO LIDO*' : '⚪';

    text += `${unreadBadge} *${i + 1}. ${e.subject}*\n`;
    text += `   👤 *De:* _${e.fromName || e.fromAddress || e.from}_\n`;
    text += `   ⏰ *Hora:* ${dt}\n`;

    // Gerar resumo curto de 1-2 linhas
    if (e.text) {
      const previewText = e.text.replace(/\s+/g, ' ').slice(0, 140);
      text += `   📝 _"${previewText}..."_\n`;
    }
    text += `\n`;
  }

  text += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `💡 *Comando:* Envia \`/ler_email 1\` para ver o resumo aprofundado e a minuta de resposta de um email!`;

  return text;
}

export default {
  getEmailStatus,
  fetchRecentEmails,
  summarizeEmailWithAI,
  getEmailBriefing
};
