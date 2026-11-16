// tests/integration/iaNutricionistaService.test.mjs — Testes Unitários e de Integração da IA Nutricionista
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  estimatePortionsFromText,
  analyzeMealPhoto,
  confirmMealEvaluation,
  askNutritionist,
  formatMealAnalysisMarkdown,
  formatNutricionistaMenuMarkdown
} from '../../src/services/iaNutricionistaService.js';
import { sqliteMasterDb } from '../../src/shared/sqliteMasterDb.js';
import { getDailyNutritionSummary } from '../../src/services/nutritionCatalogService.js';

test('NUT-IA-01. estimatePortionsFromText extrai alimentos e calcula macros proporcionalmente', () => {
  const foods = estimatePortionsFromText('Almoço: peito de frango 200g com arroz 150g e brocolos');
  assert.ok(foods.length >= 3, 'Deve detetar frango, arroz e brócolos');

  const frango = foods.find((f) => f.alimento.includes('Frango'));
  assert.ok(frango, 'Deve conter frango');
  assert.equal(frango.porcaoG, 200);
  assert.equal(frango.proteinaG, 62); // 31 * 2

  const arroz = foods.find((f) => f.alimento.includes('Arroz'));
  assert.ok(arroz, 'Deve conter arroz');
  assert.equal(arroz.porcaoG, 150);
});

test('NUT-IA-02. analyzeMealPhoto avalia prato e persiste em SQLite WAL', async () => {
  const testUserId = `test_user_${Date.now()}`;
  const res = await analyzeMealPhoto({
    userCaption: 'Bife de lombo 250g com batata doce e salada',
    userId: testUserId
  });

  assert.ok(res.id);
  assert.ok(res.total_protein >= 50);
  assert.ok(res.total_calories > 200);
  assert.ok(res.feedback.length > 0);
  assert.equal(res.recorded_to_log, 0);

  const fromDb = sqliteMasterDb.getVisualEvaluation(res.id);
  assert.ok(fromDb);
  assert.equal(fromDb.total_protein, res.total_protein);
});

test('NUT-IA-03. confirmMealEvaluation credita macros no diário alimentar diário', async () => {
  const testUserId = `test_confirm_${Date.now()}`;
  const evalRes = await analyzeMealPhoto({
    userCaption: 'Salmão 200g com arroz',
    userId: testUserId
  });

  const confirmRes = confirmMealEvaluation(evalRes.id, testUserId);
  assert.equal(confirmRes.success, true);
  assert.equal(confirmRes.totalProtein, evalRes.total_protein);

  const summary = getDailyNutritionSummary(testUserId);
  assert.ok(summary.totals.protein >= evalRes.total_protein);

  // Segunda tentativa deve ser rejeitada para evitar contagem duplicada
  const dupRes = confirmMealEvaluation(evalRes.id, testUserId);
  assert.equal(dupRes.success, false);
});

test('NUT-IA-04. askNutritionist e Dicas Clínicas da Base de Dados', async () => {
  const tip = sqliteMasterDb.getDietTip('timing');
  assert.ok(tip);
  assert.ok(tip.title.includes('Leucine'));

  const ans = await askNutritionist('Como posso melhorar a síntese proteica?');
  assert.ok(ans.includes('NUTRICIONISTA VIRTUAL'));
  assert.ok(ans.includes('160g'));
});

test('NUT-IA-05. Formatadores Telegram Markdown', () => {
  const fakeEval = {
    id: 'eval_123',
    foodsDetected: [
      { alimento: 'Peito de Frango', porcaoG: 180, proteinaG: 55.8, calorias: 280, hcG: 0, gorduraG: 4.5 }
    ],
    total_protein: 55.8,
    total_calories: 280,
    total_carbs: 0,
    total_fat: 4.5,
    feedback: 'Excelente densidade proteica.',
    impact: {
      newTotalProtein: 95.8,
      targetProtein: 160,
      pctOfGoal: 60,
      remainingProtein: 64.2
    }
  };

  const md = formatMealAnalysisMarkdown(fakeEval);
  assert.ok(md.includes('ANÁLISE NUTRICIONAL DO PRATO'));
  assert.ok(md.includes('55.8g'));
  assert.ok(md.includes('/confirmar_refeicao eval_123'));

  const menu = formatNutricionistaMenuMarkdown();
  assert.ok(menu.includes('/analisar_refeicao'));
  assert.ok(menu.includes('/confirmar_refeicao'));
  assert.ok(menu.includes('/duvida_nutricao'));
});
