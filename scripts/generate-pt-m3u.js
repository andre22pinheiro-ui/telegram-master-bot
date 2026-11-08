import axios from 'axios';
import fs from 'fs';

const BASE = 'http://stream-box8k.top:80';
const USER = '3890e14f2fa9';
const PASS = 'c71262cd90';

async function main() {
  console.log('A consultar a API do servidor Xtream Codes...');
  const catRes = await axios.get(`${BASE}/player_api.php?username=${USER}&password=${PASS}&action=get_live_categories`);
  const ptCats = catRes.data.filter(c => /^pt\s*\|/i.test(c.category_name) || /portugal/i.test(c.category_name));
  
  const catMap = new Map();
  ptCats.forEach(c => catMap.set(String(c.category_id), c.category_name.trim()));

  const streamRes = await axios.get(`${BASE}/player_api.php?username=${USER}&password=${PASS}&action=get_live_streams`);
  const ptStreams = streamRes.data.filter(s => catMap.has(String(s.category_id)));
  
  // Clean separators
  const validStreams = ptStreams.filter(s => {
    const name = s.name.trim();
    return !name.startsWith('###') && !name.startsWith('---') && !name.startsWith('===') && !name.startsWith('######');
  });

  let m3u = '#EXTM3U\n';
  const categorySummary = {};

  for (const s of validStreams) {
    const cat = catMap.get(String(s.category_id)) || 'PT| PORTUGAL';
    if (!categorySummary[cat]) categorySummary[cat] = [];
    categorySummary[cat].push(s.name.trim());

    const logo = s.stream_icon ? ` tvg-logo="${s.stream_icon}"` : '';
    m3u += `#EXTINF:-1 tvg-id="${s.epg_channel_id || ''}" tvg-name="${s.name}"${logo} group-title="${cat}",${s.name}\n`;
    m3u += `${BASE}/live/${USER}/${PASS}/${s.stream_id}.ts\n`;
  }

  // 1. Gravar ficheiro M3U no Ambiente de Trabalho
  const m3uPath = 'c:/Users/Surface_Dpc/Desktop/PORTUGAL_COMPLETO.m3u';
  fs.writeFileSync(m3uPath, m3u, 'utf-8');
  console.log(`[OK] Ficheiro M3U gerado: ${m3uPath} (${(m3u.length / 1024).toFixed(1)} KB, ${validStreams.length} canais)`);

  // 2. Gravar ficheiro TXT com a grelha organizada por categorias
  let txt = `================================================================================\n`;
  txt += `           GRELHA COMPLETA DE CANAIS DE PORTUGAL (${validStreams.length} CANAIS)\n`;
  txt += `================================================================================\n\n`;
  txt += `Ficheiro M3U correspondente gerado no Ambiente de Trabalho:\n`;
  txt += `-> PORTUGAL_COMPLETO.m3u (Pode arrastar diretamente para a janela do VLC!)\n\n`;

  for (const [cat, channels] of Object.entries(categorySummary)) {
    txt += `--------------------------------------------------------------------------------\n`;
    txt += `📂 ${cat} (${channels.length} canais)\n`;
    txt += `--------------------------------------------------------------------------------\n`;
    channels.forEach((ch, idx) => {
      txt += `  ${String(idx + 1).padStart(3, ' ')}. ${ch}\n`;
    });
    txt += `\n`;
  }

  const txtPath = 'c:/Users/Surface_Dpc/Desktop/GRELHA_PORTUGAL_COMPLETA.txt';
  fs.writeFileSync(txtPath, txt, 'utf-8');
  console.log(`[OK] Ficheiro de texto gerado: ${txtPath}`);

  // 3. Gravar cópia no diretório público do telegram-master-bot para poder ser acedido via HTTP
  const publicM3uPath = 'c:/Users/Surface_Dpc/Desktop/projectos/telegram-master-bot/public/portugal.m3u';
  fs.writeFileSync(publicM3uPath, m3u, 'utf-8');
  console.log(`[OK] Ficheiro público para o servidor web gerado: ${publicM3uPath}`);

  // 4. Copiar para o projeto MatchPro se existir
  const matchproM3u = 'c:/Users/Surface_Dpc/Desktop/projectos/matchpro/public/portugal.m3u';
  try {
    fs.writeFileSync(matchproM3u, m3u, 'utf-8');
    console.log(`[OK] Ficheiro copiado para matchpro/public/portugal.m3u`);
  } catch (e) {
    console.log(`Aviso ao copiar para matchpro:`, e.message);
  }
}

main().catch(err => {
  console.error('Erro na execução:', err);
  process.exit(1);
});

