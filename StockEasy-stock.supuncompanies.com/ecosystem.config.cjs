module.exports = {
  apps: [{
    name: "stockeasy",
    script: "server/server.js",
    cwd: __dirname,
    instances: 1,
    exec_mode: "fork",
    autorestart: true,
    max_memory_restart: "500M",
    env: {
      NODE_ENV: "production",
      STOCKEASY_HOST: "127.0.0.1",
      PORT: "3001",
      COOKIE_SECURE: "1",
      STOCKEASY_DB_PATH: "/var/lib/stockeasy/stockeasy.db"
    }
  }]
};
