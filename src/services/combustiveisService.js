// src/services/combustiveisService.js — Preços Oficiais de Combustíveis em Tempo Real (DGEG)
import axios from 'axios';
import { createLogger } from '../utils/logger.js';

const log = createLogger('CombustiveisDGEG');

// Mapeamento de concelhos mais comuns no Tâmega e Sousa / Porto
const MUNICIPIOS_DGEG = {
  amarante: 181,
  lixa: 181,
  penafiel: 191,
  marco: 187,
  'marco de canaveses': 187,
  baiao: 183,
  baião: 183,
  felgueiras: 185,
  paredes: 189,
  porto: 192,
  vilareal: 254,
  'vila real': 254
};

/**
 * Consulta os postos de combustível mais baratos num município diretamente da DGEG
 */
export async function obterPostosMaisBaratos(municipio = 'amarante', tipoCombustivel = 'gasoleo') {
  const munNorm = municipio.toLowerCase().trim();
  const idMunicipio = MUNICIPIOS_DGEG[munNorm] || 181;
  const nomeMunicipio = Object.keys(MUNICIPIOS_DGEG).find(k => MUNICIPIOS_DGEG[k] === idMunicipio) || 'Amarante';

  // 2101 = Gasóleo simples, 3201 = Gasolina 95 simples
  const isGasolina = /gasolina|95|98/i.test(tipoCombustivel);
  const idTipoComb = isGasolina ? 3201 : 2101;
  const labelComb = isGasolina ? 'Gasolina 95 Simples' : 'Gasóleo Simples';

  const url = `https://precoscombustiveis.dgeg.gov.pt/api/PrecoComb/PesquisarPostos?idDistrito=13&idMunicipio=${idMunicipio}&idsTiposComb=${idTipoComb}&qtdPorPagina=100`;

  try {
    log.info(`A consultar preços DGEG para ${labelComb} em ${nomeMunicipio}...`);
    const res = await axios.get(url, { timeout: 6000 });

    if (!res.data || !res.data.resultado || !Array.isArray(res.data.resultado)) {
      return { success: false, error: 'Sem dados da DGEG no momento' };
    }

    // Filtrar postos da localidade pretendida
    const postos = res.data.resultado
      .filter(p => {
        const munMatch = p.Municipio && new RegExp(nomeMunicipio, 'i').test(p.Municipio);
        const moradaMatch = p.Morada && new RegExp(nomeMunicipio, 'i').test(p.Morada);
        const localMatch = p.Localidade && new RegExp(nomeMunicipio, 'i').test(p.Localidade);
        return munMatch || moradaMatch || localMatch;
      })
      .map(p => {
        // Tratar preço "1,549 €" -> float
        const precoNum = parseFloat(String(p.Preco || '0').replace('€', '').replace(',', '.').trim());
        return {
          nome: p.Nome,
          marca: p.Marca || 'Independente',
          precoStr: p.Preco,
          precoNum,
          morada: p.Morada,
          municipio: p.Municipio,
          atualizacao: p.DataAtualizacao
        };
      })
      .filter(p => p.precoNum > 0)
      .sort((a, b) => a.precoNum - b.precoNum);

    return {
      success: true,
      municipio: nomeMunicipio.toUpperCase(),
      combustivel: labelComb,
      postos
    };
  } catch (err) {
    log.error('Erro ao consultar DGEG:', err.message);
    return {
      success: false,
      error: `Falha na ligação à DGEG: ${err.message}`
    };
  }
}

/**
 * Formata o briefing de combustíveis para o Telegram
 */
export function formatarCombustiveisMarkdown(data) {
  if (!data.success || !data.postos || data.postos.length === 0) {
    return (
      `⛽ *PREÇOS DE COMBUSTÍVEIS (DGEG)*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `Não foram encontrados postos registados para a pesquisa no momento.\n` +
      `Consulta o portal oficial: https://precoscombustiveis.dgeg.gov.pt/`
    );
  }

  let md = `⛽ *POSTOS MAIS ECONÓMICOS — ${data.municipio}*\n`;
  md += `⛽ *Combustível:* **${data.combustivel}**\n`;
  md += `🏛️ *Fonte:* Direção-Geral de Energia e Geologia (DGEG Oficial)\n`;
  md += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  data.postos.slice(0, 5).forEach((p, idx) => {
    const medalha = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '📍';
    md += `${medalha} *${idx + 1}. ${p.nome}* _(${p.marca})_\n`;
    md += `   💰 *Preço:* **${p.precoStr}**\n`;
    md += `   📍 *Morada:* _${p.morada}_\n\n`;
  });

  md += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  md += `💡 *Dica:* Usa \`/combustiveis gasolina\` ou \`/combustiveis penafiel\` para outras pesquisas!`;

  return md;
}

export default {
  obterPostosMaisBaratos,
  formatarCombustiveisMarkdown
};
