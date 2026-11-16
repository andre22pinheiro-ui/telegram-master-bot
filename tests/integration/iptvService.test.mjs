// tests/integration/iptvService.test.mjs — Testes Automatizados de Integração do Free-TV / IPTV
import test from 'node:test';
import assert from 'node:assert/strict';
import iptvService from '../../src/services/iptvService.js';
import { routeMessage } from '../../src/router/masterRouter.js';

test('IPTV-01: Catálogo canónico possui canais nacionais essenciais', () => {
  assert.ok(iptvService.FREE_CHANNELS.length >= 10, 'Deve ter pelo menos 10 canais curados');
  const ids = iptvService.FREE_CHANNELS.map((c) => c.id);
  assert.ok(ids.includes('rtp1'), 'Deve incluir RTP1');
  assert.ok(ids.includes('rtp2'), 'Deve incluir RTP2');
  assert.ok(ids.includes('rtp3'), 'Deve incluir RTP3');
  assert.ok(ids.includes('sic'), 'Deve incluir SIC');
  assert.ok(ids.includes('tvi'), 'Deve incluir TVI');
  assert.ok(ids.includes('porto_canal'), 'Deve incluir Porto Canal');
  assert.ok(ids.includes('canal_parlamento'), 'Deve incluir ARTV / Canal Parlamento');
});

test('IPTV-02: Filtros de canais devolvem resultados corretos', () => {
  const ptList = iptvService.getChannels('pt');
  assert.ok(ptList.length >= 8);
  assert.ok(ptList.every((c) => c.country === 'PT'));

  const newsList = iptvService.getChannels('news');
  assert.ok(newsList.length >= 3);
  assert.ok(newsList.some((c) => c.id === 'rtp3'));
});

test('IPTV-03: Geração de playlist M3U cumpre a especificação padrão', () => {
  const m3u = iptvService.generateM3uContent();
  assert.ok(m3u.startsWith('#EXTM3U'), 'Deve começar com tag #EXTM3U');
  assert.ok(m3u.includes('#EXTINF:-1'), 'Deve conter directivas #EXTINF');
  assert.ok(m3u.includes('https://streaming-live.rtp.pt'), 'Deve conter streams HLS da RTP');
});

test('IPTV-04: Routing no MasterRouter despacha /tv e /iptv para WorkerDev', async () => {
  const mockCtx = { from: { id: 950415577, first_name: 'Andre' }, chat: { id: 950415577 } };
  
  const catalog = await routeMessage('/tv', mockCtx);
  assert.ok(catalog.includes('Free-TV / IPTV'), 'Deve devolver catálogo de TV');
  assert.ok(catalog.includes('RTP 1'), 'Deve listar RTP1');

  const single = await routeMessage('/tv rtp1', mockCtx);
  assert.ok(single.includes('RTP 1'), 'Deve detalhar RTP1');
  assert.ok(single.includes('.m3u8'), 'Deve fornecer o link direto do stream HLS');
});
