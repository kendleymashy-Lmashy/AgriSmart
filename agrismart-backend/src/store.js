const fs = require('fs');
const path = require('path');
const { loadEnv } = require('./env');
const { defaultCropRules } = require('./recommendationEngine');

loadEnv();

const defaultDbPath = path.resolve(__dirname, '..', 'data', 'db.json');
const dbPath = path.resolve(process.cwd(), process.env.DB_FILE || defaultDbPath);
const storeDriver = (process.env.DB_DRIVER || 'json').toLowerCase();
const defaultDeviceUid = process.env.DEVICE_UID || 'AGRISMART-NODE-01';

const now = () => new Date().toISOString();

function seedData() {
  return {
    sensors: [
      { id: '1', type: 'soil_moisture', value: 32, unit: '%', timestamp: now(), status: 'warning', rawValue: 1024 },
      { id: '2', type: 'temperature', value: 27.5, unit: 'C', timestamp: now(), status: 'normal' },
      { id: '3', type: 'humidity', value: 58, unit: '%', timestamp: now(), status: 'normal' },
    ],
    calibration: {
      soilThreshold: { dry: 20, wet: 80 },
    },
    pump: {
      id: '1',
      isRunning: true,
      mode: 'automatic',
      uptime: 120,
      power: 5,
      lastCommand: 'start',
      updatedAt: now(),
    },
    settings: {
      deviceName: 'AgriSmart Node-01',
      location: 'Harare, Zimbabwe',
      batteryLevel: 87,
      firmwareVersion: 'v1.0.4',
      uptime: 2592000,
      autoMode: true,
      irrigationThreshold: 30,
      timezone: 'Africa/Harare',
      unitSystem: 'Metric',
    },
    alerts: [
      {
        id: '1',
        type: 'critical',
        title: 'Soil Moisture Low',
        message: 'Soil moisture is below the threshold (20%).',
        timestamp: new Date(Date.now() - 2 * 60000).toISOString(),
        isRead: false,
      },
      {
        id: '2',
        type: 'warning',
        title: 'Battery Level Medium',
        message: 'Battery level is below 50%.',
        timestamp: new Date(Date.now() - 3 * 60 * 60000).toISOString(),
        isRead: false,
      },
      {
        id: '3',
        type: 'info',
        title: 'Irrigation Completed',
        message: 'Scheduled irrigation completed.',
        timestamp: new Date(Date.now() - 24 * 60 * 60000).toISOString(),
        isRead: true,
      },
    ],
    history: [
      { date: 'May 1', soilMoisture: 28, temperature: 25, humidity: 55, pumpUsage: 45 },
      { date: 'May 2', soilMoisture: 32, temperature: 26, humidity: 58, pumpUsage: 35 },
      { date: 'May 3', soilMoisture: 35, temperature: 27, humidity: 60, pumpUsage: 40 },
      { date: 'May 4', soilMoisture: 30, temperature: 28, humidity: 62, pumpUsage: 50 },
      { date: 'May 5', soilMoisture: 25, temperature: 27.5, humidity: 58, pumpUsage: 55 },
      { date: 'May 6', soilMoisture: 32, temperature: 26.5, humidity: 59, pumpUsage: 38 },
      { date: 'May 7', soilMoisture: 38, temperature: 25.5, humidity: 57, pumpUsage: 25 },
    ],
    crops: defaultCropRules,
  };
}

function ensureJsonDb() {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify(seedData(), null, 2));
  }
}

function readJsonDb() {
  ensureJsonDb();
  return JSON.parse(fs.readFileSync(dbPath, 'utf8'));
}

function writeJsonDb(data) {
  ensureJsonDb();
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
  return data;
}

let pool;

function mysqlConfig() {
  return {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'agrismart',
    waitForConnections: true,
    connectionLimit: 10,
  };
}

function getPool() {
  if (!pool) {
    const mysql = require('mysql2/promise');
    pool = mysql.createPool(mysqlConfig());
  }

  return pool;
}

function toIso(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function formatDay(value) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric' });
}

function dateForHistoryIndex(index, total) {
  const date = new Date();
  date.setDate(date.getDate() - (total - index - 1));
  return date.toISOString().slice(0, 10);
}

async function getDevice(connection) {
  const [rows] = await connection.query('SELECT * FROM devices WHERE device_uid = ? LIMIT 1', [defaultDeviceUid]);

  if (rows.length === 0) {
    throw new Error(`Device ${defaultDeviceUid} was not found. Run: npm.cmd run db:setup`);
  }

  return rows[0];
}

async function readMysqlDb() {
  const connection = await getPool().getConnection();
  try {
    const device = await getDevice(connection);

    const [settingsRows] = await connection.query('SELECT * FROM system_settings WHERE device_id = ? LIMIT 1', [device.id]);
    const [calibrationRows] = await connection.query('SELECT * FROM calibration_settings WHERE device_id = ? LIMIT 1', [device.id]);
    const [pumpRows] = await connection.query('SELECT * FROM pump_status WHERE device_id = ? LIMIT 1', [device.id]);
    const [sensorRows] = await connection.query(
      `SELECT sr.id, st.code, st.unit, sr.value, sr.raw_value, sr.status, sr.recorded_at
       FROM sensor_readings sr
       JOIN sensor_types st ON st.id = sr.sensor_type_id
       WHERE sr.device_id = ?
       ORDER BY sr.recorded_at ASC, sr.id ASC
       LIMIT 500`,
      [device.id]
    );
    const [alertRows] = await connection.query(
      `SELECT id, type, title, message, is_read, created_at
       FROM alerts
       WHERE device_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT 50`,
      [device.id]
    );
    const [historyRows] = await connection.query(
      `SELECT date, avg_soil_moisture, avg_temperature, avg_humidity, pump_usage_minutes
       FROM daily_analytics
       WHERE device_id = ?
       ORDER BY date ASC
       LIMIT 90`,
      [device.id]
    );
    const [cropRows] = await connection.query(
      `SELECT id, name, best_season, water_requirement_liters, yield_expectation,
              min_soil_moisture, max_soil_moisture, min_temperature, max_temperature,
              min_humidity, max_humidity, reason
       FROM crops
       ORDER BY name ASC`
    );

    const settings = settingsRows[0] || {};
    const calibration = calibrationRows[0] || {};
    const pump = pumpRows[0] || {};

    return {
      sensors: sensorRows.map((row) => ({
        id: String(row.id),
        type: row.code,
        value: toNumber(row.value),
        unit: row.unit,
        timestamp: toIso(row.recorded_at),
        status: row.status,
        ...(row.raw_value === null ? {} : { rawValue: Number(row.raw_value) }),
      })),
      calibration: {
        soilThreshold: {
          dry: toNumber(calibration.dry_threshold, 20),
          wet: toNumber(calibration.wet_threshold, 80),
        },
      },
      pump: {
        id: String(pump.id || 1),
        isRunning: Boolean(pump.is_running),
        mode: pump.mode || 'automatic',
        uptime: toNumber(pump.uptime_minutes, 0),
        power: toNumber(pump.power_watts, 5),
        lastCommand: pump.last_command || 'standby',
        updatedAt: toIso(pump.updated_at) || now(),
      },
      settings: {
        deviceName: device.name,
        location: device.location,
        batteryLevel: toNumber(device.battery_level, 0),
        firmwareVersion: device.firmware_version,
        uptime: toNumber(device.uptime_seconds, 0),
        autoMode: Boolean(settings.auto_mode),
        irrigationThreshold: toNumber(settings.irrigation_threshold, 30),
        timezone: device.timezone,
        unitSystem: settings.unit_system || 'Metric',
      },
      alerts: alertRows.map((row) => ({
        id: String(row.id),
        type: row.type,
        title: row.title,
        message: row.message,
        timestamp: toIso(row.created_at),
        isRead: Boolean(row.is_read),
      })),
      history: historyRows.map((row) => ({
        date: formatDay(row.date),
        soilMoisture: toNumber(row.avg_soil_moisture),
        temperature: toNumber(row.avg_temperature),
        humidity: toNumber(row.avg_humidity),
        pumpUsage: Number(row.pump_usage_minutes || 0),
      })),
      crops: cropRows.map((row) => ({
        id: String(row.id),
        name: row.name,
        image: row.name,
        bestSeason: row.best_season,
        waterRequirement: toNumber(row.water_requirement_liters),
        yieldExpectation: row.yield_expectation,
        ideal: {
          soilMoisture: [toNumber(row.min_soil_moisture), toNumber(row.max_soil_moisture)],
          temperature: [toNumber(row.min_temperature), toNumber(row.max_temperature)],
          humidity: [toNumber(row.min_humidity), toNumber(row.max_humidity)],
        },
        reason: row.reason,
      })),
    };
  } finally {
    connection.release();
  }
}

async function writeMysqlDb(data) {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const device = await getDevice(connection);

    await connection.query(
      `UPDATE devices
       SET name = ?, location = ?, battery_level = ?, firmware_version = ?, uptime_seconds = ?, timezone = ?, last_seen_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        data.settings.deviceName,
        data.settings.location,
        data.settings.batteryLevel,
        data.settings.firmwareVersion,
        data.settings.uptime,
        data.settings.timezone || 'Africa/Harare',
        device.id,
      ]
    );

    await connection.query(
      `INSERT INTO system_settings (device_id, auto_mode, irrigation_threshold, unit_system)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE auto_mode = VALUES(auto_mode), irrigation_threshold = VALUES(irrigation_threshold), unit_system = VALUES(unit_system)`,
      [device.id, Boolean(data.settings.autoMode), data.settings.irrigationThreshold, data.settings.unitSystem || 'Metric']
    );

    await connection.query(
      `INSERT INTO calibration_settings (device_id, dry_threshold, wet_threshold)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE dry_threshold = VALUES(dry_threshold), wet_threshold = VALUES(wet_threshold)`,
      [device.id, data.calibration.soilThreshold.dry, data.calibration.soilThreshold.wet]
    );

    await connection.query(
      `INSERT INTO pump_status (device_id, is_running, mode, uptime_minutes, power_watts, last_command)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE is_running = VALUES(is_running), mode = VALUES(mode), uptime_minutes = VALUES(uptime_minutes), power_watts = VALUES(power_watts), last_command = VALUES(last_command)`,
      [device.id, Boolean(data.pump.isRunning), data.pump.mode, data.pump.uptime || 0, data.pump.power || 5, data.pump.lastCommand || 'standby']
    );

    await connection.query('DELETE FROM sensor_readings WHERE device_id = ?', [device.id]);
    for (const reading of data.sensors.slice(-500)) {
      await connection.query(
        `INSERT INTO sensor_readings (device_id, sensor_type_id, value, raw_value, status, recorded_at)
         SELECT ?, id, ?, ?, ?, ?
         FROM sensor_types
         WHERE code = ?`,
        [
          device.id,
          reading.value,
          reading.rawValue === undefined ? null : reading.rawValue,
          reading.status || 'normal',
          new Date(reading.timestamp || now()),
          reading.type,
        ]
      );
    }

    await connection.query('DELETE FROM alerts WHERE device_id = ?', [device.id]);
    for (const alert of data.alerts.slice(0, 50)) {
      const numericId = Number(alert.id);
      const hasNumericId = Number.isSafeInteger(numericId) && numericId > 0;
      if (hasNumericId) {
        await connection.query(
          `INSERT INTO alerts (id, device_id, type, title, message, is_read, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [numericId, device.id, alert.type, alert.title, alert.message, Boolean(alert.isRead), new Date(alert.timestamp || now())]
        );
      } else {
        await connection.query(
          `INSERT INTO alerts (device_id, type, title, message, is_read, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [device.id, alert.type, alert.title, alert.message, Boolean(alert.isRead), new Date(alert.timestamp || now())]
        );
      }
    }

    await connection.query('DELETE FROM daily_analytics WHERE device_id = ?', [device.id]);
    for (const [index, item] of data.history.entries()) {
      await connection.query(
        `INSERT INTO daily_analytics (device_id, date, avg_soil_moisture, avg_temperature, avg_humidity, pump_usage_minutes, water_used_liters)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          device.id,
          dateForHistoryIndex(index, data.history.length),
          item.soilMoisture,
          item.temperature,
          item.humidity,
          item.pumpUsage,
          item.pumpUsage * 10,
        ]
      );
    }

    await connection.commit();
    return data;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function readDb() {
  if (storeDriver === 'mysql') {
    return readMysqlDb();
  }

  return readJsonDb();
}

async function updateDb(mutator) {
  const data = await readDb();
  const result = mutator(data);

  if (storeDriver === 'mysql') {
    await writeMysqlDb(data);
  } else {
    writeJsonDb(data);
  }

  return result;
}

module.exports = {
  readDb,
  updateDb,
};
