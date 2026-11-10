// src/services/appFrotaService.js — Conector Supabase & Gestor de Dados do ZeroPaperFrota (AppFrota)
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('AppFrotaService');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bwibtpcunojmtnrnqpvg.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ3aWJ0cGN1bm9qbXRucm5xcHZnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4OTQxMDM3MywiZXhwIjoyMTA0OTg2MzczfQ.E7GEnfUf8TWnw3e0BN3mN_3tpzPN8nvcvjXv-5DwKYA';
export const APPFROTA_WEB_URL = process.env.APPFROTA_WEB_URL || 'https://appfrota-ten.vercel.app';

let supabase = null;
if (SUPABASE_URL && SUPABASE_KEY) {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false }
    });
    log.info('Cliente Supabase AppFrota inicializado com sucesso.');
  } catch (err) {
    log.error('Erro ao inicializar Supabase:', err.message);
  }
}

// Cache local de viaturas em memória (para matching instantâneo <1ms)
let viaturasCache = [];
let lastCacheUpdate = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

/**
 * Obtém a lista atualizada de viaturas
 */
export async function getViaturas(forceRefresh = false) {
  if (!supabase) return [];
  const now = Date.now();
  if (!forceRefresh && viaturasCache.length > 0 && now - lastCacheUpdate < CACHE_TTL_MS) {
    return viaturasCache;
  }

  try {
    const { data, error } = await supabase
      .from('viaturas')
      .select('id, matricula, marca_modelo, tipo, status, quilometragem, proxima_inspecao, proxima_revisao_km')
      .order('matricula', { ascending: true });

    if (error) throw error;
    viaturasCache = data || [];
    lastCacheUpdate = now;
    log.info(`Cache de viaturas atualizada: ${viaturasCache.length} viaturas carregadas.`);
    return viaturasCache;
  } catch (err) {
    log.error('Erro ao carregar viaturas do Supabase:', err.message);
    return viaturasCache;
  }
}

/**
 * Normaliza e encontra uma viatura por matrícula ou modelo
 * Suporta formatos: "39-HZ-66", "39 HZ 66", "39hz66", "HZ66", "Volvo", "Citaro", "Iveco", "Lion"
 */
export async function findViatura(query) {
  if (!query) return null;
  const list = await getViaturas();
  const qClean = String(query).toUpperCase().replace(/[^A-Z0-9]/g, '');

  // 1. Match exato de matrícula limpa (ex: 39HZ66)
  for (const v of list) {
    const vClean = v.matricula.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (vClean === qClean) return v;
  }

  // 2. Match parcial de matrícula (ex: "HZ-66" ou "HZ66")
  if (qClean.length >= 4) {
    for (const v of list) {
      const vClean = v.matricula.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (vClean.includes(qClean) || qClean.includes(vClean)) return v;
    }
  }

  // 3. Match por modelo ou tipo (ex: "Volvo", "Citaro", "Iveco", "MAN")
  const qLower = String(query).toLowerCase();
  for (const v of list) {
    const model = (v.marca_modelo || '').toLowerCase();
    const tipo = (v.tipo || '').toLowerCase();
    if (model.includes(qLower) || qLower.includes(model) || (tipo && tipo.includes(qLower))) {
      return v;
    }
  }

  return null;
}

/**
 * 1. REGISTAR QUILOMETRAGEM (Turno / Odómetro)
 * Atualiza a viatura e insere histórico em km_registos
 */
export async function registarKm({
  matricula,
  km,
  funcionario_nome = 'André Pinheiro',
  funcionario_num = '1688',
  observacoes = ''
}) {
  if (!supabase) return { success: false, error: 'Base de dados Supabase não configurada.' };

  const viatura = await findViatura(matricula);
  if (!viatura) {
    return { success: false, error: `Viatura com matrícula ou identificador "${matricula}" não encontrada.` };
  }

  const novoKm = parseInt(km, 10);
  if (isNaN(novoKm) || novoKm <= 0) {
    return { success: false, error: 'Quilometragem inválida fornecida.' };
  }

  const kmAnterior = viatura.quilometragem || 0;
  const diferenca = Math.max(0, novoKm - kmAnterior);
  const hoje = new Date().toISOString().split('T')[0];
  const agora = new Date().toISOString();

  try {
    // 1. Atualizar odómetro da viatura
    const { error: errViatura } = await supabase
      .from('viaturas')
      .update({ quilometragem: novoKm })
      .eq('id', viatura.id);

    if (errViatura) throw errViatura;

    // 2. Inserir registo detalhado em km_registos
    const { data: reg, error: errKm } = await supabase
      .from('km_registos')
      .insert({
        viatura: viatura.marca_modelo || viatura.matricula,
        matricula: viatura.matricula,
        km_inicio: kmAnterior,
        km_fim: novoKm,
        total: diferenca,
        observacoes: observacoes || 'Registo via Telegram Master Bot (ZeroPaperFrota)',
        nome_funcionario: funcionario_nome,
        numero_funcionario: String(funcionario_num),
        data: hoje,
        inicio_em: agora,
        fim_em: agora
      })
      .select()
      .single();

    if (errKm) log.warn('Aviso ao inserir em km_registos:', errKm.message);

    // Atualizar cache local
    viatura.quilometragem = novoKm;

    return {
      success: true,
      viatura,
      kmAnterior,
      novoKm,
      diferenca,
      regId: reg?.id
    };
  } catch (err) {
    log.error('Erro ao registar quilómetros no Supabase:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * 2. REGISTAR ANOMALIA / AVARIA / OFICINA
 * Insere em anomalias e coloca a viatura em manutenção se imobilizar
 */
export async function registarAnomalia({
  matricula,
  descricao,
  prioridade = 'Média',
  imobiliza = false,
  tipo = 'avaria',
  funcionario_nome = 'André Pinheiro',
  funcionario_num = '1688'
}) {
  if (!supabase) return { success: false, error: 'Base de dados Supabase não configurada.' };

  const viatura = await findViatura(matricula);
  const matriculaReal = viatura ? viatura.matricula : matricula;
  const hoje = new Date().toISOString().split('T')[0];

  try {
    const { data, error } = await supabase
      .from('anomalias')
      .insert({
        viatura_id: viatura?.id || null,
        matricula: matriculaReal,
        descricao: descricao || 'Anomalia reportada via Telegram',
        tipo,
        prioridade,
        estado: 'Pendente',
        imobiliza: Boolean(imobiliza),
        nome_funcionario: funcionario_nome,
        numero_funcionario: String(funcionario_num),
        data: hoje,
        resolvido: false
      })
      .select()
      .single();

    if (error) throw error;

    // Se a avaria imobilizar a viatura, atualizar status da viatura para 'manutencao'
    if (imobiliza && viatura) {
      await supabase
        .from('viaturas')
        .update({ status: 'manutencao' })
        .eq('id', viatura.id);
      viatura.status = 'manutencao';
    }

    return {
      success: true,
      anomalia: data,
      viatura
    };
  } catch (err) {
    log.error('Erro ao registar anomalia no Supabase:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * 3. REGISTAR HIGIENIZAÇÃO / LIMPEZA
 */
export async function registarHigienizacao({
  matricula,
  tipo = 'Desinfeção e Lavagem Completa',
  observacoes = ''
}) {
  if (!supabase) return { success: false, error: 'Base de dados Supabase não configurada.' };

  const viatura = await findViatura(matricula);
  if (!viatura) {
    return { success: false, error: `Viatura "${matricula}" não encontrada.` };
  }

  const hoje = new Date().toISOString().split('T')[0];

  try {
    const { data, error } = await supabase
      .from('higienizacoes')
      .insert({
        viatura_id: viatura.id,
        tipo,
        observacoes: observacoes || 'Higienização registada via Telegram',
        data_higienizacao: hoje,
        estado: 'Concluído'
      })
      .select()
      .single();

    if (error) throw error;

    return { success: true, higienizacao: data, viatura };
  } catch (err) {
    log.error('Erro ao registar higienização no Supabase:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * 4. REGISTAR CHECKLIST DIÁRIO
 */
export async function registarChecklist({
  matricula,
  observacoes = 'Verificação diária concluída sem anomalias.',
  concluido = true,
  dados = {}
}) {
  if (!supabase) return { success: false, error: 'Base de dados Supabase não configurada.' };

  const viatura = await findViatura(matricula);
  if (!viatura) {
    return { success: false, error: `Viatura "${matricula}" não encontrada.` };
  }

  try {
    const { data, error } = await supabase
      .from('checklists')
      .insert({
        viatura_id: viatura.id,
        observacoes,
        concluido: Boolean(concluido),
        quilometragem: viatura.quilometragem || null,
        dados
      })
      .select()
      .single();

    if (error) throw error;

    return { success: true, checklist: data, viatura };
  } catch (err) {
    log.error('Erro ao registar checklist no Supabase:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * 5. REGISTAR SERVIÇO / REPARAÇÃO DE OFICINA
 */
export async function registarServico({
  matricula,
  descricao,
  custo = 0,
  motorista = null
}) {
  if (!supabase) return { success: false, error: 'Base de dados Supabase não configurada.' };

  const viatura = await findViatura(matricula);
  if (!viatura) {
    return { success: false, error: `Viatura "${matricula}" não encontrada.` };
  }

  const hoje = new Date().toISOString().split('T')[0];

  try {
    const { data, error } = await supabase
      .from('servicos')
      .insert({
        viatura_id: viatura.id,
        descricao,
        custo: parseFloat(custo) || 0,
        data_servico: hoje,
        data: hoje,
        titulo: 'Serviço Operacional / Oficina',
        motorista
      })
      .select()
      .single();

    if (error) throw error;

    return { success: true, servico: data, viatura };
  } catch (err) {
    log.error('Erro ao registar serviço no Supabase:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * 6. ATUALIZAR STOCK DE PEÇAS E CONSUMÍVEIS
 */
export async function atualizarStock({
  item,
  quantidade = 1,
  operacao = 'adicionar' // 'adicionar' ou 'consumir'
}) {
  if (!supabase) return { success: false, error: 'Base de dados Supabase não configurada.' };

  try {
    const qClean = String(item).toLowerCase().trim();
    const { data: stockItems, error: errSearch } = await supabase
      .from('stock')
      .select('*');

    if (errSearch) throw errSearch;

    const matched = stockItems?.find(s => s.item.toLowerCase().includes(qClean) || qClean.includes(s.item.toLowerCase()));

    const qtdNum = Math.abs(parseInt(quantidade, 10)) || 1;

    if (matched) {
      const novaQtd = operacao === 'consumir'
        ? Math.max(0, matched.quantidade - qtdNum)
        : matched.quantidade + qtdNum;

      const { data, error } = await supabase
        .from('stock')
        .update({ quantidade: novaQtd, updated_at: new Date().toISOString() })
        .eq('id', matched.id)
        .select()
        .single();

      if (error) throw error;

      return {
        success: true,
        stock: data,
        itemNome: matched.item,
        anterior: matched.quantidade,
        novo: novaQtd,
        operacao
      };
    } else {
      // Criar novo item no stock
      const { data, error } = await supabase
        .from('stock')
        .insert({
          item,
          quantidade: qtdNum,
          minimo: 5
        })
        .select()
        .single();

      if (error) throw error;

      return {
        success: true,
        stock: data,
        itemNome: item,
        anterior: 0,
        novo: qtdNum,
        operacao: 'criado'
      };
    }
  } catch (err) {
    log.error('Erro ao atualizar stock no Supabase:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * 7. RELATÓRIO DO ESTADO ATUAL DA FROTA
 */
export async function getFrotaStatusReport() {
  const viaturas = await getViaturas(true);
  if (!viaturas || viaturas.length === 0) {
    return '⚠️ Não foi possível obter o estado da frota no Supabase.';
  }

  let pendentesAnomalias = [];
  try {
    const { data } = await supabase
      .from('anomalias')
      .select('matricula, descricao, prioridade, imobiliza')
      .eq('resolvido', false)
      .limit(10);
    pendentesAnomalias = data || [];
  } catch {}

  let texto = `🚛 *ZeroPaperFrota — Estado em Tempo Real:*\n`;
  texto += `Plataforma Web: [appfrota-ten.vercel.app](${APPFROTA_WEB_URL})\n\n`;

  let disponiveis = 0;
  let servico = 0;
  let oficina = 0;

  for (const v of viaturas) {
    const statusIcon = v.status === 'em_servico' ? '🟢' : v.status === 'manutencao' ? '🔴' : '🟡';
    if (v.status === 'em_servico') servico++;
    else if (v.status === 'manutencao') oficina++;
    else disponiveis++;

    texto += `${statusIcon} *${v.matricula}* (${v.marca_modelo || v.tipo || 'Viatura'})\n`;
    texto += `   • Odómetro: **${(v.quilometragem || 0).toLocaleString('pt-PT')} km**\n`;
    texto += `   • Estado: _${v.status || 'disponível'}_\n`;
    if (v.proxima_inspecao) texto += `   • Próx. Inspeção: ${v.proxima_inspecao}\n`;
  }

  texto += `\n📊 *Resumo Global:*\n`;
  texto += `• Total: **${viaturas.length} viaturas**\n`;
  texto += `• Em Serviço: **${servico}** | Disponíveis: **${disponiveis}** | Oficina: **${oficina}**\n`;

  if (pendentesAnomalias.length > 0) {
    texto += `\n⚠️ *Avarias / Anomalias Pendentes (${pendentesAnomalias.length}):*\n`;
    for (const a of pendentesAnomalias) {
      const imob = a.imobiliza ? '⛔ *IMOBILIZA*' : '⚠️';
      texto += `• ${imob} [${a.matricula || 'Geral'}]: ${a.descricao} (${a.prioridade})\n`;
    }
  }

  return texto;
}

export default {
  getViaturas,
  findViatura,
  registarKm,
  registarAnomalia,
  registarHigienizacao,
  registarChecklist,
  registarServico,
  atualizarStock,
  getFrotaStatusReport,
  APPFROTA_WEB_URL
};
