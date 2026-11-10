// src/shared/immoSitesCatalog.js — Catálogo dos 12 Portais & Agências Imobiliárias de Amarante
// Transposto fielmente de diretorio_imobiliarias.py e radar_web.py da app Vercel

export const IMMO_SITES = [
  {
    id: 'casayes',
    nome: 'Casa Yes (Amarante)',
    tipo: 'Portal Nacional / Parcerias',
    url: 'https://casayes.pt/imoveis/amarante/moradias',
    searchUrl: 'https://casayes.pt/imoveis/amarante/moradias?preco_max=250000',
    descricao: 'Excelente cobertura de moradias no centro e freguesias de Amarante.'
  },
  {
    id: 'remax',
    nome: 'RE/MAX Advanced (Amarante)',
    tipo: 'Rede Nacional / Agência Local',
    url: 'https://www.remax.pt/advanced',
    searchUrl: 'https://www.remax.pt/comprar/moradia/amarante?precomax=250000',
    descricao: 'Av. 1º de Maio. Carteira ativa em São Gonçalo, Cepelos, Gatão e Madalena.'
  },
  {
    id: 'era',
    nome: 'ERA Amarante',
    tipo: 'Rede Nacional / Agência Local',
    url: 'https://www.era.pt/agencia/era-amarante',
    searchUrl: 'https://www.era.pt/imoveis/comprar/moradias/porto/amarante?precoMax=250000',
    descricao: 'Rua António Carneiro. Moradias, quintas e apartamentos em Amarante.'
  },
  {
    id: 'idealista',
    nome: 'Idealista (Amarante)',
    tipo: 'Portal Líder Nacional',
    url: 'https://www.idealista.pt/comprar-casas/amarante/moradias/',
    searchUrl: 'https://www.idealista.pt/comprar-casas/amarante/moradias/com-preco-max_250000/',
    descricao: 'Maior agregador imobiliário com alertas em tempo real e histórico de preços.'
  },
  {
    id: 'imovirtual',
    nome: 'Imovirtual (Amarante)',
    tipo: 'Portal Nacional',
    url: 'https://www.imovirtual.com/pt/resultados/comprar/moradia/porto/amarante',
    searchUrl: 'https://www.imovirtual.com/pt/resultados/comprar/moradia/porto/amarante?price_to=250000',
    descricao: 'Grande volume de anúncios de particulares e agências do Tâmega e Sousa.'
  },
  {
    id: 'supercasa',
    nome: 'Supercasa (Amarante)',
    tipo: 'Portal Nacional',
    url: 'https://supercasa.pt/comprar-casas/amarante',
    searchUrl: 'https://supercasa.pt/comprar-casas/amarante?preco-max=250000',
    descricao: 'Pesquisa avançada com foco na região Norte.'
  },
  {
    id: 'casasapo',
    nome: 'Casa Sapo (Amarante)',
    tipo: 'Portal Nacional',
    url: 'https://casasapo.pt/comprar-moradias/amarante/',
    searchUrl: 'https://casasapo.pt/comprar-moradias/amarante/?sa=250000',
    descricao: 'Pioneiro em Portugal, forte presença em concelhos do interior norte.'
  },
  {
    id: 'century21',
    nome: 'Century 21',
    tipo: 'Rede Imobiliária',
    url: 'https://www.century21.pt/comprar/moradia/amarante/',
    searchUrl: 'https://www.century21.pt/comprar/moradia/amarante/?maxprice=250000',
    descricao: 'Rede internacional com presença e consultores em Amarante e Penafiel.'
  },
  {
    id: 'moramarante',
    nome: 'Moramarante Imobiliária',
    tipo: 'Agência Local Independente',
    url: 'https://moramarante.pt',
    searchUrl: 'https://moramarante.pt/imoveis',
    descricao: 'Edifício Santa Luzia. Especializada no mercado tradicional, casas de pedra e restauro.'
  },
  {
    id: 'ds_amarante',
    nome: 'DS Amarante & Baião',
    tipo: 'Mediação Imobiliária & Crédito',
    url: 'https://decisoesesolucoes.com/agencia/amarante',
    searchUrl: 'https://decisoesesolucoes.com/agencia/amarante',
    descricao: 'Rua 5 de Outubro. Mediação e viabilidade de crédito à habitação.'
  },
  {
    id: 'olx',
    nome: 'OLX Imóveis (Amarante)',
    tipo: 'Classificados / Particulares',
    url: 'https://www.olx.pt/imoveis/amarante/',
    searchUrl: 'https://www.olx.pt/imoveis/casas-moradias-para-venda/amarante/?search%5Bfilter_float_price%3Ato%5D=250000',
    descricao: 'Canal de oportunidades diretas de proprietários e particulares sem comissão.'
  },
  {
    id: 'custojusto',
    nome: 'CustoJusto (Amarante)',
    tipo: 'Classificados',
    url: 'https://www.custojusto.pt/porto/amarante/imobiliario',
    searchUrl: 'https://www.custojusto.pt/porto/amarante/imobiliario/moradias-venda?pe=250000',
    descricao: 'Anúncios locais de quintas, moradias para recuperar e negócios rápidos.'
  }
];

export const VERCEL_IMMO_APP = {
  name: 'ImmoEval Vercel App',
  url: 'https://pesquisa-imobiliario.vercel.app',
  descricao: 'Radar de mercado, filtros CMVM e comparador de moradias em Amarante.'
};

/**
 * Formata a lista dos 12 portais para o Telegram
 */
export function formatarSitesImobiliariosMarkdown() {
  let md = `🌐 *DIRETÓRIO DOS 12 PORTAIS & AGÊNCIAS DE AMARANTE*\n`;
  md += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  md += `_Filtros pré-configurados para Moradias ≤ 250.000 €:_\n\n`;

  IMMO_SITES.forEach((site, i) => {
    md += `*${i + 1}. ${site.nome}* _(${site.tipo})_\n`;
    md += `• 🔗 [Abrir Anúncios](${site.searchUrl})\n`;
    md += `• ℹ️ _${site.descricao}_\n\n`;
  });

  md += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  md += `📱 *Mini App Oficial:* [ImmoEval Vercel](${VERCEL_IMMO_APP.url})\n`;
  md += `_Toque nos botões abaixo para abrir diretamente:_`;
  return md;
}

/**
 * Constrói teclado inline para acesso aos portais principais
 */
export function buildImmoSitesKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '🏠 Abrir ImmoEval Vercel', web_app: { url: VERCEL_IMMO_APP.url } }
      ],
      [
        { text: '🔍 Casa Yes (≤250k)', url: IMMO_SITES[0].searchUrl },
        { text: '🔍 RE/MAX Advanced', url: IMMO_SITES[1].searchUrl }
      ],
      [
        { text: '🔍 ERA Amarante', url: IMMO_SITES[2].searchUrl },
        { text: '🔍 Idealista', url: IMMO_SITES[3].searchUrl }
      ],
      [
        { text: '🔍 Imovirtual', url: IMMO_SITES[4].searchUrl },
        { text: '🔍 OLX Particulares', url: IMMO_SITES[10].searchUrl }
      ],
      [
        { text: '📡 Disparar Radar Agora', callback_data: 'immo_radar_scan' },
        { text: '📊 Relatório Diário', callback_data: 'immo_daily_report' }
      ]
    ]
  };
}

export default {
  IMMO_SITES,
  VERCEL_IMMO_APP,
  formatarSitesImobiliariosMarkdown,
  buildImmoSitesKeyboard
};

