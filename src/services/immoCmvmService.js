// src/services/immoCmvmService.js — Motor de Avaliação Imobiliária Normas CMVM
// Transposto fielmente da aplicação Vercel (https://pesquisa-imobiliario.vercel.app / calculadora.py)

/**
 * Normaliza o nome da freguesia / zona de Amarante e arredores
 */
export function normalizarZona(zona = '') {
  const z = (zona || '').toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  if (/goncalo|cepelos|madalena|gatao|centro|urbana/i.test(z)) {
    return {
      nome: 'União de Freguesias de Amarante (Centro Urbano)',
      tipo: 'central',
      valorBaseM2: 1350
    };
  }
  if (/teloes|lomba|freixo|aboim|garcia|chapa|fregim|padronelo|lufrei/i.test(z)) {
    return {
      nome: 'Amarante (Coroa Envolvente / Periférica)',
      tipo: 'periferica',
      valorBaseM2: 1180
    };
  }
  if (/felgueiras|lousada|marco|penafiel/i.test(z)) {
    return {
      nome: `${zona.trim()} (Concelho Limítrofe)`,
      tipo: 'limitrofe',
      valorBaseM2: 1120
    };
  }
  return {
    nome: zona.trim() || 'Amarante Geral',
    tipo: 'periferica',
    valorBaseM2: 1180
  };
}

/**
 * Avalia um imóvel segundo o Método do Perito Avaliador CMVM
 * @param {Object} params
 * @param {number} params.precoAnunciado - Preço pedido no anúncio (€)
 * @param {number} params.areaUtil - Área útil de habitação em m²
 * @param {number} [params.areaTerreno=0] - Área total do terreno em m²
 * @param {string} [params.classeEnergetica='D'] - Classe energética (A+, A, B, C, D, E, F, G)
 * @param {string} [params.zona='Amarante'] - Freguesia ou zona
 * @param {boolean} [params.semLicenca=false] - Imóvel sem licença de utilização
 * @param {boolean} [params.isRuina=false] - Imóvel em ruína para reconstrução total
 * @param {string} [params.estado='bom'] - novo, excelente, bom, razoavel, degradado, ruina
 */
export function avaliarImovelCmvm({
  precoAnunciado = 0,
  areaUtil = 100,
  areaTerreno = 0,
  classeEnergetica = 'D',
  zona = 'Amarante',
  semLicenca = false,
  isRuina = false,
  estado = 'bom'
}) {
  const area = Math.max(1, parseFloat(areaUtil) || 100);
  const terrenoTotal = Math.max(0, parseFloat(areaTerreno) || 0);
  const preco = Math.max(0, parseFloat(precoAnunciado) || 0);
  const infoZona = normalizarZona(zona);

  // 1. VALOR BASE DE CONSTRUÇÃO POR M² (Norma CMVM Amarante)
  // Central: 1.350 €/m² | Periférica: 1.180 €/m² | Limítrofe: 1.120 €/m²
  const valorConstrucaoBase = Math.round(area * infoZona.valorBaseM2);

  // 2. VALORIZAÇÃO ESCALONADA DO TERRENO LIVRE (Escala Pericial CMVM)
  // - Até 500 m²: 35 €/m² (logradouro urbano, jardim vedado)
  // - De 501 a 2.000 m²: 8 €/m² (envolvente rústica imediata, pomar)
  // - Acima de 2.000 m²: 2 €/m² (área rústica/florestal)
  const terrenoLivre = Math.max(0, terrenoTotal - area);
  let valorTerreno = 0;
  let detalheTerreno = 'Sem terreno livre';

  if (terrenoLivre > 0) {
    if (terrenoLivre <= 500) {
      valorTerreno = terrenoLivre * 35;
      detalheTerreno = `${Math.round(terrenoLivre)} m² a 35 €/m² (${Math.round(valorTerreno).toLocaleString('pt-PT')} €)`;
    } else if (terrenoLivre <= 2000) {
      const v1 = 500 * 35;
      const v2 = (terrenoLivre - 500) * 8;
      valorTerreno = v1 + v2;
      detalheTerreno = `500 m² a 35 €/m² + ${Math.round(terrenoLivre - 500)} m² a 8 €/m² (${Math.round(valorTerreno).toLocaleString('pt-PT')} €)`;
    } else {
      const v1 = 500 * 35;
      const v2 = 1500 * 8;
      const v3 = (terrenoLivre - 2000) * 2;
      valorTerreno = v1 + v2 + v3;
      detalheTerreno = `500 m² (35 €/m²) + 1.500 m² (8 €/m²) + ${Math.round(terrenoLivre - 2000)} m² rústico (2 €/m²)`;
    }
  }

  // 3. CUSTO DE REABILITAÇÃO TÉRMICA & EFICIÊNCIA ENERGÉTICA (CAPEX)
  const classeLimpa = String(classeEnergetica || 'D').trim().toUpperCase();
  let custoReabilitacao = 0;
  let bonusEnergia = 0;
  let detalheEnergia = '';

  if (classeLimpa === 'A+' || classeLimpa === 'A') {
    bonusEnergia = Math.round(valorConstrucaoBase * 0.10);
    detalheEnergia = 'Bónus de eficiência máxima (+10% construção)';
  } else if (classeLimpa === 'B' || classeLimpa === 'B-') {
    bonusEnergia = 0;
    detalheEnergia = 'Classe B: Sem provisão necessária';
  } else if (classeLimpa === 'C' || classeLimpa === 'D') {
    custoReabilitacao = Math.round(100 * area);
    detalheEnergia = `Classe ${classeLimpa}: Provisão térmica ligeira (-${custoReabilitacao.toLocaleString('pt-PT')} €)`;
  } else {
    // E, F, G ou Não Detetado
    custoReabilitacao = Math.round(Math.max(6000, 130 * area));
    detalheEnergia = `Classe ${classeLimpa}: Provisão reabilitação térmica (-${custoReabilitacao.toLocaleString('pt-PT')} €)`;
  }

  // 4. AJUSTE DE ESTADO FÍSICO / RUÍNA
  let ajusteEstado = 0;
  let detalheEstado = 'Conservação normal';
  const est = (estado || '').toLowerCase();

  if (isRuina || est === 'ruina' || est === 'ruína') {
    ajusteEstado = Math.round(-750 * area); // Necessidade de obras profundas estruturais
    detalheEstado = `Ruína / Restauro total: Provisão estrutural (-${Math.abs(ajusteEstado).toLocaleString('pt-PT')} €)`;
  } else if (est === 'novo') {
    ajusteEstado = Math.round(valorConstrucaoBase * 0.15);
    detalheEstado = 'Imóvel novo / Chave na mão (+15%)';
  } else if (est === 'excelente') {
    ajusteEstado = Math.round(valorConstrucaoBase * 0.10);
    detalheEstado = 'Excelente estado de conservação (+10%)';
  } else if (est === 'razoavel' || est === 'razoável') {
    ajusteEstado = Math.round(-valorConstrucaoBase * 0.10);
    detalheEstado = 'Estado razoável: Necessita de pinturas e retoques (-10%)';
  } else if (est === 'mau' || est === 'degradado') {
    ajusteEstado = Math.round(-valorConstrucaoBase * 0.25);
    detalheEstado = 'Degradado: Obras médias indispensáveis (-25%)';
  }

  // 5. CÁLCULO DO VALOR INTRÍNSECO PRELIMINAR
  let valorIntrinseco = valorConstrucaoBase + valorTerreno + bonusEnergia - custoReabilitacao + ajusteEstado;

  // 6. PENALIZAÇÃO DE RISCO LEGAL — SEM LICENÇA DE UTILIZAÇÃO
  let penalizacaoLicenca = 0;
  if (semLicenca) {
    penalizacaoLicenca = Math.round(valorIntrinseco * 0.25); // -25% por risco de embargo/dificuldade bancária
    valorIntrinseco -= penalizacaoLicenca;
  }

  valorIntrinseco = Math.max(10000, Math.round(valorIntrinseco));

  // 7. COMPARAÇÃO COM PREÇO ANUNCIADO & CLASSIFICAÇÃO DE OPORTUNIDADE
  const precoM2Anunciado = preco > 0 ? Math.round(preco / area) : 0;
  const precoM2Cmvm = Math.round(valorIntrinseco / area);
  const diferenca = preco > 0 ? valorIntrinseco - preco : 0;
  const percentagem = preco > 0 ? Math.round((diferenca / preco) * 100) : 0;

  let classificacao = '🟡 PREÇO DE MERCADO';
  let veredito = 'Preço alinhado com a avaliação bancária de referência.';
  let margemNegociacao = '0% a 5%';

  if (preco > 0) {
    if (diferenca >= preco * 0.20) {
      classificacao = '💎 SUPER OPORTUNIDADE';
      veredito = `Imóvel anunciado ${Math.abs(percentagem)}% ABAIXO do valor intrínseco CMVM. Forte margem de valorização!`;
      margemNegociacao = 'Avançar com proposta rápida (margem mínima de regateio).';
    } else if (diferenca >= preco * 0.05) {
      classificacao = '🟢 PREÇO ATRATIVO';
      veredito = `Imóvel anunciado ${Math.abs(percentagem)}% abaixo do valor bancário. Margem positiva.`;
      margemNegociacao = 'Propor desconto de 5% a 8%.';
    } else if (diferenca <= -preco * 0.25) {
      classificacao = '🔴 SOBREVALORIZADO';
      veredito = `Imóvel anunciado ${Math.abs(percentagem)}% ACIMA do valor intrínseco de avaliação.`;
      margemNegociacao = `Exigir redução agressiva de pelo menos ${Math.abs(diferenca).toLocaleString('pt-PT')} € (-${Math.abs(percentagem)}%).`;
    } else if (diferenca < 0) {
      classificacao = '🟠 LIGEIRAMENTE ACIMA';
      veredito = `Preço pedido ${Math.abs(percentagem)}% acima do valor de avaliação.`;
      margemNegociacao = 'Margem de negociação recomendada: 10% a 15%.';
    }
  }

  // Teto máximo definido pelo utilizador: 250.000 € (ou 300.000 € negociáveis)
  const dentroTeto = preco <= 250000;
  const viavelNegociacao = preco <= 300000;

  return {
    zona: infoZona.nome,
    tipoZona: infoZona.tipo,
    areaUtil: area,
    areaTerreno: terrenoTotal,
    terrenoLivre,
    classeEnergetica: classeLimpa,
    estado,
    semLicenca,
    isRuina,
    valorBaseM2: infoZona.valorBaseM2,
    valorConstrucaoBase,
    valorTerreno,
    detalheTerreno,
    custoReabilitacao,
    bonusEnergia,
    detalheEnergia,
    ajusteEstado,
    detalheEstado,
    penalizacaoLicenca,
    valorIntrinseco,
    precoAnunciado: preco,
    precoM2Anunciado,
    precoM2Cmvm,
    diferenca,
    percentagem,
    classificacao,
    veredito,
    margemNegociacao,
    dentroTeto,
    viavelNegociacao
  };
}

/**
 * Formata o resultado da avaliação CMVM em Markdown estruturado para o Telegram
 */
export function formatarAvaliacaoMarkdown(av) {
  let md = `🏠 *RELATÓRIO DE AVALIAÇÃO CMVM — AMARANTE*\n`;
  md += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  md += `📍 *Zona:* ${av.zona}\n`;
  md += `📐 *Área Útil:* ${av.areaUtil} m² | *Terreno:* ${av.areaTerreno} m²\n`;
  md += `⚡ *Classe Energética:* \`${av.classeEnergetica}\` | *Estado:* ${av.estado}\n\n`;

  md += `📊 *DISCRIMINAÇÃO BANCÁRIA (PERITO CMVM):*\n`;
  md += `• Construção base (${av.valorBaseM2} €/m²): *${av.valorConstrucaoBase.toLocaleString('pt-PT')} €*\n`;
  md += `• Terreno livre escalonado: *+${av.valorTerreno.toLocaleString('pt-PT')} €*\n`;
  md += `  ↳ _${av.detalheTerreno}_\n`;

  if (av.bonusEnergia > 0) {
    md += `• Eficiência energética: *+${av.bonusEnergia.toLocaleString('pt-PT')} €* _(${av.detalheEnergia})_\n`;
  }
  if (av.custoReabilitacao > 0) {
    md += `• Obras térmicas/CAPEX: *-${av.custoReabilitacao.toLocaleString('pt-PT')} €* _(${av.detalheEnergia})_\n`;
  }
  if (av.ajusteEstado !== 0) {
    const sinal = av.ajusteEstado > 0 ? '+' : '';
    md += `• Ajuste de estado: *${sinal}${av.ajusteEstado.toLocaleString('pt-PT')} €* _(${av.detalheEstado})_\n`;
  }
  if (av.penalizacaoLicenca > 0) {
    md += `• ⚠️ *Sem Licença de Utilização:* *-${av.penalizacaoLicenca.toLocaleString('pt-PT')} €* _(penalização de 25% por risco legal)_\n`;
  }

  md += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  md += `💰 *VALOR INTRÍNSECO CMVM:* **${av.valorIntrinseco.toLocaleString('pt-PT')} €**\n`;
  md += `📈 *Preço de Referência:* \`${av.precoM2Cmvm} €/m²\`\n\n`;

  if (av.precoAnunciado > 0) {
    md += `🏷️ *Preço Pedido no Anúncio:* ${av.precoAnunciado.toLocaleString('pt-PT')} € (\`${av.precoM2Anunciado} €/m²\`)\n`;
    md += `🎯 *Classificação:* **${av.classificacao}**\n`;
    md += `💡 *Análise:* ${av.veredito}\n`;
    md += `🤝 *Margem Negocial:* ${av.margemNegociacao}\n\n`;

    if (av.dentroTeto) {
      md += `✅ *Enquadramento orçamental:* Dentro do teto de 250.000 €.\n`;
    } else if (av.viavelNegociacao) {
      md += `⚠️ *Enquadramento orçamental:* Entre 250k e 300k. Negociação obrigatória para caber no orçamento.\n`;
    } else {
      md += `❌ *Enquadramento orçamental:* Acima de 300.000 € (fora do perfil-alvo).\n`;
    }
  }

  md += `\n⚖️ _Enquadramento: Regulamento CMVM n.º 2/2015, DL n.º 10/2024 (Simplex Urbanístico) e PDM de Amarante / RMUE._\n`;
  md += `🌐 _Referência WebApp:_ \`https://pesquisa-imobiliario.vercel.app\``;
  return md;
}

export default {
  normalizarZona,
  avaliarImovelCmvm,
  formatarAvaliacaoMarkdown
};

