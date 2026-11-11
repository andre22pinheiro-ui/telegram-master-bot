// tests/test_all_bots_maximum_response.mjs — Teste End-to-End ao Vivo (@AndrePinheirobot — Arquitetura Limpa)
import 'dotenv/config';
import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Isolar DB temporária e desativar Drive sync durante o teste live
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tmb-live-'));
process.env.MASTER_DB_PATH = path.join(TMP_DIR, 'live_pessoal_master.db');
process.env.DISABLE_DRIVE_SYNC = 'true';
process.env.NODE_ENV = 'test';

const { sqliteMasterDb } = await import('../src/shared/sqliteMasterDb.js');
const { askAgent } = await import('../src/services/reasoningService.js');
const { routeMessage, FLEET_REDIRECT_MSG } = await import('../src/router/masterRouter.js');
const { getDailyNewsBriefing, getRegionalNews, getGovNews } = await import('../src/services/newsService.js');
const { getEmailStatus } = await import('../src/services/emailService.js');
const workerGeral = await import('../src/workers/worker_geral.js');
const workerNutricao = await import('../src/workers/worker_nutricao.js');
const workerImmo = await import('../src/workers/worker_immo.js');
const workerDev = await import('../src/workers/worker_dev.js');

console.log('================================================================');
console.log('🤖 TESTE END-TO-END AO VIVO — GROK BOT (@AndrePinheirobot)');
console.log('================================================================\n');

async function main() {
  const mockCtx = {
    chat: { id: 950415577 },
    from: { id: 950415577, first_name: 'André' },
    message: { text: '' }
  };

  try {
    // 1. Cascata IA (temp: 0.0) & Separação de Domínios
    console.log('1️⃣  Cascata IA (temperature: 0.0) & Separação Trabalho vs. Pessoal...');
    const aiReply = await askAgent({
      chatId: 'live_test_master',
      workerTag: 'master',
      prompt: 'Responde apenas com uma frase curta em Português de Portugal: qual é a capital de Portugal?'
    });
    console.log('   ↳ askAgent:', aiReply.replace(/\n/g, ' ').slice(0, 140));
    assert(aiReply.toLowerCase().includes('lisboa'), 'Cascata IA deve responder Lisboa factualmente');
    await askAgent({ chatId: 'live_test_master', workerTag: 'master', prompt: '/reset' });

    const redirectOut = await routeMessage('/tacografo 4.5', mockCtx);
    assert(redirectOut === FLEET_REDIRECT_MSG && redirectOut.includes('@zeropaperfrotaBot'), 'Frota/tacógrafo deve redirecionar para @zeropaperfrotaBot');
    console.log('   ↳ Separação frota -> @zeropaperfrotaBot: OK\n');

    // 2. Notícias Certificadas ERC / Fontes Oficiais
    console.log('2️⃣  Notícias Certificadas (Whitelist ERC/Oficial)...');
    const [briefing, regional, gov] = await Promise.all([
      getDailyNewsBriefing(true),
      getRegionalNews(true),
      getGovNews(true)
    ]);
    assert(briefing.includes('BRIEFING OFICIAL CERTIFICADO'), 'Deve gerar cabeçalho oficial');
    assert(regional.includes('AMARANTE') || regional.includes('TÂMEGA'), 'Deve incluir secção regional Amarante');
    assert(gov.includes('portugal.gov.pt') && gov.includes('diariodarepublica.pt'), 'Deve incluir fontes governamentais oficiais');
    console.log('   ↳ Briefing / Regional / Governo OK\n');

    // 3. Nutrição 160g & Motor de Receitas Saudáveis (Ao Vivo)
    console.log('3️⃣  Receita Saudável Ao Vivo (/receita_airfryer & /receita_mcc)...');
    const [recAir, recMcc] = await Promise.all([
      workerNutricao.handle('/receita_airfryer peito de frango', mockCtx),
      workerNutricao.handle('/receita_mcc sopa de legumes proteica', mockCtx)
    ]);
    assert(recAir.includes('160g') && recAir.length > 120, 'Receita Airfryer deve mencionar meta 160g');
    assert(recMcc.includes('160g') && recMcc.length > 120, 'Receita MCC deve mencionar meta 160g');
    console.log('   ↳ Airfryer & MCC OK\n');

    // 4. Radar de Oportunidades em 5 Frentes (Ao Vivo)
    console.log('4️⃣  Radar 5 Frentes Ao Vivo (Casas CMVM, Carros, Tech, Amazon, Apple)...');
    const [rCasas, rAval, rCarros, rTech, rAmazon, rApple] = await Promise.all([
      workerImmo.handle('/casas Amarante', mockCtx),
      workerImmo.handle('/avaliacao 140 Amarante T3 bom 400 B', mockCtx),
      workerImmo.handle('/carros BYD Atto 3', mockCtx),
      workerImmo.handle('/tech RTX 4070', mockCtx),
      workerImmo.handle('/amazon airfryer', mockCtx),
      workerImmo.handle('/apple iPhone 15 128GB', mockCtx)
    ]);
    assert(rCasas.includes('RADAR') || rCasas.includes('MORADIAS'), 'Frente Casas deve responder em formato estruturado');
    assert(rAval.includes('AVALIAÇÃO') || rAval.includes('CMVM'), 'Avaliação CMVM deve responder');
    assert(rCarros.includes('CARROS') || rCarros.includes('Standvirtual'), 'Frente Carros deve incluir resultados ou portais');
    assert(rTech.includes('TECH') || rTech.includes('PCDiga'), 'Frente Tech deve incluir lojas/resultados');
    assert(rAmazon.includes('AMAZON') || rAmazon.includes('Amazon.es'), 'Frente Amazon deve incluir resultados/pesquisa');
    assert(rApple.includes('APPLE') || rApple.includes('Swappie') || rApple.includes('iServices'), 'Frente Apple deve incluir comparação/lojas');
    console.log('   ↳ 5 Frentes OK\n');

    // 5. Serviços Pessoais Gerais (DGEG, Farmácias, Email IMAP, /apps & /status_cloud)
    console.log('5️⃣  Serviços Pessoais Gerais (DGEG, Farmácias, IMAP, /apps, /status_cloud)...');
    const [combResp, farmResp, appsResp, cloudResp, emailStatus] = await Promise.all([
      workerGeral.handle('/combustiveis Amarante', mockCtx),
      workerGeral.handle('/farmacias Amarante', mockCtx),
      workerDev.handle('/apps', mockCtx),
      workerDev.handle('/status_cloud', mockCtx),
      getEmailStatus()
    ]);
    assert(combResp.includes('DGEG') || combResp.includes('POSTOS MAIS ECONÓMICOS'), 'DGEG deve devolver postos ou link oficial');
    assert(farmResp.includes('FARMÁCIAS') || farmResp.includes('farmaciasportuguesas.pt'), 'Farmácias deve devolver dados ou portal oficial');
    assert(appsResp.toLowerCase().includes('pessoal') && appsResp.includes('AppFrota'), 'Catálogo /apps deve separar pessoal vs trabalho');
    assert(cloudResp.includes('STATUS CLOUD-NATIVE') && cloudResp.includes('16 tabelas'), '/status_cloud deve reportar telemetria 100% Cloud-Native com 16 tabelas');
    assert(typeof emailStatus.configured === 'boolean', 'getEmailStatus deve devolver estado booleano');
    console.log(`   ↳ DGEG, Farmácias, /apps, /status_cloud e IMAP (configured=${emailStatus.configured}, online=${Boolean(emailStatus.online)}) OK\n`);

    console.log('================================================================');
    console.log('🎉 TODOS OS TESTES AO VIVO DO @AndrePinheirobot PASSARAM!');
    console.log('================================================================');
  } finally {
    sqliteMasterDb.close();
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Falha nos testes ao vivo:', err);
  process.exit(1);
});
