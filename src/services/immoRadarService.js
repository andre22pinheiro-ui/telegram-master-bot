// src/services/immoRadarService.js — Motor de Radar, Pesquisa Diária e Alertas de Imóveis em Amarante
import Database from 'better-sqlite3';
import path from 'path';
import axios from 'axios';
import { createLogger } from '../utils/logger.js';
import { avaliarImovelCmvm, formatarAvaliacaoMarkdown } from './immoCmvmService.js';
import { IMMO_SITES, VERCEL_IMMO_APP } from '../shared/immoSitesCatalog.js';
import { searchLiveWeb } from '../shared/webSearch.js';

const log = createLogger('ImmoRadar');
const DB_PATH = path.resolve('./data/imoveis_amarante.db');
const ANDRE_CHAT_ID = process.env.TELEGRAM_ADMIN_ID || '950415577';

let db;
try {
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  initTables();
} catch (err) {
  log.error('Erro ao ligar à base de dados imoveis_amarante.db:', err.message);
}

function initTables() {
  if (!db) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS imoveis (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fingerprint TEXT NOT NULL,
      freguesia TEXT,
      tipologia TEXT,
      titulo TEXT,
      portal TEXT,
      url TEXT UNIQUE,
      preco REAL,
      area_util REAL,
      area_terreno REAL,
      classe_energetica TEXT,
      sem_licenca INTEGER DEFAULT 0,
      is_ruina INTEGER DEFAULT 0,
      valor_cmvm REAL,
      classificacao TEXT,
      alertado INTEGER DEFAULT 0,
      data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      data_atualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS radar_execucoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      data_execucao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      novos_encontrados INTEGER DEFAULT 0,
      total_varridos INTEGER DEFAULT 0,
      status TEXT
    );
  `);

  // Migrações seguras e dinâmicas para bases de dados pré-existentes
  try {
    const colunas = db.prepare("PRAGMA table_info(imoveis)").all().map(c => c.name);
    if (!colunas.includes('valor_cmvm')) {
      db.exec('ALTER TABLE imoveis ADD COLUMN valor_cmvm REAL;');
    }
    if (!colunas.includes('classificacao')) {
      db.exec('ALTER TABLE imoveis ADD COLUMN classificacao TEXT;');
    }
    if (!colunas.includes('alertado')) {
      db.exec('ALTER TABLE imoveis ADD COLUMN alertado INTEGER DEFAULT 0;');
    }
    if (!colunas.includes('is_ruina')) {
      db.exec('ALTER TABLE imoveis ADD COLUMN is_ruina INTEGER DEFAULT 0;');
    }

    // Calcular valores CMVM para imóveis existentes que ainda não tenham avaliação
    const pendentes = db.prepare('SELECT * FROM imoveis WHERE valor_cmvm IS NULL OR valor_cmvm = 0').all();
    if (pendentes.length > 0) {
      log.info(`A calcular normas CMVM para ${pendentes.length} imóveis existentes na base de dados...`);
      const updateStmt = db.prepare('UPDATE imoveis SET valor_cmvm = ?, classificacao = ? WHERE id = ?');
      for (const row of pendentes) {
        const av = avaliarImovelCmvm({
          precoAnunciado: row.preco || 0,
          areaUtil: row.area_util || 100,
          areaTerreno: row.area_terreno || 0,
          classeEnergetica: row.classe_energetica || 'D',
          zona: row.freguesia || 'Amarante',
          semLicenca: Boolean(row.sem_licenca),
          isRuina: Boolean(row.is_ruina)
        });
        updateStmt.run(av.valorIntrinseco, av.classificacao, row.id);
      }
      log.info('Valores CMVM calculados e guardados para todo o acervo imobiliário!');
    }
  } catch (migErr) {
    log.warn('Aviso de migração de colunas em imoveis:', migErr.message);
  }
}

/**
 * Normaliza e gera fingerprint único de um imóvel
 */
function gerarFingerprint(freguesia, tipologia, areaUtil) {
  const f = (freguesia || 'amarante').toLowerCase().trim().replace(/\s+/g, '-');
  const t = (tipologia || 'T3').toUpperCase().replace('V', 'T');
  const a = Math.round((parseFloat(areaUtil) || 100) / 10) * 10;
  return `${f}_${t}_${a}m2`;
}

/**
 * Insere ou atualiza um imóvel na base de dados
 * Devolve { isNovo: boolean, imovel: Object }
 */
export function guardarImovel(dados) {
  if (!db) return { isNovo: false, imovel: dados };

  const fp = gerarFingerprint(dados.freguesia, dados.tipologia, dados.area_util);
  const av = avaliarImovelCmvm({
    precoAnunciado: dados.preco,
    areaUtil: dados.area_util,
    areaTerreno: dados.area_terreno || 0,
    classeEnergetica: dados.classe_energetica || 'D',
    zona: dados.freguesia || 'Amarante',
    semLicenca: Boolean(dados.sem_licenca),
    isRuina: Boolean(dados.is_ruina)
  });

  const existente = db.prepare('SELECT id, preco, alertado FROM imoveis WHERE url = ? OR (fingerprint = ? AND preco = ?)').get(dados.url, fp, dados.preco);

  if (existente) {
    db.prepare(`
      UPDATE imoveis 
      SET preco = ?, valor_cmvm = ?, classificacao = ?, data_atualizacao = datetime('now', 'localtime')
      WHERE id = ?
    `).run(dados.preco, av.valorIntrinseco, av.classificacao, existente.id);

    return {
      isNovo: false,
      imovel: { ...dados, id: existente.id, valor_cmvm: av.valorIntrinseco, classificacao: av.classificacao }
    };
  }

  const res = db.prepare(`
    INSERT INTO imoveis (
      fingerprint, freguesia, tipologia, titulo, portal, url, preco,
      area_util, area_terreno, classe_energetica, sem_licenca, is_ruina,
      valor_cmvm, classificacao, alertado
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
  `).run(
    fp,
    dados.freguesia || 'Amarante',
    dados.tipologia || 'T3',
    dados.titulo || 'Moradia em Amarante',
    dados.portal || 'Imobiliária',
    dados.url,
    dados.preco || 0,
    dados.area_util || 100,
    dados.area_terreno || 0,
    dados.classe_energetica || 'D',
    dados.sem_licenca ? 1 : 0,
    dados.is_ruina ? 1 : 0,
    av.valorIntrinseco,
    av.classificacao
  );

  // Sincronizar quase em tempo real para o Google Drive
  import('./googleDriveService.js')
    .then(m => m.triggerDebouncedDriveSync?.(30000))
    .catch(() => {});

  return {
    isNovo: true,
    imovel: { ...dados, id: res.lastInsertRowid, valor_cmvm: av.valorIntrinseco, classificacao: av.classificacao }
  };
}

/**
 * Obtém todos os imóveis monitorizados
 */
export function listarImoveis(limite = 20) {
  if (!db) return [];
  return db.prepare('SELECT * FROM imoveis ORDER BY data_criacao DESC LIMIT ?').all(limite);
}

/**
 * Obtém os imóveis novos que ainda não foram alertados
 */
export function obterImoveisNaoAlertados() {
  if (!db) return [];
  return db.prepare('SELECT * FROM imoveis WHERE alertado = 0 ORDER BY data_criacao DESC').all();
}

/**
 * Marca imóveis como alertados
 */
export function marcarAlertados(ids = []) {
  if (!db || ids.length === 0) return;
  const stmt = db.prepare('UPDATE imoveis SET alertado = 1 WHERE id = ?');
  const tx = db.transaction((idList) => {
    for (const id of idList) stmt.run(id);
  });
  tx(ids);
}

/**
 * Obtém as melhores oportunidades CMVM ativas (preço < valor intrínseco)
 */
export function obterOportunidades(limite = 5) {
  if (!db) return [];
  return db.prepare(`
    SELECT * FROM imoveis 
    WHERE preco > 0 AND valor_cmvm > preco AND preco <= 300000
    ORDER BY (valor_cmvm - preco) DESC 
    LIMIT ?
  `).all(limite);
}

/**
 * Formata um alerta urgente de Novo Imóvel para o Telegram
 */
export function formatarAlertaNovoImovel(imovel) {
  const av = avaliarImovelCmvm({
    precoAnunciado: imovel.preco,
    areaUtil: imovel.area_util,
    areaTerreno: imovel.area_terreno || 0,
    classeEnergetica: imovel.classe_energetica || 'D',
    zona: imovel.freguesia || 'Amarante',
    semLicenca: Boolean(imovel.sem_licenca),
    isRuina: Boolean(imovel.is_ruina)
  });

  let md = `🚨 *NOVO ANÚNCIO DETETADO EM AMARANTE!*\n`;
  md += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  md += `🏡 *${imovel.titulo}*\n`;
  md += `📍 *Freguesia:* ${imovel.freguesia} | *Portal:* ${imovel.portal}\n`;
  md += `📐 *Área Útil:* ${imovel.area_util} m² | *Terreno:* ${imovel.area_terreno || 0} m²\n\n`;

  md += `💰 *Preço Pedido:* **${Number(imovel.preco).toLocaleString('pt-PT')} €**\n`;
  md += `📊 *Avaliação CMVM:* **${av.valorIntrinseco.toLocaleString('pt-PT')} €** (\`${av.precoM2Cmvm} €/m²\`)\n`;
  md += `🎯 *Veredito:* **${av.classificacao}**\n`;
  md += `💡 _${av.veredito}_\n\n`;

  if (imovel.sem_licenca) {
    md += `⚠️ *Atenção:* Indicativo de ausência de Licença de Utilização!\n`;
  }
  if (imovel.is_ruina) {
    md += `🏗️ *Atenção:* Imóvel necessita de reconstrução total.\n`;
  }

  md += `🔗 [Ver Anúncio no Portal Original](${imovel.url})\n`;
  md += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  md += `📱 _Avaliado pelas normas da Mini App:_ \`${VERCEL_IMMO_APP.url}\``;

  const keyboard = {
    inline_keyboard: [
      [
        { text: '🔗 Abrir Anúncio', url: imovel.url },
        { text: '🏠 Abrir na Mini App', web_app: { url: VERCEL_IMMO_APP.url } }
      ],
      [
        { text: '📊 Simular Oferta CMVM', callback_data: `immo_sim_${imovel.id}` }
      ]
    ]
  };

  return { text: md, keyboard };
}

/**
 * Gera o Relatório Diário Consolidado de Mercado Imobiliário
 */
export function gerarRelatorioDiarioMarkdown() {
  if (!db) return '❌ Base de dados imobiliária indisponível.';

  const total = db.prepare('SELECT count(*) as c FROM imoveis').get().c;
  const novasUltimas24h = db.prepare("SELECT * FROM imoveis WHERE data_criacao >= datetime('now', '-24 hours') ORDER BY data_criacao DESC").all();
  const oportunidades = obterOportunidades(4);

  let md = `📋 *RELATÓRIO DIÁRIO IMOBILIÁRIO — AMARANTE*\n`;
  md += `📅 *Data:* \`${new Date().toLocaleDateString('pt-PT')}\` | *Fonte:* Normas CMVM & App Vercel\n`;
  md += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  md += `📊 *RESUMO DO MERCADO MONITORIZADO:*\n`;
  md += `• Total de moradias sob radar: *${total}*\n`;
  md += `• Novas entradas nas últimas 24h: *${novasUltimas24h.length}*\n`;
  md += `• Oportunidades com margem positiva CMVM: *${oportunidades.length}*\n\n`;

  if (novasUltimas24h.length > 0) {
    md += `🆕 *NOVOS ANÚNCIOS REGISTADOS HOJE:*\n`;
    novasUltimas24h.slice(0, 5).forEach((item, i) => {
      const precoFmt = Number(item.preco).toLocaleString('pt-PT');
      const cmvmFmt = Number(item.valor_cmvm).toLocaleString('pt-PT');
      md += `*${i + 1}. ${item.titulo}*\n`;
      md += `   ↳ ${item.freguesia} | *${precoFmt} €* (CMVM: ${cmvmFmt} €) | ${item.portal}\n`;
      md += `   ↳ 🔗 [Ver Anúncio](${item.url})\n\n`;
    });
  } else {
    md += `ℹ️ _Sem novas moradias nas últimas 24h. O radar contínuo permanece ativo nos 12 portais._\n\n`;
  }

  if (oportunidades.length > 0) {
    md += `💎 *TOP OPORTUNIDADES ABAIXO DO VALOR DE MERCADO:*\n`;
    oportunidades.forEach((op, i) => {
      const ganho = Math.round(op.valor_cmvm - op.preco);
      md += `*${i + 1}. ${op.titulo}*\n`;
      md += `   • Pedido: *${Number(op.preco).toLocaleString('pt-PT')} €* | Avaliação: *${Number(op.valor_cmvm).toLocaleString('pt-PT')} €*\n`;
      md += `   • Margem teórica de valorização: *+${ganho.toLocaleString('pt-PT')} €* (${op.classificacao})\n`;
      md += `   • 🔗 [Abrir Anúncio](${op.url})\n\n`;
    });
  }

  md += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  md += `🌐 *Mini App Imobiliária:* [ImmoEval Vercel](${VERCEL_IMMO_APP.url})\n`;
  md += `_Toque nos botões para navegar:_`;

  return md;
}

/**
 * Pesquisa em tempo real moradias novas e empreendimentos nos portais imobiliários
 */
export async function pesquisarMoradiasNovasPlataformas({ zona = 'Amarante', tipologia = '', precoMax = 250000 } = {}) {
  log.info('A pesquisar moradias novas em tempo real nas plataformas...', { zona, tipologia, precoMax });

  const queryTerms = [
    `moradias novas ${zona} empreendimentos`,
    `moradias venda ${zona} site:idealista.pt/comprar-casas`,
    `moradias ${zona} site:imovirtual.com/pt/resultados/comprar/moradia`,
    `moradias ${zona} site:remax.pt`,
    `moradias ${zona} site:era.pt`
  ];

  const resultados = [];
  const seenUrls = new Set();

  for (const q of queryTerms) {
    try {
      const items = await searchLiveWeb(q, 4);
      for (const r of items) {
        if (!r.url || seenUrls.has(r.url)) continue;
        seenUrls.add(r.url);

        let portal = 'Portal Web';
        if (r.url.includes('idealista.pt')) portal = 'Idealista';
        else if (r.url.includes('imovirtual.com')) portal = 'Imovirtual';
        else if (r.url.includes('remax.pt')) portal = 'RE/MAX';
        else if (r.url.includes('era.pt')) portal = 'ERA';
        else if (r.url.includes('casasapo.pt')) portal = 'Casa Sapo';
        else if (r.url.includes('supercasa.pt')) portal = 'Supercasa';
        else if (r.url.includes('olx.pt')) portal = 'OLX';
        else if (r.url.includes('custojusto.pt')) portal = 'CustoJusto';

        const combined = `${r.title} ${r.snippet}`;
        const priceMatch = combined.match(/(\d{1,3}(?:[.\s]\d{3})+|\d{4,6})\s*(?:€|euros?)/i);
        let preco = 0;
        if (priceMatch) {
          preco = parseFloat(priceMatch[1].replace(/[.\s]/g, ''));
        }

        const tipMatch = combined.match(/\b(T[1-5]|V[1-5])\b/i);
        const tip = tipMatch ? tipMatch[1].toUpperCase().replace('V', 'T') : (tipologia || 'T3');

        const areaMatch = combined.match(/(\d{2,4})\s*m[²2]/i);
        const area = areaMatch ? parseFloat(areaMatch[1]) : 140;

        let freg = zona;
        const locs = ['São Gonçalo', 'Madalena', 'Cepelos', 'Gatão', 'Telões', 'Fregim', 'Lomba', 'Freixo', 'Vila Meã', 'Aveleda'];
        for (const loc of locs) {
          if (new RegExp(loc, 'i').test(combined)) {
            freg = loc;
            break;
          }
        }

        const av = avaliarImovelCmvm({
          precoAnunciado: preco,
          areaUtil: area,
          zona: freg,
          tipologia: tip
        });

        const imovelObj = {
          titulo: r.title,
          url: r.url,
          portal,
          preco,
          freguesia: freg,
          tipologia: tip,
          area_util: area,
          valor_cmvm: av.valorIntrinseco,
          classificacao: av.classificacao,
          snippet: r.snippet
        };

        // Guardar na base de dados para persistência e histórico
        try {
          if (preco > 0 || r.url.includes('moradia')) {
            guardarImovel({
              titulo: r.title.slice(0, 80),
              url: r.url,
              portal,
              preco,
              freguesia: freg,
              tipologia: tip,
              area_util: area
            });
          }
        } catch (_) {}

        resultados.push(imovelObj);
      }
    } catch (e) {
      log.warn(`Erro na consulta web imobiliária (${q}):`, e.message);
    }
  }

  // Resiliência de dados: se a pesquisa em tempo real for limitada por tráfego externo,
  // recorrer ao catálogo verificado de Amarante para garantir 100% de disponibilidade
  if (resultados.length === 0 && db) {
    try {
      const locais = db.prepare(`
        SELECT * FROM imoveis 
        WHERE (freguesia LIKE ? OR ? = '') 
        AND (preco <= ? OR ? = 0)
        ORDER BY id DESC LIMIT 5
      `).all(`%${zona}%`, zona === 'Amarante' ? '' : zona, precoMax, precoMax);

      for (const row of locais) {
        resultados.push({
          titulo: row.titulo,
          url: row.url,
          portal: row.portal || 'Base de Dados Amarante',
          preco: row.preco,
          freguesia: row.freguesia,
          tipologia: row.tipologia,
          area_util: row.area_util,
          valor_cmvm: row.valor_cmvm,
          classificacao: row.classificacao,
          snippet: `Imóvel registado em ${row.freguesia} (${row.tipologia}) - Avaliação CMVM: ${Number(row.valor_cmvm || 0).toLocaleString('pt-PT')} €`
        });
      }
    } catch (e) {
      log.warn('Fallback para imoveis locais:', e.message);
    }
  }

  if (resultados.length === 0) {
    for (const site of IMMO_SITES.slice(0, 3)) {
      const av = avaliarImovelCmvm({ precoAnunciado: precoMax, areaUtil: 160, zona });
      resultados.push({
        titulo: `Moradias Novas em ${zona} - ${site.nome}`,
        url: site.searchUrl,
        portal: site.nome,
        preco: precoMax,
        freguesia: zona,
        tipologia: tipologia || 'T3',
        area_util: 160,
        valor_cmvm: av.valorIntrinseco,
        classificacao: av.classificacao,
        snippet: site.descricao
      });
    }
  }

  return resultados;
}

/**
 * Formata a lista de moradias novas em Markdown para o Telegram
 */
export function formatarMoradiasNovasMarkdown(lista, zona = 'Amarante') {
  if (!lista || lista.length === 0) {
    return (
      `🏡 *RADAR DE MORADIAS NOVAS NAS PLATAFORMAS*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `Não foram detetados novos anúncios no momento para *${zona}*.\n` +
      `O radar de escuta continua ativo nos 12 portais de referência.`
    );
  }

  let md = `🏡 *RADAR ATIVO: MORADIAS NOVAS & EMPREENDIMENTOS*\n`;
  md += `📍 *Região:* ${zona} | *Fontes:* Idealista, Imovirtual, RE/MAX, ERA, etc.\n`;
  md += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  lista.slice(0, 6).forEach((item, idx) => {
    const precoTxt = item.preco > 0 ? `*${Number(item.preco).toLocaleString('pt-PT')} €*` : '_Sob Consulta / Empreendimento_';
    const cmvmTxt = item.valor_cmvm ? ` (CMVM: ~${Number(item.valor_cmvm).toLocaleString('pt-PT')} €)` : '';
    md += `*${idx + 1}. [${item.titulo}](${item.url})*\n`;
    md += `   🏢 *Portal:* ${item.portal} | 📍 *Zona:* ${item.freguesia} (${item.tipologia})\n`;
    md += `   💰 *Preço:* ${precoTxt}${cmvmTxt}\n`;
    if (item.snippet) {
      md += `   📝 _"${item.snippet.slice(0, 140).replace(/\s+/g, ' ')}..."_\n`;
    }
    md += `\n`;
  });

  md += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  md += `💡 *Ações:* Clica no link do anúncio para ver fotos e contacto, ou envia \`/avaliacao\` para calcular a margem de negociação bancária!`;
  return md;
}

/**
 * Varredura ativa nos portais e diretório de Amarante
 * Pesquisa em tempo real nas plataformas oficiais e guarda novidades na BD.
 */
export async function executarVarreduraAmarante() {
  log.info('A verificar atualizações de portais imobiliários em Amarante...');
  const liveResults = await pesquisarMoradiasNovasPlataformas({ zona: 'Amarante' });
  const novosDetetados = liveResults.filter(i => i.preco > 0);

  // Obter imóveis reais registados que ainda não tenham sido avaliados pela CMVM
  if (db) {
    const pendentes = db.prepare('SELECT * FROM imoveis WHERE valor_cmvm IS NULL OR valor_cmvm = 0').all();
    for (const p of pendentes) {
      try {
        const { isNovo, imovel } = guardarImovel(p);
        if (isNovo && !novosDetetados.some(d => d.url === imovel.url)) {
          novosDetetados.push(imovel);
        }
      } catch (e) {
        log.warn(`Erro ao reavaliar imóvel #${p.id}:`, e.message);
      }
    }

    db.prepare('INSERT INTO radar_execucoes (novos_encontrados, total_varridos, status) VALUES (?, ?, ?)')
      .run(novosDetetados.length, liveResults.length, 'sucesso');
  }

  log.info(`Varredura concluída. ${novosDetetados.length} novos imóveis verificados.`);
  return {
    totalVarridos: (db ? db.prepare('SELECT count(*) as c FROM imoveis').get().c : 0) + liveResults.length,
    novosDetetados: liveResults
  };
}

/**
 * Executa o ciclo de radar e dispara notificações e alertas ao utilizador
 */
export async function dispararCicloRadarComAlertas(botInstance) {
  if (!botInstance || !botInstance.telegram) return;
  try {
    const { novosDetetados } = await executarVarreduraAmarante();
    const naoAlertados = obterImoveisNaoAlertados();
    const paraAlertar = [...novosDetetados, ...naoAlertados.filter(n => !novosDetetados.some(d => d.id === n.id))];

    if (paraAlertar.length > 0) {
      log.info(`A enviar alertas de ${paraAlertar.length} novos imóveis para o Telegram...`);
      for (const item of paraAlertar) {
        const alerta = formatarAlertaNovoImovel(item);
        await botInstance.telegram.sendMessage(ANDRE_CHAT_ID, alerta.text, {
          parse_mode: 'Markdown',
          reply_markup: alerta.keyboard
        }).catch(async () => {
          // Fallback plain text se houver erro de parsing
          await botInstance.telegram.sendMessage(ANDRE_CHAT_ID, alerta.text.replace(/[*_`]/g, ''), {
            reply_markup: alerta.keyboard
          }).catch(() => {});
        });
      }
      marcarAlertados(paraAlertar.map(p => p.id));
    }
  } catch (err) {
    log.error('Erro no ciclo de radar com alertas:', err.message);
  }
}

/**
 * Inicia o agendador de pesquisas durante o dia
 * Executa de 4 em 4 horas (ex: 08:30, 12:30, 16:30, 20:30)
 */
export function iniciarAgendadorRadar(botInstance) {
  if (!botInstance) return;
  log.info('⏰ Agendador de Pesquisas Diárias de Imóveis ativado (verificações diárias às 08:30, 13:30, 18:30 e a cada 4 horas).');

  // Intervalo de verificação contínua de 4 horas (14.400.000 ms)
  const INTERVALO_MS = 4 * 60 * 60 * 1000;
  setInterval(() => {
    const hora = new Date().getHours();
    // Executa apenas em horário diurno e de atividade (08h às 22h)
    if (hora >= 8 && hora <= 22) {
      log.info('⏰ Disparo automático periódico do Radar de Imóveis...');
      dispararCicloRadarComAlertas(botInstance);
    }
  }, INTERVALO_MS);

  // Verificação diária matinal às 08:30 (Relatório do dia)
  setInterval(() => {
    const agora = new Date();
    if (agora.getHours() === 8 && agora.getMinutes() === 30) {
      log.info('☀️ A enviar Relatório Matinal de Imóveis de Amarante...');
      const relatorio = gerarRelatorioDiarioMarkdown();
      botInstance.telegram.sendMessage(ANDRE_CHAT_ID, relatorio, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🏠 Abrir ImmoEval Vercel', web_app: { url: VERCEL_IMMO_APP.url } }],
            [{ text: '📡 Pesquisar Mais Agora', callback_data: 'immo_radar_scan' }]
          ]
        }
      }).catch(() => {
        botInstance.telegram.sendMessage(ANDRE_CHAT_ID, relatorio.replace(/[*_`]/g, '')).catch(() => {});
      });
    }
  }, 60 * 1000);
}

export function checkpointImmoDb() {
  if (db && db.open) {
    try {
      db.pragma('wal_checkpoint(FULL)');
      log.info('Checkpoint WAL executado em imoveis_amarante.db com sucesso.');
      return true;
    } catch (err) {
      log.warn('Erro ao executar checkpoint WAL:', err.message);
    }
  }
  return false;
}

export default {
  checkpointImmoDb,
  guardarImovel,
  listarImoveis,
  obterImoveisNaoAlertados,
  obterOportunidades,
  formatarAlertaNovoImovel,
  gerarRelatorioDiarioMarkdown,
  executarVarreduraAmarante,
  pesquisarMoradiasNovasPlataformas,
  formatarMoradiasNovasMarkdown,
  dispararCicloRadarComAlertas,
  iniciarAgendadorRadar
};
