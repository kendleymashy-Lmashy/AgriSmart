USE agrismart;

INSERT INTO users (name, email, password_hash, role)
VALUES ('Tendai', 'demo@agrismart.local', '$2b$10$replace_with_real_hash', 'admin')
ON DUPLICATE KEY UPDATE name = VALUES(name), role = VALUES(role);

INSERT INTO devices (
  device_uid,
  name,
  location,
  timezone,
  firmware_version,
  battery_level,
  voltage,
  uptime_seconds,
  is_online,
  last_seen_at
)
VALUES (
  'AGRISMART-NODE-01',
  'AgriSmart Node-01',
  'Harare, Zimbabwe',
  'Africa/Harare',
  'v1.0.4',
  87,
  3.98,
  2592000,
  TRUE,
  CURRENT_TIMESTAMP
)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  location = VALUES(location),
  firmware_version = VALUES(firmware_version),
  battery_level = VALUES(battery_level),
  voltage = VALUES(voltage),
  uptime_seconds = VALUES(uptime_seconds),
  is_online = VALUES(is_online),
  last_seen_at = VALUES(last_seen_at);

SET @device_id = (SELECT id FROM devices WHERE device_uid = 'AGRISMART-NODE-01');

INSERT INTO sensor_types (code, name, unit, min_value, max_value)
VALUES
  ('soil_moisture', 'Soil Moisture', '%', 0, 100),
  ('temperature', 'Temperature', 'C', -10, 60),
  ('humidity', 'Humidity', '%', 0, 100)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  unit = VALUES(unit),
  min_value = VALUES(min_value),
  max_value = VALUES(max_value);

INSERT INTO calibration_settings (device_id, dry_threshold, wet_threshold)
VALUES (@device_id, 20, 80)
ON DUPLICATE KEY UPDATE
  dry_threshold = VALUES(dry_threshold),
  wet_threshold = VALUES(wet_threshold);

INSERT INTO system_settings (device_id, auto_mode, irrigation_threshold, unit_system)
VALUES (@device_id, TRUE, 30, 'Metric')
ON DUPLICATE KEY UPDATE
  auto_mode = VALUES(auto_mode),
  irrigation_threshold = VALUES(irrigation_threshold),
  unit_system = VALUES(unit_system);

INSERT INTO pump_status (device_id, is_running, mode, uptime_minutes, power_watts, last_command)
VALUES (@device_id, TRUE, 'automatic', 120, 5, 'start')
ON DUPLICATE KEY UPDATE
  is_running = VALUES(is_running),
  mode = VALUES(mode),
  uptime_minutes = VALUES(uptime_minutes),
  power_watts = VALUES(power_watts),
  last_command = VALUES(last_command);

INSERT INTO irrigation_rules (device_id, moisture_threshold, duration_minutes, is_enabled)
SELECT @device_id, 30, 15, TRUE
WHERE NOT EXISTS (SELECT 1 FROM irrigation_rules WHERE device_id = @device_id);

INSERT INTO irrigation_schedules (device_id, scheduled_time, duration_minutes, is_enabled)
SELECT @device_id, '06:00:00', 15, TRUE
WHERE NOT EXISTS (SELECT 1 FROM irrigation_schedules WHERE device_id = @device_id);

INSERT INTO crops (
  name,
  best_season,
  water_requirement_liters,
  yield_expectation,
  min_soil_moisture,
  max_soil_moisture,
  min_temperature,
  max_temperature,
  min_humidity,
  max_humidity,
  reason
)
VALUES
  ('Maize', 'Summer', 500, 'High', 25, 65, 22, 32, 45, 75, 'Suitable for warm conditions and current soil moisture.'),
  ('Wheat', 'Winter', 400, 'Medium-High', 30, 70, 12, 25, 40, 65, 'Good option for cooler temperatures and moderate water demand.'),
  ('Soybeans', 'Summer', 450, 'Medium', 35, 75, 20, 30, 50, 80, 'Nitrogen-fixing crop that fits humid summer growing conditions.'),
  ('Sorghum', 'Summer', 320, 'Medium-High', 15, 45, 25, 36, 30, 65, 'Drought-tolerant crop for warmer and drier field conditions.')
ON DUPLICATE KEY UPDATE
  best_season = VALUES(best_season),
  water_requirement_liters = VALUES(water_requirement_liters),
  yield_expectation = VALUES(yield_expectation),
  min_soil_moisture = VALUES(min_soil_moisture),
  max_soil_moisture = VALUES(max_soil_moisture),
  min_temperature = VALUES(min_temperature),
  max_temperature = VALUES(max_temperature),
  min_humidity = VALUES(min_humidity),
  max_humidity = VALUES(max_humidity),
  reason = VALUES(reason);

INSERT INTO sensor_readings (device_id, sensor_type_id, value, raw_value, status, recorded_at)
SELECT @device_id, st.id, 32, 1024, 'warning', CURRENT_TIMESTAMP
FROM sensor_types st
WHERE st.code = 'soil_moisture'
  AND NOT EXISTS (
    SELECT 1 FROM sensor_readings sr
    WHERE sr.device_id = @device_id AND sr.sensor_type_id = st.id
  );

INSERT INTO sensor_readings (device_id, sensor_type_id, value, raw_value, status, recorded_at)
SELECT @device_id, st.id, 27.5, NULL, 'normal', CURRENT_TIMESTAMP
FROM sensor_types st
WHERE st.code = 'temperature'
  AND NOT EXISTS (
    SELECT 1 FROM sensor_readings sr
    WHERE sr.device_id = @device_id AND sr.sensor_type_id = st.id
  );

INSERT INTO sensor_readings (device_id, sensor_type_id, value, raw_value, status, recorded_at)
SELECT @device_id, st.id, 58, NULL, 'normal', CURRENT_TIMESTAMP
FROM sensor_types st
WHERE st.code = 'humidity'
  AND NOT EXISTS (
    SELECT 1 FROM sensor_readings sr
    WHERE sr.device_id = @device_id AND sr.sensor_type_id = st.id
  );

INSERT INTO alerts (device_id, type, title, message, is_read)
SELECT @device_id, 'critical', 'Soil Moisture Low', 'Soil moisture is below the threshold (20%).', FALSE
WHERE NOT EXISTS (
  SELECT 1 FROM alerts
  WHERE device_id = @device_id AND title = 'Soil Moisture Low' AND message = 'Soil moisture is below the threshold (20%).'
);

INSERT INTO alerts (device_id, type, title, message, is_read)
SELECT @device_id, 'warning', 'Battery Level Medium', 'Battery level is below 50%.', FALSE
WHERE NOT EXISTS (
  SELECT 1 FROM alerts
  WHERE device_id = @device_id AND title = 'Battery Level Medium'
);

INSERT INTO alerts (device_id, type, title, message, is_read)
SELECT @device_id, 'info', 'Irrigation Completed', 'Scheduled irrigation completed.', TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM alerts
  WHERE device_id = @device_id AND title = 'Irrigation Completed'
);

INSERT INTO daily_analytics (
  device_id,
  date,
  avg_soil_moisture,
  avg_temperature,
  avg_humidity,
  pump_usage_minutes,
  water_used_liters
)
VALUES
  (@device_id, DATE_SUB(CURRENT_DATE, INTERVAL 6 DAY), 28, 25, 55, 45, 450),
  (@device_id, DATE_SUB(CURRENT_DATE, INTERVAL 5 DAY), 32, 26, 58, 35, 350),
  (@device_id, DATE_SUB(CURRENT_DATE, INTERVAL 4 DAY), 35, 27, 60, 40, 400),
  (@device_id, DATE_SUB(CURRENT_DATE, INTERVAL 3 DAY), 30, 28, 62, 50, 500),
  (@device_id, DATE_SUB(CURRENT_DATE, INTERVAL 2 DAY), 25, 27.5, 58, 55, 550),
  (@device_id, DATE_SUB(CURRENT_DATE, INTERVAL 1 DAY), 32, 26.5, 59, 38, 380),
  (@device_id, CURRENT_DATE, 38, 25.5, 57, 25, 250)
ON DUPLICATE KEY UPDATE
  avg_soil_moisture = VALUES(avg_soil_moisture),
  avg_temperature = VALUES(avg_temperature),
  avg_humidity = VALUES(avg_humidity),
  pump_usage_minutes = VALUES(pump_usage_minutes),
  water_used_liters = VALUES(water_used_liters);
