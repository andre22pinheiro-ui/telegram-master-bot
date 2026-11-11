// src/services/personalLawService.js — Direito Rodoviário Pessoal (Ligeiros / SRI Art. 55), Municipal, Consumo DL 84/2021 & DRE
// Nota de isolamento: Tempos de condução pesados / tacógrafo CE 561/2006 / TCC pertencem a @zeropaperfrotaBot.

export function formatSriCriancasLigeiros() {
  return (
    `⚖️ *TRANSPORTE FAMILIAR DE CRIANÇAS (ART. 55.º CÓDIGO DA ESTRADA)*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `👶 *Regra Geral Ligeiros:*\n` +
    `• Crianças com menos de *12 anos* E menos de *135 cm* de altura devem viajar em Sistema de Retenção para Crianças (SRI / cadeirinha) homologado e adaptado ao peso e estatura (*UN R129 i-Size* ou *ECE R44/04*).\n\n` +
    `🚗 *Banco da Frente (<12 anos) — Exceções Legais (Art. 55.º, n.º 2 CE):*\n` +
    `1. Menor de 3 anos em SRI virado para a retaguarda, **com airbag frontal obrigatoriamente desativado**;\n` +
    `2. Veículo sem bancos traseiros ou sem cintos na retaguarda;\n` +
    `3. Bancos traseiros já totalmente ocupados por outras crianças em cadeirinhas SRI.\n\n` +
    `🔗 *Diploma Consolidado DRE:* https://dre.pt/dre/legislacao-consolidada/decreto-lei/1994-34537375`
  );
}

export function formatCodigoEstradaLigeiros() {
  return (
    `⚖️ *CÓDIGO DA ESTRADA PORTUGUÊS (VEÍCULOS LIGEIROS — DL 114/94)*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🚗 *Velocidades Máximas (Ligeiros s/ Reboque):*\n` +
    `• Localidades: *50 km/h* | Vias Reservadas: *100 km/h* | Autoestradas: *120 km/h* (mínimo *50 km/h*).\n\n` +
    `🍷 *Taxa de Álcool no Sangue (TAS — Regime Geral vs Recém-Encartado):*\n` +
    `• *Regime Geral:* 0,50 a 0,79 g/l (*Grave*) | 0,80 a 1,19 g/l (*Muito Grave*) | >= 1,20 g/l (*Crime — Art. 292.º CP*).\n` +
    `• *Recém-encartados (<3 anos):* 0,20 a 0,49 g/l (*Grave*) | >= 0,50 g/l (*Muito Grave*).\n\n` +
    `📱 *Telemóvel (Art. 84.º CE):*\n` +
    `• Proibido manuseamento em marcha (apenas alta-voz ou auricular de um ouvido). Coima **250€ a 1.250€**, perda de **3 pontos** e inibição de conduzir de **1 a 12 meses**.\n\n` +
    `🔗 *Código da Estrada DRE:* https://dre.pt/dre/legislacao-consolidada/decreto-lei/1994-34537375`
  );
}

export function formatRegulamentosMunicipais() {
  return (
    `🏛️ *REGULAMENTOS MUNICIPAIS, ESTACIONAMENTO & ZER*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `• *Estacionamento Tarifado (Art. 70.º e 71.º CE):* Falta de título ou excesso sujeita a aviso, bloqueio e remoção (Art. 164.º CE).\n` +
    `• *Cargas e Descargas (Sinalização C16/H1, Art. 50.º CE):* Uso indevido por ligeiro de passageiros constitui contraordenação grave com reboque imediato.\n` +
    `• *Zonas de Emissões Reduzidas (ZER Lisboa):* Restrições por Norma Euro (Eixo 1 Euro 3+, Eixo 2 Euro 2+); coima de 25€ a 125€.\n` +
    `• *Fiscalização Municipal:* Polícia Municipal e fiscais equiparados (Art. 5.º DL 44/2005).`
  );
}

export function formatDireitoConsumoDl84() {
  return (
    `🛡️ *DIREITO DO CONSUMO & GARANTIAS (DECRETO-LEI N.º 84/2021)*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `• *Garantia Legal Bens Móveis Novos:* **3 anos** a contar da entrega do bem.\n` +
    `• *Presunção de Não Conformidade:* Nos primeiros **2 anos**, presume-se que o defeito já existia à data da entrega (ónus da prova cabe ao vendedor).\n` +
    `• *Bens Recondicionados / Usados:* Garantia legal de 3 anos, podendo ser reduzida a **18 meses** por acordo expresso (exceto se anunciado como novo/3 anos).\n` +
    `• *Direito de Arrependimento (Compras Online — DL 24/2014):* **14 dias** de livre resolução.\n` +
    `• *Informação Pré-Contratual Preços (Diretiva Omnibus UE 2019/2161):* Qualquer redução deve indicar o preço mais baixo praticado nos últimos **30 dias**.\n\n` +
    `🔗 *Pesquisa DRE DL 84/2021:* https://dre.pt/dre/pesquisa-geral?search=Decreto-Lei%2084%2F2021`
  );
}

export function formatDrePersonalAccess(query = '') {
  const clean = encodeURIComponent(
    String(query)
      .replace(/^\/?(leis|codigo_estrada|dre|sri|cadeirinha|dl84)\s*/i, '')
      .trim() || 'Código da Estrada'
  );
  return (
    `📜 *CONSULTA JURÍDICA PESSOAL & DIÁRIO DA REPÚBLICA (DRE)*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🔎 *Pesquisa Direta DRE:* https://dre.pt/dre/pesquisa-geral?search=${clean}\n\n` +
    `📚 *Comandos Jurídicos Pessoais Disponíveis:*\n` +
    `• \`/sri\` ou \`/cadeirinha\` — Art. 55.º CE (Carolina <12 anos / <135 cm)\n` +
    `• \`/codigo_estrada\` — Velocidades ligeiros, TAS e Art. 84.º telemóvel\n` +
    `• \`/dl84\` — Garantias 3 anos, arrependimento 14 dias e Omnibus\n` +
    `• \`/leis municipal\` — Estacionamento tarifado e ZER\n\n` +
    `_(Legislação comercial de pesados, tacógrafo e TCC está isolada em @zeropaperfrotaBot.)_`
  );
}

export function consultPersonalLaw(query = '') {
  const q = String(query || '').toLowerCase().trim();
  if (!q) return formatDrePersonalAccess();

  if (q.includes('sri') || q.includes('cadeirinha') || q.includes('crianca') || q.includes('criança') || q.includes('55') || q.includes('carolina')) {
    return formatSriCriancasLigeiros();
  }
  if (q.includes('dl84') || q.includes('84/2021') || q.includes('garantia') || q.includes('consumidor') || q.includes('omnibus') || q.includes('arrependimento')) {
    return formatDireitoConsumoDl84();
  }
  if (q.includes('municipal') || q.includes('estacionamento') || q.includes('reboque') || q.includes('zer') || q.includes('camara') || q.includes('câmara')) {
    return formatRegulamentosMunicipais();
  }
  if (q.includes('velocidade') || q.includes('alcool') || q.includes('álcool') || q.includes('telemovel') || q.includes('telemóvel') || q.includes('estrada') || q.includes('ligeiro')) {
    return formatCodigoEstradaLigeiros();
  }
  return formatDrePersonalAccess(query);
}

export default {
  formatSriCriancasLigeiros,
  formatCodigoEstradaLigeiros,
  formatRegulamentosMunicipais,
  formatDireitoConsumoDl84,
  formatDrePersonalAccess,
  consultPersonalLaw
};

