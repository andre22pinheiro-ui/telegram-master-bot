// src/utils/logger.js — Logger partilhado com timestamps

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info;

function timestamp() {
  return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

function format(level, module, message, data) {
  const prefix = `[${timestamp()}] [${level.toUpperCase()}] [${module}]`;
  if (data !== undefined) {
    const extra = typeof data === 'object' ? JSON.stringify(data, null, 2) : data;
    return `${prefix} ${message} | ${extra}`;
  }
  return `${prefix} ${message}`;
}

export function createLogger(module) {
  return {
    info: (msg, data) => {
      if (currentLevel >= LEVELS.info) console.log(format('info', module, msg, data));
    },
    warn: (msg, data) => {
      if (currentLevel >= LEVELS.warn) console.warn(format('warn', module, msg, data));
    },
    error: (msg, data) => {
      if (currentLevel >= LEVELS.error) console.error(format('error', module, msg, data));
    },
    debug: (msg, data) => {
      if (currentLevel >= LEVELS.debug) console.debug(format('debug', module, msg, data));
    },
  };
}

export default createLogger;

