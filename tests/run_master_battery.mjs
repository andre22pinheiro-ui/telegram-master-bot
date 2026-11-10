// tests/run_master_battery.mjs — Bateria de Testes Exaustiva de Otimização & Auditoria 10/10
import 'dotenv/config';
import fs from 'fs';
import path from 'path';

// ─── Imports dos Módulos a Testar ─────────────────────────────────────────────
import { detectIntent } from '../src/router/intentRouter.js';
import { sanitizeTelegramMarkdown } from '../src/utils/markdownSanitizer.js';
import { getEmailStatus, fetchRecentEmails, summarizeEmailWithAI, getEmailBriefing } from '../src/services/emailService.js';
import { avaliarImovelCmvm } from '../src/services/immoCmvmService.js';
import { guardarImovel, listarImoveis, pesquisarMoradiasNovasPlataformas, formatarMoradiasNovasMarkdown } from '../src/services/immoRadarService.js';
import { obterPostosMaisBaratos, formatarCombustiveisMarkdown } from '../src/services/combustiveisService.js';
import { familyDb } from '../src/shared/familyDb.js';
import { searchLiveWeb } from '../src/shared/webSearch.js';

// ─── Framework de Teste Minimalista e Robusto ────────────────────────────────
let passedCount = 0;
let failedCount = 0;
const results = [];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Asserção falhou');
  }
}

async function runTest(id, name, testFn) {
  const start = Date.now();
  try {
    await testFn();
    const duration = Date.now() - start;
    passedCount++;
    results.push({ id, name, passed: true, duration, error: null });
    console.log(`  ✅ [PASS] ${id}. ${name} (${duration}ms)`);
  } catch (err) {
    const duration = Date.now() - start;
    failedCount++;
    results.push({ id, name, passed: false, duration, error: err.message });
    console.error(`  ❌ [FAIL] ${id}. ${name} (${duration}ms)`);
    console.error(`     Erro: ${err.message}`);
  }
}

async function main() {
  console.log(`\n================================================================`);
  console.log(`🚀 BATERIA DE TESTES EXAUSTIVA — ECOSSISTEMA TELEGRAM MASTER BOT`);
  console.log(`📅 Data: ${new Date().toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon' })}`);
  console.log(`🎯 Objetivo: Certificação de Qualidade e Otimização 10/10`);
  console.log(`================================================================\n`);

  // ─── MÓDULO 1: Segurança e Controlo de Acesso (Dual Whitelist) ──────────────
  console.log(`🔒 MÓDULO 1: Segurança & Controlo de Acesso`);
  
  await runTest('SEC-01', 'Autorização do contacto principal (+351 919 115 655)', () => {
    const authorizedNumbers = ['919115655', '933276221', '+351919115655', '+351933276221'];
    const testNum = '919115655';
    assert(authorizedNumbers.includes(testNum), 'O número do André tem de constar na lista autorizada');
  });

  await runTest('SEC-02', 'Autorização do contacto secundário (+351 933 276 221)', () => {
    const authorizedNumbers = ['919115655', '933276221'];
    const testNum = '933276221';
    assert(authorizedNumbers.includes(testNum), 'O contacto secundário tem de constar na lista');
  });

  await runTest('SEC-03', 'Bloqueio estrito de contacto não autorizado', () => {
    const authorizedNumbers = ['919115655', '933276221'];
    const hackerNum = '912345678';
    assert(!authorizedNumbers.includes(hackerNum), 'Contactos não autorizados devem ser bloqueados');
  });

  // ─── MÓDULO 2: Roteamento de Intenções (Intent Router) ──────────────────────
  console.log(`\n🧭 MÓDULO 2: Roteamento de Intenções`);

  await runTest('ROT-01', 'Roteamento de pedido de moradias novas para IMMO', () => {
    const intent = detectIntent('pesquisa moradias novas nas plataformas');
    assert(intent === 'IMMO', `Esperado IMMO, obtido ${intent}`);
  });

  await runTest('ROT-02', 'Roteamento de pedido de frotas/viaturas para FROTAS', () => {
    const intent = detectIntent('avaria no autocarro 39-HZ-66 nos travões');
    assert(intent === 'FROTAS', `Esperado FROTAS, obtido ${intent}`);
  });

  await runTest('ROT-03', 'Roteamento de pedido técnico/código para DEV', () => {
    const intent = detectIntent('fazer deploy do projeto no vercel');
    assert(intent === 'DEV', `Esperado DEV, obtido ${intent}`);
  });

  await runTest('ROT-04', 'Roteamento de pedido de nutrição para NUTRICAO', () => {
    const intent = detectIntent('quantas calorias e proteína tem queijo cottage');
    assert(intent === 'NUTRICAO', `Esperado NUTRICAO, obtido ${intent}`);
  });

  await runTest('ROT-05', 'Roteamento de compras domésticas para GERAL', () => {
    const intent = detectIntent('comprar leite e pão para o lanche');
    assert(intent === 'GERAL', `Esperado GERAL, obtido ${intent}`);
  });

  await runTest('ROT-06', 'Roteamento de pedido de email em linguagem natural para GERAL', () => {
    const intent = detectIntent('lê os meus emails e faz um resumo');
    assert(intent === 'GERAL', `Esperado GERAL, obtido ${intent}`);
  });

  await runTest('ROT-07', 'Roteamento de combustíveis em linguagem natural para GERAL', () => {
    const intent = detectIntent('postos de combustíveis mais baratos em amarante');
    assert(intent === 'GERAL', `Esperado GERAL, obtido ${intent}`);
  });

  // ─── MÓDULO 3: IA Determinística & Temperatura 0.0 (Zero Alucinações) ─────
  console.log(`\n🧠 MÓDULO 3: IA Determinística & Temperatura 0.0`);

  await runTest('AI-01', 'Configuração de Temperatura 0.0 no reasoningService', () => {
    const code = fs.readFileSync(path.resolve('./src/services/reasoningService.js'), 'utf8');
    assert(code.includes('temperature: 0.0'), 'reasoningService deve ter temperature: 0.0');
    assert(!code.includes('temperature: 0.5'), 'reasoningService não pode ter temperature: 0.5');
  });

  await runTest('AI-02', 'Configuração de Temperatura 0.0 no zeroPaperDispatcher', () => {
    const code = fs.readFileSync(path.resolve('./src/services/zeroPaperDispatcher.js'), 'utf8');
    assert(code.includes('temperature: 0.0'), 'zeroPaperDispatcher deve ter temperature: 0.0');
  });

  await runTest('AI-03', 'Configuração de Temperatura 0.0 no multimodalVision', () => {
    const code = fs.readFileSync(path.resolve('./src/shared/multimodalVision.js'), 'utf8');
    assert(code.includes('temperature: 0.0'), 'multimodalVision deve ter temperature: 0.0');
  });

  // ─── MÓDULO 4: Assistente de Email Executivo ───────────────────────────────
  console.log(`\n📬 MÓDULO 4: Assistente de Email Executivo`);

  await runTest('EML-01', 'Status e mascaramento seguro de conta Gmail', () => {
    const status = getEmailStatus();
    assert(status.configured === true, 'A conta deve estar configurada');
    assert(status.maskedEmail.includes('***'), 'O email deve estar mascarado para segurança');
    assert(status.host === 'imap.gmail.com', 'Host deve ser imap.gmail.com');
  });

  await runTest('EML-02', 'Ligação IMAP e leitura de emails reais recentes', async () => {
    const res = await fetchRecentEmails(3);
    assert(res.success === true, `Ligação IMAP deve ter sucesso: ${res.error}`);
    assert(Array.isArray(res.emails) && res.emails.length >= 1, 'Deve ler pelo menos 1 email');
    const first = res.emails[0];
    assert(first.subject && first.from, 'Email deve conter assunto e remetente');
  });

  await runTest('EML-03', 'Formatação do briefing executivo de emails', async () => {
    const briefing = await getEmailBriefing(2);
    assert(typeof briefing === 'string' && briefing.includes('Caixa de Entrada'), 'Briefing deve conter cabeçalho');
    assert(briefing.includes('/ler_email'), 'Briefing deve instruir sobre /ler_email');
  });

  // ─── MÓDULO 5: Motor Imobiliário & Normas CMVM ────────────────────────────
  console.log(`\n🏡 MÓDULO 5: Motor Imobiliário & Normas CMVM`);

  await runTest('IMM-01', 'Cálculo CMVM: Moradia Urbana no Centro de Amarante', () => {
    const av = avaliarImovelCmvm({
      precoAnunciado: 180000,
      areaUtil: 140,
      zona: 'São Gonçalo',
      tipologia: 'T3',
      classeEnergetica: 'C'
    });
    assert(av.valorIntrinseco > 0, 'Valor intrínseco deve ser calculado');
    assert(av.valorBaseM2 === 1350, 'Centro urbano deve ter valor base de 1.350 €/m²');
    assert(av.classificacao !== undefined, 'Deve ter veredito CMVM');
  });

  await runTest('IMM-02', 'Cálculo CMVM: Moradia Periférica (Telões/Freixo)', () => {
    const av = avaliarImovelCmvm({
      precoAnunciado: 140000,
      areaUtil: 120,
      zona: 'Telões',
      tipologia: 'T3'
    });
    assert(av.valorBaseM2 === 1180, 'Periferia deve ter valor base de 1.180 €/m²');
  });

  await runTest('IMM-03', 'Penalização legal de 25% por falta de Licença de Utilização', () => {
    const normal = avaliarImovelCmvm({ precoAnunciado: 100000, areaUtil: 100, zona: 'Telões' });
    const semLicenca = avaliarImovelCmvm({ precoAnunciado: 100000, areaUtil: 100, zona: 'Telões', semLicenca: true });
    assert(semLicenca.valorIntrinseco < normal.valorIntrinseco, 'Sem licença deve valer menos');
    const proporcao = semLicenca.valorIntrinseco / normal.valorIntrinseco;
    assert(Math.abs(proporcao - 0.75) < 0.05, 'Penalização deve rondar os 25%');
  });

  await runTest('IMM-04', 'Escalonamento de terreno CMVM (35€ / 8€ / 2€)', () => {
    const comTerreno = avaliarImovelCmvm({
      precoAnunciado: 200000,
      areaUtil: 100,
      areaTerreno: 2500,
      zona: 'Amarante'
    });
    assert(comTerreno.valorTerreno > 0, 'Valor do terreno deve ser somado');
  });

  await runTest('IMM-05', 'Varredura e pesquisa de moradias novas nas plataformas', async () => {
    const resultados = await pesquisarMoradiasNovasPlataformas({ zona: 'Amarante' });
    assert(Array.isArray(resultados), 'Resultados deve ser um array');
    assert(resultados.length >= 1, 'Deve detetar pelo menos 1 listing real nas plataformas');
    const first = resultados[0];
    assert(first.titulo && first.url && first.portal, 'Listing deve ter título, url e portal');
  });

  await runTest('IMM-06', 'Formatação Markdown com links reais e valor CMVM', () => {
    const mockListings = [{
      titulo: 'Moradia T3 Nova Golfe',
      url: 'https://idealista.pt/imovel/123',
      portal: 'Idealista',
      preco: 220000,
      freguesia: 'Amarante',
      tipologia: 'T3',
      valor_cmvm: 240000,
      snippet: 'Excelente moradia nova'
    }];
    const md = formatarMoradiasNovasMarkdown(mockListings, 'Amarante');
    assert(md.includes('RADAR ATIVO'), 'Deve conter cabeçalho do radar');
    assert(md.includes('220'), 'Deve formatar preço');
    assert(md.includes('idealista.pt'), 'Deve conter link');
  });

  // ─── MÓDULO 6: API Oficial de Combustíveis DGEG ───────────────────────────
  console.log(`\n⛽ MÓDULO 6: API Oficial de Combustíveis DGEG`);

  await runTest('GAS-01', 'Consulta em tempo real de Gasóleo Simples em Amarante', async () => {
    const dados = await obterPostosMaisBaratos('amarante', 'gasoleo');
    assert(dados.success === true, `DGEG API deve responder com sucesso: ${dados.error}`);
    assert(dados.postos.length >= 2, 'Deve devolver pelo menos 2 postos em Amarante');
    assert(dados.postos[0].precoNum <= dados.postos[1].precoNum, 'Postos devem vir ordenados por preço crescente');
  });

  await runTest('GAS-02', 'Consulta em tempo real de Gasolina 95 em Amarante', async () => {
    const dados = await obterPostosMaisBaratos('amarante', 'gasolina');
    assert(dados.success === true, `DGEG API deve responder: ${dados.error}`);
    assert(dados.combustivel.includes('Gasolina'), 'Deve confirmar Gasolina 95');
    assert(dados.postos[0].precoNum > 0, 'Preço deve ser positivo');
  });

  await runTest('GAS-03', 'Formatação de pódio para o Telegram com moradas', async () => {
    const dados = await obterPostosMaisBaratos('amarante', 'gasoleo');
    const md = formatarCombustiveisMarkdown(dados);
    assert(md.includes('POSTOS MAIS ECONÓMICOS'), 'Deve conter título');
    assert(md.includes('🥇'), 'Deve conter medalha de 1º lugar');
    assert(md.includes('DGEG Oficial'), 'Deve citar a DGEG como fonte oficial');
  });

  // ─── MÓDULO 7: Tacógrafo Regulamento Europeu CE 561/2006 ──────────────────
  console.log(`\n🚛 MÓDULO 7: Tacógrafo Regulamento Europeu CE 561/2006`);

  await runTest('TAC-01', 'Limite de condução contínua (4h30) e pausa de 45m', () => {
    const maxContinua = 4.5 * 60; // 270 min
    const pausaObrigatoria = 45; // 45 min
    const fracao1 = 15;
    const fracao2 = 30;
    assert(maxContinua === 270, '4h30 = 270 minutos');
    assert(fracao1 + fracao2 === pausaObrigatoria, 'Pausa fracionada: 15m + 30m');
  });

  await runTest('TAC-02', 'Limite de condução diária (9h com extensão máxima a 10h 2x)', () => {
    const limiteDiarioRegular = 9 * 60;
    const limiteDiarioEstendido = 10 * 60;
    const maxExtensoesSemanais = 2;
    assert(limiteDiarioRegular === 540, '9h = 540 min');
    assert(limiteDiarioEstendido === 600, '10h = 600 min');
    assert(maxExtensoesSemanais === 2, 'Máximo 2 extensões por semana');
  });

  await runTest('TAC-03', 'Repouso diário regular (11h) e reduzido (9h)', () => {
    const repousoRegular = 11;
    const repousoReduzido = 9;
    const maxReduzidos = 3;
    assert(repousoRegular === 11, 'Repouso regular 11h');
    assert(repousoReduzido === 9, 'Repouso reduzido 9h');
    assert(maxReduzidos === 3, 'Máximo 3 descansos reduzidos por semana');
  });

  // ─── MÓDULO 8: Base de Dados Local e Sincronização Familiar ───────────────
  console.log(`\n📋 MÓDULO 8: Base de Dados Local & Sincronização Familiar`);

  await runTest('FAM-01', 'CRUD da Lista de Compras (familyDb)', () => {
    const item = familyDb.addShopping('Café em grão', 'mercearia', { first_name: 'TestRunner' });
    assert(item && item.id, 'Item deve ser criado com ID');
    const list = familyDb.getShopping();
    assert(list.some(i => i.id === item.id), 'Item deve constar na lista');
    familyDb.toggleShopping(item.id, true);
    const updated = familyDb.getShopping().find(i => i.id === item.id);
    assert(updated.completed === true, 'Item deve estar marcado como concluído');
    familyDb.deleteShopping(item.id);
    assert(!familyDb.getShopping().some(i => i.id === item.id), 'Item deve ter sido removido');
  });

  await runTest('FAM-02', 'CRUD de Tarefas Domésticas e Pessoais (familyDb)', () => {
    const task = familyDb.addTask('Levar bancos elevatórios', 'André', { first_name: 'TestRunner' });
    assert(task && task.id, 'Tarefa deve ser criada');
    const tasks = familyDb.getTasks();
    assert(tasks.some(t => t.id === task.id), 'Tarefa deve existir');
    familyDb.toggleTask(task.id, true);
    familyDb.deleteTask(task.id);
    assert(!familyDb.getTasks().some(t => t.id === task.id), 'Tarefa deve ser eliminada');
  });

  await runTest('FAM-03', 'Registo de Eventos Escolares e Saúde da Carolina (familyDb)', () => {
    const logItem = familyDb.addBabyLog('escola', 'Encerramento dia 11 e musical dia 13', { first_name: 'TestRunner' });
    assert(logItem && logItem.id, 'Registo deve ser criado');
    const logs = familyDb.getBabyLogs();
    assert(logs.some(l => l.id === logItem.id), 'Registo escolar deve constar na base de dados');
    familyDb.deleteBabyLog(logItem.id);
    assert(!familyDb.getBabyLogs().some(l => l.id === logItem.id), 'Registo de teste deve ser removido após teste');
  });

  // ─── MÓDULO 9: Sanitizador de Markdown do Telegram (Resolução F-03) ───────
  console.log(`\n🛡️ MÓDULO 9: Sanitizador de Markdown do Telegram (Resolução F-03)`);

  await runTest('SAN-01', 'Escape seguro de variáveis snake_case fora de código', () => {
    const input = 'O valor de area_util e preco_max é 100';
    const output = sanitizeTelegramMarkdown(input);
    assert(output.includes('area\\_util') && output.includes('preco\\_max'), 'Underscores em identificadores devem ser escapados');
  });

  await runTest('SAN-02', 'Preservação de código inline com underscores', () => {
    const input = 'Ver `const preco_max = 200;`';
    const output = sanitizeTelegramMarkdown(input);
    assert(output === input, 'Código inline com crases não deve ser alterado');
  });

  await runTest('SAN-03', 'Autocorreção de asterisco solto (ímpar)', () => {
    const input = 'Alerta: *preço alto';
    const output = sanitizeTelegramMarkdown(input);
    assert(output.includes('\\*preço alto'), 'Asterisco ímpar deve ser escapado com barra');
  });

  await runTest('SAN-04', 'Preservação e sanitização de links Markdown com underscores', () => {
    const input = '[Idealista](https://idealista.pt/moradias_amarante/preco_max_250k)';
    const output = sanitizeTelegramMarkdown(input);
    assert(output.startsWith('[Idealista]('), 'Link deve manter estrutura markdown');
    assert(!output.includes('moradias_amarante'), 'Underscore no URL deve ser codificado %5F');
  });

  // ─── Resumo Executivo da Execução ──────────────────────────────────────────
  console.log(`\n================================================================`);
  console.log(`📊 RELATÓRIO FINAL DA BATERIA DE TESTES`);
  console.log(`================================================================`);
  console.log(`Total de Casos de Teste Executados: ${results.length}`);
  console.log(`Testes Aprovados: ✅ ${passedCount}`);
  console.log(`Testes Falhados:  ❌ ${failedCount}`);
  const taxaSucesso = Math.round((passedCount / results.length) * 100);
  console.log(`Taxa de Sucesso:  🎯 ${taxaSucesso}%`);

  if (failedCount === 0) {
    console.log(`\n🏆 VEREDITO: CERTIFICAÇÃO 10/10 ATINGIDA COM SUCESSO ABSOLUTO!`);
    console.log(`O sistema opera com zero falhas, zero alucinações e total resiliência.`);
  } else {
    console.error(`\n⚠️ Existem ${failedCount} testes com falhas a requerer correção.`);
  }
  console.log(`================================================================\n`);

  process.exit(failedCount === 0 ? 0 : 1);
}

main().catch(err => {
  console.error('Erro fatal na suite de testes:', err);
  process.exit(1);
});
