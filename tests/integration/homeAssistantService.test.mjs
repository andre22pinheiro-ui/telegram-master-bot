// tests/integration/homeAssistantService.test.mjs — Testes Unitários e de Integração da Domótica Home Assistant
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveLightEntityId,
  controlLight,
  controlClimate,
  triggerScene,
  getBabyRoomComfortReport,
  formatHomeOverviewMarkdown,
  formatBabyComfortMarkdown,
  formatHassMenuMarkdown
} from '../../src/services/homeAssistantService.js';
import { sqliteMasterDb } from '../../src/shared/sqliteMasterDb.js';

test('HASS-01. resolveLightEntityId normaliza aliases residenciais', () => {
  assert.equal(resolveLightEntityId('sala'), 'light.sala');
  assert.equal(resolveLightEntityId('cozinha'), 'light.cozinha');
  assert.equal(resolveLightEntityId('carolina'), 'light.quarto_carolina');
  assert.equal(resolveLightEntityId('bebe'), 'light.quarto_carolina');
  assert.equal(resolveLightEntityId('presenca'), 'light.presenca_bebe');
  assert.equal(resolveLightEntityId('light.quarto_casal'), 'light.quarto_casal');
});

test('HASS-02. controlLight liga, desliga e controla grupo "tudo" com persistência SQLite', async () => {
  // 1. Ligar luz da sala
  const onRes = await controlLight('sala', 'on', { brightness: 255 });
  assert.equal(onRes.success, true);
  assert.equal(onRes.state, 'on');

  const salaDb = sqliteMasterDb.getHomeEntity('light.sala');
  assert.equal(salaDb.state, 'on');

  // 2. Desligar luz da sala
  const offRes = await controlLight('sala', 'off');
  assert.equal(offRes.success, true);
  assert.equal(offRes.state, 'off');

  // 3. Desligar todas as luzes
  const allRes = await controlLight('tudo', 'off');
  assert.equal(allRes.success, true);
  assert.equal(allRes.all, true);
  assert.equal(allRes.state, 'off');

  const lightsAfter = sqliteMasterDb.listHomeEntities('light');
  assert.ok(lightsAfter.every((l) => l.state === 'off'), 'Todas as luzes devem estar desligadas');
});

test('HASS-03. controlClimate ajusta temperatura de conforto e modo', async () => {
  const res = await controlClimate('bebe', { targetTemperature: 21.0, hvacMode: 'heat' });
  assert.equal(res.success, true);
  assert.equal(res.targetTemperature, 21.0);
  assert.equal(res.hvacMode, 'heat');

  const climateDb = sqliteMasterDb.getHomeEntity('climate.quarto_carolina');
  assert.equal(climateDb.state, 'heat');
  assert.equal(climateDb.attributes.target_temperature, 21.0);
});

test('HASS-04. triggerScene executa cenário "noite" e "bom_dia"', async () => {
  // Ativar modo noite
  const noiteRes = await triggerScene('noite');
  assert.equal(noiteRes.success, true);
  assert.ok(noiteRes.actionsCount >= 5);

  const sala = sqliteMasterDb.getHomeEntity('light.sala');
  const presenca = sqliteMasterDb.getHomeEntity('light.presenca_bebe');
  assert.equal(sala.state, 'off');
  assert.equal(presenca.state, 'on');

  // Ativar modo bom dia
  const diaRes = await triggerScene('bom_dia');
  assert.equal(diaRes.success, true);
  const cozinha = sqliteMasterDb.getHomeEntity('light.cozinha');
  const presencaDia = sqliteMasterDb.getHomeEntity('light.presenca_bebe');
  assert.equal(cozinha.state, 'on');
  assert.equal(presencaDia.state, 'off');
});

test('HASS-05. getBabyRoomComfortReport e formatadores Markdown', () => {
  const report = getBabyRoomComfortReport();
  assert.ok(report.temperature > 0);
  assert.ok(report.humidity > 0);
  assert.ok(report.airQuality);

  const overview = formatHomeOverviewMarkdown();
  assert.ok(overview.includes('PAINEL RESIDENCIAL & DOMÓTICA'));
  assert.ok(overview.includes('Quarto da Carolina'));
  assert.ok(overview.includes('/cenario noite'));

  const babyMd = formatBabyComfortMarkdown();
  assert.ok(babyMd.includes('MONITOR DE CONFORTO: QUARTO DA CAROLINA'));
  assert.ok(babyMd.includes('Temperatura Atual'));

  const menu = formatHassMenuMarkdown();
  assert.ok(menu.includes('/casa'));
  assert.ok(menu.includes('/luz'));
  assert.ok(menu.includes('/clima'));
});
