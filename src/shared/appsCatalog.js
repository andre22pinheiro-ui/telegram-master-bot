// src/shared/appsCatalog.js — Catálogo Centralizado de Todas as Aplicações Vercel & Telegram Mini Apps

export const VERCEL_APPS = {
  familiar: {
    id: "familiar",
    name: "Família (Gestão & Carolina)",
    category: "Família & Produtividade",
    url: "https://gestao-familiar-webapp.vercel.app",
    description: "Compras partilhadas, tarefas da casa, notas e registo da Carolina (escola, faltas, consultas).",
    isMiniApp: true,
    icon: "🏡"
  },
  rotabus: {
    id: "rotabus",
    name: "RotaBus (Pesados & Conforto VIP)",
    category: "Frotas & Mobilidade Pesada",
    url: "https://smooth-bus-routes.vercel.app",
    apkUrl: "https://smooth-bus-routes.vercel.app/rotabus.apk",
    description: "Navegação GPS de autocarros, equipas de futebol, anti-sinuosidade e tacógrafo digital.",
    isMiniApp: true,
    icon: "🚌",
    getRouteUrl: (orig, dest) => `https://smooth-bus-routes.vercel.app/?origin=${encodeURIComponent(orig)}&destination=${encodeURIComponent(dest)}`
  },
  matchpro: {
    id: "matchpro",
    name: "MatchPro (Tática & Jogos)",
    category: "Desporto & Análise de Jogo",
    url: "https://matchpro-alpha.vercel.app",
    description: "Plataforma de streaming, scout de jogos e prancheta tática interativa.",
    isMiniApp: true,
    icon: "⚽"
  },
  pladur: {
    id: "pladur",
    name: "Pladur-Pro (Engenharia 3D)",
    category: "Construção & Engenharia",
    url: "https://pladur-pro.vercel.app",
    description: "Orçamentação automática de divisórias, perfis Pladur e modelos 3D interativos.",
    isMiniApp: true,
    icon: "🏗️"
  },
  appfrota: {
    id: "appfrota",
    name: "AppFrota (Gestão de Frotas)",
    category: "Logística & Frota",
    url: "https://appfrota-ten.vercel.app",
    description: "Monitorização de viaturas, tacógrafos, manutenções e consumo de combustível.",
    isMiniApp: true,
    icon: "🚛"
  },
  bonecas: {
    id: "bonecas",
    name: "Casa de Bonecas 3D",
    category: "Arquitetura & Design",
    url: "https://casadebonecas-3d.vercel.app",
    description: "Visualizador tridimensional imersivo de interiores e divisórias.",
    isMiniApp: true,
    icon: "🏰"
  },
  immo: {
    id: "immo",
    name: "ImmoEval (Avaliação Imobiliária)",
    category: "Avaliação & Mercado Imobiliário",
    url: "https://pesquisa-imobiliario.vercel.app",
    description: "Radar de preços m², análise CMVM e comparativo de mercado residencial em Amarante e Norte.",
    isMiniApp: true,
    icon: "🏠"
  },
  lastwar: {
    id: "lastwar",
    name: "Last War Tactics",
    category: "Estratégia & Jogos",
    url: "https://last-war-tactics.vercel.app",
    description: "Calculadora tática de esquadrões e gestão militar.",
    isMiniApp: true,
    icon: "⚔️"
  },
  scaffold: {
    id: "scaffold",
    name: "Scaffold Bot Preview",
    category: "Desenvolvimento & Cloud",
    url: "https://teste-scaffold-bot.vercel.app",
    description: "Ambiente de pré-visualização de protótipos de software e automações.",
    isMiniApp: true,
    icon: "💻"
  }
};

/**
 * Constrói teclado de Mini Apps completo para o Telegram
 */
export function buildTelegramAppsKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "🏡 1. Família (Carolina & Casa)", web_app: { url: VERCEL_APPS.familiar.url } }
      ],
      [
        { text: "🚌 2. RotaBus (Navegação VIP)", web_app: { url: VERCEL_APPS.rotabus.url } },
        { text: "⚽ 3. MatchPro (Tática & TV)", web_app: { url: VERCEL_APPS.matchpro.url } }
      ],
      [
        { text: "🏗️ 4. Pladur-Pro (Orçamentos 3D)", web_app: { url: VERCEL_APPS.pladur.url } },
        { text: "🚛 5. AppFrota (Gestão de Frotas)", web_app: { url: VERCEL_APPS.appfrota.url } }
      ],
      [
        { text: "🏠 6. ImmoEval (Avaliação m²)", web_app: { url: VERCEL_APPS.immo.url } },
        { text: "🏰 7. Casa de Bonecas 3D", web_app: { url: VERCEL_APPS.bonecas.url } }
      ],
      [
        { text: "⚔️ 8. Last War Tactics", web_app: { url: VERCEL_APPS.lastwar.url } },
        { text: "💻 9. Scaffold Preview", web_app: { url: VERCEL_APPS.scaffold.url } }
      ]
    ]
  };
}

export function formatAllVercelAppsMarkdown() {
  const apps = Object.values(VERCEL_APPS);
  const lines = apps.map((a, i) => `*${i + 1}. ${a.icon} ${a.name}*\n• _${a.description}_\n• \`${a.url}\``);
  return (
    `🌐 *CATÁLOGO DE TELEGRAM MINI APPS & VERCEL:*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `${lines.join("\n\n")}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `👇 _Toca num dos botões abaixo para abrir a aplicação diretamente como Mini App nativa no Telegram:_`
  );
}

export function getAppByKeyword(keyword) {
  const clean = String(keyword || '').toLowerCase().trim();
  const apps = Object.values(VERCEL_APPS);
  return apps.find(a => 
    a.name.toLowerCase().includes(clean) || 
    a.id.toLowerCase().includes(clean) || 
    a.description.toLowerCase().includes(clean) ||
    clean.includes(a.id)
  ) || null;
}

export default {
  VERCEL_APPS,
  getAppByKeyword,
  buildTelegramAppsKeyboard,
  formatAllVercelAppsMarkdown
};

