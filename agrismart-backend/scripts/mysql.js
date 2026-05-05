const fs = require('fs');
const path = require('path');

function loadEnvFile() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const equalsIndex = trimmed.indexOf('=');
    if (equalsIndex === -1) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed.slice(equalsIndex + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function getConfig({ includeDatabase = true } = {}) {
  loadEnvFile();

  const config = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true,
  };

  if (includeDatabase) {
    config.database = process.env.DB_NAME || 'agrismart';
  }

  return config;
}

function requireMysql() {
  try {
    return require('mysql2/promise');
  } catch (error) {
    console.error('Missing dependency: mysql2');
    console.error('Run: npm.cmd install');
    process.exit(1);
  }
}

function readSql(relativePath) {
  return fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');
}

module.exports = {
  getConfig,
  readSql,
  requireMysql,
};
