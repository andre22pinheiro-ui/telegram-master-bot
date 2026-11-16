// tests/run_master_battery.mjs — Bateria de Testes Determinística (Arquitetura Limpa Pessoal)
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

// ── Isolamento Obrigatório ANTES de carregar módulos SQLite/Drive ────────────
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tmb-battery-'));
const TEST_DB_PATH = path.join(TMP_DIR, 'test_pessoal_master.db');
process.env.MASTER_DB_PATH = TEST_DB_PATH;
process.env.DISABLE_DRIVE_SYNC = 'true';
process.env.NODE_ENV = 'test';
process.env.AUTHORIZED_PHONE_NUMBERS = '351919115655,351933276221,919115655,933276221';
process.env.CHAT_ID_AUTORIZADO = '950415577';

// Imports dinâmicos após configurar MASTER_DB_PATH
const { sqliteMasterDb, triggerCloudSyncDebounced: dbSyncHook } = await import('../src/shared/sqliteMasterDb.js');
const { getDriveSyncStatus, getServiceAccountCredentials, isDriveConfigured, initCloudPersistence, triggerCloudSyncDebounced } = await import('../src/services/googleDriveService.js');
const { conversationMemory } = await import('../src/shared/conversationMemory.js');
const { isAuthorized, authorizeContact, AUTHORIZED_PHONES, maskEmailRgpd, maskPhoneRgpd } = await import('../src/shared/security.js');
const { VERCEL_APPS } = await import('../src/shared/appsCatalog.js');
const { detectIntent, routeMessage, FLEET_REDIRECT_MSG } = await import('../src/router/masterRouter.js');
const {
  LEGACY_WEBHOOK_KEYS,
  LEGACY_FLEET_ACTIONS,
  getLegacyBridgeConfigs,
  registerMasterBackCompatHandlers,
  createLegacyBridgeBots,
  mountBotTransport
} = await import('../src/bot/legacyBridges.js');
const { SYSTEM_PROMPTS, loadAgentsMdDirectives, CONFORMANCE_MATRIX } = await import('../src/services/reasoningService.js');
const { TRUSTED_SOURCES, isTrustedSource, fetchIpmaPortoWeather } = await import('../src/services/newsService.js');
const { avaliarImovelCmvm } = await import('../src/services/immoCmvmService.js');
const { evaluateAppleComparison } = await import('../src/services/appleRadarService.js');
const { validateOmnibus90DayDeal } = await import('../src/services/amazonRadarService.js');
const proactiveEngine = await import('../src/services/proactiveEngine.js');
const cloudDevService = await import('../src/services/cloudDevService.js');
const ideaHarvesterService = await import('../src/services/ideaHarvesterService.js');
const workerNutricao = await import('../src/workers/worker_nutricao.js');
const nutritionCatalogService = await import('../src/services/nutritionCatalogService.js');
const workerImmo = await import('../src/workers/worker_immo.js');
const workerDev = await import('../src/workers/worker_dev.js');
const workerGeral = await import('../src/workers/worker_geral.js');
const { parseReminderInput } = workerGeral;
const selfRefineEngine = await import('../src/shared/selfRefineEngine.js');
const calendarHelperService = await import('../src/services/calendarHelperService.js');
const { safeExecute } = await import('../src/utils/resilience.js');
const { sanitizeTelegramMarkdown } = await import('../src/utils/markdownSanitizer.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

let passedCount = 0;
let failedCount = 0;

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
    console.log(`  ✅ [PASS] ${id}. ${name} (${duration}ms)`);
  } catch (err) {
    const duration = Date.now() - start;
    failedCount++;
    console.error(`  ❌ [FAIL] ${id}. ${name} (${duration}ms)`);
    console.error(`     Erro: ${err.message}`);
  }
}

function collectJsFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectJsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

async function main() {
  console.log('\n================================================================');
  console.log('🚀 BATERIA DE TESTES — TELEGRAM MASTER BOT (@AndrePinheirobot)');
  console.log(`📅 Data (Lisboa): ${new Date().toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon' })}`);
  console.log(`🗄️  DB Teste Isolada: ${TEST_DB_PATH}`);
  console.log('================================================================\n');

  try {
    // ─── MÓDULO 1: Segurança, AGENTS.md & Integridade da Arquitetura Limpa ───
    console.log('🔒 MÓDULO 1: Segurança, AGENTS.md & Integridade do Código');

    await runTest('SEC-01', 'Whitelist pessoal autoriza família e bloqueia desconhecidos', () => {
      assert(AUTHORIZED_PHONES.includes('919115655'), 'Contacto André deve constar em AUTHORIZED_PHONES');
      assert(AUTHORIZED_PHONES.includes('933276221'), 'Contacto secundário deve constar em AUTHORIZED_PHONES');
      assert(isAuthorized(process.env.CHAT_ID_AUTORIZADO || '950415577', '950415577'), 'Chat principal deve ser autorizado');
      assert(!isAuthorized('999000111', '999000111'), 'ID aleatório deve ser bloqueado');
      const rejectRes = authorizeContact('999000111', '999000111', '912345678', 'Intruso');
      assert(rejectRes.success === false, 'Telefone não autorizado deve ser rejeitado');
    });

    await runTest('SEC-02', 'Ficheiros obsoletos de frota/Supabase e pcRemoteBridge permanecem removidos', () => {
      const obsoleteFiles = [
        'src/workers/worker_frotas.js',
        'src/services/appFrotaService.js',
        'src/services/zeroPaperDispatcher.js',
        'src/services/pcRemoteBridge.js',
        'src/router/intentRouter.js',
        'src/shared/familyDb.js',
        'src/shared/sqliteFamilyDb.js',
        'src/shared/centralDb.js',
        'src/shared/cloudSync.js',
        'supabase_schema.sql',
        'RELATORIO_VALENCIAS.md'
      ];
      for (const rel of obsoleteFiles) {
        assert(!fs.existsSync(path.join(ROOT_DIR, rel)), `Ficheiro obsoleto não deve existir: ${rel}`);
      }
      const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf-8'));
      assert(!pkg.dependencies['@supabase/supabase-js'], '@supabase/supabase-js não pode existir no telegram-master-bot');
    });

    await runTest('SEC-03', 'Zero credenciais hardcoded, zero imports partidos e zero pcRemoteBridge', () => {
      const files = [path.join(ROOT_DIR, 'index.js'), ...collectJsFiles(path.join(ROOT_DIR, 'src'))];
      const secretPatterns = [
        /AIzaSy[0-9A-Za-z_-]{20,}/,
        /gsk_[0-9A-Za-z]{20,}/,
        /sk-or-v1-[0-9a-zA-Z]{20,}/,
        /rfin\s*xflr\s*wsgp\s*emqh/i
      ];
      for (const f of files) {
        const content = fs.readFileSync(f, 'utf-8');
        for (const re of secretPatterns) {
          assert(!re.test(content), `Possível segredo hardcoded em ${path.relative(ROOT_DIR, f)}`);
        }
        assert(
          !/worker_frotas|appFrotaService|zeroPaperDispatcher|sqliteFamilyDb|familyDb\.js|pcRemoteBridge|\/api\/sync\//.test(content),
          `Referência obsoleta encontrada em ${path.relative(ROOT_DIR, f)}`
        );
      }
    });

    await runTest('SEC-04', 'AGENTS.md e reasoningService.js aplicam temperature: 0.0 e isolamento', () => {
      const agentsMd = fs.readFileSync(path.join(ROOT_DIR, 'AGENTS.md'), 'utf-8');
      assert(agentsMd.includes('temperature: 0.0'), 'AGENTS.md deve exigir temperature: 0.0');
      assert(agentsMd.includes('@zeropaperfrotaBot'), 'AGENTS.md deve referir redirecionamento para @zeropaperfrotaBot');
      assert(agentsMd.includes('pessoal_master.db'), 'AGENTS.md deve documentar pessoal_master.db');
      assert(!SYSTEM_PROMPTS.frotas, 'SYSTEM_PROMPTS não deve ter persona frotas');

      const reasoningSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/services/reasoningService.js'), 'utf-8');
      assert(reasoningSrc.includes('temperature: 0.0'), 'reasoningService.js deve usar temperature: 0.0');
      assert(!reasoningSrc.includes('temperature: 0.7'), 'reasoningService.js não pode usar temperature elevada');
    });

    await runTest('SEC-05', 'Render Blueprint e index.js implementam Cloud-Native sem PC local e isolamento Dual-Bot', () => {
      const renderYaml = fs.readFileSync(path.join(ROOT_DIR, 'render.yaml'), 'utf-8');
      assert(renderYaml.includes('name: telegram-master-bot'), 'render.yaml deve declarar serviço telegram-master-bot');
      assert(!renderYaml.includes('name: zeropaper-frota-bot'), 'render.yaml do Master não deve duplicar o serviço zeropaper-frota-bot');
      assert(!renderYaml.includes('SYNC_SECRET_TOKEN'), 'render.yaml não deve conter SYNC_SECRET_TOKEN obsoleto');
      assert(!renderYaml.includes('SUPABASE_'), 'Serviço pessoal telegram-master-bot não pode ter variáveis SUPABASE_');

      const indexSrc = fs.readFileSync(path.join(ROOT_DIR, 'index.js'), 'utf-8');
      assert(indexSrc.includes('/webhook/master'), 'index.js deve servir webhook /webhook/master');
      assert(indexSrc.includes('initCloudPersistence'), 'index.js deve executar Boot Restore antes de servir');
      assert(indexSrc.includes('SIGTERM') && indexSrc.includes('SIGINT'), 'index.js deve suportar shutdown gracioso SIGTERM/SIGINT');
      assert(indexSrc.includes('backupDatabaseToDrive'), 'index.js deve forçar backup Drive no shutdown');
    });

    // ─── MÓDULO 2: SQLite WAL Único (16 Tabelas, Cloud Write-Through & Radar 5 Frentes) ────
    console.log('\n🗄️  MÓDULO 2: SQLite WAL Único (16 Tabelas + Cloud Drive)');

    await runTest('DB-01', 'SQLite WAL inicializado com todas as 16 tabelas oficiais', () => {
      const stats = sqliteMasterDb.getStats();
      const expectedTables = [
        'shopping', 'tasks', 'baby_logs', 'notes', 'reminders', 'nutrition_logs',
        'saved_recipes', 'radar_casas', 'radar_carros', 'radar_tech', 'radar_amazon',
        'radar_apple', 'radar_filtros', 'radar_execucoes', 'error_reports', 'conversation_history'
      ];
      for (const tbl of expectedTables) {
        assert(Object.prototype.hasOwnProperty.call(stats.tables, tbl), `Tabela em falta: ${tbl}`);
      }
      assert(Object.keys(stats.tables).length === 16, `Esperadas 16 tabelas oficiais, obtidas ${Object.keys(stats.tables).length}`);
      const mode = sqliteMasterDb.getDb().pragma('journal_mode', { simple: true });
      assert(String(mode).toLowerCase() === 'wal', `Esperado journal_mode=wal, obtido ${mode}`);
    });

    await runTest('DB-02', 'CRUD familiar, lembretes e memória conversacional persistem em SQLite', () => {
      const item = sqliteMasterDb.addShopping('Queijo Cottage', 'laticínios', { first_name: 'André' });
      assert(sqliteMasterDb.getShopping().some((s) => s.id === item.id), 'Compra deve persistir');
      const task = sqliteMasterDb.addTask('Confirmar consulta', 'André');
      assert(sqliteMasterDb.getTasks().some((t) => t.id === task.id), 'Tarefa deve persistir');
      const baby = sqliteMasterDb.addBabyLog('saude', 'Pediatra OK');
      assert(sqliteMasterDb.getBabyLogs().some((b) => b.id === baby.id), 'Registo Carolina deve persistir');
      const note = sqliteMasterDb.addNote('Código Portão', '1234');
      assert(sqliteMasterDb.getNotes().some((n) => n.id === note.id), 'Nota deve persistir');

      const pastRem = sqliteMasterDb.addReminder({ text: 'Toma vitamina', triggerAt: new Date(Date.now() - 5000), chatId: '950415577' });
      const due = sqliteMasterDb.getPendingDueReminders();
      assert(due.some((r) => r.id === pastRem.id), 'Lembrete vencido deve aparecer em getPendingDueReminders');
      sqliteMasterDb.markReminderSent(pastRem.id);
      assert(!sqliteMasterDb.getPendingDueReminders().some((r) => r.id === pastRem.id), 'Lembrete enviado não pode reaparecer');

      conversationMemory.addTurn('test_chat', 'master', 'user', 'Olá Grok');
      conversationMemory.addTurn('test_chat', 'master', 'model', 'Olá André');
      assert(conversationMemory.getOpenAiHistory('test_chat', 'master').length === 2, 'Histórico deve guardar 2 turnos');
      conversationMemory.clear('test_chat', 'master');
      assert(conversationMemory.getOpenAiHistory('test_chat', 'master').length === 0, 'Reset deve limpar sessão');
    });

    await runTest('DB-03', 'Deteção de novidades e baixas de preço nas 5 frentes do Radar', () => {
      const c1 = sqliteMasterDb.upsertRadarCasa({ titulo: 'Moradia Teste', url: 'https://example.com/casa1', preco: 250000 });
      const c2 = sqliteMasterDb.upsertRadarCasa({ titulo: 'Moradia Teste', url: 'https://example.com/casa1', preco: 250000 });
      const c3 = sqliteMasterDb.upsertRadarCasa({ titulo: 'Moradia Teste', url: 'https://example.com/casa1', preco: 230000 });
      assert(c1.isNew && !c2.isNew && !c2.priceDropped && c3.priceDropped && c3.previousPrice === 250000, 'radar_casas deve detetar baixa de preço');

      const car1 = sqliteMasterDb.upsertRadarCarro({ marca_modelo: 'BYD Atto 3', url: 'https://example.com/car1', preco: 28000 });
      const car2 = sqliteMasterDb.upsertRadarCarro({ marca_modelo: 'BYD Atto 3', url: 'https://example.com/car1', preco: 26500 });
      assert(car1.isNew && car2.priceDropped && car2.previousPrice === 28000, 'radar_carros deve detetar baixa de preço');

      const t1 = sqliteMasterDb.upsertRadarTech({ produto: 'RTX 4070', url: 'https://example.com/tech1', preco: 599 });
      const t2 = sqliteMasterDb.upsertRadarTech({ produto: 'RTX 4070', url: 'https://example.com/tech1', preco: 529 });
      assert(t1.isNew && t2.priceDropped, 'radar_tech deve detetar baixa de preço');

      const am1 = sqliteMasterDb.upsertRadarAmazon({ titulo: 'Airfryer XL', url: 'https://amazon.es/dp/B0TEST', preco: 120 });
      const am2 = sqliteMasterDb.upsertRadarAmazon({ titulo: 'Airfryer XL', url: 'https://amazon.es/dp/B0TEST', preco: 89 });
      assert(am1.isNew && am2.priceDropped, 'radar_amazon deve detetar baixa de preço');

      const ap1 = sqliteMasterDb.upsertRadarApple({ modelo: 'iPhone 15 Pro', url: 'https://example.com/iphone15pro', preco: 950 });
      const ap2 = sqliteMasterDb.upsertRadarApple({ modelo: 'iPhone 15 Pro', url: 'https://example.com/iphone15pro', preco: 840 });
      assert(ap1.isNew && ap2.priceDropped, 'radar_apple deve detetar baixa de preço');
    });

    await runTest('DB-04', 'Tabelas Cloud (saved_recipes, radar_execucoes, error_reports) e hooks Write-Through Drive', async () => {
      const recipeRow = sqliteMasterDb.saveRecipe({
        title: 'Frango com brócolos',
        query: 'Frango com brócolos',
        mode: 'airfryer',
        content: 'Receita teste 4 blocos',
        protein_g: 45
      });
      assert(recipeRow.id && sqliteMasterDb.getSavedRecipes().some((r) => r.id === recipeRow.id), 'saved_recipes deve persistir');

      const execRow = sqliteMasterDb.recordRadarExecution({ frente: '5-frentes', totalScanned: 12, newAlerts: 2, status: 'ok' });
      assert(
        sqliteMasterDb.getRadarExecutions().some((e) => e.executed_at === execRow.executed_at && e.frente === '5-frentes' && e.total_scanned === 12),
        'radar_execucoes deve persistir'
      );

      const errRow = sqliteMasterDb.addErrorReport({ service: 'worker_dev', message: 'Erro simulado teste' });
      assert(errRow.id && sqliteMasterDb.getErrorReports().some((e) => e.id === errRow.id), 'error_reports deve persistir');
      sqliteMasterDb.markErrorReportResolved(errRow.id);
      assert(sqliteMasterDb.getErrorReports().find((e) => e.id === errRow.id).resolved === true, 'error_reports deve marcar resolvido');

      assert(typeof triggerCloudSyncDebounced === 'function' && typeof dbSyncHook === 'function', 'Hooks triggerCloudSyncDebounced devem existir');
      const bootRes = await initCloudPersistence();
      assert(bootRes === false, 'initCloudPersistence deve devolver false com DISABLE_DRIVE_SYNC=true');
      const driveStatus = getDriveSyncStatus();
      assert(typeof driveStatus.configured === 'boolean', 'getDriveSyncStatus deve devolver estado válido');
    });

    // ─── MÓDULO 3: Separação Pessoal vs. Trabalho (masterRouter) ─────────────
    console.log('\n🧭 MÓDULO 3: Roteamento & Separação Trabalho vs. Pessoal');

    await runTest('ROT-01', 'Pedidos de frota/rota/tacógrafo redirecionam para @zeropaperfrotaBot', async () => {
      const fleetCmds = ['/frota', '/frotas', '/rota Amarante para Porto', '/tacografo 4.5', 'avaria no autocarro 39-HZ-66'];
      for (const cmd of fleetCmds) {
        assert(detectIntent(cmd) === 'FROTA_REDIRECT', `Esperado FROTA_REDIRECT para "${cmd}", obtido ${detectIntent(cmd)}`);
        const out = await routeMessage(cmd, { chat: { id: 950415577 }, from: { first_name: 'André' } });
        assert(out === FLEET_REDIRECT_MSG && out.includes('@zeropaperfrotaBot'), `Resposta deve encaminhar "${cmd}" para @zeropaperfrotaBot`);
      }
    });

    await runTest('ROT-02', 'Intenções pessoais encaminham corretamente por domínio', () => {
      assert(detectIntent('/receita_airfryer salmão') === 'NUTRICAO');
      assert(detectIntent('/casas Amarante') === 'IMMO');
      assert(detectIntent('/carros BYD') === 'IMMO');
      assert(detectIntent('/tech SSD 2TB') === 'IMMO');
      assert(detectIntent('/amazon ofertas') === 'IMMO');
      assert(detectIntent('/apple iPhone 15') === 'IMMO');
      assert(detectIntent('/vigiar apple MacBook 900') === 'IMMO');
      assert(detectIntent('/vigiar_amazon smartwatch 150') === 'IMMO');
      assert(detectIntent('/vigiar_apple MacBook 900') === 'IMMO');
      assert(detectIntent('/apps') === 'DEV');
      assert(detectIntent('/status_cloud') === 'DEV');
      assert(detectIntent('/compilar smooth-bus-routes') === 'DEV');
      assert(detectIntent('/noticias') === 'GERAL');
      assert(detectIntent('/farmacias Amarante') === 'GERAL');
      assert(detectIntent('/governo') === 'GERAL');
      assert(detectIntent('/emails') === 'GERAL');
      assert(detectIntent('olá, como está o tempo hoje em termos gerais?') === 'MASTER');
    });

    await runTest('ROT-03', 'Catálogo Mini Apps mantém segregação explícita de 7 pessoal + 2 trabalho', () => {
      const apps = Object.values(VERCEL_APPS);
      assert(apps.length === 9, `Esperadas 9 apps no catálogo, encontradas ${apps.length}`);
      const pessoal = apps.filter((a) => a.domain === 'pessoal');
      const trabalho = apps.filter((a) => a.domain === 'trabalho');
      assert(pessoal.length === 7, `Esperadas 7 apps pessoais, obtidas ${pessoal.length}`);
      assert(trabalho.length === 2, `Esperadas 2 apps de trabalho, obtidas ${trabalho.length}`);
    });

    // ─── MÓDULO 4: Notícias Certificadas ERC, Lembretes Lisboa & Markdown ────
    console.log('\n📰 MÓDULO 4: Notícias Certificadas, Lembretes DST & Markdown');

    await runTest('NEWS-01', 'Whitelist ERC/Oficial valida fontes oficiais e rejeita fontes não certificadas', () => {
      assert(TRUSTED_SOURCES.length >= 14, 'Whitelist deve conter fontes oficiais PT/UE e regionais Amarante');
      const validUrls = [
        'https://www.portugal.gov.pt/pt/gc24/comunicacao',
        'https://diariodarepublica.pt/dr/detalhe/decreto-lei/1',
        'https://www.ipma.pt/pt/otempo/prev.localidade.hora/',
        'https://www.rtp.pt/noticias/pais/exemplo',
        'https://www.cm-amarante.pt/noticias',
        'https://www.averdade.com/amarante/noticia'
      ];
      for (const u of validUrls) {
        assert(isTrustedSource(u) !== null, `Fonte oficial devia ser aceite: ${u}`);
      }
      const blockedUrls = [
        'https://blog-aleatorio-fakenews.example.com/artigo',
        'https://noticias-virais.ru/post',
        'texto-sem-url'
      ];
      for (const u of blockedUrls) {
        assert(isTrustedSource(u) === null, `Fonte não certificada devia ser rejeitada: ${u}`);
      }
    });

    await runTest('REM-01', 'parseReminderInput interpreta horários relativos e fixos no fuso Europe/Lisbon', () => {
      const now = Date.now();
      const rel = parseReminderInput('daqui a 20 min Desligar forno');
      const diffMin = Math.round((rel.triggerAt.getTime() - now) / 60000);
      assert(diffMin >= 19 && diffMin <= 21, `Esperado ~20 min, obtido ${diffMin}`);
      assert(rel.text.includes('Desligar forno'), 'Texto do lembrete relativo incorreto');

      const tomorrow = parseReminderInput('amanhã às 08:30 Ginásio');
      const lisbonHour = new Intl.DateTimeFormat('pt-PT', {
        timeZone: 'Europe/Lisbon',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }).format(tomorrow.triggerAt);
      assert(lisbonHour === '08:30', `Esperada hora local 08:30 em Lisboa, obtido ${lisbonHour}`);
      assert(tomorrow.triggerAt.getTime() > now, 'Lembrete de amanhã tem de ficar no futuro');
    });

    await runTest('FMT-01', 'Sanitizador Markdown protege links, snake_case e balanceia delimitadores', () => {
      const input = 'Texto com snake_case e *negrito partido e [Link](https://example.com/a_b) e `code_var`';
      const clean = sanitizeTelegramMarkdown(input);
      assert(clean.includes('snake\\_case'), 'Underscore isolado em snake_case deve ser escapado');
      assert(clean.includes('`code_var`'), 'Código inline deve manter underscore literal');
      assert(clean.includes('[Link](https://example.com/a%5Fb)'), 'Link deve codificar underscore no URL');
      assert((clean.match(/(?<!\\)\*/g) || []).length % 2 === 0, 'Asteriscos não escapados devem ficar pares');
    });

    // ─── MÓDULO 5: Nutrição 160g & Motor de Receitas (4 Blocos) ───────────────
    console.log('\n🥗 MÓDULO 5: Nutrição Alta Proteína (160g) & Receitas Saudáveis');

    await runTest('NUT-01', 'Registos diários de proteína, água e creatina atualizam resumo e metas', () => {
      const pMsg = workerNutricao.handleProteinaInput('48 : Bife de peru grelhado');
      assert(pMsg.includes('48g') && pMsg.includes('160g'), 'Registo proteico deve mostrar progresso face a 160g');
      const aMsg = workerNutricao.handleAguaInput('750');
      assert(aMsg.includes('750ml') && aMsg.includes('2500ml'), 'Registo de água deve mostrar 2500ml meta');
      const cMsg = workerNutricao.handleCreatina();
      assert(cMsg.includes('Creatina'), 'Creatina deve confirmar registo');
      const resumo = workerNutricao.getResumoHoje();
      assert(resumo.includes('48g / 160g') && resumo.includes('750ml / 2500ml') && resumo.includes('Tomada (5g)'), 'Resumo diário inconsistente');
    });

    await runTest('NUT-02', 'Motor de receitas devolve 4 blocos obrigatórios (% da meta de 160g) nos 3 modos', async () => {
      const savedEnv = {
        GEMINI_API_KEY: process.env.GEMINI_API_KEY,
        GROQ_API_KEY: process.env.GROQ_API_KEY,
        OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY
      };
      const origFetch = globalThis.fetch;
      delete process.env.GEMINI_API_KEY;
      delete process.env.GROQ_API_KEY;
      delete process.env.OPENROUTER_API_KEY;
      globalThis.fetch = async () => ({ ok: false, status: 503, text: async () => '' });

      try {
        for (const mode of ['geral', 'airfryer', 'mcc']) {
          const rec = await workerNutricao.generateHealthyRecipe({ query: 'Frango com legumes', mode });
          assert(rec.includes('1. Tempo & Doses'), `Modo ${mode}: falta bloco 1 (Tempo & Doses)`);
          assert(rec.includes('2. Ingredientes'), `Modo ${mode}: falta bloco 2 (Ingredientes)`);
          assert(rec.includes('3. Preparação'), `Modo ${mode}: falta bloco 3 (Preparação)`);
          assert(rec.includes('4. Informação Nutricional'), `Modo ${mode}: falta bloco 4 (Informação Nutricional)`);
          assert(/\d+%\s+da\s+meta\s+di[aá]ria\s+de\s+160g/i.test(rec), `Modo ${mode}: falta % da meta diária de 160g`);
          assert(rec.includes('/proteina'), `Modo ${mode}: falta atalho /proteina`);
        }
      } finally {
        globalThis.fetch = origFetch;
        if (savedEnv.GEMINI_API_KEY !== undefined) process.env.GEMINI_API_KEY = savedEnv.GEMINI_API_KEY;
        if (savedEnv.GROQ_API_KEY !== undefined) process.env.GROQ_API_KEY = savedEnv.GROQ_API_KEY;
        if (savedEnv.OPENROUTER_API_KEY !== undefined) process.env.OPENROUTER_API_KEY = savedEnv.OPENROUTER_API_KEY;
      }
    });

    await runTest('NUT-03', 'Separação estrita Produto/Rótulo vs Compra vs Consumo Diário e fatores Atwater', () => {
      // 1. Validar fatores de Atwater exatos (Proteína=4, HC=4, Gordura=9, Fibra=2)
      const atw = nutritionCatalogService.calculateAtwaterEnergy({ protein: 20, carbs: 10, fat: 5, fibre: 2 });
      assert(atw.energyKcal === 169, `Atwater deve calcular 169 kcal (obtido ${atw.energyKcal})`);

      // 2. Registar rótulo no catálogo
      const testUserId = `user_battery_${Date.now()}`;
      const prodRes = nutritionCatalogService.registerProductWithFacts({
        name: 'Queijo Quark Milbona Test',
        barcode: `TEST_BC_${Date.now()}`,
        protein: 12,
        carbohydrates: 3.5,
        fat: 0.2,
        fibre: 0,
        salt: 0.1
      });
      assert(prodRes.productId, 'Produto de teste deve ser criado com ID');

      // 3. Registar compra de 4 unidades
      nutritionCatalogService.recordPurchase({
        userId: testUserId,
        productId: prodRes.productId,
        quantity: 4,
        unit: 'un',
        unitPrice: 1.19
      });

      // 4. Validar que o consumo diário PERMANECE RIGOROSAMENTE ZERO
      const summaryInitial = nutritionCatalogService.getDailyNutritionSummary(testUserId);
      assert(summaryInitial.totals.calories === 0, 'Registar rótulo e compra NÃO pode alterar calorias consumidas!');
      assert(summaryInitial.totals.protein === 0, 'Registar rótulo e compra NÃO pode alterar proteína consumida!');
      assert(summaryInitial.entriesCount === 0, 'entriesCount deve ser 0 antes de haver consumo!');

      // 5. Registar consumo de 250g do produto
      nutritionCatalogService.recordFoodConsumption({
        userId: testUserId,
        productId: prodRes.productId,
        description: 'Queijo Quark Milbona Test (250g)',
        quantity: 250,
        unit: 'g'
      });

      // 6. Validar que agora o consumo aumentou proporcionalmente (12g * 2.5 = 30g proteína)
      const summaryAfter = nutritionCatalogService.getDailyNutritionSummary(testUserId);
      assert(summaryAfter.totals.protein === 30, `Esperado 30g de proteína consumida, obtido ${summaryAfter.totals.protein}`);
      assert(summaryAfter.totals.calories > 0, 'Calorias devem ser superiores a zero após consumo');
      assert(summaryAfter.entriesCount === 1, 'entriesCount deve ser 1 após consumo');

      // 7. Validar handlers dos novos comandos no workerNutricao
      const msgRotulo = workerNutricao.handleFotoRotulo();
      assert(/NÃO.*conta como consumo/i.test(msgRotulo), 'handleFotoRotulo deve alertar para regra de isolamento');

      const msgCompra = workerNutricao.handleAdicionarCompra('Aveia Integral 1 pacote', testUserId);
      assert(/NÃO.*afeta.*diário calórico/i.test(msgCompra), 'handleAdicionarCompra deve garantir impacto zero');

      const msgComer = workerNutricao.handleComer('150g Peito de frango', testUserId);
      assert(msgComer.includes('Consumo Registado'), 'handleComer deve registar consumo com sucesso');
    });

    await runTest('NUT-04', 'IA-Nutricionista (Asimov Academy): Análise de Prato, Macros, Dicas e Confirmação de Diário', async () => {
      const { default: iaNutri } = await import('../src/services/iaNutricionistaService.js');
      const testUserId = `battery_user_${Date.now()}`;
      const ctx = { chat: { id: testUserId }, from: { id: testUserId, first_name: 'André' } };

      // 1. Menu Geral
      const menu = await workerNutricao.handle('/ia_nutricionista', ctx);
      assert(menu.includes('IA-NUTRICIONISTA') && menu.includes('/analisar_refeicao'), '/ia_nutricionista deve exibir menu de funcionalidades');

      // 2. Análise de Refeição Visual / Heurística
      const analise = await workerNutricao.handle('/analisar_refeicao 200g peito de frango com 150g arroz e brocolos', ctx);
      assert(analise.includes('ANÁLISE NUTRICIONAL DO PRATO') && analise.includes('Proteína:'), '/analisar_refeicao deve devolver macros e porções');
      assert(analise.includes('/confirmar_refeicao'), 'Deve incluir comando para confirmar refeição');

      // 3. Extrair ID da avaliação e confirmar registo
      const idMatch = analise.match(/\/confirmar_refeicao\s+(eval_\w+)/);
      assert(idMatch && idMatch[1], 'Deve conter ID de avaliação válido');
      const evalId = idMatch[1];

      const confirmOut = await workerNutricao.handle(`/confirmar_refeicao ${evalId}`, ctx);
      assert(confirmOut.includes('Refeição Registada com Sucesso'), 'confirmar_refeicao deve somar ao diário');

      // 4. Dúvida / Dica Clínica
      const dicaOut = await workerNutricao.handle('/dica_nutricao timing', ctx);
      assert(dicaOut.includes('DICA DO NUTRICIONISTA') && dicaOut.includes('Leucine'), '/dica_nutricao deve devolver recomendação baseada em evidência');
    });

    // ─── MÓDULO 6: CMVM Imobiliário, Apple Comparação & Filtros /vigiar ───────
    console.log('\n📡 MÓDULO 6: Radar 5 Frentes, CMVM & Filtros /vigiar');

    await runTest('IMMO-01', 'Avaliação pericial CMVM aplica escalões e penalização -25% sem licença', () => {
      const superOp = avaliarImovelCmvm({
        precoAnunciado: 150000,
        areaUtil: 140,
        areaTerreno: 500,
        classeEnergetica: 'B',
        zona: 'São Gonçalo',
        estado: 'bom'
      });
      assert(superOp.classificacao.includes('SUPER OPORTUNIDADE'), `Esperado SUPER OPORTUNIDADE, obtido ${superOp.classificacao}`);

      const comLicenca = avaliarImovelCmvm({ precoAnunciado: 200000, areaUtil: 120, zona: 'Amarante', classeEnergetica: 'B', semLicenca: false });
      const semLicenca = avaliarImovelCmvm({ precoAnunciado: 200000, areaUtil: 120, zona: 'Amarante', classeEnergetica: 'B', semLicenca: true });
      assert(semLicenca.penalizacaoLicenca > 0 && semLicenca.valorIntrinseco < comLicenca.valorIntrinseco, 'Falta de licença deve penalizar ~25%');
    });

    await runTest('APPLE-01', 'Comparador Apple distingue Poupança Grau A vs Novo 3 Anos Garantia sem inventar', () => {
      const refurbWin = evaluateAppleComparison(1000, 720);
      assert(refurbWin.diferenca === 280 && refurbWin.pctPoupanca === 28 && refurbWin.recomenda.includes('COMPENSA RECONDICIONADO'), 'Devía recomendar Grau A a -28%');

      const novoWin = evaluateAppleComparison(850, 800);
      assert(novoWin.diferenca === 50 && novoWin.recomenda.includes('PREFERIR NOVO'), 'Diferença de 50€ deve preferir novo 3A');

      const semDados = evaluateAppleComparison(0, 0);
      assert(semDados.diferenca === 0 && semDados.recomenda.includes('Consultar preço'), 'Sem preços não pode inventar diferença');
    });

    await runTest('RADAR-01', 'Comandos /vigiar, /meus_alertas e /alertas gerem filtros no SQLite', async () => {
      const ctx = { chat: { id: 950415577 }, from: { id: 950415577, first_name: 'André' } };
      const createOut = await workerImmo.handle('/vigiar apple iPhone 15 Pro 256GB 850', ctx);
      assert(createOut.includes('Alerta de Vigilância Ativado') && createOut.includes('850'), 'Comando /vigiar deve confirmar filtro criado');

      const listOut = await workerImmo.handle('/meus_alertas', ctx);
      assert(listOut.includes('iPhone 15 Pro 256GB'), '/meus_alertas deve listar filtro ativo');

      const filters = sqliteMasterDb.getRadarFilters(true);
      assert(filters.length >= 1, 'Deve existir pelo menos 1 filtro ativo na tabela radar_filtros');
      const delOut = await workerImmo.handle(`/meus_alertas apagar ${filters[0].id}`, ctx);
      assert(delOut.includes('removido'), '/meus_alertas apagar <id> deve remover filtro');

      const schedOut = await workerImmo.handle('/alertas', ctx);
      assert(schedOut.includes('08:30') && schedOut.includes('5 FRENTES'), '/alertas deve informar agenda 08:30 e 5 frentes');
    });

    // ─── MÓDULO 7: Cloud-Native DevOps (/status_cloud, /compilar & Atalhos) ──
    console.log('\n☁️  MÓDULO 7: Cloud-Native DevOps & Vigilância Direta');

    await runTest('DEV-01', '/status_cloud e /compilar (GitHub Actions dispatch) funcionam sem PC local', async () => {
      const statusOut = await workerDev.handleStatusCloud({ measureNetwork: false });
      assert(statusOut.includes('STATUS CLOUD-NATIVE'), '/status_cloud deve mostrar cabeçalho Cloud-Native');
      assert(statusOut.includes('RAM Container:') && statusOut.includes('SQLite WAL (16 tabelas)'), 'Deve incluir métricas RAM e 16 tabelas SQLite');
      assert(statusOut.includes('Google Drive Write-Through'), 'Deve mostrar estado do Google Drive');

      const dispatched = [];
      const mockOctokit = {
        rest: {
          repos: {
            get: async ({ owner, repo }) => ({ data: { owner, repo, default_branch: 'main' } })
          },
          actions: {
            listRepoWorkflows: async () => ({
              data: { workflows: [{ id: 101, name: 'Build Android APK', path: '.github/workflows/android-apk.yml' }] }
            }),
            createWorkflowDispatch: async (params) => {
              dispatched.push(params);
              return { status: 204 };
            },
            listWorkflowRuns: async () => ({
              data: { workflow_runs: [{ html_url: 'https://github.com/andre22pinheiro-ui/smooth-bus-routes/actions/runs/123' }] }
            })
          }
        }
      };

      const compOut = await workerDev.handleCompilarCloud('rotabus', { octokitClient: mockOctokit });
      assert(dispatched.length === 1 && dispatched[0].repo === 'smooth-bus-routes' && dispatched[0].ref === 'main', 'handleCompilarCloud deve invocar createWorkflowDispatch com repo mapeado');
      assert(compOut.includes('GITHUB ACTIONS') && compOut.includes('https://github.com/'), '/compilar deve devolver URL real da build na nuvem');

      const legacyPcOut = await workerDev.handle('/pc', { chat: { id: 950415577 } });
      assert(legacyPcOut.includes('STATUS CLOUD-NATIVE'), '/pc legado deve devolver status cloud sem erro');
      const legacyPrintOut = await workerDev.handle('/print', { chat: { id: 950415577 } });
      assert(legacyPrintOut.includes('zero dependência de PC local') && legacyPrintOut.includes('STATUS CLOUD-NATIVE'), '/print legado deve informar remoção do PC local');
    });

    await runTest('DEV-02', 'Padrões Mercury: Second Brain FTS5 (/memoria) e Token Budget ADR-044 (/budget)', async () => {
      const testUserId = `user_mercury_${Date.now()}`;
      const ctx = { chat: { id: 950415577 }, from: { id: 950415577, first_name: 'André' } };

      // 1. Guardar factos com categorias diferentes
      const f1 = sqliteMasterDb.saveMemoryFact({
        userId: testUserId,
        category: 'preferencia',
        fact: 'Prefere café expresso curto sem açúcar após o almoço',
        confidenceScore: 0.95
      });
      assert(f1.id, 'saveMemoryFact deve gerar ID');

      const f2 = sqliteMasterDb.saveMemoryFact({
        userId: testUserId,
        category: 'rotina',
        fact: 'Treino de hipertrofia às segundas e quartas às 19h00',
        confidenceScore: 0.90
      });

      // 2. Pesquisar via FTS5
      const searchRes = sqliteMasterDb.searchMemoryFacts(testUserId, 'expresso curto', 5);
      assert(searchRes.length >= 1, 'searchMemoryFacts deve encontrar termo com FTS5');
      assert(searchRes[0].fact.includes('café expresso curto'), 'Pesquisa FTS5 deve retornar o facto exato');

      // 3. Comandos /memoria e /budget no workerDev
      const memList = await workerDev.handle('/memoria', { chat: { id: testUserId } });
      assert(memList.includes('SECOND BRAIN') || memList.includes('FACTOS DURÁVEIS'), '/memoria deve listar factos');

      const memSearch = await workerDev.handle('/memoria café', { chat: { id: testUserId } });
      assert(memSearch.includes('RESULTADOS DA PESQUISA') && memSearch.includes('café'), '/memoria <termo> deve pesquisar');

      // 4. Token Budget ADR-044
      sqliteMasterDb.recordTokenUsage({ model: 'gemini-flash-test', tokens: 12500, costEur: 0.0025 });
      const budgetStatus = sqliteMasterDb.getTokenBudgetStatus();
      assert(budgetStatus.totalTokens >= 12500, 'recordTokenUsage deve acumular tokens no orçamento diário');
      assert(budgetStatus.totalCost > 0, 'recordTokenUsage deve acumular custo estimado');

      const budgetCmd = await workerDev.handle('/budget', ctx);
      assert(budgetCmd.includes('ORÇAMENTO DE TOKENS') && budgetCmd.includes('ADR-044'), '/budget deve exibir relatório com limiar 100k');
    });

    await runTest('DEV-03', 'IdeaHarvester: Absorção Cloud-Native, Filtro Anti-TUI/Daemons e Geração de Prompt IDE', async () => {
      // 1. Mock do cliente Octokit para simular repositório com TUI Ink e Daemons locais
      const mockOctokit = {
        rest: {
          repos: {
            get: async () => ({
              data: {
                description: 'Terminal UI dashboard with Ink and systemd daemon for background polling',
                topics: ['ink', 'tui', 'daemon', 'systemd'],
                stargazers_count: 142,
                language: 'TypeScript'
              }
            }),
            getReadme: async () => ({
              data: {
                content: Buffer.from(
                  '# Local Dashboard CLI\nUses React Ink for interactive terminal TUI and systemd service daemon to watch fs.watch files.\n<script>alert("xss")</script>'
                ).toString('base64')
              }
            })
          }
        }
      };

      // 2. Absorver e adaptar repositório simulado
      const harvested = await ideaHarvesterService.harvestAndAdaptIdea({
        sourceUrl: 'https://github.com/mock-org/local-tui-daemon',
        targetProject: 'frota-bot',
        userNotes: 'Adaptar telemetria para o bot de frotas sem rodar localmente',
        octokitClient: mockOctokit
      });

      assert(harvested.id, 'Ideia deve ser gravada com ID na tabela idea_radar');
      assert(harvested.target_project === 'frota-bot', 'Projeto alvo deve ser preservado');
      assert(!harvested.extracted_summary.includes('<script>'), 'Sanitização ADR-044 deve expurgar tags perigosas');

      // 3. Verificar que requisitos locais foram rejeitados e convertidos para Cloud
      const rejectedItems = harvested.cloudPlan.filter((c) => c.status === 'REJEITADO_E_CONVERTIDO');
      assert(rejectedItems.length >= 2, 'Pelo menos 2 padrões locais (TUI e Daemons) devem ser rejeitados e convertidos');
      const conversionText = harvested.cloud_adaptation_plan;
      assert(conversionText.includes('Telegraf') || conversionText.includes('Markup'), 'TUI deve ser convertido para Telegraf/Webhooks');
      assert(conversionText.includes('node-cron') || conversionText.includes('Render'), 'Daemons devem ser convertidos para node-cron ou Render');

      // 4. Verificar ide_prompt
      assert(harvested.ide_prompt.includes('Antigravity IDE Implementation Prompt'), 'ide_prompt deve conter cabeçalho canónico');
      assert(harvested.ide_prompt.includes('<untrusted_data'), 'ide_prompt deve conter delimitação de segurança <untrusted_data>');

      // 5. Testar comandos no workerDev
      const ctx = { chat: { id: 950415577 }, from: { id: 950415577, first_name: 'André' } };

      const radarOut = await workerDev.handle('/radar_ideias', ctx);
      assert(radarOut.includes('RADAR DE IDEIAS') && radarOut.includes(`#${harvested.id}`), '/radar_ideias deve listar a ideia gravada');

      const promptOut = await workerDev.handle(`/gerar_prompt_ideia ${harvested.id}`, ctx);
      assert(promptOut.includes('PROMPT ESTRUTURADO PARA O ANTIGRAVITY IDE') && promptOut.includes('Antigravity IDE Implementation Prompt'), '/gerar_prompt_ideia deve emitir o bloco de prompt');

      // Testar comando /absorver_ideia com fallback
      const directCmd = await workerDev.handle('/absorver_ideia https://github.com/exemplo/repo-teste master-bot "Apenas teste"', ctx);
      assert(directCmd.includes('Ideia Open-Source Absorvida com Sucesso'), '/absorver_ideia deve responder com sucesso');
    });

    await runTest('DEV-04', 'Free-TV / IPTV: Catálogo canónico legal, HLS streams e comando /tv', async () => {
      const { default: iptvService } = await import('../src/services/iptvService.js');
      assert(iptvService.FREE_CHANNELS.length >= 10, 'Deve ter pelo menos 10 canais abertos legais curados');
      const ctx = { chat: { id: 950415577 }, from: { id: 950415577, first_name: 'André' } };
      const tvCatalog = await workerDev.handle('/tv', ctx);
      assert(tvCatalog.includes('Free-TV / IPTV') && tvCatalog.includes('RTP 1'), '/tv deve devolver catálogo de canais legais');
      const tvRtp1 = await workerDev.handle('/tv rtp1', ctx);
      assert(tvRtp1.includes('RTP 1') && tvRtp1.includes('.m3u8'), '/tv rtp1 deve devolver o stream direto');
      const m3u = iptvService.generateM3uContent();
      assert(m3u.startsWith('#EXTM3U') && m3u.includes('https://streaming-live.rtp.pt'), 'generateM3uContent deve produzir playlist válida');
    });

    await runTest('DEV-05', 'Obsidian Skills: Formatação Markdown, JSON Canvas (.canvas) e exportação de Vault', async () => {
      const { default: obsidianService } = await import('../src/services/obsidianService.js');
      const ctx = { chat: { id: 950415577 }, from: { id: 950415577, first_name: 'André' } };
      const menu = await workerDev.handle('/obsidian', ctx);
      assert(menu.includes('Integração Obsidian') && menu.includes('/obsidian export'), '/obsidian deve exibir menu com comandos');
      const canvasOut = await workerDev.handle('/canvas', ctx);
      assert(canvasOut.includes('JSON Canvas do Ecossistema') && canvasOut.includes('node-master-hub'), '/canvas deve gerar visual JSON Canvas');
      const vault = obsidianService.exportSecondBrainToObsidianVault();
      assert(vault.length === 5, 'exportSecondBrainToObsidianVault deve produzir exatamente 5 ficheiros canónicos');
    });

    await runTest('DEV-06', 'Hindsight Memory: Retain, Recall, Reflect e Bancos Particionados (ADR-044)', async () => {
      const { default: hindsight } = await import('../src/services/hindsightMemoryService.js');
      const banks = hindsight.listBanks();
      assert(banks.length >= 4, 'Deve conter pelo menos os 4 bancos canónicos');
      const ctx = { chat: { id: 950415577 }, from: { id: 950415577, first_name: 'André' } };
      const menu = await workerDev.handle('/hindsight', ctx);
      assert(menu.includes('Hindsight') && menu.includes('Retain'), '/hindsight deve devolver menu com as 3 operações');
      const rRetain = await workerDev.handle('/hindsight retain dev_cloud | Deploy do Render testado com sucesso', ctx);
      assert(rRetain.includes('Memória Retida com Sucesso'), 'Retain deve persistir com sucesso');
      const rRecall = await workerDev.handle('/hindsight recall dev_cloud | Render', ctx);
      assert(rRecall.includes('Memórias Evocadas'), 'Recall deve recuperar a memória persistida');
    });

    await runTest('DEV-07', 'Projeto NOMAD: Conhecimento Offline, Socorro SBV, Kit 72h e CyberChef (ADR-044)', async () => {
      const { default: nomad } = await import('../src/services/nomadKnowledgeService.js');
      assert(nomad.EMERGENCY_CONTACTS.length >= 5, 'Deve conter lista de contactos de emergência');
      const ctx = { chat: { id: 950415577 }, from: { id: 950415577, first_name: 'André' } };
      const menu = await workerDev.handle('/nomad', ctx);
      assert(menu.includes('Projeto NOMAD') && menu.includes('/nomad socorro'), '/nomad deve exibir menu de resiliência');
      const sbvOut = await workerDev.handle('/socorro sbv', ctx);
      assert(sbvOut.includes('Suporte Básico de Vida') && sbvOut.includes('30 compressões'), '/socorro sbv deve detalhar procedimento 30:2');
      const kitOut = await workerDev.handle('/kit72h', ctx);
      assert(kitOut.includes('Kit de Emergência 72 Horas'), '/kit72h deve listar itens do kit');
      const hashOut = await workerDev.handle('/hash teste', ctx);
      assert(hashOut.includes('46070d4bf934fb0d4b06d9e2c46e346944e322444900a435d7d9a95e6d7435f5'), '/hash deve calcular SHA-256');
    });

    await runTest('DEV-08', 'Agent-Reach: Zero-API-Fee Web Intelligence, Cache SQLite e Comandos (/reach, /read, /hn)', async () => {
      const { default: reachService } = await import('../src/services/agentReachService.js');
      const ctx = { chat: { id: 950415577 }, from: { id: 950415577, first_name: 'André' } };

      // 1. Menu Geral
      const menu = await workerDev.handle('/reach', ctx);
      assert(menu.includes('AGENT-REACH') && menu.includes('/reach read'), '/reach deve exibir menu multi-plataforma');

      // 2. Doctor / Diagnóstico com mock
      const mockDoctorAxios = {
        get: async () => ({ data: 'ok' })
      };
      const doc = await reachService.runAgentReachDoctor({ axiosClient: mockDoctorAxios });
      assert(doc.ok === true && doc.healthyCount >= 5, 'Doctor deve reportar canais operacionais');
      const docMsg = reachService.formatDoctorMarkdown(doc);
      assert(docMsg.includes('DIAGNÓSTICO AGENT-REACH') && docMsg.includes('Web Reader'), 'Formatador Doctor deve exibir cabeçalho e canais');

      // 3. Cache SQLite WAL
      const testEnv = reachService.buildReachEnvelope({
        platform: 'reddit',
        query: 'battery-test',
        title: 'Discussão sobre SQLite WAL',
        author: 'u/tester',
        score: 42,
        snippet: 'Alta performance no Render',
        status: 'success'
      });
      sqliteMasterDb.setCachedReach({
        platform: 'reddit',
        queryOrUrl: 'battery-test',
        title: testEnv.title,
        envelope: testEnv,
        ttlSeconds: 120
      });
      const cached = sqliteMasterDb.getCachedReach('reddit', 'battery-test');
      assert(cached && cached.cached === true && cached.title === 'Discussão sobre SQLite WAL', 'Cache SQLite deve retornar envelope com flag cached=true');

      // 4. Execução de comandos no workerDev
      const readHelp = await workerDev.handle('/read', ctx);
      assert(readHelp.includes('/read <https://url>'), '/read sem argumentos deve devolver ajuda de sintaxe');

      const redditCmd = await workerDev.handle('/reddit battery-test', ctx);
      assert(redditCmd.includes('AGENT-REACH') && redditCmd.includes('REDDIT'), '/reddit deve recuperar e formatar dados');
    });

    await runTest('DEV-09', 'Home Assistant: Domótica Cloud-Native, Controlo de Luzes, Clima Carolina e Cenários (ADR-044)', async () => {
      const { default: hassService } = await import('../src/services/homeAssistantService.js');
      const ctx = { chat: { id: 950415577 }, from: { id: 950415577, first_name: 'André' } };

      // 1. Painel Geral /casa
      const casaOut = await workerDev.handle('/casa', ctx);
      assert(casaOut.includes('PAINEL RESIDENCIAL & DOMÓTICA') && casaOut.includes('Quarto da Carolina'), '/casa deve exibir visão geral residencial');

      // 2. Controlo de Iluminação /luz
      const luzOut = await workerDev.handle('/luz sala on', ctx);
      assert(luzOut.includes('Luz da Sala') && luzOut.includes('ON'), '/luz sala on deve ligar luz da sala');
      const salaDb = sqliteMasterDb.getHomeEntity('light.sala');
      assert(salaDb.state === 'on', 'Estado da luz da sala em SQLite deve ser on');

      // 3. Clima Quarto Bebé /clima
      const climaOut = await workerDev.handle('/clima bebe 20.5', ctx);
      assert(climaOut.includes('Climatização Quarto Bebé') && climaOut.includes('20.5°C'), '/clima bebe deve atualizar temperatura');

      // 4. Cenário /cenario noite
      const cenarioOut = await workerDev.handle('/cenario noite', ctx);
      assert(cenarioOut.includes('Modo Noturno (Descanso Bebé)') && cenarioOut.includes('Ações Executadas'), '/cenario noite deve ativar modo noturno');
      const salaAfterNoite = sqliteMasterDb.getHomeEntity('light.sala');
      assert(salaAfterNoite.state === 'off', 'Modo noite deve apagar luz da sala');

      // 5. Monitor Conforto Bebé /carolina_quarto
      const bebeOut = await workerDev.handle('/carolina_quarto', ctx);
      assert(bebeOut.includes('MONITOR DE CONFORTO: QUARTO DA CAROLINA') && bebeOut.includes('Temperatura Atual'), '/carolina_quarto deve exibir métricas');
    });

    await runTest('RADAR-02', 'Atalhos diretos /vigiar_amazon e /vigiar_apple criam filtros dedicados', async () => {
      const ctx = { chat: { id: 950415577 }, from: { id: 950415577, first_name: 'André' } };
      const amOut = await workerImmo.handle('/vigiar_amazon Garmin Forerunner 250', ctx);
      assert(amOut.includes('Alerta de Vigilância Ativado') && amOut.toLowerCase().includes('amazon'), '/vigiar_amazon deve criar filtro amazon');
      const apOut = await workerImmo.handle('/vigiar_apple MacBook Air M3 1100', ctx);
      assert(apOut.includes('Alerta de Vigilância Ativado') && apOut.toLowerCase().includes('apple'), '/vigiar_apple deve criar filtro apple');
    });

    // ─── MÓDULO 8: Conformidade Normativa Tripla, Proatividade & IPMA ─────────
    console.log('\n🛡️  MÓDULO 8: Conformidade Tripla, Proatividade & IPMA/Cloud');

    await runTest('PROACT-01', 'Janela de silêncio 22:30-07:30, Briefing Matinal, Nutrição <70% e Lembretes críticos', async () => {
      assert(proactiveEngine.isQuietHours(new Date('2026-01-15T22:35:00Z')) === true, '22:35 Lisboa deve estar em silêncio');
      assert(proactiveEngine.isQuietHours(new Date('2026-01-15T07:15:00Z')) === true, '07:15 Lisboa deve estar em silêncio');
      assert(proactiveEngine.isQuietHours(new Date('2026-01-15T07:30:00Z')) === false, '07:30 Lisboa já não deve estar em silêncio');
      assert(proactiveEngine.isQuietHours(new Date('2026-01-15T22:29:00Z')) === false, '22:29 Lisboa já está ativa');

      const morning = await proactiveEngine.buildMorningExecutiveBriefing({
        getNewsFn: async () => '🗞️ NOTÍCIAS IPMA + AMARANTE OK',
        getFuelFn: async (_mun, tipo) => ({ tipo, postos: [{ nome: 'Posto Teste' }] }),
        formatFuelFn: (d) => `⛽ ${d.tipo}: 1.499 €/L`,
        getEmailStatusFn: () => ({ configured: true }),
        getEmailBriefingFn: async () => '📧 1 email importante',
        getTasksFn: () => [{ title: 'Comprar leite bebé', assigned_to: 'André', completed: false }]
      });
      assert(
        morning.includes('NOTÍCIAS IPMA + AMARANTE OK') &&
        morning.includes('gasoleo') &&
        morning.includes('1 email importante') &&
        morning.includes('Comprar leite bebé'),
        'Briefing Matinal deve consolidar notícias, combustíveis, emails e tarefas'
      );

      let recipeCalled = false;
      const alert20h = await proactiveEngine.evaluateNutritionProactiveCheck({
        nutritionData: { totalProtein: 80, proteinTarget: 160, totalWater: 1500, waterTarget: 2500, tookCreatina: false },
        hour: 20,
        generateRecipeFn: async () => {
          recipeCalled = true;
          return '👨‍🍳 Pescada MCC com ervas aromáticas diretas (sem refogado)';
        }
      });
      assert(recipeCalled && alert20h && alert20h.includes('80g / 160g') && alert20h.includes('EFSA/ISSN'), 'Às 20h com <70% proteína deve sugerir receita rápida');

      const ok20h = await proactiveEngine.evaluateNutritionProactiveCheck({
        nutritionData: { totalProtein: 160, proteinTarget: 160, totalWater: 2500, waterTarget: 2500, tookCreatina: true },
        hour: 20
      });
      assert(ok20h === null, 'Meta totalmente cumprida às 20h deve devolver null');

      const check13h = await proactiveEngine.evaluateNutritionProactiveCheck({
        nutritionData: { totalProtein: 20, proteinTarget: 160, totalWater: 500, waterTarget: 2500, tookCreatina: false },
        hour: 13
      });
      assert(check13h && check13h.includes('13h00'), 'Check-in às 13h deve alertar progresso matinal');

      const pastIso = new Date(Date.now() - 60000).toISOString();
      const rem = sqliteMasterDb.addReminder({ text: 'Dar vitamina Carolina', triggerAt: pastIso, chatId: '950415577', user: { id: 950415577, first_name: 'André' } });
      const sentMsgs = [];
      const mockBot = { telegram: { sendMessage: async (chatId, text) => { sentMsgs.push({ chatId, text }); } } };
      const dispatched = await proactiveEngine.dispatchDueReminders(mockBot, '950415577');
      assert(dispatched >= 1 && sentMsgs.some((m) => m.text.includes('Dar vitamina Carolina')), 'Lembrete devido deve disparar sempre');
      const remainingDue = sqliteMasterDb.getPendingDueReminders().filter((r) => r.id === rem.id);
      assert(remainingDue.length === 0, 'Lembrete despachado deve ser marcado como enviado');
    });

    await runTest('COMPLY-01', 'Conformidade Tripla (AGENTS, RGPD logs, Omnibus 90d, DL 84/2021, MCC sem refogado)', async () => {
      assert(loadAgentsMdDirectives() === true, 'AGENTS.md canónico deve carregar com sucesso');
      for (const req of ['2024/1689', '2016/679', '2019/2161', 'EFSA/ISSN', 'DL n.º 10/2024', 'DL n.º 84/2021', 'PDM de Amarante']) {
        assert(CONFORMANCE_MATRIX.includes(req), `CONFORMANCE_MATRIX deve citar ${req}`);
      }

      const maskedMail = maskEmailRgpd('andre@example.com');
      const maskedPhone = maskPhoneRgpd('351919115655');
      assert(!maskedMail.includes('andre@') && maskedMail.includes('@example.com'), 'RGPD deve mascarar prefixo de email');
      assert(!maskedPhone.includes('919115') && maskedPhone.endsWith('655'), 'RGPD deve mascarar dígitos iniciais de telemóvel');

      const recent = new Date(Date.now() - 10 * 86400 * 1000).toISOString();
      const realDeal = validateOmnibus90DayDeal({ preco: 80, asin: 'B001' }, [{ preco: 110, asin: 'B001', data_atualizacao: recent }]);
      assert(realDeal.status === 'true_min_90d' && realDeal.min90d === 80, 'Omnibus deve confirmar mínimo real de 90 dias');
      const fakeDeal = validateOmnibus90DayDeal({ preco: 120, asin: 'B001' }, [{ preco: 110, asin: 'B001', data_atualizacao: recent }]);
      assert(fakeDeal.status === 'not_lowest_90d' && fakeDeal.min90d === 110, 'Omnibus deve detetar preço acima do mínimo de 90 dias');

      const appleNear = evaluateAppleComparison(1000, 950);
      assert(appleNear.recomenda.includes('DL 84/2021'), 'Comparador Apple deve referenciar garantia 3 anos DL 84/2021');
      const appleMid = evaluateAppleComparison(1000, 860);
      assert(appleMid.recomenda.includes('DL 84/2021') && appleMid.recomenda.includes('>=85%'), 'Comparador Apple equilibrado deve exigir bateria >=85%');

      const savedEnv = { GEMINI_API_KEY: process.env.GEMINI_API_KEY, GROQ_API_KEY: process.env.GROQ_API_KEY, OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY };
      const origFetch = globalThis.fetch;
      delete process.env.GEMINI_API_KEY;
      delete process.env.GROQ_API_KEY;
      delete process.env.OPENROUTER_API_KEY;
      globalThis.fetch = async () => ({ ok: false, status: 503, text: async () => '' });
      try {
        const mccRec = await workerNutricao.generateHealthyRecipe({ query: 'Pescada com curgete', mode: 'mcc' });
        assert(mccRec.includes('sem refogado') && !mccRec.includes('*Refogar*'), 'Modo MCC deve eliminar refogados e usar ervas aromáticas diretas');
      } finally {
        globalThis.fetch = origFetch;
        if (savedEnv.GEMINI_API_KEY !== undefined) process.env.GEMINI_API_KEY = savedEnv.GEMINI_API_KEY;
        if (savedEnv.GROQ_API_KEY !== undefined) process.env.GROQ_API_KEY = savedEnv.GROQ_API_KEY;
        if (savedEnv.OPENROUTER_API_KEY !== undefined) process.env.OPENROUTER_API_KEY = savedEnv.OPENROUTER_API_KEY;
      }
    });

    await runTest('IPMA-01', 'fetchIpmaPortoWeather lê IPMA real e não alucina em falha HTTP', async () => {
      const origFetch = globalThis.fetch;
      try {
        globalThis.fetch = async (url) => {
          if (String(url).includes('1131200.json')) {
            return {
              ok: true,
              json: async () => ({ data: [{ forecastDate: '2026-11-12', tMin: '8', tMax: '17', precipitaProb: '20', predWindDir: 'NW' }] })
            };
          }
          return {
            ok: true,
            json: async () => [{ idAreaAviso: 'PTO', awarenessLevelID: 'yellow', awarenessTypeName: 'Precipitação', text: 'Chuva forte pontual' }]
          };
        };
        const okRes = await fetchIpmaPortoWeather();
        assert(okRes.forecast.tMin === '8' && okRes.forecast.tMax === '17' && okRes.warnings.length === 1, 'IPMA deve extrair forecast e aviso PTO');

        globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
        const errRes = await fetchIpmaPortoWeather();
        assert(errRes.forecast === null && errRes.warnings.length === 0, 'Em falha IPMA nunca pode inventar valores meteorológicos');
      } finally {
        globalThis.fetch = origFetch;
      }
    });

    await runTest('CLOUD-01', 'cloudDevService lista repositórios, cria repo e consulta catálogo Vercel', async () => {
      const mockOctokit = {
        rest: {
          repos: {
            listForAuthenticatedUser: async () => ({ data: [{ name: 'telegram-master-bot', html_url: 'https://github.com/u/r', description: 'Bot' }] }),
            createForAuthenticatedUser: async ({ name }) => ({ data: { name, html_url: `https://github.com/u/${name}` } })
          }
        }
      };
      const reposOut = await cloudDevService.listGithubRepos({ octokitClient: mockOctokit });
      assert(reposOut.includes('telegram-master-bot'), 'listGithubRepos deve listar repositórios reais');
      const createdOut = await cloudDevService.createCloudRepoAndDeploy('nova-app Teste Cloud', { octokitClient: mockOctokit });
      assert(createdOut.includes('nova-app') && createdOut.includes('Nuvem'), 'createCloudRepoAndDeploy deve confirmar criação Cloud');
      const vercelApps = await cloudDevService.listVercelAppsOrDeployments();
      assert(vercelApps.includes('gestao-familiar-webapp.vercel.app'), 'listVercelAppsOrDeployments deve listar catálogo Vercel');
    });

    await runTest('UPG-01', 'Aliasing legacy (/europa, /status_nuvem) e leitura dinâmica Drive env após import', () => {
      assert(detectIntent('/europa') === 'GERAL', '/europa deve encaminhar para worker GERAL (notícias)');
      assert(detectIntent('/status_nuvem') === 'DEV', '/status_nuvem deve encaminhar para worker DEV');

      const prevKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
      try {
        process.env.GOOGLE_SERVICE_ACCOUNT_KEY = JSON.stringify({
          client_email: 'dynamic-test@example.iam.gserviceaccount.com',
          private_key: '-----BEGIN PRIVATE KEY-----\nTEST\n-----END PRIVATE KEY-----\n'
        });
        const sa = getServiceAccountCredentials();
        assert(sa?.client_email === 'dynamic-test@example.iam.gserviceaccount.com', 'Credenciais Drive devem ser lidas dinamicamente do env');
        assert(isDriveConfigured() === true, 'isDriveConfigured deve reconhecer GOOGLE_SERVICE_ACCOUNT_KEY dinâmico');
      } finally {
        if (prevKey === undefined) delete process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
        else process.env.GOOGLE_SERVICE_ACCOUNT_KEY = prevKey;
      }
    });

    await runTest('UPG-02', 'legacyBridges garante compatibilidade dos 5 bots + redirecionamento frota isolado', async () => {
      assert(LEGACY_WEBHOOK_KEYS.length === 5, 'Deve reconhecer exatamente as 5 chaves de webhook legacy');
      const cfgs = getLegacyBridgeConfigs({
        TELEGRAM_DEV_TOKEN: '123456:DEV_TOKEN',
        TELEGRAM_IMMO_TOKEN: '123456:IMMO_TOKEN',
        TELEGRAM_PESSOAL_TOKEN: '123456:PESSOAL_TOKEN',
        TELEGRAM_NUTRICAO_TOKEN: '123456:NUTRI_TOKEN',
        TELEGRAM_FROTAS_TOKEN: '123456:FROTA_TOKEN'
      });
      assert(cfgs.every((c) => Boolean(c.token && c.webhookPath.startsWith('/webhook/'))), 'Todas as pontes DEV/IMMO/PESSOAL/NUTRICAO/FROTAS devem resolver token e webhook');

      const actionMap = new Map();
      const commandMap = new Map();
      const mockBot = {
        action: (id, fn) => actionMap.set(id, fn),
        command: (cmds, fn) => (Array.isArray(cmds) ? cmds : [cmds]).forEach((c) => commandMap.set(c, fn))
      };

      const sent = [];
      registerMasterBackCompatHandlers(mockBot, {
        sendReply: async (_ctx, text, extra) => sent.push({ text, extra }),
        handleImmo: async (cmd) => `MOCK_IMMO:${cmd}`,
        getPlanoNutricional: () => 'MOCK_PLANO',
        getResumoHoje: () => 'MOCK_HOJE',
        routeMessage
      });

      for (const id of ['immo_amarante', 'immo_felgueiras', 'immo_alertas_status', 'nutri_plano', 'nutri_hoje', ...LEGACY_FLEET_ACTIONS]) {
        assert(actionMap.has(id), `Callback legado em falta no Master: ${id}`);
      }

      await actionMap.get('immo_amarante')({ answerCbQuery: async () => { }, sendChatAction: async () => { } });
      assert(sent.at(-1).text === 'MOCK_IMMO:/avaliacao 120 Amarante T3 bom', 'immo_amarante deve invocar avaliação Amarante');

      await actionMap.get('frota_porto_lisboa')({ answerCbQuery: async () => { } });
      assert(sent.at(-1).text === FLEET_REDIRECT_MSG, 'frota_porto_lisboa no Master deve redirecionar com FLEET_REDIRECT_MSG');
      assert(JSON.stringify(sent.at(-1).extra).includes('zeropaperfrotaBot'), 'Botão inline deve apontar para @zeropaperfrotaBot');

      const noop = async () => { };
      const bridges = createLegacyBridgeBots(
        {
          authMiddleware: async (_ctx, next) => next(),
          cleanChatMiddleware: async (_ctx, next) => next(),
          sendReply: noop,
          safeExecute: async (fn) => fn(),
          withTypingHeartbeat: async (_ctx, fn) => fn(),
          processPhotoWithVision: noop,
          transcribeTelegramAudio: async () => null,
          routeMessage,
          handleDev: async () => 'DEV_OK',
          handleImmo: async () => 'IMMO_OK',
          handleGeral: async () => 'GERAL_OK',
          handleNutricao: async () => 'NUTRI_OK',
          handleStatusCloud: async () => 'CLOUD_OK',
          getPlanoNutricional: () => 'PLANO_OK',
          getResumoHoje: () => 'HOJE_OK',
          handleAguaInput: () => 'AGUA_OK',
          handleCreatina: () => 'CREATINA_OK',
          handleProteinaInput: () => 'PROT_OK'
        },
        {
          TELEGRAM_DEV_TOKEN: '123456:DEV_TEST',
          TELEGRAM_FROTAS_TOKEN: '123456:FROTAS_TEST'
        }
      );
      assert(bridges.length === 2, 'Deve instanciar apenas pontes com token presente no ambiente');
      assert(bridges.some((b) => b.webhookPath === '/webhook/dev') && bridges.some((b) => b.webhookPath === '/webhook/frotas'), 'Deve mapear /webhook/dev e /webhook/frotas');
    });

    await runTest('UPG-03', 'index.js expõe pontes legacy, aliases (/europa, /status_nuvem) e newsService sem feeds 404', () => {
      const indexSrc = fs.readFileSync(path.join(ROOT_DIR, 'index.js'), 'utf-8');
      assert(indexSrc.includes('europa') && indexSrc.includes('status_nuvem'), 'index.js deve suportar aliases legados /europa e /status_nuvem');
      assert(indexSrc.includes('LEGACY_WEBHOOK_KEYS') && indexSrc.includes('createLegacyBridgeBots'), 'index.js deve montar pontes webhook legacy');

      const newsSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/services/newsService.js'), 'utf-8');
      assert(!newsSrc.includes('averdade.com/feed/'), 'newsService.js não pode consultar feed 404 de averdade.com/feed/');
      assert(newsSrc.includes('cm-amarante.pt/feed/'), 'newsService.js deve usar RSS oficial vivo cm-amarante.pt/feed/');
    });

    await runTest('UPG-04', 'mountBotTransport reusa webhook ativo, faz retry em 429 e nunca apaga webhook na nuvem', async () => {
      const callbacks = new Map();
      let setCalls = 0;
      let deleteCalls = 0;
      let launchCalls = 0;
      const slept = [];

      const retryBot = {
        webhookCallback: (p) => () => p,
        launch: async () => { launchCalls++; },
        telegram: {
          getWebhookInfo: async () => ({ url: '' }),
          deleteWebhook: async () => { deleteCalls++; },
          setWebhook: async () => {
            setCalls++;
            if (setCalls === 1) {
              const err = new Error('429: Too Many Requests: retry after 2');
              err.response = { parameters: { retry_after: 2 } };
              throw err;
            }
          }
        }
      };

      const res1 = await mountBotTransport({
        name: 'MasterTest',
        targetBot: retryBot,
        webhookPath: '/webhook/master',
        webhookCallbacks: callbacks,
        renderUrl: 'https://telegram-master-bot-0h2h.onrender.com',
        usePolling: false,
        isCloudEnv: true,
        sleepFn: async (ms) => { slept.push(ms); }
      });

      assert(res1.mode === 'webhook' && res1.attempts === 2, 'Deve recuperar de erro 429 na 2.ª tentativa');
      assert(slept[0] === 2000, 'Deve respeitar retry_after=2s do Telegram');
      assert(callbacks.has('/webhook/master'), 'Callback HTTP deve permanecer montado');
      assert(deleteCalls === 0 && launchCalls === 0, 'Em cloud nunca pode chamar deleteWebhook nem polling launch');

      let reusedSetCalls = 0;
      const reuseBot = {
        webhookCallback: () => async () => { throw new Error('Simulated Telegraf failure'); },
        telegram: {
          getMe: async () => ({ id: 42, is_bot: true, username: 'MasterReuseBot' }),
          getWebhookInfo: async () => ({ url: 'https://telegram-master-bot-0h2h.onrender.com/webhook/master' }),
          setWebhook: async () => { reusedSetCalls++; }
        }
      };
      const res2 = await mountBotTransport({
        name: 'MasterReuse',
        targetBot: reuseBot,
        webhookPath: '/webhook/master',
        webhookCallbacks: callbacks,
        renderUrl: 'https://telegram-master-bot-0h2h.onrender.com',
        usePolling: false,
        sleepFn: async () => { }
      });
      assert(res2.reused === true && reusedSetCalls === 0, 'Deve reutilizar webhook já registado sem chamar setWebhook');
      assert(reuseBot.botInfo?.username === 'MasterReuseBot', 'mountBotTransport deve pré-carregar botInfo via getMe');

      let statusWritten = 0;
      await callbacks.get('/webhook/master')({}, {
        headersSent: false,
        writeHead: (code) => { statusWritten = code; },
        end: () => { }
      });
      assert(statusWritten === 500, 'Erro síncrono/assíncrono no webhookCallback deve devolver 500 sem derrubar o servidor Node');
    });

    // =========================================================================
    // 16. NOVOS SERVIÇOS INTEGRADOS (Self-Refine, Pladur, Lei PT, Agenda, OSM, Render Frota)
    // =========================================================================
    await runTest('SVC-01', 'Serviços Legacy Integrados (Self-Refine, Pladur, Direito Pessoal, Agenda, OSM Amarante, Render Frota)', async () => {
      const mockCtx = { chat: { id: '950415577' }, from: { id: 950415577, first_name: 'André' } };

      const pladurOut = await workerDev.handle('/pladur 25', mockCtx);
      assert(pladurOut.includes('EN 520') && pladurOut.includes('EN 14195'), 'Pladur deve referir EN 520 e EN 14195');
      assert(pladurOut.includes('52.5 m²') && pladurOut.includes('50.0 m lineares'), 'Pladur 25m² deve calcular rácios exatos');

      const sriOut = await workerGeral.handle('/leis cadeirinha', mockCtx);
      assert(sriOut.includes('Art. 55.º') && sriOut.includes('135 cm'), '/leis cadeirinha deve devolver Art. 55.º SRI');

      const dl84Out = await workerGeral.handle('/dl84', mockCtx);
      assert(dl84Out.includes('84/2021') && dl84Out.includes('3 anos'), '/dl84 deve devolver garantias 3 anos DL 84/2021');

      const codigoOut = await routeMessage('/codigo_estrada', mockCtx);
      assert(codigoOut.includes('120 km/h') && codigoOut !== FLEET_REDIRECT_MSG, '/codigo_estrada fica no Master Pessoal');

      const tccRedirect = await routeMessage('/tcc escolar', mockCtx);
      const tachoRedirect = await routeMessage('regras smart tacho gen 2', mockCtx);
      assert(tccRedirect === FLEET_REDIRECT_MSG && tachoRedirect === FLEET_REDIRECT_MSG, 'TCC e Smart Tacho devem redirecionar para @zeropaperfrotaBot');

      const agendaOut = await workerGeral.handle('/agenda amanhã às 15h Pediatra Carolina', mockCtx);
      assert(agendaOut.includes('Pediatra Carolina') && agendaOut.includes('calendar.google.com/calendar/render'), '/agenda deve gerar link Google Calendar');
      assert(!agendaOut.includes('@gmail.com'), '/agenda não deve expor email pessoal em claro (RGPD)');
      const icsOut = calendarHelperService.generateIcsContent('Vistoria Casa', new Date('2026-12-01T10:00:00Z'), 45);
      assert(icsOut.includes('BEGIN:VCALENDAR') && icsOut.includes('END:VCALENDAR'), 'ICS deve respeitar formato VCALENDAR');

      const mapaOut = await workerGeral.handle('/mapa', mockCtx);
      assert(mapaOut.includes('CARTOGRAFIA OFICIAL OSM DE AMARANTE') && mapaOut.includes('125'), '/mapa deve ler amarante.osm empacotado');

      const avalOut = await workerImmo.handle('/avaliacao 120 Amarante T3 bom', mockCtx);
      assert(avalOut.includes('CMVM') && avalOut.includes('OSM Amarante'), 'Avaliação em Amarante deve anexar infraestrutura OSM');

      const errReply = await safeExecute(async () => {
        throw new Error('Falha simulada TestWorker');
      }, 'TestWorker');
      assert(errReply.includes('Aviso temporário'), 'safeExecute deve conter exceção graciosamente');

      const errosList = await workerDev.handle('/erros', mockCtx);
      assert(errosList.includes('Falha simulada TestWorker'), 'safeExecute deve persistir erro em error_reports para /erros');

      const diagMock = await selfRefineEngine.diagnoseAndRefineError({
        filePath: path.join(ROOT_DIR, 'src/services/pladurService.js'),
        errorMessage: 'Erro mock de teste',
        errorStack: 'at mock:1:1',
        completionFn: async () => JSON.stringify({ rootCause: 'Mock cause', summary: 'Mock fix', patchedCode: '// ok' })
      });
      assert(diagMock.success && diagMock.rootCause === 'Mock cause', 'diagnoseAndRefineError deve funcionar via cascata determinística');

      const errosResolved = await workerDev.handle('/erros resolver', mockCtx);
      assert(errosResolved.includes('marcado(s) como resolvido(s)'), '/erros resolver deve encerrar relatórios abertos');

      const cloudStat = await cloudDevService.getCloudStatusReport({ measureNetwork: false });
      assert(cloudStat.includes('STATUS CLOUD-NATIVE') && cloudStat.includes('16 tabelas') && cloudStat.includes('Self-Refine'), 'Status Cloud deve manter contrato e reportar Self-Refine');

      const idxSrc = fs.readFileSync(path.join(ROOT_DIR, 'index.js'), 'utf-8');
      for (const cmd of ["'pladur'", "'erros'", "'agenda'", "'mapa'", "'codigo_estrada'", "'sri'", "'dl84'"]) {
        assert(idxSrc.includes(cmd), `index.js deve registar comando ${cmd}`);
      }
      const yamlSrc = fs.readFileSync(path.join(ROOT_DIR, 'render.yaml'), 'utf-8');
      assert(
        yamlSrc.includes('telegram-master-bot-0h2h.onrender.com') &&
        !yamlSrc.includes('name: zeropaper-frota-bot') &&
        !yamlSrc.includes('17bj'),
        'render.yaml do Master deve gerir apenas telegram-master-bot (0h2h) sem duplicar zeropaper-frota-bot nem 17bj'
      );
    });
  } finally {
    sqliteMasterDb.close();
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  }

  console.log('\n================================================================');
  console.log(`📊 RESULTADO DA BATERIA: ${passedCount} PASS | ${failedCount} FAIL`);
  console.log('================================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Erro fatal na bateria:', err);
  process.exit(1);
});
