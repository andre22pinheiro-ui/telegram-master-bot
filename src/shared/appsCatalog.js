// src/shared/appsCatalog.js — Catálogo Centralizado de Todas as 9 Aplicações Vercel & Telegram Mini Apps (Separação Pessoal vs. Trabalho)

export const VERCEL_APPS = {
  familiar: {
    id: 'familiar',
    domain: 'pessoal',
    name: 'Família (Gestão & Carolina)',
    category: 'Família & Produtividade',
    url: 'https://gestao-familiar-webapp.vercel.app',
    description: 'Compras partilhadas, tarefas da casa, notas e registo da Carolina (escola, faltas, consultas).',
    isMiniApp: true,
    icon: '🏡'
  },
  immo: {
    id: 'immo',
    domain: 'pessoal',
    name: 'ImmoEval (Avaliação Imobiliária)',
    category: 'Avaliação & Mercado Imobiliário',
    url: 'https://pesquisa-imobiliario.vercel.app',
    description: 'Radar de preços m², análise CMVM e comparativo de mercado residencial em Amarante e Norte.',
    isMiniApp: true,
    icon: '🏠'
  },
  pladur: {
    id: 'pladur',
    domain: 'pessoal',
    name: 'Pladur-Pro (Engenharia 3D)',
    category: 'Construção & Engenharia',
    url: 'https://pladur-pro.vercel.app',
    description: 'Orçamentação automática de divisórias, perfis Pladur e modelos 3D interativos.',
    isMiniApp: true,
    icon: '🏗️'
  },
  bonecas: {
    id: 'bonecas',
    domain: 'pessoal',
    name: 'Casa de Bonecas 3D',
    category: 'Arquitetura & Design',
    url: 'https://casadebonecas-3d.vercel.app',
    description: 'Visualizador tridimensional imersivo de interiores e divisórias.',
    isMiniApp: true,
    icon: '🏰'
  },
  matchpro: {
    id: 'matchpro',
    domain: 'pessoal',
    name: 'MatchPro (Tática & Jogos)',
    category: 'Desporto & Análise de Jogo',
    url: 'https://matchpro-alpha.vercel.app',
    description: 'Plataforma de streaming, scout de jogos e prancheta tática interativa.',
    isMiniApp: true,
    icon: '⚽'
  },
  lastwar: {
    id: 'lastwar',
    domain: 'pessoal',
    name: 'Last War Tactics',
    category: 'Estratégia & Jogos',
    url: 'https://last-war-tactics.vercel.app',
    description: 'Calculadora tática de esquadrões e gestão militar.',
    isMiniApp: true,
    icon: '⚔️'
  },
  scaffold: {
    id: 'scaffold',
    domain: 'pessoal',
    name: 'Scaffold Bot Preview',
    category: 'Desenvolvimento & Cloud',
    url: 'https://teste-scaffold-bot.vercel.app',
    description: 'Ambiente de pré-visualização de protótipos de software e automações.',
    isMiniApp: true,
    icon: '💻'
  },
  appfrota: {
    id: 'appfrota',
    domain: 'trabalho',
    name: 'AppFrota (Gestão de Frotas)',
    category: 'Trabalho / Frotas (@zeropaperfrotaBot)',
    url: 'https://appfrota-ten.vercel.app',
    description: 'Monitorização de viaturas, manutenção e stock empresarial (bot dedicado @zeropaperfrotaBot).',
    isMiniApp: true,
    icon: '🚛'
  },
  rotabus: {
    id: 'rotabus',
    domain: 'trabalho',
    name: 'RotaBus (Pesados & Conforto VIP)',
    category: 'Trabalho / Frotas (@zeropaperfrotaBot)',
    url: 'https://smooth-bus-routes.vercel.app',
    apkUrl: 'https://smooth-bus-routes.vercel.app/rotabus.apk',
    description: 'Navegação GPS de autocarros, anti-sinuosidade e tacógrafo CE 561/2006 (bot @zeropaperfrotaBot).',
    isMiniApp: true,
    icon: '🚌',
    getRouteUrl: (orig, dest) => `https://smooth-bus-routes.vercel.app/?origin=${encodeURIComponent(orig)}&destination=${encodeURIComponent(dest)}`
  }
};

export function buildTelegramAppsKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '🏡 1. Família (Carolina & Casa)', web_app: { url: VERCEL_APPS.familiar.url } },
        { text: '🏠 2. ImmoEval CMVM', web_app: { url: VERCEL_APPS.immo.url } }
      ],
      [
        { text: '🏗️ 3. Pladur-Pro 3D', web_app: { url: VERCEL_APPS.pladur.url } },
        { text: '🏰 4. Casa de Bonecas 3D', web_app: { url: VERCEL_APPS.bonecas.url } }
      ],
      [
        { text: '⚽ 5. MatchPro', web_app: { url: VERCEL_APPS.matchpro.url } },
        { text: '⚔️ 6. Last War Tactics', web_app: { url: VERCEL_APPS.lastwar.url } }
      ],
      [
        { text: '💻 7. Scaffold Preview', web_app: { url: VERCEL_APPS.scaffold.url } }
      ],
      [
        { text: '🚛 8. AppFrota (Trabalho)', web_app: { url: VERCEL_APPS.appfrota.url } },
        { text: '🚌 9. RotaBus (Trabalho)', web_app: { url: VERCEL_APPS.rotabus.url } }
      ]
    ]
  };
}

export function formatAllVercelAppsMarkdown() {
  const apps = Object.values(VERCEL_APPS);
  const pessoais = apps.filter((a) => a.domain === 'pessoal');
  const trabalho = apps.filter((a) => a.domain === 'trabalho');

  const formatList = (list) =>
    list.map((a, i) => `*${i + 1}. ${a.icon} ${a.name}*\n• _${a.description}_\n• \`${a.url}\``).join('\n\n');

  return (
    `🌐 *CATÁLOGO DE 9 MINI APPS VERCEL (PESSOAL vs. TRABALHO)*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `👤 *DOMÍNIO PESSOAL & DEV (@AndrePinheirobot):*\n\n${formatList(pessoais)}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🏢 *DOMÍNIO TRABALHO & FROTAS (@zeropaperfrotaBot):*\n\n${formatList(trabalho)}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `👇 _Toca num dos botões abaixo para abrir diretamente no Telegram:_`
  );
}

export function getAppByKeyword(keyword) {
  const clean = String(keyword || '').toLowerCase().trim();
  const apps = Object.values(VERCEL_APPS);
  return (
    apps.find(
      (a) =>
        a.name.toLowerCase().includes(clean) ||
        a.id.toLowerCase().includes(clean) ||
        a.description.toLowerCase().includes(clean) ||
        clean.includes(a.id)
    ) || null
  );
}

export default {
  VERCEL_APPS,
  getAppByKeyword,
  buildTelegramAppsKeyboard,
  formatAllVercelAppsMarkdown
};
