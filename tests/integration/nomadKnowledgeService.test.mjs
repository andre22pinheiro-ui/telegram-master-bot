// tests/integration/nomadKnowledgeService.test.mjs — Testes de Integração Projeto NOMAD
import test from 'node:test';
import assert from 'node:assert/strict';
import nomad, { EMERGENCY_CONTACTS, FIRST_AID_PROCEDURES, KIT_72H } from '../../src/services/nomadKnowledgeService.js';
import { routeMessage } from '../../src/router/masterRouter.js';

test('NOMAD-01: Contactos de emergência contêm números nacionais e municipais de Amarante', () => {
  assert.ok(EMERGENCY_CONTACTS.length >= 5, 'Deve conter pelo menos 5 contactos críticos');
  const numbers = EMERGENCY_CONTACTS.map((c) => c.number);
  assert.ok(numbers.includes('112'), 'Deve conter o 112');
  assert.ok(numbers.includes('808 24 24 24'), 'Deve conter o SNS 24');
  assert.ok(numbers.includes('255 422 122'), 'Deve conter os Bombeiros de Amarante');
});

test('NOMAD-02: Procedimentos de primeiros socorros incluem SBV e desobstrução de bebés', () => {
  assert.ok(FIRST_AID_PROCEDURES.sbv, 'Deve incluir SBV adulto');
  assert.ok(FIRST_AID_PROCEDURES.sbv.steps.some((s) => s.includes('30 compressões')), 'Deve citar rácio 30:2');
  assert.ok(FIRST_AID_PROCEDURES.bebe_engasgamento, 'Deve incluir manobras pediátricas');
});

test('NOMAD-03: Kit de emergência 72h cobre necessidades básicas de sobrevivência', () => {
  assert.ok(KIT_72H.length >= 6, 'Deve listar pelo menos 6 categorias do kit');
  const items = KIT_72H.map((k) => k.item);
  assert.ok(items.includes('Água Potável'));
  assert.ok(items.includes('Alimentos Não Perecíveis'));
  assert.ok(items.includes('Estojo de Primeiros Socorros'));
});

test('NOMAD-04: CyberChef tools executam criptografia e conversões de dados', () => {
  const hash = nomad.CYBERCHEF_TOOLS.hashSha256('teste');
  assert.equal(hash, '46070d4bf934fb0d4b06d9e2c46e346944e322444900a435d7d9a95e6d7435f5');

  const b64 = nomad.CYBERCHEF_TOOLS.encodeBase64('Nomad');
  assert.equal(b64, 'Tm9tYWQ=');
  assert.equal(nomad.CYBERCHEF_TOOLS.decodeBase64('Tm9tYWQ='), 'Nomad');
});

test('NOMAD-05: Roteamento MasterRouter despacha /nomad e atalhos de socorro', async () => {
  const mockCtx = { from: { id: 950415577, first_name: 'Andre' }, chat: { id: 950415577 } };

  const menu = await routeMessage('/nomad', mockCtx);
  assert.ok(menu.includes('Projeto NOMAD'), 'Deve devolver menu do NOMAD');

  const socorro = await routeMessage('/socorro sbv', mockCtx);
  assert.ok(socorro.includes('Suporte Básico de Vida'), 'Deve detalhar SBV');

  const kit = await routeMessage('/kit72h', mockCtx);
  assert.ok(kit.includes('Kit de Emergência 72 Horas'), 'Deve listar kit');
});
