// src/services/tvService.js — Gestor de IPTV, Listas M3U e Pesquisa de Canais
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { Markup } from 'telegraf';
import { createLogger } from '../utils/logger.js';

const log = createLogger('TvService');

const XTREAM_SERVER = 'http://stream-box8k.top:80';
const XTREAM_USER = '3890e14f2fa9';
const XTREAM_PASS = 'c71262cd90';

// Links rápidos encurtados e online
export const TV_LINKS = {
  portugalShort: 'https://is.gd/matchpropt',
  portugalVercel: 'https://matchpro-alpha.vercel.app/portugal.m3u',
  criancasVercel: 'https://matchpro-alpha.vercel.app/criancas.m3u',
  top16Vercel: 'https://matchpro-alpha.vercel.app/top.m3u',
  masterShort: 'https://is.gd/matchpro57k',
  masterOriginal: `${XTREAM_SERVER}/get.php?username=${XTREAM_USER}&password=${XTREAM_PASS}&type=m3u_plus&output=ts`
};

let cachedChannels = null;

/**
 * Remove acentos e converte para minúsculas para pesquisa flexível.
 */
function normalizeText(text) {
  return (text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Carrega a lista de 776 canais de Portugal para memória.
 */
export function getChannels() {
  if (cachedChannels && cachedChannels.length > 0) {
    return cachedChannels;
  }

  const paths = [
    path.resolve('./public/portugal.m3u'),
    'c:/Users/Surface_Dpc/Desktop/PORTUGAL_COMPLETO.m3u',
    path.resolve('./data/portugal.m3u')
  ];

  let content = null;
  for (const p of paths) {
    if (existsSync(p)) {
      try {
        content = readFileSync(p, 'utf-8');
        log.info(`Canais de Portugal carregados a partir de: ${p}`);
        break;
      } catch (e) {
        log.warn(`Erro ao ler ${p}:`, e.message);
      }
    }
  }

  if (!content) {
    log.warn('Nenhum ficheiro M3U de Portugal encontrado localmente.');
    return [];
  }

  const lines = content.split('\n');
  const list = [];
  let current = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('#EXTINF:')) {
      const groupMatch = line.match(/group-title="([^"]+)"/);
      const nameMatch = line.match(/,([^\n\r]+)$/);
      current = {
        group: groupMatch ? groupMatch[1].trim() : 'Portugal',
        name: nameMatch ? nameMatch[1].trim() : 'Canal Sem Nome'
      };
    } else if (line.startsWith('http') && current) {
      current.url = line;
      list.push(current);
      current = null;
    }
  }

  cachedChannels = list;
  log.info(`Total de canais em cache: ${list.length}`);
  return cachedChannels;
}

/**
 * Pesquisa canais por nome ou categoria.
 */
export function searchChannels(query, limit = 5) {
  const all = getChannels();
  if (!query || query.trim() === '') {
    // Retorna canais populares caso a pesquisa venha vazia
    return all.filter(c => 
      c.name.includes('RTP 1') || 
      c.name.includes('SIC') || 
      c.name.includes('TVI') || 
      c.name.includes('SPORT TV 1') || 
      c.name.includes('PANDA')
    ).slice(0, limit);
  }

  const cleanQ = normalizeText(query);
  const words = cleanQ.split(/\s+/).filter(Boolean);

  const matched = all.filter(c => {
    const normName = normalizeText(c.name);
    const normGroup = normalizeText(c.group);
    return words.every(w => normName.includes(w) || normGroup.includes(w));
  });

  // Ordena por relevância (correspondência no início do nome tem prioridade)
  matched.sort((a, b) => {
    const aNorm = normalizeText(a.name);
    const bNorm = normalizeText(b.name);
    const aStarts = aNorm.startsWith(cleanQ);
    const bStarts = bNorm.startsWith(cleanQ);
    if (aStarts && !bStarts) return -1;
    if (!aStarts && bStarts) return 1;
    return a.name.localeCompare(b.name);
  });

  return matched.slice(0, limit);
}

/**
 * Formata os resultados de pesquisa para o Telegram com links diretos.
 */
export function formatSearchResults(query, results) {
  if (!results || results.length === 0) {
    return {
      text: `🔍 Não encontrei nenhum canal correspondente a "*${query}*".\n\n_Dica: Tente pesquisar por exemplo:_ \`/canal sic\`, \`/canal sport tv 1\` ou \`/canal panda\`.`,
      keyboard: Markup.inlineKeyboard([
        [Markup.button.callback('📺 Menu Principal TV', 'act_tv_menu')]
      ])
    };
  }

  let text = `🔍 *Resultados para:* "*${query}*" (${results.length} encontrados)\n\n`;
  const keyboardRows = [];

  results.forEach((c, idx) => {
    text += `*${idx + 1}. ${c.name}*\n`;
    text += `📂 _${c.group}_\n`;
    text += `🔗 [Link Direto do Fluxo](${c.url})\n\n`;

    // Botão para abrir direto
    keyboardRows.push([
      Markup.button.url(`▶️ Abrir ${c.name.substring(0, 24)}`, c.url)
    ]);
  });

  keyboardRows.push([
    Markup.button.callback('📺 Menu Principal TV', 'act_tv_menu')
  ]);

  return {
    text,
    keyboard: Markup.inlineKeyboard(keyboardRows)
  };
}

/**
 * Constrói o menu principal da TV para o Telegram.
 */
export function getTvCockpit() {
  const text = 
    `📺 *CENTRAL DE TV & IPTV MATCHPRO*\n\n` +
    `Aceda aos seus canais em direto no telemóvel, computador ou na Fire TV Stick com o VLC Player:\n\n` +
    `• 🇵🇹 *Portugal Completo:* 776 canais organizados por operadora (MEO, Vodafone, VIP)\n` +
    `• 👶 *Crianças & Desenhos:* 11 canais infantis sem paragens\n` +
    `• ⚽ *Top 16 Desporto:* Sport TV, DAZN, BTV, Sporting TV, Canal 11\n` +
    `• 🌐 *Master Global:* 57.031 canais mundiais\n\n` +
    `_Pode também pesquisar qualquer canal digitando:_ \`/canal <nome>\``;

  const keyboard = Markup.inlineKeyboard([
    [
      Markup.button.url('🇵🇹 Portugal (776 canais)', TV_LINKS.portugalShort),
      Markup.button.callback('📥 Descarregar M3U', 'act_tv_download_pt')
    ],
    [
      Markup.button.url('👶 Crianças (11)', TV_LINKS.criancasVercel),
      Markup.button.url('⚽ Top 16 Desporto', TV_LINKS.top16Vercel)
    ],
    [
      Markup.button.url('🌐 Master Global (57k)', TV_LINKS.masterShort)
    ],
    [
      Markup.button.callback('🔑 Dados Xtream Codes', 'act_tv_creds'),
      Markup.button.callback('💡 Ajuda no VLC', 'act_tv_help')
    ],
    [
      Markup.button.callback('🎛️ Voltar ao Cockpit', 'act_main_menu')
    ]
  ]);

  return { text, keyboard };
}

/**
 * Retorna o Markdown com as credenciais Xtream Codes prontas para cópia.
 */
export function getXtreamCredentialsMarkdown() {
  return (
    `🔑 *Dados de Acesso Xtream Codes*\n` +
    `_(Toca no texto em caixa cinzenta para copiar no telemóvel)_\n\n` +
    `• *URL do Servidor:*\n\`${XTREAM_SERVER}\`\n\n` +
    `• *Nome de Utilizador:*\n\`${XTREAM_USER}\`\n\n` +
    `• *Palavra-passe:*\n\`${XTREAM_PASS}\`\n\n` +
    `• *Estado:* \`Ativa (World 8K)\`\n\n` +
    `_Podes inserir diretamente em apps como TiviMate, IPTV Smarters Pro, Televizo ou XCIPTV na Smart TV._`
  );
}

/**
 * Retorna as instruções de configuração para o VLC.
 */
export function getVlcHelpMarkdown() {
  return (
    `💡 *Como Abrir no VLC (Fire TV Stick, Android ou PC):*\n\n` +
    `1. Abra a aplicação **VLC**.\n` +
    `2. No menu, escolha **Navegar** (ou ícone 🌐 / **Mais**).\n` +
    `3. Selecione **Fluxo de Rede** (ou _Abrir MRL_).\n` +
    `4. Digite ou cole o link curto de Portugal:\n` +
    `   👉 \`${TV_LINKS.portugalShort}\`\n\n` +
    `5. Prima **Reproduzir**. O VLC guarda a lista no histórico para mudar de canal num instante com as setas do comando!`
  );
}

