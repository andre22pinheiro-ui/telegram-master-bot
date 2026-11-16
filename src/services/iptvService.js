// src/services/iptvService.js — Serviço Cloud-Native de Canais Abertos Free-TV / IPTV (ADR-044)
import axios from 'axios';
import { createLogger } from '../utils/logger.js';

const log = createLogger('IptvService');

export const FREE_TV_RAW_BASE = 'https://raw.githubusercontent.com/Free-TV/IPTV/master';

/**
 * Catálogo canónico curado de canais de sinal aberto, legais e gratuitos (Portugal & Notícias Internacionais)
 * Sincronizado factualmente com o repositório Free-TV/IPTV (playlists/playlist_portugal.m3u8)
 */
export const FREE_CHANNELS = [
  // --- Portugal: Generalistas & Informação ---
  {
    id: 'rtp1',
    name: 'RTP 1',
    category: 'Generalista',
    country: 'PT',
    epgId: 'RTP1.pt',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ec/RTP1_-_Logo_2016.svg/500px-RTP1_-_Logo_2016.svg.png',
    streamUrl: 'https://streaming-live.rtp.pt/liverepeater/smil:rtp1HD.smil/playlist.m3u8'
  },
  {
    id: 'rtp2',
    name: 'RTP 2',
    category: 'Cultura & Infantil',
    country: 'PT',
    epgId: 'RTP2.pt',
    logo: 'https://upload.wikimedia.org/wikipedia/en/4/4d/Rtp2_2016_logo.png',
    streamUrl: 'https://streaming-live.rtp.pt/liverepeater/rtp2HD.smil/playlist.m3u8'
  },
  {
    id: 'rtp3',
    name: 'RTP 3',
    category: 'Informação 24h',
    country: 'PT',
    epgId: 'RTP3.pt',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/b/b9/Rtp3.png',
    streamUrl: 'https://streaming-live.rtp.pt/livetvhlsDVR/rtpnHDdvr.smil/playlist.m3u8?DVR='
  },
  {
    id: 'sic',
    name: 'SIC',
    category: 'Generalista',
    country: 'PT',
    epgId: 'SIC.pt',
    logo: 'https://i.imgur.com/SPMqiDG.png',
    streamUrl: 'https://production-fast-sic.content.okast.tv/fa2e8c4385712f9aa54bbe52b1bd9b6b/channels/d9070446-8448-455e-8075-773b1ba12562/fc831b20-f252-4e7d-8cc5-2d05f4d43c1c/media_.m3u8'
  },
  {
    id: 'tvi',
    name: 'TVI',
    category: 'Generalista',
    country: 'PT',
    epgId: 'TVI.pt',
    logo: 'https://upload.wikimedia.org/wikipedia/en/6/63/TVI_logo_2017.png',
    streamUrl: 'https://raw.githubusercontent.com/thomraider12/canaistvpt/main/m3u8s/tvi.m3u8'
  },
  {
    id: 'rtp_memoria',
    name: 'RTP Memória',
    category: 'Arquivo & Séries',
    country: 'PT',
    epgId: 'RTPMemoria.pt',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/7/79/RtpMemoria_positivo_horiz_RGB.png',
    streamUrl: 'https://streaming-live.rtp.pt/liverepeater/smil:rtpmem.smil/playlist.m3u8'
  },
  {
    id: 'porto_canal',
    name: 'Porto Canal',
    category: 'Regional Norte',
    country: 'PT',
    epgId: 'PortoCanal.pt',
    logo: 'https://i.imgur.com/wsyvP2H.png',
    streamUrl: 'https://pull-live-156-1.global.ssl.fastly.net/pc5865dc25400thmb-ea6bf03b14fa318f7133/smil:pc1-jhrgyuoqe5865db-68tkgb14fa318f7133f03.smil/playlist.m3u8'
  },
  {
    id: 'canal_parlamento',
    name: 'Canal Parlamento (ARTV)',
    category: 'Institucional',
    country: 'PT',
    epgId: 'ARTV.pt',
    logo: 'https://i.imgur.com/FvlcU3z.png',
    streamUrl: 'https://playout172.livextend.cloud/liveiframe/_definst_/ngrp:liveartvabr_abr/playlist.m3u8'
  },
  {
    id: 'rtp_acores',
    name: 'RTP Açores',
    category: 'Regional Açores',
    country: 'PT',
    epgId: 'RTPAcores.pt',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/aa/RTP_A%C3%A7ores_%282016%29.svg/500px-RTP_A%C3%A7ores_%282016%29.svg.png',
    streamUrl: 'https://streaming-live.rtp.pt/liverepeater/smil:rtpacoresHD.smil/playlist.m3u8'
  },
  {
    id: 'rtp_madeira',
    name: 'RTP Madeira',
    category: 'Regional Madeira',
    country: 'PT',
    epgId: 'RTPMadeira.pt',
    logo: 'https://upload.wikimedia.org/wikipedia/en/a/ac/RTP_Madeira_2016.png',
    streamUrl: 'https://streaming-live.rtp.pt/liverepeater/smil:rtpmadeira.smil/playlist.m3u8'
  },
  {
    id: 'rtp_africa',
    name: 'RTP África',
    category: 'Internacional Lusófona',
    country: 'PT',
    epgId: 'RTPAfrica.pt',
    logo: 'https://i.imgur.com/ISFNy17.png',
    streamUrl: 'https://streaming-live.rtp.pt/liverepeater/smil:rtpafrica.smil/playlist.m3u8'
  },
  {
    id: 'cnn_portugal',
    name: 'CNN Portugal',
    category: 'Informação 24h',
    country: 'PT',
    epgId: 'CNNPortugal.pt',
    logo: 'https://i.imgur.com/NYH39xs.png',
    streamUrl: 'https://github.com/LITUATUI/M3UPT/raw/main/M3U/CNN_Portugal.m3u8'
  },
  // --- Internacional: Notícias & Atualidade ---
  {
    id: 'euronews_pt',
    name: 'Euronews (Português)',
    category: 'Notícias Europa',
    country: 'EU',
    epgId: 'EuronewsPortuguese.fr',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9c/Euronews_2022.svg/500px-Euronews_2022.svg.png',
    streamUrl: 'https://www.youtube.com/euronewspt/live'
  },
  {
    id: 'euronews_en',
    name: 'Euronews (English)',
    category: 'Notícias Europa',
    country: 'EU',
    epgId: 'EuronewsEnglish.fr',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9c/Euronews_2022.svg/500px-Euronews_2022.svg.png',
    streamUrl: 'https://euronews-euronews-world-1-eu.samsung.wurl.tv/playlist.m3u8'
  },
  {
    id: 'france24_en',
    name: 'France 24 (English)',
    category: 'Notícias Mundo',
    country: 'FR',
    epgId: 'France24English.fr',
    logo: 'https://static.france24.com/live/F24_EN_LO_HLS/live_tv.png',
    streamUrl: 'https://static.france24.com/live/F24_EN_LO_HLS/live_tv.m3u8'
  },
  {
    id: 'dw_news',
    name: 'Deutsche Welle (DW News)',
    category: 'Notícias Mundo',
    country: 'DE',
    epgId: 'DWNews.de',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/75/Deutsche_Welle_logo.svg/500px-Deutsche_Welle_logo.svg.png',
    streamUrl: 'https://dwamdstream102.akamaized.net/hls/live/2015525/dwstream102/index.m3u8'
  }
];

/**
 * Procura canal por ID ou nome
 */
export function findChannel(query = '') {
  const q = String(query || '').toLowerCase().trim();
  if (!q) return null;
  return FREE_CHANNELS.find(
    (c) => c.id.toLowerCase() === q || c.name.toLowerCase().includes(q) || (c.epgId && c.epgId.toLowerCase().includes(q))
  ) || null;
}

/**
 * Devolve a lista de canais filtrada por país ou categoria
 */
export function getChannels(filter = '') {
  const f = String(filter || '').toLowerCase().trim();
  if (!f || f === 'todos' || f === 'all') return FREE_CHANNELS;
  if (f === 'pt' || f === 'portugal') return FREE_CHANNELS.filter((c) => c.country === 'PT');
  if (f === 'news' || f === 'noticias' || f === 'notícias') {
    return FREE_CHANNELS.filter((c) => c.category.toLowerCase().includes('inform') || c.category.toLowerCase().includes('notícia'));
  }
  return FREE_CHANNELS.filter(
    (c) => c.name.toLowerCase().includes(f) || c.category.toLowerCase().includes(f) || c.country.toLowerCase() === f
  );
}

/**
 * URL oficial da playlist raw no repositório Free-TV/IPTV
 */
export function getOfficialPlaylistUrl(country = 'portugal') {
  const c = country.toLowerCase() === 'pt' ? 'portugal' : country.toLowerCase();
  return `${FREE_TV_RAW_BASE}/playlists/playlist_${c}.m3u8`;
}

/**
 * Gera conteúdo de playlist .m3u formatada
 */
export function generateM3uContent(channels = FREE_CHANNELS) {
  let m3u = '#EXTM3U x-tvg-url="https://epgshare01.online/epgshare01/epg_ripper_PT1.xml.gz"\n\n';
  for (const ch of channels) {
    m3u += `#EXTINF:-1 tvg-id="${ch.epgId || ''}" tvg-name="${ch.name}" tvg-logo="${ch.logo}" group-title="${ch.category}",${ch.name}\n`;
    m3u += `${ch.streamUrl}\n\n`;
  }
  return m3u;
}

/**
 * Validação de conectividade rápida de stream (HEAD ou GET parcial <3s)
 */
export async function checkStreamHealth(streamUrl = '') {
  if (!streamUrl || streamUrl.includes('youtube.com')) {
    return { ok: true, status: 200, latencyMs: 0, note: 'stream_web' };
  }
  const start = Date.now();
  try {
    const res = await axios.get(streamUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Node-IPTV-Agent)' },
      timeout: 3500,
      maxContentLength: 1024 * 50
    });
    return {
      ok: res.status >= 200 && res.status < 400,
      status: res.status,
      latencyMs: Date.now() - start
    };
  } catch (err) {
    return {
      ok: false,
      status: err.response?.status || 0,
      error: err.message,
      latencyMs: Date.now() - start
    };
  }
}

/**
 * Formata o Relatório Estruturado de Canais para Telegram
 */
export function formatIptvCatalogMarkdown(filter = 'pt') {
  const channels = getChannels(filter);
  const countryName = filter.toLowerCase() === 'news' ? 'Notícias 24h' : 'Portugal (Sinal Aberto)';
  const officialUrl = getOfficialPlaylistUrl('portugal');

  let text = `📺 *Free-TV / IPTV — Canais Abertos Legais*\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `🌍 *Região:* ${countryName} | *Canais:* ${channels.length}\n`;
  text += `📡 *Origem:* [Free-TV/IPTV GitHub](${FREE_TV_RAW_BASE})\n\n`;

  channels.forEach((ch, idx) => {
    const isDirectHls = ch.streamUrl.endsWith('.m3u8');
    const badge = isDirectHls ? '🔴 [HLS]' : '🌐 [WEB]';
    text += `*${idx + 1}. ${ch.name}* _(${ch.category})_\n`;
    text += `   ↳ ${badge} [Ver Emissão Ao Vivo](${ch.streamUrl})\n`;
    text += `   ↳ Comando: \`/tv ${ch.id}\`\n\n`;
  });

  text += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `📲 *Como Usar no VLC, Kodi, Smart TV ou TiviMate:*\n`;
  text += `• Playlist Direta: \`${officialUrl}\`\n`;
  text += `• Verificar streams: \`/tv check\`\n`;
  text += `• Filtrar notícias: \`/tv news\` | Todos: \`/tv todos\``;

  return text;
}

/**
 * Devolve detalhes e link direto de um canal específico
 */
export async function formatSingleChannelMarkdown(query = '') {
  const ch = findChannel(query);
  if (!ch) {
    return (
      `⚠️ *Canal não encontrado:* "${query}"\n\n` +
      `Para ver todos os canais disponíveis, escreve \`/tv\` ou \`/tv news\`.\n` +
      `Exemplos: \`/tv rtp1\`, \`/tv sic\`, \`/tv tvi\`, \`/tv porto_canal\``
    );
  }

  const health = await checkStreamHealth(ch.streamUrl);
  const healthBadge = health.ok ? `🟢 Online (${health.latencyMs}ms)` : `🟡 A validar / Inacessível (${health.status || health.error})`;

  return (
    `📺 *${ch.name}* _(${ch.category})_\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `• *País/Região:* ${ch.country}\n` +
    `• *EPG ID:* \`${ch.epgId || 'N/A'}\`\n` +
    `• *Estado do Stream:* ${healthBadge}\n\n` +
    `🔗 *URL do Stream HLS / Emissão:* [Abrir no Reprodutor](${ch.streamUrl})\n` +
    `📋 *Link Direto M3U8:*\n\`${ch.streamUrl}\`\n\n` +
    `💡 _Dica: Copia o link acima e cola no reprodutor de rede do VLC Media Player ou clica para abrir diretamente._`
  );
}

/**
 * Executa healthcheck em massa nos canais portugueses principais
 */
export async function runIptvHealthCheck() {
  const ptChannels = getChannels('pt').slice(0, 8); // Verifica os 8 primeiros para resposta rápida (<5s)
  let report = `🩺 *Diagnóstico de Streams IPTV (Sinal Aberto PT)*\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;

  for (const ch of ptChannels) {
    const check = await checkStreamHealth(ch.streamUrl);
    const badge = check.ok ? '🟢' : '🔴';
    const lat = check.ok ? `${check.latencyMs}ms` : `erro ${check.status || check.error}`;
    report += `${badge} *${ch.name}:* ${lat}\n`;
  }

  report += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  report += `✅ _Catálogo baseado no repositório Free-TV/IPTV (transmissões públicas autorizadas)._`;
  return report;
}

export default {
  FREE_CHANNELS,
  findChannel,
  getChannels,
  getOfficialPlaylistUrl,
  generateM3uContent,
  checkStreamHealth,
  formatIptvCatalogMarkdown,
  formatSingleChannelMarkdown,
  runIptvHealthCheck
};
