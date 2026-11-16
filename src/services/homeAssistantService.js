// src/services/homeAssistantService.js — Ponte de Domótica & Home Assistant Cloud-Native (ADR-044)
import axios from 'axios';
import { createLogger } from '../utils/logger.js';
import { sqliteMasterDb } from '../shared/sqliteMasterDb.js';

const log = createLogger('HomeAssistant');

const DEFAULT_TIMEOUT_MS = 5000;

export function getHassConfig() {
  const url = (process.env.HASS_URL || process.env.HOME_ASSISTANT_URL || '').replace(/\/$/, '');
  const token = process.env.HASS_TOKEN || process.env.HOME_ASSISTANT_TOKEN || '';
  return {
    isConfigured: Boolean(url && token),
    url,
    token
  };
}

/**
 * Invoca a REST API do Home Assistant se configurado; caso contrário, opera em modo SQLite WAL
 */
export async function callHassApi(endpoint, { method = 'GET', data = null, axiosClient = null } = {}) {
  const config = getHassConfig();
  if (!config.isConfigured) {
    return { live: false, note: 'Home Assistant Cloud Bridge em modo SQLite WAL (Offline/Local).' };
  }

  const http = axiosClient || axios;
  try {
    const res = await http({
      url: `${config.url}/api/${endpoint.replace(/^\//, '')}`,
      method,
      data,
      timeout: DEFAULT_TIMEOUT_MS,
      headers: {
        'Authorization': `Bearer ${config.token}`,
        'Content-Type': 'application/json'
      }
    });
    return { live: true, data: res.data };
  } catch (err) {
    log.warn(`[HomeAssistant] Erro ao contactar API REST (${endpoint}): ${err.message}. A recorrer a SQLite local.`);
    return { live: false, error: err.message };
  }
}

/**
 * Resolução amigável de nomes e aliases de luzes
 */
export function resolveLightEntityId(alias = '') {
  const clean = String(alias || '').toLowerCase().trim();
  const map = {
    sala: 'light.sala',
    estar: 'light.sala',
    cozinha: 'light.cozinha',
    quarto: 'light.quarto_casal',
    casal: 'light.quarto_casal',
    carolina: 'light.quarto_carolina',
    bebe: 'light.quarto_carolina',
    presenca: 'light.presenca_bebe',
    noite: 'light.presenca_bebe'
  };

  if (map[clean]) return map[clean];
  if (clean.startsWith('light.')) return clean;
  return `light.${clean}`;
}

/**
 * Controlo de Iluminação com suporte a ligar, desligar, toggle e "todas"
 */
export async function controlLight(target, action = 'toggle', { brightness = null, caller = 'telegram_bot', axiosClient = null } = {}) {
  const cleanTarget = String(target || '').toLowerCase().trim();
  const cleanAction = String(action || 'toggle').toLowerCase().trim();

  // Caso especial: Todas as luzes
  if (['todas', 'tudo', 'todas_luzes', 'all'].includes(cleanTarget)) {
    const allLights = sqliteMasterDb.listHomeEntities('light');
    const newState = cleanAction === 'on' || cleanAction === 'ligar' ? 'on' : 'off';
    const updated = [];

    for (const light of allLights) {
      sqliteMasterDb.updateHomeEntityState(light.entity_id, newState, brightness ? { brightness } : null);
      sqliteMasterDb.logHomeEvent({
        entityId: light.entity_id,
        service: newState === 'on' ? 'turn_on' : 'turn_off',
        caller,
        status: 'ok',
        details: `Comando geral: ${newState}`
      });
      updated.push({ entity_id: light.entity_id, state: newState });
    }

    // Tentar propagar para API externa se configurada
    callHassApi('services/light/' + (newState === 'on' ? 'turn_on' : 'turn_off'), {
      method: 'POST',
      data: { entity_id: 'all' },
      axiosClient
    }).catch(() => {});

    return {
      success: true,
      all: true,
      state: newState,
      count: updated.length,
      lights: updated
    };
  }

  const entityId = resolveLightEntityId(cleanTarget);
  const current = sqliteMasterDb.getHomeEntity(entityId);
  if (!current) {
    return {
      success: false,
      error: `Entidade de iluminação \`${entityId}\` não encontrada.`
    };
  }

  let finalState = 'on';
  if (cleanAction === 'off' || cleanAction === 'desligar' || cleanAction === 'apagar') {
    finalState = 'off';
  } else if (cleanAction === 'on' || cleanAction === 'ligar' || cleanAction === 'acender') {
    finalState = 'on';
  } else if (cleanAction === 'toggle') {
    finalState = current.state === 'on' ? 'off' : 'on';
  }

  const attrs = brightness !== null ? { brightness: Number(brightness) } : current.attributes;
  const updatedEntity = sqliteMasterDb.updateHomeEntityState(entityId, finalState, attrs);

  sqliteMasterDb.logHomeEvent({
    entityId,
    service: finalState === 'on' ? 'turn_on' : 'turn_off',
    caller,
    status: 'ok',
    details: `Estado alterado para ${finalState}`
  });

  // Notificar Home Assistant REST API se disponível
  callHassApi('services/light/' + (finalState === 'on' ? 'turn_on' : 'turn_off'), {
    method: 'POST',
    data: { entity_id: entityId, ...(brightness ? { brightness } : {}) },
    axiosClient
  }).catch(() => {});

  return {
    success: true,
    entity: updatedEntity,
    state: finalState
  };
}

/**
 * Controlo de Climatização (Ar Condicionado / Aquecedores)
 */
export async function controlClimate(target, { targetTemperature = null, hvacMode = null, caller = 'telegram_bot', axiosClient = null } = {}) {
  const cleanTarget = String(target || 'quarto_carolina').toLowerCase().trim();
  let entityId = cleanTarget.startsWith('climate.') ? cleanTarget : `climate.${cleanTarget}`;
  if (cleanTarget === 'bebe' || cleanTarget === 'carolina' || cleanTarget === 'quarto') {
    entityId = 'climate.quarto_carolina';
  } else if (cleanTarget === 'sala') {
    entityId = 'climate.sala';
  }

  const current = sqliteMasterDb.getHomeEntity(entityId);
  if (!current) {
    return { success: false, error: `Dispositivo de climatização \`${entityId}\` não encontrado.` };
  }

  const attrs = { ...current.attributes };
  let finalState = current.state;

  if (targetTemperature !== null) {
    const tempNum = Number(targetTemperature);
    if (!isNaN(tempNum) && tempNum >= 16 && tempNum <= 28) {
      attrs.target_temperature = tempNum;
    }
  }

  if (hvacMode) {
    const mode = String(hvacMode).toLowerCase().trim();
    if (['off', 'heat', 'cool', 'auto'].includes(mode)) {
      attrs.hvac_mode = mode;
      finalState = mode;
    }
  }

  const updatedEntity = sqliteMasterDb.updateHomeEntityState(entityId, finalState, attrs);
  sqliteMasterDb.logHomeEvent({
    entityId,
    service: 'set_climate',
    caller,
    status: 'ok',
    details: `Temp: ${attrs.target_temperature || 'inalterada'}°C | Modo: ${finalState}`
  });

  // Disparo assíncrono para Home Assistant externo
  if (attrs.target_temperature) {
    callHassApi('services/climate/set_temperature', {
      method: 'POST',
      data: { entity_id: entityId, temperature: attrs.target_temperature },
      axiosClient
    }).catch(() => {});
  }

  return {
    success: true,
    entity: updatedEntity,
    targetTemperature: attrs.target_temperature,
    hvacMode: finalState
  };
}

/**
 * Disparo de Cenários Residenciais Predefinidos (Noite, Bom Dia, Sair, Cinema)
 */
export async function triggerScene(sceneId, { caller = 'telegram_bot', axiosClient = null } = {}) {
  const cleanId = String(sceneId || '').toLowerCase().trim();
  const scene = sqliteMasterDb.getHomeScene(cleanId);
  if (!scene) {
    const available = sqliteMasterDb.listHomeScenes().map((s) => `\`${s.id}\``).join(', ');
    return {
      success: false,
      error: `Cenário \`${cleanId}\` não reconhecido. Disponíveis: ${available}`
    };
  }

  const executedActions = [];
  for (const act of scene.actions) {
    const { entity_id, service, data } = act;
    if (entity_id.startsWith('light.')) {
      const state = service === 'turn_on' ? 'on' : 'off';
      sqliteMasterDb.updateHomeEntityState(entity_id, state, data || null);
      executedActions.push({ entity_id, state });
    } else if (entity_id.startsWith('climate.')) {
      if (service === 'set_temperature' && data?.temperature) {
        sqliteMasterDb.updateHomeEntityState(entity_id, 'heat', { target_temperature: data.temperature });
        executedActions.push({ entity_id, target_temperature: data.temperature });
      } else if (service === 'turn_off') {
        sqliteMasterDb.updateHomeEntityState(entity_id, 'off', { hvac_mode: 'off' });
        executedActions.push({ entity_id, state: 'off' });
      }
    }
  }

  sqliteMasterDb.logHomeEvent({
    entityId: `scene.${scene.id}`,
    service: 'turn_on',
    caller,
    status: 'ok',
    details: `Cenário "${scene.name}" ativado com ${executedActions.length} ações.`
  });

  // Tentar chamar API externa se conectada
  callHassApi(`services/scene/turn_on`, {
    method: 'POST',
    data: { entity_id: `scene.${scene.id}` },
    axiosClient
  }).catch(() => {});

  return {
    success: true,
    scene,
    actionsCount: executedActions.length,
    actions: executedActions
  };
}

/**
 * Relatório Específico de Conforto e Segurança do Quarto da Carolina (Bebé)
 */
export function getBabyRoomComfortReport() {
  const temp = sqliteMasterDb.getHomeEntity('sensor.temperatura_quarto_carolina');
  const hum = sqliteMasterDb.getHomeEntity('sensor.humidade_quarto_carolina');
  const air = sqliteMasterDb.getHomeEntity('sensor.qualidade_ar_quarto');
  const light = sqliteMasterDb.getHomeEntity('light.quarto_carolina');
  const nightLight = sqliteMasterDb.getHomeEntity('light.presenca_bebe');
  const windowSensor = sqliteMasterDb.getHomeEntity('binary_sensor.janela_quarto_carolina');
  const climate = sqliteMasterDb.getHomeEntity('climate.quarto_carolina');

  const tempVal = Number(temp?.state || 20.4);
  const humVal = Number(hum?.state || 52);

  let tempStatus = 'ideal';
  let tempAlert = null;
  if (tempVal < 18.5) {
    tempStatus = 'frio';
    tempAlert = '⚠️ Temperatura abaixo do recomendado (<18.5°C). Considere ativar climatização.';
  } else if (tempVal > 22.0) {
    tempStatus = 'quente';
    tempAlert = '⚠️ Temperatura acima do ideal (>22°C). Ventile ou reduza aquecimento.';
  }

  let humStatus = 'ideal';
  let humAlert = null;
  if (humVal < 40) {
    humStatus = 'seco';
    humAlert = '⚠️ Ar seco (<40%). Recomendado ligar humidificador.';
  } else if (humVal > 65) {
    humStatus = 'humido';
    humAlert = '⚠️ Humidade elevada (>65%). Ventile o quarto.';
  }

  return {
    temperature: tempVal,
    tempStatus,
    tempAlert,
    humidity: humVal,
    humStatus,
    humAlert,
    airQuality: air?.state || 'excelente',
    lightState: light?.state || 'off',
    nightLightState: nightLight?.state || 'off',
    windowOpen: windowSensor?.state === 'on',
    climateState: climate?.state || 'off',
    targetTemp: climate?.attributes?.target_temperature || 20.5
  };
}

// ─── FORMATADORES TELEGRAM MARKDOWN ──────────────────────────────────────────

/**
 * Visão Geral Residencial (/casa ou /domotica)
 */
export function formatHomeOverviewMarkdown() {
  const summary = sqliteMasterDb.getHomeSummary();
  const baby = getBabyRoomComfortReport();
  const config = getHassConfig();
  const bridgeStatus = config.isConfigured ? '🟢 Conectado (Nabu Casa / REST)' : '⚡ SQLite WAL (Cloud-Native)';

  let msg = `🏠 *PAINEL RESIDENCIAL & DOMÓTICA*\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `📡 *Ponte:* _${bridgeStatus}_\n\n`;

  // Iluminação
  msg += `💡 *Iluminação:* \`${summary.lightsOn}/${summary.totalLights}\` luzes acesas\n`;
  const lights = sqliteMasterDb.listHomeEntities('light');
  lights.forEach((l) => {
    const icon = l.state === 'on' ? '🟡' : '⚪';
    msg += `  ${icon} *${l.friendly_name}:* \`${l.state.toUpperCase()}\`\n`;
  });

  // Conforto Bebé (Carolina)
  msg += `\n👶 *Quarto da Carolina (Conforto Bebé):*\n`;
  msg += `  🌡️ *Temperatura:* \`${baby.temperature}°C\` (${baby.tempStatus === 'ideal' ? '✅ Ideal 19-21°C' : baby.tempStatus})\n`;
  msg += `  💧 *Humidade:* \`${baby.humidity}%\` (${baby.humStatus === 'ideal' ? '✅ Ideal 45-60%' : baby.humStatus})\n`;
  msg += `  🌙 *Luz de Presença:* \`${baby.nightLightState.toUpperCase()}\`\n`;
  msg += `  🪟 *Janela:* \`${baby.windowOpen ? 'ABERTA ⚠️' : 'FECHADA ✅'}\`\n`;
  if (baby.tempAlert) msg += `  ↳ ${baby.tempAlert}\n`;
  if (baby.humAlert) msg += `  ↳ ${baby.humAlert}\n`;

  // Segurança
  msg += `\n🚪 *Segurança & Portas:*\n`;
  msg += `  • *Porta de Entrada:* \`${summary.doorOpen ? 'ABERTA ⚠️' : 'FECHADA ✅'}\`\n`;

  // Cenários
  msg += `\n🎬 *Cenários Rápidos:*\n`;
  msg += `• \`/cenario noite\` — Desliga casa e prepara quarto da Carolina\n`;
  msg += `• \`/cenario bom_dia\` — Liga luzes da cozinha e sala\n`;
  msg += `• \`/cenario sair\` — Desliga tudo ao sair de casa\n`;
  msg += `• \`/cenario cinema\` — Luz da sala a 15%\n\n`;
  msg += `⚡ *Comandos Rápidos:* \`/luz <on|off|sala|quarto|tudo>\` | \`/clima 21\` | \`/carolina_quarto\``;

  return msg;
}

/**
 * Formatação do Relatório Específico da Carolina
 */
export function formatBabyComfortMarkdown() {
  const b = getBabyRoomComfortReport();
  let msg = `👶 *MONITOR DE CONFORTO: QUARTO DA CAROLINA*\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `🌡️ *Temperatura Atual:* \`${b.temperature}°C\` (Alvo: \`${b.targetTemp}°C\`)\n`;
  msg += `💧 *Humidade Relativa:* \`${b.humidity}%\`\n`;
  msg += `🍃 *Qualidade do Ar:* \`${b.airQuality.toUpperCase()}\`\n`;
  msg += `💡 *Iluminação Principal:* \`${b.lightState.toUpperCase()}\`\n`;
  msg += `🌙 *Luz Noturna Suave:* \`${b.nightLightState.toUpperCase()}\`\n`;
  msg += `🪟 *Janela:* \`${b.windowOpen ? 'Aberta ⚠️' : 'Fechada ✅'}\`\n\n`;

  if (b.tempStatus === 'ideal' && b.humStatus === 'ideal' && !b.windowOpen) {
    msg += `✅ *Condições Ótimas:* O ambiente está ideal para o descanso e segurança da Carolina.\n`;
  } else {
    msg += `⚠️ *Avisos Ativos:*\n`;
    if (b.tempAlert) msg += `• ${b.tempAlert}\n`;
    if (b.humAlert) msg += `• ${b.humAlert}\n`;
    if (b.windowOpen) msg += `• Janela aberta pode causar correntes de ar.\n`;
  }

  msg += `\n_Ajuste rápido com \`/clima bebe 20.5\` ou \`/cenario noite\`._`;
  return msg;
}

/**
 * Menu Geral /hass
 */
export function formatHassMenuMarkdown() {
  return (
    `🏠 *HOME ASSISTANT & DOMÓTICA INTELIGENTE (ADR-044)*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `Gestão residencial e automação sem dependência de hardware local pesado:\n\n` +
    `🔹 \`/casa\` ou \`/domotica\` — Painel geral de estados e sensores\n` +
    `🔹 \`/luz <on|off|toggle> [local]\` — Controlo de iluminação (ex: \`/luz sala off\`, \`/luz tudo off\`)\n` +
    `🔹 \`/clima [local] [temperatura]\` — Climatização (ex: \`/clima bebe 20.5\`, \`/clima sala off\`)\n` +
    `🔹 \`/cenario <noite|bom_dia|sair|cinema>\` — Ativação de cenários integrados\n` +
    `🔹 \`/carolina_quarto\` — Estado de conforto e sensores do bebé\n` +
    `🔹 \`/hass entidades [dominio]\` — Listar dispositivos e sensores\n\n` +
    `🔒 _Persistência determinística em SQLite WAL (\`home_entities\`) com sincronização cloud._`
  );
}

export default {
  getHassConfig,
  callHassApi,
  resolveLightEntityId,
  controlLight,
  controlClimate,
  triggerScene,
  getBabyRoomComfortReport,
  formatHomeOverviewMarkdown,
  formatBabyComfortMarkdown,
  formatHassMenuMarkdown
};
