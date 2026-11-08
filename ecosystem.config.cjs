// ecosystem.config.cjs — PM2 configuration (CommonJS obrigatório para PM2)
module.exports = {
  apps: [
    {
      name: 'telegram-master-bot',
      script: 'index.js',
      interpreter: 'node',
      interpreter_args: '--experimental-vm-modules',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '350M',
      restart_delay: 3000,
      kill_timeout: 4000,
      max_restarts: 20,
      env: {
        NODE_ENV: 'production',
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      out_file: './logs/bot-out.log',
      error_file: './logs/bot-error.log',
      merge_logs: true,
    },
  ],
};

