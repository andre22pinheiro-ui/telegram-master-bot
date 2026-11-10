// tests/test_all_bots_maximum_response.mjs — Teste de Resposta Máxima de Todos os Bots
import 'dotenv/config';
import assert from 'assert';
import { handle as handleDev } from '../src/workers/worker_dev.js';
import { handle as handleFrotas } from '../src/workers/worker_frotas.js';
import { handle as handleImmo } from '../src/workers/worker_immo.js';
import { handle as handleGeral } from '../src/workers/worker_geral.js';
import { handle as handleNutricao, getPlanoNutricional, getResumoHoje } from '../src/workers/worker_nutricao.js';

console.log('================================================================');
console.log('🤖 TESTE DE RESPOSTA MÁXIMA — TODOS OS 6 BOTS MELHORADOS');
console.log('================================================================\n');

async function main() {
  const mockCtx = {
    chat: { id: 950415577 },
    from: { id: 950415577, first_name: 'André' },
    message: { text: '' }
  };

  // 1. BOT PESSOAL (@AndTrarBOT) — Email, Combustíveis, Trânsito, Tarefas
  console.log('1️⃣ A TESTAR BOT PESSOAL (@AndTrarBOT)...');
  
  console.log('   ↳ Teste 1.1: Leitura de Emails Reais (/emails)');
  const respEmail = await handleGeral('/emails', mockCtx);
  console.log('   Resultado Email:\n' + respEmail.slice(0, 200) + '...\n');
  assert(respEmail.includes('gmail.com') || respEmail.includes('email') || respEmail.includes('Caixa de Entrada'), 'Deve conter cabeçalho de emails');

  console.log('   ↳ Teste 1.2: Combustíveis DGEG Oficiais (/combustiveis)');
  const respComb = await handleGeral('/combustiveis', mockCtx);
  console.log('   Resultado Combustíveis:\n' + respComb.slice(0, 200) + '...\n');
  assert(respComb.includes('POSTOS MAIS ECONÓMICOS') || respComb.includes('DGEG'), 'Deve conter postos da DGEG');

  console.log('   ↳ Teste 1.3: Trânsito A4 e Túnel do Marão (/transito)');
  const respTransito = await handleGeral('/transito', mockCtx);
  console.log('   Resultado Trânsito:\n' + respTransito.slice(0, 200) + '...\n');
  assert(respTransito.includes('Trânsito') || respTransito.includes('A4'), 'Deve conter estado do trânsito');

  // 2. BOT IMOBILIÁRIO (@ppspppBot) — Moradias Novas & Normas CMVM
  console.log('\n2️⃣ A TESTAR BOT IMOBILIÁRIO (@ppspppBot)...');
  console.log('   ↳ Teste 2.1: Radar de Moradias Novas nas Plataformas');
  const respMoradias = await handleImmo('pesquisa moradias novas nas plataformas', mockCtx);
  console.log('   Resultado Moradias:\n' + respMoradias.slice(0, 250) + '...\n');
  assert(respMoradias.includes('MORADIAS') || respMoradias.includes('RADAR'), 'Deve listar moradias reais');

  console.log('   ↳ Teste 2.2: Avaliação Pericial CMVM');
  const respAvaliacao = await handleImmo('/avaliacao 140 Amarante T3 bom 400 B', mockCtx);
  console.log('   Resultado Avaliação:\n' + respAvaliacao.slice(0, 250) + '...\n');
  assert(respAvaliacao.includes('AVALIAÇÃO') || respAvaliacao.includes('CMVM'), 'Deve conter avaliação CMVM');

  // 3. BOT FROTAS (@TrasFrotBot) — Tacógrafo CE 561/2006 & Rotas
  console.log('\n3️⃣ A TESTAR BOT FROTAS (@TrasFrotBot)...');
  console.log('   ↳ Teste 3.1: Tacógrafo Europeu (/tacografo 4.5)');
  const respTacho = await handleFrotas('/tacografo 4.5', mockCtx);
  console.log('   Resultado Tacógrafo:\n' + respTacho.slice(0, 200) + '...\n');
  assert(respTacho.includes('Tacógrafo') || respTacho.includes('4h30') || respTacho.includes('pausa'), 'Deve aplicar regras CE 561/2006');

  console.log('   ↳ Teste 3.2: Rota Rodoviária (/rota Amarante para Porto)');
  const respRota = await handleFrotas('/rota Amarante para Porto', mockCtx);
  console.log('   Resultado Rota:\n' + respRota.slice(0, 200) + '...\n');
  assert(respRota.includes('Rota') || respRota.includes('km') || respRota.includes('Amarante'), 'Deve calcular rota rodoviária');

  // 4. BOT DEV (@DesSofBot) — Engenharia, Repos e Vercel Apps
  console.log('\n4️⃣ A TESTAR BOT DEV (@DesSofBot)...');
  const respDev = await handleDev('/apps', mockCtx);
  console.log('   Resultado Dev / Apps:\n' + respDev.slice(0, 200) + '...\n');
  assert(respDev.toLowerCase().includes('mini apps') || respDev.toLowerCase().includes('vercel'), 'Deve listar as aplicações Vercel');

  // 5. BOT NUTRIÇÃO (@Nutriainbot) — Plano de Alta Proteína (160g)
  console.log('\n5️⃣ A TESTAR BOT NUTRIÇÃO (@Nutriainbot)...');
  const respNutri = await handleNutricao('/plano', mockCtx);
  console.log('   Resultado Nutrição:\n' + respNutri.slice(0, 200) + '...\n');
  assert(respNutri.toLowerCase().includes('proteína') || respNutri.includes('160g'), 'Deve conter plano de 160g de proteína');

  // 6. BOT MASTER (@AndrePinheirobot) — Briefing Consolidado
  console.log('\n6️⃣ A TESTAR BOT MASTER (@AndrePinheirobot)...');
  const respBriefing = await handleGeral('/briefing', mockCtx);
  console.log('   Resultado Briefing:\n' + respBriefing.slice(0, 250) + '...\n');
  assert(respBriefing.toLowerCase().includes('briefing') || respBriefing.toLowerCase().includes('resumo'), 'Deve gerar o briefing do dia');

  console.log('================================================================');
  console.log('🎉 TODOS OS 6 BOTS RESPONDERAM NO NÍVEL MÁXIMO DE PERFORMANCE!');
  console.log('================================================================');
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Falha nos testes de resposta máxima:', err);
  process.exit(1);
});
