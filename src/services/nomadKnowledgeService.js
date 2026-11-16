// src/services/nomadKnowledgeService.js — Módulo Cloud-Native do Projeto NOMAD (Conhecimento Offline, Emergência & CyberChef)
import crypto from 'crypto';
import { createLogger } from '../utils/logger.js';
import amaranteMapService from './amaranteMapService.js';

const log = createLogger('NomadKnowledge');

/**
 * Contactos Oficiais de Emergência e Proteção Civil (Portugal & Amarante)
 */
export const EMERGENCY_CONTACTS = [
  { name: 'Emergência Nacional (Polícia / Bombeiros / INEM)', number: '112', type: 'Gratuito 24h' },
  { name: 'SNS 24 (Triagem e Aconselhamento de Saúde)', number: '808 24 24 24', type: 'Nacional' },
  { name: 'Centro de Informação Antivenenos (CIAV)', number: '800 250 250', type: 'Gratuito 24h' },
  { name: 'Hospital de Amarante (CH Tâmega e Sousa)', number: '255 420 100', type: 'Local' },
  { name: 'Bombeiros Voluntários de Amarante', number: '255 422 122', type: 'Local' },
  { name: 'GNR Posto Territorial de Amarante', number: '255 410 490', type: 'Local' },
  { name: 'Serviço Municipal de Proteção Civil (SMPC Amarante)', number: '255 420 200', type: 'Local' }
];

/**
 * Procedimentos Médicos e Primeiros Socorros Críticos (Normas INEM / Cruz Vermelha)
 */
export const FIRST_AID_PROCEDURES = {
  sbv: {
    title: 'Suporte Básico de Vida (SBV Adulto)',
    steps: [
      '1. Garantir segurança do local antes de intervir.',
      '2. Avaliar estado de consciência (abanar ombros e falar alto).',
      '3. Se não responde: Ligar imediatamente **112** e colocar em alta-voz.',
      '4. Permeabilizar via aérea (inclinar ligeiramente a cabeça e elevar o queixo).',
      '5. Verificar respiração (Ver, Ouvir e Sentir durante 10 segundos).',
      '6. Se não respira: Iniciar **30 compressões torácicas** no centro do peito (frequência de 100 a 120/minuto).',
      '7. Realizar **2 insuflações** de ar (se treinado/seguro).',
      '8. Manter o ciclo **30:2** contínuo até chegada dos meios de socorro ou recuperação da vítima.'
    ]
  },
  bebe_engasgamento: {
    title: 'Desobstrução da Via Aérea em Bebés (Lactentes < 1 ano)',
    steps: [
      '1. Avaliar eficácia da tosse. Se tosse eficaz, incentivar e vigiar.',
      '2. Se tosse ineficaz/asfixia: deitar o bebé de barriga para baixo sobre o antebraço, com a cabeça mais baixa que o tronco.',
      '3. Apoiar firmemente a mandíbula com os dedos.',
      '4. Aplicar até **5 pancadas entre as omoplatas** com a base da outra mão.',
      '5. Se não desobstruir: virar o bebé de barriga para cima sobre o outro antebraço.',
      '6. Aplicar até **5 compressões no peito** com 2 dedos, no terço inferior do esterno.',
      '7. Repetir os ciclos até desobstruir ou o bebé ficar inconsciente (iniciar SBV e ligar 112).'
    ]
  },
  hemorragia: {
    title: 'Controlo de Hemorragias Graves',
    steps: [
      '1. Aplicar compressão direta sobre a ferida com compressas limpas ou pano limpo.',
      '2. Manter pressão firme e contínua durante pelo menos 10 minutos.',
      '3. Se o penso ensopar, NÃO retirar: aplicar novas compressas por cima.',
      '4. Deitar a vítima se apresentar tonturas ou palidez (prevenção de choque).',
      '5. Ligar **112** se a hemorragia não estancar com compressão direta.'
    ]
  },
  queimadura: {
    title: 'Tratamento Inicial de Queimaduras Térmicas',
    steps: [
      '1. Arrefecer a zona afetada com água corrente morna/fria (não gelada) durante 10 a 20 minutos.',
      '2. Retirar joias, relógios ou roupas não coladas antes que a área inche.',
      '3. NUNCA aplicar manteiga, azeite, pasta de dentes ou produtos caseiros.',
      '4. NUNCA rebentar bolhas.',
      '5. Cobrir com compressa húmida limpa ou película aderente sem apertar.',
      '6. Se queimadura extensa (> palma da mão) ou em crianças/bebé: ligar **112** ou SNS 24.'
    ]
  },
  pls: {
    title: 'Posição Lateral de Segurança (PLS)',
    steps: [
      'Indicada para vítima inconsciente mas QUE RESPIRA NORMALMENTE.',
      '1. Retirar óculos e objetos duros dos bolsos.',
      '2. Ajoelhar ao lado da vítima e estender as duas pernas.',
      '3. Braço mais próximo em ângulo reto com o corpo, palma virada para cima.',
      '4. Cruzar o outro braço sobre o peito e encostar as costas da mão à face oposta.',
      '5. Dobrar a perna mais distante pelo joelho.',
      '6. Puxar suavemente o joelho para rolar a vítima sobre si em bloco.',
      '7. Inclinar a cabeça para trás para manter a via aérea aberta e verificar a respiração periodicamente.'
    ]
  }
};

/**
 * Checklist de Preparação e Sobrevivência 72 Horas (Kit de Emergência Familiar)
 */
export const KIT_72H = [
  { item: 'Água Potável', desc: 'Mínimo de 3 litros por pessoa por dia (reserva para 72h).' },
  { item: 'Alimentos Não Perecíveis', desc: 'Enlatados, frutos secos, barras de cereais e alimentos infantis para a bebé.' },
  { item: 'Estojo de Primeiros Socorros', desc: 'Compressas, pensos, iodopovidona, paracetamol, tesoura e medicação habitual.' },
  { item: 'Iluminação & Energia', desc: 'Lanterna LED, pilhas de reserva e powerbanks com 100% de carga.' },
  { item: 'Rádio a Pilhas / Manivela', desc: 'Para receção de comunicações da Proteção Civil em caso de falha celular.' },
  { item: 'Documentos e Dinheiro', desc: 'Cópias de CC/cartões de saúde plastificados e reserva de dinheiro físico em notas pequenas.' },
  { item: 'Agasalhos & Mantas Térmicas', desc: 'Casacos impermeáveis e manta isotérmica de sobrevivência.' },
  { item: 'Higiene & Saneamento', desc: 'Toalhetes húmidos, álcool gel, sacos plásticos resistentes e papel higiénico.' }
];

/**
 * Utilitários Rápidos de Dados (Estilo CyberChef / NOMAD Data Tools)
 */
export const CYBERCHEF_TOOLS = {
  encodeBase64: (text) => Buffer.from(String(text), 'utf8').toString('base64'),
  decodeBase64: (base64) => {
    try {
      return Buffer.from(String(base64), 'base64').toString('utf8');
    } catch {
      return 'Erro: Base64 inválido';
    }
  },
  hashSha256: (text) => crypto.createHash('sha256').update(String(text)).digest('hex'),
  toHex: (text) => Buffer.from(String(text), 'utf8').toString('hex'),
  fromHex: (hex) => {
    try {
      return Buffer.from(String(hex).replace(/[^0-9a-fA-F]/g, ''), 'hex').toString('utf8');
    } catch {
      return 'Erro: Hex inválido';
    }
  }
};

/**
 * Formata o menu principal do Projeto NOMAD
 */
export function formatNomadMenuMarkdown() {
  return (
    `🛡️ *Projeto NOMAD: Conhecimento Offline & Resiliência (ADR-044)*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `Módulo inspirado no [Crosstalk-Solutions/project-nomad](https://github.com/Crosstalk-Solutions/project-nomad).\n` +
    `Fornece acesso imediato a procedimentos de primeiros socorros, contactos de proteção civil, kits de sobrevivência e ferramentas utilitárias sem depender de serviços externos.\n\n` +
    `📋 *Comandos NOMAD Disponíveis:*\n` +
    `• \`/nomad socorro\` — Guia de primeiros socorros e suporte básico de vida (SBV, engasgamento, queimaduras).\n` +
    `• \`/nomad kit\` — Checklist de emergência de 72 horas para a família.\n` +
    `• \`/nomad contactos\` — Números diretos de emergência nacional e de Amarante.\n` +
    `• \`/nomad map\` — Vias de evacuação e pontos de saúde locais em Amarante.\n` +
    `• \`/nomad tools <tool> <texto>\` — Ferramentas estilo CyberChef (\`b64enc\`, \`b64dec\`, \`sha256\`, \`hex\`).\n\n` +
    `💡 _Atalhos rápidos:_ \`/socorro\`, \`/kit72h\`, \`/hash <texto>\`, \`/b64 <texto>\``
  );
}

/**
 * Formata o guia de socorro
 */
export function formatFirstAidMarkdown(procedureKey = '') {
  const key = String(procedureKey || '').toLowerCase().trim();
  const proc = FIRST_AID_PROCEDURES[key];

  if (!proc) {
    let list = `🩺 *Guia de Primeiros Socorros NOMAD (Protocolos INEM)*\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    list += `Escolhe um dos procedimentos oficiais:\n\n`;
    list += `• \`/nomad socorro sbv\` — Suporte Básico de Vida Adulto (Reanimação)\n`;
    list += `• \`/nomad socorro bebe\` — Desobstrução de via aérea em lactentes/bebé\n`;
    list += `• \`/nomad socorro hemorragia\` — Controlo de hemorragias graves\n`;
    list += `• \`/nomad socorro queimadura\` — Tratamento imediato de queimaduras\n`;
    list += `• \`/nomad socorro pls\` — Posição Lateral de Segurança\n\n`;
    list += `🚨 *Em situação de risco de vida:* liga de imediato **112**.`;
    return list;
  }

  let text = `🩺 *${proc.title}*\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  proc.steps.forEach((s) => {
    text += `${s}\n\n`;
  });
  text += `🚨 *Regra de Ouro:* Manter a calma e acionar o **112** sempre que a vítima não recupere.`;
  return text;
}

/**
 * Formata a checklist do Kit 72H
 */
export function formatKit72hMarkdown() {
  let text = `🎒 *Kit de Emergência 72 Horas (Proteção Civil / NOMAD)*\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `Itens essenciais para autossuficiência da família em caso de corte prolongado de energia ou catástrofe:\n\n`;
  KIT_72H.forEach((k, idx) => {
    text += `*${idx + 1}. [ ] ${k.item}*\n   ↳ _${k.desc}_\n\n`;
  });
  text += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `💡 _Dica: Revê o prazo de validade das reservas a cada 6 meses._`;
  return text;
}

/**
 * Formata a lista de contactos de emergência
 */
export function formatEmergencyContactsMarkdown() {
  let text = `🚨 *Contactos de Emergência & Proteção Civil*\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  EMERGENCY_CONTACTS.forEach((c) => {
    text += `• *${c.name}:* \`${c.number}\` _(${c.type})_\n`;
  });
  text += `\n📍 *Amarante:* Para ocorrências locais de vias ou cheias no Rio Tâmega, contactar o SMPC Amarante.`;
  return text;
}

/**
 * Executa ferramenta de dados (CyberChef)
 */
export function runCyberChefTool(toolName = '', input = '') {
  const t = String(toolName || '').toLowerCase().trim();
  const rawInput = String(input || '').trim();

  if (!rawInput) {
    return (
      `🛠️ *NOMAD Data Tools (CyberChef)*\n━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `Uso: \`/nomad tools <ferramenta> <texto>\`\n\n` +
      `• \`b64enc\` — Codificar em Base64\n` +
      `• \`b64dec\` — Descodificar Base64\n` +
      `• \`sha256\` — Hash criptográfica SHA-256\n` +
      `• \`hexenc\` — Codificar em Hexadecimal\n` +
      `• \`hexdec\` — Descodificar Hexadecimal\n\n` +
      `_Exemplo:_ \`/nomad tools sha256 SenhaSegura123\``
    );
  }

  let result = '';
  let label = '';

  switch (t) {
    case 'b64enc':
    case 'base64':
      label = 'Base64 Encoded';
      result = CYBERCHEF_TOOLS.encodeBase64(rawInput);
      break;
    case 'b64dec':
      label = 'Base64 Decoded';
      result = CYBERCHEF_TOOLS.decodeBase64(rawInput);
      break;
    case 'sha256':
    case 'hash':
      label = 'SHA-256 Hash';
      result = CYBERCHEF_TOOLS.hashSha256(rawInput);
      break;
    case 'hexenc':
    case 'hex':
      label = 'Hex Encoded';
      result = CYBERCHEF_TOOLS.toHex(rawInput);
      break;
    case 'hexdec':
      label = 'Hex Decoded';
      result = CYBERCHEF_TOOLS.fromHex(rawInput);
      break;
    default:
      return `⚠️ Ferramenta desconhecida: "${toolName}". Escreve \`/nomad tools\` para a lista.`;
  }

  return (
    `🛠️ *NOMAD Data Tools — ${label}*\n━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `• *Entrada:* \`${rawInput.slice(0, 80)}\`\n` +
    `• *Saída:*\n\`${result}\``
  );
}

/**
 * Formata pontos de evacuação e hospitais locais
 */
export function formatNomadMapPointsMarkdown() {
  const infra = amaranteMapService.getUrbanInfrastructure();

  let text = `🗺️ *NOMAD Cartografia Local: Pontos Críticos de Amarante*\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `🏥 *Unidades de Saúde no Concelho (OSM):*\n`;
  if (infra.health && infra.health.length > 0) {
    infra.health.forEach((h) => {
      text += `• ${h}\n`;
    });
  } else {
    text += `• Hospital de Amarante (CH Tâmega e Sousa) — Tel: 255 420 100\n`;
    text += `• Centro de Saúde de Amarante — Tel: 255 420 800\n`;
  }

  text += `\n🛣️ *Eixos Principais de Evacuação Rodoviária:*\n`;
  text += `• *Autoestrada A4 / Túnel do Marão:* Ligação rápida Porto ↔ Vila Real.\n`;
  text += `• *Estrada Nacional EN15:* Alternativa regional ao IP4/A4 com atravessamento do concelho.\n`;
  text += `• *Ponte de S. Gonçalo:* Travessia central histórica sobre o Rio Tâmega.\n\n`;
  text += `✅ _Cartografia baseada no mapa vetorial OSM Amarante (125 vias e infraestruturas urbanas integradas)._`;

  return text;
}

export default {
  EMERGENCY_CONTACTS,
  FIRST_AID_PROCEDURES,
  KIT_72H,
  CYBERCHEF_TOOLS,
  formatNomadMenuMarkdown,
  formatFirstAidMarkdown,
  formatKit72hMarkdown,
  formatEmergencyContactsMarkdown,
  runCyberChefTool,
  formatNomadMapPointsMarkdown
};
