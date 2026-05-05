CREATE DATABASE IF NOT EXISTS agrismart
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE agrismart;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(180) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin', 'operator', 'viewer') NOT NULL DEFAULT 'operator',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS devices (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  device_uid VARCHAR(80) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  location VARCHAR(180) NOT NULL,
  timezone VARCHAR(80) NOT NULL DEFAULT 'Africa/Harare',
  firmware_version VARCHAR(40) NOT NULL DEFAULT 'v1.0.0',
  battery_level DECIMAL(5,2) NOT NULL DEFAULT 0,
  voltage DECIMAL(5,2) NULL,
  uptime_seconds BIGINT UNSIGNED NOT NULL DEFAULT 0,
  is_online BOOLEAN NOT NULL DEFAULT TRUE,
  last_seen_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sensor_types (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(40) NOT NULL UNIQUE,
  name VARCHAR(80) NOT NULL,
  unit VARCHAR(20) NOT NULL,
  min_value DECIMAL(8,2) NULL,
  max_value DECIMAL(8,2) NULL
);

CREATE TABLE IF NOT EXISTS sensor_readings (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  device_id BIGINT UNSIGNED NOT NULL,
  sensor_type_id BIGINT UNSIGNED NOT NULL,
  value DECIMAL(8,2) NOT NULL,
  raw_value INT NULL,
  status ENUM('normal', 'warning', 'critical') NOT NULL DEFAULT 'normal',
  recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sensor_readings_device
    FOREIGN KEY (device_id) REFERENCES devices(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_sensor_readings_sensor_type
    FOREIGN KEY (sensor_type_id) REFERENCES sensor_types(id)
    ON DELETE RESTRICT,
  INDEX idx_sensor_readings_device_recorded (device_id, recorded_at),
  INDEX idx_sensor_readings_type_recorded (sensor_type_id, recorded_at)
);

CREATE TABLE IF NOT EXISTS calibration_settings (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  device_id BIGINT UNSIGNED NOT NULL,
  dry_threshold DECIMAL(5,2) NOT NULL DEFAULT 20,
  wet_threshold DECIMAL(5,2) NOT NULL DEFAULT 80,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_calibration_device
    FOREIGN KEY (device_id) REFERENCES devices(id)
    ON DELETE CASCADE,
  UNIQUE KEY uniq_calibration_device (device_id)
);

CREATE TABLE IF NOT EXISTS system_settings (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  device_id BIGINT UNSIGNED NOT NULL,
  auto_mode BOOLEAN NOT NULL DEFAULT TRUE,
  irrigation_threshold DECIMAL(5,2) NOT NULL DEFAULT 30,
  unit_system VARCHAR(40) NOT NULL DEFAULT 'Metric',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_system_settings_device
    FOREIGN KEY (device_id) REFERENCES devices(id)
    ON DELETE CASCADE,
  UNIQUE KEY uniq_system_settings_device (device_id)
);

CREATE TABLE IF NOT EXISTS pump_status (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  device_id BIGINT UNSIGNED NOT NULL,
  is_running BOOLEAN NOT NULL DEFAULT FALSE,
  mode ENUM('automatic', 'manual') NOT NULL DEFAULT 'automatic',
  uptime_minutes INT UNSIGNED NOT NULL DEFAULT 0,
  power_watts DECIMAL(8,2) NOT NULL DEFAULT 5,
  last_command ENUM('start', 'stop', 'standby') NOT NULL DEFAULT 'standby',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_pump_status_device
    FOREIGN KEY (device_id) REFERENCES devices(id)
    ON DELETE CASCADE,
  UNIQUE KEY uniq_pump_status_device (device_id)
);

CREATE TABLE IF NOT EXISTS pump_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  device_id BIGINT UNSIGNED NOT NULL,
  event_type ENUM('started', 'stopped', 'mode_changed', 'completed') NOT NULL,
  mode ENUM('automatic', 'manual') NULL,
  duration_minutes INT UNSIGNED NULL,
  reason VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pump_events_device
    FOREIGN KEY (device_id) REFERENCES devices(id)
    ON DELETE CASCADE,
  INDEX idx_pump_events_device_created (device_id, created_at)
);

CREATE TABLE IF NOT EXISTS irrigation_rules (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  device_id BIGINT UNSIGNED NOT NULL,
  moisture_threshold DECIMAL(5,2) NOT NULL DEFAULT 30,
  duration_minutes INT UNSIGNED NOT NULL DEFAULT 15,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_irrigation_rules_device
    FOREIGN KEY (device_id) REFERENCES devices(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS irrigation_schedules (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  device_id BIGINT UNSIGNED NOT NULL,
  scheduled_time TIME NOT NULL,
  duration_minutes INT UNSIGNED NOT NULL DEFAULT 15,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_irrigation_schedules_device
    FOREIGN KEY (device_id) REFERENCES devices(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS crops (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  best_season VARCHAR(80) NOT NULL,
  water_requirement_liters INT UNSIGNED NOT NULL,
  yield_expectation VARCHAR(80) NOT NULL,
  min_soil_moisture DECIMAL(5,2) NOT NULL,
  max_soil_moisture DECIMAL(5,2) NOT NULL,
  min_temperature DECIMAL(5,2) NOT NULL,
  max_temperature DECIMAL(5,2) NOT NULL,
  min_humidity DECIMAL(5,2) NOT NULL,
  max_humidity DECIMAL(5,2) NOT NULL,
  reason VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS recommendation_history (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  device_id BIGINT UNSIGNED NOT NULL,
  crop_id BIGINT UNSIGNED NOT NULL,
  confidence DECIMAL(5,2) NOT NULL,
  soil_moisture DECIMAL(8,2) NOT NULL,
  temperature DECIMAL(8,2) NOT NULL,
  humidity DECIMAL(8,2) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_recommendation_history_device
    FOREIGN KEY (device_id) REFERENCES devices(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_recommendation_history_crop
    FOREIGN KEY (crop_id) REFERENCES crops(id)
    ON DELETE RESTRICT,
  INDEX idx_recommendation_history_device_created (device_id, created_at)
);

CREATE TABLE IF NOT EXISTS alerts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  device_id BIGINT UNSIGNED NOT NULL,
  type ENUM('critical', 'warning', 'info') NOT NULL,
  title VARCHAR(120) NOT NULL,
  message VARCHAR(255) NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_alerts_device
    FOREIGN KEY (device_id) REFERENCES devices(id)
    ON DELETE CASCADE,
  INDEX idx_alerts_device_created (device_id, created_at),
  INDEX idx_alerts_read_type (is_read, type)
);

CREATE TABLE IF NOT EXISTS daily_analytics (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  device_id BIGINT UNSIGNED NOT NULL,
  date DATE NOT NULL,
  avg_soil_moisture DECIMAL(8,2) NOT NULL,
  avg_temperature DECIMAL(8,2) NOT NULL,
  avg_humidity DECIMAL(8,2) NOT NULL,
  pump_usage_minutes INT UNSIGNED NOT NULL DEFAULT 0,
  water_used_liters INT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_daily_analytics_device
    FOREIGN KEY (device_id) REFERENCES devices(id)
    ON DELETE CASCADE,
  UNIQUE KEY uniq_daily_analytics_device_date (device_id, date)
);

CREATE TABLE IF NOT EXISTS device_commands (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  device_id BIGINT UNSIGNED NOT NULL,
  command ENUM('start_pump', 'stop_pump', 'sync_settings', 'restart') NOT NULL,
  payload JSON NULL,
  status ENUM('pending', 'sent', 'acknowledged', 'failed') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  acknowledged_at TIMESTAMP NULL,
  CONSTRAINT fk_device_commands_device
    FOREIGN KEY (device_id) REFERENCES devices(id)
    ON DELETE CASCADE,
  INDEX idx_device_commands_device_status (device_id, status)
);
