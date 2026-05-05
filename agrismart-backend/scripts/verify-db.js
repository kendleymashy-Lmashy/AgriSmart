const { getConfig, requireMysql } = require('./mysql');

const requiredTables = [
  'users',
  'devices',
  'sensor_types',
  'sensor_readings',
  'calibration_settings',
  'system_settings',
  'pump_status',
  'pump_events',
  'irrigation_rules',
  'irrigation_schedules',
  'crops',
  'recommendation_history',
  'alerts',
  'daily_analytics',
  'device_commands',
];

async function main() {
  const mysql = requireMysql();
  const connection = await mysql.createConnection(getConfig());
  const [rows] = await connection.query('SHOW TABLES');
  await connection.end();

  const foundTables = new Set(rows.map((row) => Object.values(row)[0]));
  const missingTables = requiredTables.filter((table) => !foundTables.has(table));

  if (missingTables.length > 0) {
    console.error(`Missing tables: ${missingTables.join(', ')}`);
    process.exit(1);
  }

  console.log(`All required tables exist: ${requiredTables.join(', ')}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
