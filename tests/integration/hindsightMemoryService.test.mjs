// tests/integration/hindsightMemoryService.test.mjs — Testes de Integração Hindsight Memory
import test from 'node:test';
import assert from 'node:assert/strict';
import hindsight, { CANONICAL_BANKS } from '../../src/services/hindsightMemoryService.js';
import { routeMessage } from '../../src/router/masterRouter.js';

test('HINDSIGHT-01: Bancos canónicos particionados inicializados com sucesso', () => {
  const banks = hindsight.listBanks();
  assert.ok(banks.length >= 4, 'Deve conter pelo menos os 4 bancos canónicos');
  const ids = banks.map((b) => b.id);
  assert.ok(ids.includes(CANONICAL_BANKS.PESSOAL), 'Deve conter pessoal_andre');
  assert.ok(ids.includes(CANONICAL_BANKS.FAMILIA), 'Deve conter familia');
  assert.ok(ids.includes(CANONICAL_BANKS.DEV), 'Deve conter dev_cloud');
  assert.ok(ids.includes(CANONICAL_BANKS.FROTA), 'Deve conter frota_municipal');
});

test('HINDSIGHT-02: Operações Retain e Recall armazenam e recuperam factos com pontuação', () => {
  const retained = hindsight.retain({
    bankId: 'pessoal_andre',
    content: 'Gosta de treinar musculação 4 vezes por semana',
    category: 'desporto',
    confidence: 0.95
  });

  assert.ok(retained.id.startsWith('mem_'), 'Deve gerar ID único para memória');
  assert.equal(retained.bankId, 'pessoal_andre');
  assert.equal(retained.confidence, 0.95);

  const recalled = hindsight.recall({ bankId: 'pessoal_andre', query: 'musculação' });
  assert.ok(recalled.length >= 1, 'Deve evocar pelo menos uma memória correspondente');
  assert.ok(recalled.some((m) => m.content.includes('musculação')));
});

test('HINDSIGHT-03: Operação Reflect sintetiza memórias de forma estruturada', async () => {
  const res = await hindsight.reflect({ bankId: 'pessoal_andre', query: 'treinar' });
  assert.ok(res.memoriesCount >= 1, 'Deve analisar as memórias evocadas');
  assert.ok(res.reflection.length > 20, 'Deve gerar reflexão estruturada');
});

test('HINDSIGHT-04: Roteamento MasterRouter despacha comandos /hindsight para WorkerDev', async () => {
  const mockCtx = { from: { id: 950415577, first_name: 'Andre' }, chat: { id: 950415577 } };

  const menu = await routeMessage('/hindsight', mockCtx);
  assert.ok(menu.includes('Memória Biomimética'), 'Deve exibir cabeçalho Hindsight');
  assert.ok(menu.includes('pessoal_andre'), 'Deve listar banco pessoal');

  const retainResp = await routeMessage('/hindsight retain familia | Aniversário da Carolina em setembro', mockCtx);
  assert.ok(retainResp.includes('Memória Retida com Sucesso'), 'Deve confirmar retain');

  const recallResp = await routeMessage('/hindsight recall familia | Carolina', mockCtx);
  assert.ok(recallResp.includes('Memórias Evocadas'), 'Deve evocar memórias');
});
