// src/services/obsidianService.js — Motor de Integração Obsidian (Markdown Flavored & JSON Canvas)
import { createLogger } from '../utils/logger.js';
import { sqliteMasterDb } from '../shared/sqliteMasterDb.js';

const log = createLogger('ObsidianService');

/**
 * Cores padrão da especificação JSON Canvas (1: vermelho, 2: laranja, 3: amarelo, 4: verde, 5: ciano, 6: roxo)
 */
export const CANVAS_COLORS = {
  RED: '1',
  ORANGE: '2',
  YELLOW: '3',
  GREEN: '4',
  CYAN: '5',
  PURPLE: '6'
};

/**
 * Formata texto simples em Obsidian Flavored Markdown com Frontmatter YAML, Wikilinks e Callouts
 */
export function formatObsidianMarkdown({
  title = 'Sem Título',
  content = '',
  tags = ['second-brain', 'pessoal'],
  category = 'Geral',
  author = 'André Pinheiro',
  created = new Date().toISOString(),
  aliases = [],
  callout = null, // { type: 'NOTE'|'TIP'|'IMPORTANT'|'WARNING', title: '', body: '' }
  wikilinks = []
}) {
  const safeTags = Array.isArray(tags) ? tags : [tags];
  const safeAliases = Array.isArray(aliases) ? aliases : [aliases];

  // 1. YAML Frontmatter
  let md = '---\n';
  md += `title: "${title.replace(/"/g, '\\"')}"\n`;
  md += `created: "${created}"\n`;
  md += `author: "${author}"\n`;
  md += `category: "${category}"\n`;
  md += `tags:\n${safeTags.map((t) => `  - ${t.replace(/^#/, '')}`).join('\n')}\n`;
  if (safeAliases.length > 0) {
    md += `aliases:\n${safeAliases.map((a) => `  - "${a}"`).join('\n')}\n`;
  }
  md += '---\n\n';

  // 2. Título H1
  md += `# ${title}\n\n`;

  // 3. Callout opcional (Obsidian Callouts)
  if (callout && callout.body) {
    const cType = (callout.type || 'NOTE').toUpperCase();
    const cTitle = callout.title ? ` ${callout.title}` : '';
    md += `> [!${cType}]${cTitle}\n`;
    callout.body.split('\n').forEach((line) => {
      md += `> ${line}\n`;
    });
    md += '\n';
  }

  // 4. Conteúdo Principal
  md += `${content.trim()}\n\n`;

  // 5. Wikilinks / Conexões do Grafo
  if (wikilinks.length > 0) {
    md += `## Conexões & Notas Relacionadas\n`;
    wikilinks.forEach((link) => {
      md += `- [[${link}]]\n`;
    });
    md += '\n';
  }

  return md;
}

/**
 * Gera um ficheiro de mapa visual JSON Canvas (.canvas) válido segundo a especificação oficial de Obsidian
 */
export function generateEcosystemCanvas({
  title = 'Ecossistema Digital André Pinheiro',
  customNodes = [],
  customEdges = []
} = {}) {
  // Nós canónicos padrão do ecossistema de bots
  const defaultNodes = [
    {
      id: 'node-master-hub',
      type: 'text',
      text: `## 🧠 Master Hub (@AndrePinheirobot)\n*Orquestrador Pessoal & Familiar (Cloud-Native)*\n- SQLite WAL + FTS5 Second Brain\n- Sincronização Google Drive 24/7\n- Notícias Certificadas & Radar 5 Frentes`,
      x: 0,
      y: 0,
      width: 360,
      height: 190,
      color: CANVAS_COLORS.CYAN
    },
    {
      id: 'node-second-brain',
      type: 'text',
      text: `### 📚 Second Brain (FTS5)\n*Memória Conversacional e Factos*\n- /memoria pesquisa em linguagem natural\n- Exportação para Obsidian Vault\n- Wikilinks automáticos e Callouts`,
      x: -460,
      y: -260,
      width: 340,
      height: 180,
      color: CANVAS_COLORS.PURPLE
    },
    {
      id: 'node-familia',
      type: 'text',
      text: `### 👨‍👩‍👧 Família & Carolina\n*Gestão Doméstica Integrada*\n- Compras partilhadas em SQLite\n- Diário de desenvolvimento da bebé\n- Lembretes no fuso Europe/Lisbon`,
      x: -460,
      y: 200,
      width: 340,
      height: 180,
      color: CANVAS_COLORS.GREEN
    },
    {
      id: 'node-dev-bot',
      type: 'text',
      text: `### 💻 Dev Bot (@DesSofBot)\n*Engenharia Cloud & GitHub Actions*\n- Compilação de APKs (RotaBus)\n- Absorção de Ideias Open-Source (ADR-044)\n- Catálogo Free-TV e Canais Abertos`,
      x: 460,
      y: -260,
      width: 340,
      height: 180,
      color: CANVAS_COLORS.ORANGE
    },
    {
      id: 'node-frota-bot',
      type: 'text',
      text: `### 🚛 Frota Municipal (@zeropaperfrotaBot)\n*Domínio Profissional Isolado*\n- Supabase PostgREST (bwibtpcunojmtnrnqpvg)\n- Escalas (/escala), Férias (/ferias), Alertas (/alertas)\n- Tacógrafo CE 561/2006 e TCC Lei 13/2006`,
      x: 460,
      y: 200,
      width: 360,
      height: 190,
      color: CANVAS_COLORS.YELLOW
    }
  ];

  // Arestas de conexão direcionada
  const defaultEdges = [
    {
      id: 'edge-hub-brain',
      fromNode: 'node-master-hub',
      fromSide: 'left',
      toNode: 'node-second-brain',
      toSide: 'right',
      label: 'FTS5 Facts'
    },
    {
      id: 'edge-hub-fam',
      fromNode: 'node-master-hub',
      fromSide: 'bottom',
      toNode: 'node-familia',
      toSide: 'top',
      label: 'Casa & Bebé'
    },
    {
      id: 'edge-hub-dev',
      fromNode: 'node-master-hub',
      fromSide: 'top',
      toNode: 'node-dev-bot',
      toSide: 'bottom',
      label: 'Cloud & Ideias'
    },
    {
      id: 'edge-hub-frota',
      fromNode: 'node-master-hub',
      fromSide: 'right',
      toNode: 'node-frota-bot',
      toSide: 'left',
      label: 'Redirecionamento Estrito'
    }
  ];

  const canvasData = {
    nodes: [...defaultNodes, ...customNodes],
    edges: [...defaultEdges, ...customEdges]
  };

  return JSON.stringify(canvasData, null, 2);
}

/**
 * Exporta o Second Brain (factos, notas, tarefas e radar) para um pacote de notas compatível com Obsidian Vault
 */
export function exportSecondBrainToObsidianVault(userId = 'default_user') {
  const notes = sqliteMasterDb.getNotes(30) || [];
  const facts = sqliteMasterDb.searchMemoryFacts('', 50) || [];
  const tasks = sqliteMasterDb.getTasks() || [];
  const ideas = (typeof sqliteMasterDb.listIdeaRecords === 'function' ? sqliteMasterDb.listIdeaRecords(null, 20) : []) || [];

  const vaultFiles = [];

  // 1. Nota Principal (MOC - Map of Content)
  let mocContent = `Este Map of Content (MOC) agrega todas as notas, tarefas, memórias e ideias geradas pelo ecossistema de bots Telegram no Obsidian.\n\n`;
  mocContent += `### 📌 Secções do Vault\n`;
  mocContent += `- [[01 - Notas Pessoais e Familiares]]\n`;
  mocContent += `- [[02 - Factos do Second Brain (FTS5)]]\n`;
  mocContent += `- [[03 - Lista de Tarefas Ativas]]\n`;
  mocContent += `- [[04 - Radar de Ideias e Projetos Cloud]]\n`;
  mocContent += `- [[05 - Ecossistema Visual (Canvas)]]\n\n`;
  mocContent += `> [!TIP] Sincronização Automática\n`;
  mocContent += `> As notas deste vault sincronizam com o ficheiro SQLite \`pessoal_master.db\` e o backup Google Drive.\n`;

  vaultFiles.push({
    filename: '00 - Índice Second Brain.md',
    content: formatObsidianMarkdown({
      title: '00 - Índice Second Brain (MOC)',
      content: mocContent,
      tags: ['second-brain', 'moc', 'indice'],
      category: 'Índice',
      callout: {
        type: 'NOTE',
        title: 'Central de Conhecimento Pessoal',
        body: 'Estrutura gerada automaticamente a partir do SQLite WAL Master.'
      }
    })
  });

  // 2. Ficheiro de Factos do Second Brain
  let factsContent = `Factos aprendidos e registados pelo motor cognitivo Grok no Second Brain:\n\n`;
  if (facts.length === 0) {
    factsContent += `_Nenhum facto registado até ao momento._\n`;
  } else {
    facts.forEach((f, i) => {
      factsContent += `### ${i + 1}. [${f.category || 'Geral'}] ${f.fact}\n`;
      factsContent += `- Confiança: \`${Math.round((f.confidence_score || 1.0) * 100)}%\`\n`;
      factsContent += `- Atualizado em: \`${f.updated_at || 'N/A'}\`\n\n`;
    });
  }

  vaultFiles.push({
    filename: '02 - Factos do Second Brain (FTS5).md',
    content: formatObsidianMarkdown({
      title: '02 - Factos do Second Brain',
      content: factsContent,
      tags: ['second-brain', 'memoria', 'fts5'],
      category: 'Memória',
      wikilinks: ['00 - Índice Second Brain (MOC)']
    })
  });

  // 3. Ficheiro de Tarefas Ativas
  let tasksContent = `Lista de tarefas pendentes e em curso no ecossistema familiar:\n\n`;
  tasks.forEach((t) => {
    const check = t.status === 'concluida' ? '[x]' : '[ ]';
    tasksContent += `- ${check} ${t.text} _(Atribuído a: ${t.assigned_to || 'Ambos'})_\n`;
  });

  vaultFiles.push({
    filename: '03 - Lista de Tarefas Ativas.md',
    content: formatObsidianMarkdown({
      title: '03 - Lista de Tarefas Ativas',
      content: tasksContent,
      tags: ['tarefas', 'familia'],
      category: 'Planeamento',
      wikilinks: ['00 - Índice Second Brain (MOC)']
    })
  });

  // 4. Ficheiro de Ideias do Radar
  let ideasContent = `Projetos e repositórios open-source absorvidos e adaptados à infraestrutura Cloud-Native:\n\n`;
  ideas.forEach((item) => {
    ideasContent += `### #${item.id} [${item.target_project}] ${item.repo_name || item.source_url}\n`;
    ideasContent += `- URL: ${item.source_url}\n`;
    ideasContent += `- Estado: \`${item.status}\`\n`;
    ideasContent += `- Resumo: ${item.extracted_summary || 'Sem resumo'}\n\n`;
  });

  vaultFiles.push({
    filename: '04 - Radar de Ideias e Projetos Cloud.md',
    content: formatObsidianMarkdown({
      title: '04 - Radar de Ideias e Projetos Cloud',
      content: ideasContent,
      tags: ['projetos', 'cloud', 'ideias', 'adr-044'],
      category: 'DevOps',
      wikilinks: ['00 - Índice Second Brain (MOC)']
    })
  });

  // 5. Ficheiro JSON Canvas
  vaultFiles.push({
    filename: '05 - Ecossistema Visual (Canvas).canvas',
    content: generateEcosystemCanvas()
  });

  return vaultFiles;
}

/**
 * Cria e guarda uma nota diretamente no formato Obsidian
 */
export function createAndSaveObsidianNote({
  title,
  content,
  tags = ['pessoal'],
  category = 'Geral',
  user = 'André Pinheiro'
}) {
  const md = formatObsidianMarkdown({
    title,
    content,
    tags,
    category,
    author: user,
    callout: {
      type: 'NOTE',
      title: 'Nota Criada via Telegram',
      body: `Criada por ${user} em ${new Date().toLocaleString('pt-PT')}`
    }
  });

  sqliteMasterDb.addNote(title, md, 'obsidian', user);
  return {
    success: true,
    title,
    markdown: md
  };
}

/**
 * Gera mensagem de menu estruturado do Obsidian para Telegram
 */
export function formatObsidianMenuMarkdown() {
  const notesCount = sqliteMasterDb.getNotes(100)?.length || 0;
  const factsCount = sqliteMasterDb.searchMemoryFacts('', 100)?.length || 0;
  const ideasCount = (typeof sqliteMasterDb.listIdeaRecords === 'function' ? sqliteMasterDb.listIdeaRecords(null, 100) : [])?.length || 0;

  return (
    `💎 *Integração Obsidian & Agent Skills (ADR-044)*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `O teu ecossistema de bots agora suporta nativamente a especificação aberta de **Obsidian Flavored Markdown** e **JSON Canvas**.\n\n` +
    `📊 *Estado do Vault Digital:* \n` +
    `• Notas Registadas: *${notesCount}*\n` +
    `• Factos Second Brain (FTS5): *${factsCount}*\n` +
    `• Ideias no Radar: *${ideasCount}*\n\n` +
    `🛠️ *Comandos Disponíveis:*\n` +
    `• \`/obsidian export\` — Exporta o Map of Content (MOC) e notas em Markdown.\n` +
    `• \`/obsidian canvas\` — Devolve o ficheiro visual \`.canvas\` pronto para abrir no Obsidian.\n` +
    `• \`/obsidian nota <titulo> | <conteudo>\` — Cria uma nota no formato Obsidian.\n\n` +
    `✨ *Competências Instaladas:* \`obsidian-markdown\`, \`json-canvas\`, \`obsidian-bases\`, \`obsidian-cli\`, \`obsidian-headless\`.`
  );
}

export default {
  CANVAS_COLORS,
  formatObsidianMarkdown,
  generateEcosystemCanvas,
  exportSecondBrainToObsidianVault,
  createAndSaveObsidianNote,
  formatObsidianMenuMarkdown
};
