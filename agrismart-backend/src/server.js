const http = require('http');
const { URL } = require('url');
const { loadEnv } = require('./env');
const { buildIrrigationAdvice, buildRecommendations, buildWeatherContext } = require('./recommendationEngine');
const { readDb, updateDb } = require('./store');

loadEnv();

const port = Number(process.env.PORT || 8000);
const corsOrigin = process.env.CORS_ORIGIN || '*';

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Device-Id',
  });
  response.end(JSON.stringify(payload));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk.toString();
      if (body.length > 1_000_000) {
        request.destroy();
        reject(new Error('Request body too large'));
      }
    });
    request.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error('Invalid JSON body'));
      }
    });
    request.on('error', reject);
  });
}

function sensorStatus(type, value, settings) {
  if (type === 'soil_moisture') {
    if (value < settings.calibration.soilThreshold.dry) return 'critical';
    if (value < settings.settings.irrigationThreshold) return 'warning';
    return 'normal';
  }

  if (type === 'temperature') {
    if (value > 38 || value < 5) return 'critical';
    if (value > 32 || value < 12) return 'warning';
    return 'normal';
  }

  if (type === 'humidity') {
    if (value < 25 || value > 90) return 'warning';
    return 'normal';
  }

  return 'normal';
}

function latestReadings(readings) {
  return Object.values(
    readings.reduce((acc, reading) => {
      const current = acc[reading.type];
      const readingTime = new Date(reading.timestamp);
      const currentTime = current ? new Date(current.timestamp) : null;
      const isNewer =
        !current ||
        readingTime > currentTime ||
        (readingTime.getTime() === currentTime.getTime() && readingSequence(reading) > readingSequence(current));

      if (isNewer) {
        acc[reading.type] = reading;
      }
      return acc;
    }, {})
  );
}

function readingSequence(reading) {
  const numericId = Number(reading.id);
  if (Number.isFinite(numericId)) return numericId;
  const leadingNumber = Number(String(reading.id || '').split('-')[0]);
  return Number.isFinite(leadingNumber) ? leadingNumber : 0;
}

function createAlert(data, input) {
  const alert = {
    id: String(Date.now()),
    timestamp: new Date().toISOString(),
    isRead: false,
    ...input,
  };
  data.alerts.unshift(alert);
  data.alerts = data.alerts.slice(0, 50);
  return alert;
}

function applyAutomaticIrrigation(data) {
  const advice = buildIrrigationAdvice(data.sensors, data.settings, data.pump, data.calibration);
  const automaticMode = data.pump.mode === 'automatic' && data.settings.autoMode;

  if (!automaticMode) {
    return advice;
  }

  if (advice.command === 'start_pump' && !data.pump.isRunning) {
    data.pump.isRunning = true;
    data.pump.lastCommand = 'start';
    data.pump.updatedAt = new Date().toISOString();
    createAlert(data, {
      type: advice.action === 'water_now' ? 'warning' : 'info',
      title: 'AI Started Irrigation',
      message: `${advice.reason} Duration: ${advice.durationMinutes} minutes.`,
    });
  }

  if (advice.command === 'stop_pump' && data.pump.isRunning) {
    data.pump.isRunning = false;
    data.pump.lastCommand = 'stop';
    data.pump.updatedAt = new Date().toISOString();
    createAlert(data, {
      type: 'info',
      title: 'AI Stopped Irrigation',
      message: advice.reason,
    });
  }

  return buildIrrigationAdvice(data.sensors, data.settings, data.pump, data.calibration);
}

function addSensorReading(payload) {
  return updateDb((data) => {
    const incoming = Array.isArray(payload.readings) ? payload.readings : [payload];
    const created = incoming.map((item) => {
      const value = Number(item.value);
      const type = item.type;
      const reading = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        type,
        value,
        unit: item.unit || (type === 'temperature' ? 'C' : '%'),
        timestamp: item.timestamp || new Date().toISOString(),
        status: item.status || sensorStatus(type, value, data),
      };

      if (item.rawValue !== undefined) {
        reading.rawValue = Number(item.rawValue);
      }

      return reading;
    });

    data.sensors.push(...created);
    data.sensors = data.sensors.slice(-500);

    const soil = created.find((item) => item.type === 'soil_moisture');
    if (soil && soil.value < data.settings.irrigationThreshold) {
      createAlert(data, {
        type: soil.value < data.calibration.soilThreshold.dry ? 'critical' : 'warning',
        title: 'Soil Moisture Low',
        message: `Soil moisture is ${soil.value}%, below the ${data.settings.irrigationThreshold}% irrigation threshold.`,
      });
    }

    applyAutomaticIrrigation(data);
    return created;
  });
}

function routeKey(method, pathname) {
  return `${method} ${pathname}`;
}

async function handleApi(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const method = request.method || 'GET';
  const pathname = url.pathname;

  if (method === 'OPTIONS') {
    sendJson(response, 204, {});
    return;
  }

  if (routeKey(method, pathname) === 'GET /api/health') {
    sendJson(response, 200, { status: 'ok', service: 'agrismart-backend', timestamp: new Date().toISOString() });
    return;
  }

  if (routeKey(method, pathname) === 'GET /api/sensors/readings') {
    const data = await readDb();
    const limit = Number(url.searchParams.get('limit') || 100);
    sendJson(response, 200, data.sensors.slice(-limit));
    return;
  }

  if (routeKey(method, pathname) === 'GET /api/sensors/latest') {
    const data = await readDb();
    sendJson(response, 200, latestReadings(data.sensors));
    return;
  }

  if (routeKey(method, pathname) === 'POST /api/sensors/readings') {
    const payload = await readBody(request);
    const created = await addSensorReading(payload);
    sendJson(response, 201, created);
    return;
  }

  if (routeKey(method, pathname) === 'GET /api/sensors/calibration') {
    sendJson(response, 200, (await readDb()).calibration);
    return;
  }

  if (routeKey(method, pathname) === 'PUT /api/sensors/calibration') {
    const payload = await readBody(request);
    const calibration = await updateDb((data) => {
      data.calibration = { ...data.calibration, ...payload };
      return data.calibration;
    });
    sendJson(response, 200, calibration);
    return;
  }

  if (routeKey(method, pathname) === 'GET /api/pump/status') {
    sendJson(response, 200, (await readDb()).pump);
    return;
  }

  if (routeKey(method, pathname) === 'POST /api/pump/toggle') {
    const payload = await readBody(request);
    const pump = await updateDb((data) => {
      data.pump.isRunning = Boolean(payload.on);
      data.pump.lastCommand = payload.on ? 'start' : 'stop';
      data.pump.updatedAt = new Date().toISOString();
      createAlert(data, {
        type: 'info',
        title: payload.on ? 'Pump Started' : 'Pump Stopped',
        message: payload.on ? 'Irrigation pump was started manually.' : 'Irrigation pump was stopped.',
      });
      return data.pump;
    });
    sendJson(response, 200, pump);
    return;
  }

  if (routeKey(method, pathname) === 'POST /api/pump/mode') {
    const payload = await readBody(request);
    if (!['automatic', 'manual'].includes(payload.mode)) {
      sendJson(response, 422, { message: 'mode must be automatic or manual' });
      return;
    }

    const pump = await updateDb((data) => {
      data.pump.mode = payload.mode;
      data.settings.autoMode = payload.mode === 'automatic';
      data.pump.updatedAt = new Date().toISOString();
      applyAutomaticIrrigation(data);
      return data.pump;
    });
    sendJson(response, 200, pump);
    return;
  }

  if (routeKey(method, pathname) === 'GET /api/device/command') {
    const data = await readDb();
    const advice = buildIrrigationAdvice(data.sensors, data.settings, data.pump, data.calibration);
    sendJson(response, 200, {
      pump: data.pump.lastCommand,
      command: advice.command,
      mode: data.pump.mode,
      irrigationThreshold: data.settings.irrigationThreshold,
      durationMinutes: advice.durationMinutes,
      reason: advice.reason,
      weather: advice.weather,
    });
    return;
  }

  if (routeKey(method, pathname) === 'GET /api/ai/recommendations') {
    const data = await readDb();
    sendJson(response, 200, buildRecommendations(data.sensors, data.settings, data.crops));
    return;
  }

  if (routeKey(method, pathname) === 'GET /api/ai/irrigation-advice') {
    const data = await readDb();
    sendJson(response, 200, buildIrrigationAdvice(data.sensors, data.settings, data.pump, data.calibration));
    return;
  }

  if (routeKey(method, pathname) === 'GET /api/weather/current') {
    const data = await readDb();
    sendJson(response, 200, buildWeatherContext(data.sensors, data.settings));
    return;
  }

  if (routeKey(method, pathname) === 'GET /api/alerts') {
    sendJson(response, 200, (await readDb()).alerts);
    return;
  }

  if (method === 'PATCH' && pathname.startsWith('/api/alerts/')) {
    const alertId = pathname.split('/').pop();
    const payload = await readBody(request);
    const alert = await updateDb((data) => {
      const found = data.alerts.find((item) => item.id === alertId);
      if (!found) return null;
      Object.assign(found, payload);
      return found;
    });

    if (!alert) {
      sendJson(response, 404, { message: 'Alert not found' });
      return;
    }

    sendJson(response, 200, alert);
    return;
  }

  if (routeKey(method, pathname) === 'GET /api/settings/system') {
    sendJson(response, 200, (await readDb()).settings);
    return;
  }

  if (routeKey(method, pathname) === 'PUT /api/settings/system') {
    const payload = await readBody(request);
    const settings = await updateDb((data) => {
      data.settings = { ...data.settings, ...payload };
      data.pump.mode = data.settings.autoMode ? 'automatic' : 'manual';
      applyAutomaticIrrigation(data);
      return data.settings;
    });
    sendJson(response, 200, settings);
    return;
  }

  if (routeKey(method, pathname) === 'GET /api/analytics/history') {
    const days = Number(url.searchParams.get('days') || 7);
    sendJson(response, 200, (await readDb()).history.slice(-days));
    return;
  }

  if (routeKey(method, pathname) === 'GET /api/analytics/insights') {
    const data = await readDb();
    const averagePumpUsage = Math.round(data.history.reduce((sum, item) => sum + item.pumpUsage, 0) / data.history.length);
    const lowestSoil = Math.min(...data.history.map((item) => item.soilMoisture));
    sendJson(response, 200, {
      soilDried: { value: data.history.filter((item) => item.soilMoisture < data.settings.irrigationThreshold).length, unit: 'times' },
      waterUsed: { value: averagePumpUsage * 10, unit: 'liters' },
      bestTime: { value: 'early morning', reason: 'Lower temperatures reduce evaporation.' },
      soilMoisture: { value: lowestSoil < data.settings.irrigationThreshold ? 'low' : 'stable', reason: `Lowest recent reading is ${lowestSoil}%.` },
    });
    return;
  }

  if (routeKey(method, pathname) === 'GET /api/dashboard/summary') {
    const data = await readDb();
    const readings = latestReadings(data.sensors);
    const irrigationAdvice = buildIrrigationAdvice(data.sensors, data.settings, data.pump, data.calibration);
    sendJson(response, 200, {
      readings,
      pump: data.pump,
      recommendation: buildRecommendations(data.sensors, data.settings, data.crops)[0],
      irrigationAdvice,
      weather: irrigationAdvice.weather,
      unreadAlerts: data.alerts.filter((alert) => !alert.isRead).length,
      settings: data.settings,
    });
    return;
  }

  sendJson(response, 404, { message: `No route for ${method} ${pathname}` });
}

const server = http.createServer((request, response) => {
  handleApi(request, response).catch((error) => {
    sendJson(response, error.message === 'Invalid JSON body' ? 400 : 500, { message: error.message });
  });
});

server.listen(port, () => {
  console.log(`AgriSmart backend running on http://localhost:${port}`);
});
