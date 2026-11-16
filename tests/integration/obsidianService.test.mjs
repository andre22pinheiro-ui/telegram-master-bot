// tests/integration/obsidianService.test.mjs — Testes Automatizados de Integração do Obsidian Skills
import test from 'node:test';
import assert from 'node:assert/strict';
import obsidianService, { CANVAS_COLORS } from '../../src/services/obsidianService.js';
import { routeMessage } from '../../src/router/masterRouter.js';

test('OBSIDIAN-01: Formatação de Markdown cumpre especificação Obsidian (Frontmatter, Callouts, Wikilinks)', () => {
  const md = obsidianService.formatObsidianMarkdown({
    title: 'Nota Arquitetura',
    content: 'Descrição do sistema com wikilink [[Frota]]',
    tags: ['arquitetura', 'cloud'],
    category: 'Engenharia',
    author: 'André Pinheiro',
    callout: { type: 'IMPORTANT', title: 'Regra de Ouro', body: 'Isolamento estrito entre bots.' },
    wikilinks: ['Frota', 'MasterBot']
  });

  assert.ok(md.startsWith('---\n'), 'Deve conter frontmatter YAML inicial');
  assert.ok(md.includes('title: "Nota Arquitetura"'), 'Deve conter título no frontmatter');
  assert.ok(md.includes('> [!IMPORTANT] Regra de Ouro'), 'Deve conter callout Obsidian');
  assert.ok(md.includes('[[Frota]]'), 'Deve conter wikilink no corpo');
  assert.ok(md.includes('- [[MasterBot]]'), 'Deve conter secção de conexões relacionadas');
});

test('OBSIDIAN-02: Geração de JSON Canvas (.canvas) gera estrutura válida com nós e arestas', () => {
  const rawJson = obsidianService.generateEcosystemCanvas();
  const canvas = JSON.parse(rawJson);

  assert.ok(Array.isArray(canvas.nodes), 'Canvas deve possuir lista de nós');
  assert.ok(Array.isArray(canvas.edges), 'Canvas deve possuir lista de arestas');
  assert.ok(canvas.nodes.length >= 5, 'Deve possuir pelo menos os 5 nós canónicos do ecossistema');
  assert.ok(canvas.edges.length >= 4, 'Deve possuir pelo menos 4 arestas direcionadas');

  const hubNode = canvas.nodes.find((n) => n.id === 'node-master-hub');
  assert.ok(hubNode, 'Deve possuir nó central do Master Hub');
  assert.equal(hubNode.color, CANVAS_COLORS.CYAN);
});

test('OBSIDIAN-03: Exportação do Second Brain produz 5 ficheiros canónicos de Vault', () => {
  const vault = obsidianService.exportSecondBrainToObsidianVault();

  assert.equal(vault.length, 5, 'Deve gerar exatamente 5 ficheiros de vault');
  const filenames = vault.map((f) => f.filename);
  assert.ok(filenames.includes('00 - Índice Second Brain.md'));
  assert.ok(filenames.includes('02 - Factos do Second Brain (FTS5).md'));
  assert.ok(filenames.includes('03 - Lista de Tarefas Ativas.md'));
  assert.ok(filenames.includes('04 - Radar de Ideias e Projetos Cloud.md'));
  assert.ok(filenames.includes('05 - Ecossistema Visual (Canvas).canvas'));
});

test('OBSIDIAN-04: Roteamento MasterRouter despacha /obsidian e /canvas para WorkerDev', async () => {
  const mockCtx = { from: { id: 950415577, first_name: 'Andre' }, chat: { id: 950415577 } };

  const menu = await routeMessage('/obsidian', mockCtx);
  assert.ok(menu.includes('Integração Obsidian'), 'Deve responder com menu Obsidian');
  assert.ok(menu.includes('/obsidian export'), 'Deve sugerir comando export');

  const canvasResp = await routeMessage('/canvas', mockCtx);
  assert.ok(canvasResp.includes('JSON Canvas do Ecossistema'), 'Deve responder com canvas visual');
  assert.ok(canvasResp.includes('node-master-hub'), 'Deve conter identificador do nó');
});
