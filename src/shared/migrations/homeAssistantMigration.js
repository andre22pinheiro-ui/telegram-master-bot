// src/shared/migrations/homeAssistantMigration.js — Migração Home Assistant & Domótica Cloud-Native (ADR-044)
import { createLogger } from '../../utils/logger.js';

const log = createLogger('HomeAssistantMigration');

/**
 * Cria tabelas de domótica, entidades, cenários e registo de eventos (ADR-044)
 * @param {import('better-sqlite3').Database} db
 */
export function applyHomeAssistantMigration(db) {
  try {
    db.exec(`
      -- 1. home_entities: Registo persistente de entidades e estados
      CREATE TABLE IF NOT EXISTS home_entities (
        entity_id TEXT PRIMARY KEY,
        domain TEXT NOT NULL,
        friendly_name TEXT NOT NULL,
        state TEXT NOT NULL,
        unit_of_measurement TEXT,
        attributes_json TEXT DEFAULT '{}',
        last_changed TEXT NOT NULL,
        last_updated TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_home_domain ON home_entities(domain);
      CREATE INDEX IF NOT EXISTS idx_home_state ON home_entities(state);

      -- 2. home_scenes: Cenários residenciais predefinidos
      CREATE TABLE IF NOT EXISTS home_scenes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        actions_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      -- 3. home_events_log: Auditoria de comandos e telemetria
      CREATE TABLE IF NOT EXISTS home_events_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_id TEXT NOT NULL,
        service TEXT NOT NULL,
        caller TEXT DEFAULT 'telegram_bot',
        status TEXT DEFAULT 'ok',
        details TEXT,
        timestamp TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_home_events_time ON home_events_log(timestamp DESC);
    `);

    // Inserir entidades canónicas iniciais se tabela estiver vazia
    const count = db.prepare('SELECT COUNT(*) as c FROM home_entities').get().c;
    if (count === 0) {
      const now = new Date().toISOString();
      const insertEntity = db.prepare(`
        INSERT INTO home_entities (entity_id, domain, friendly_name, state, unit_of_measurement, attributes_json, last_changed, last_updated)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      // Iluminação
      insertEntity.run('light.sala', 'light', 'Luz da Sala', 'off', null, JSON.stringify({ brightness: 255, supported_color_modes: ['brightness'] }), now, now);
      insertEntity.run('light.cozinha', 'light', 'Luz da Cozinha', 'off', null, JSON.stringify({ brightness: 255 }), now, now);
      insertEntity.run('light.quarto_casal', 'light', 'Luz Quarto Casal', 'off', null, JSON.stringify({ brightness: 255 }), now, now);
      insertEntity.run('light.quarto_carolina', 'light', 'Luz Quarto Carolina', 'off', null, JSON.stringify({ brightness: 200 }), now, now);
      insertEntity.run('light.presenca_bebe', 'light', 'Luz de Presença Bebé', 'off', null, JSON.stringify({ brightness: 30, color: 'warm_white' }), now, now);

      // Interruptores & Climatização
      insertEntity.run('switch.aquecedor_toalhas', 'switch', 'Aquecedor de Toalhas', 'off', null, JSON.stringify({ power_w: 0 }), now, now);
      insertEntity.run('climate.quarto_carolina', 'climate', 'Climatização Quarto Bebé', 'heat', '°C', JSON.stringify({ current_temperature: 20.4, target_temperature: 20.5, hvac_mode: 'heat' }), now, now);
      insertEntity.run('climate.sala', 'climate', 'Ar Condicionado Sala', 'off', '°C', JSON.stringify({ current_temperature: 21.0, target_temperature: 22.0, hvac_mode: 'off' }), now, now);

      // Sensores de Conforto Bebé (Carolina) & Segurança
      insertEntity.run('sensor.temperatura_quarto_carolina', 'sensor', 'Temperatura Quarto Carolina', '20.4', '°C', JSON.stringify({ ideal_min: 19.0, ideal_max: 21.5 }), now, now);
      insertEntity.run('sensor.humidade_quarto_carolina', 'sensor', 'Humidade Quarto Carolina', '52', '%', JSON.stringify({ ideal_min: 45, ideal_max: 60 }), now, now);
      insertEntity.run('sensor.qualidade_ar_quarto', 'sensor', 'Qualidade do Ar Quarto Bebé', 'excelente', null, JSON.stringify({ pm25: 5, co2: 480 }), now, now);
      insertEntity.run('binary_sensor.porta_entrada', 'binary_sensor', 'Porta de Entrada', 'off', null, JSON.stringify({ device_class: 'door' }), now, now);
      insertEntity.run('binary_sensor.janela_quarto_carolina', 'binary_sensor', 'Janela Quarto Carolina', 'off', null, JSON.stringify({ device_class: 'window' }), now, now);

      // Inserir cenários predefinidos
      const insertScene = db.prepare(`
        INSERT INTO home_scenes (id, name, description, actions_json, created_at)
        VALUES (?, ?, ?, ?, ?)
      `);

      insertScene.run(
        'noite',
        'Modo Noturno (Descanso Bebé)',
        'Desliga todas as luzes principais, ativa luz de presença suave e ajusta climatização do quarto a 20.0°C',
        JSON.stringify([
          { entity_id: 'light.sala', service: 'turn_off' },
          { entity_id: 'light.cozinha', service: 'turn_off' },
          { entity_id: 'light.quarto_casal', service: 'turn_off' },
          { entity_id: 'light.quarto_carolina', service: 'turn_off' },
          { entity_id: 'light.presenca_bebe', service: 'turn_on', data: { brightness: 25 } },
          { entity_id: 'climate.quarto_carolina', service: 'set_temperature', data: { temperature: 20.0 } }
        ]),
        now
      );

      insertScene.run(
        'bom_dia',
        'Bom Dia Família',
        'Liga luzes da cozinha e sala, desliga luz de presença e verifica temperatura',
        JSON.stringify([
          { entity_id: 'light.cozinha', service: 'turn_on' },
          { entity_id: 'light.sala', service: 'turn_on' },
          { entity_id: 'light.presenca_bebe', service: 'turn_off' },
          { entity_id: 'climate.quarto_carolina', service: 'set_temperature', data: { temperature: 21.0 } }
        ]),
        now
      );

      insertScene.run(
        'sair_de_casa',
        'Saída de Casa',
        'Desliga todas as iluminações e coloca climatizações em modo eco',
        JSON.stringify([
          { entity_id: 'light.sala', service: 'turn_off' },
          { entity_id: 'light.cozinha', service: 'turn_off' },
          { entity_id: 'light.quarto_casal', service: 'turn_off' },
          { entity_id: 'light.quarto_carolina', service: 'turn_off' },
          { entity_id: 'light.presenca_bebe', service: 'turn_off' },
          { entity_id: 'climate.sala', service: 'turn_off' },
          { entity_id: 'climate.quarto_carolina', service: 'set_temperature', data: { temperature: 19.0 } }
        ]),
        now
      );

      insertScene.run(
        'cinema',
        'Modo Cinema na Sala',
        'Reduz luz da sala para 15% e desliga luzes adjacentes',
        JSON.stringify([
          { entity_id: 'light.sala', service: 'turn_on', data: { brightness: 38 } },
          { entity_id: 'light.cozinha', service: 'turn_off' }
        ]),
        now
      );

      log.info('Entidades e cenários canónicos de domótica inseridos com sucesso.');
    }

    log.info('Migração Home Assistant aplicada com sucesso.');
  } catch (err) {
    log.error('Erro ao aplicar migração Home Assistant:', err.message);
  }
}

export default {
  applyHomeAssistantMigration
};
