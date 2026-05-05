# AgriSmart Backend

REST API for the AI-powered smart irrigation and crop recommendation dashboard.

The frontend talks to this backend at:

```text
http://localhost:8000/api
```

The current API is already functional with a local JSON store at `data/db.json`. The MySQL schema and setup scripts are included so the project can move to a real database cleanly.

## Database Tables

The required MySQL tables are defined in `database/schema.mysql.sql`:

```text
users
devices
sensor_types
sensor_readings
calibration_settings
system_settings
pump_status
pump_events
irrigation_rules
irrigation_schedules
crops
recommendation_history
alerts
daily_analytics
device_commands
```

These tables cover login users, ESP32 devices, sensor readings, calibration, settings, pump control, irrigation automation, crop recommendations, alerts, analytics, and device commands.

## XAMPP Setup Steps

Use these steps if you want the database in XAMPP.

1. Open XAMPP Control Panel.

2. Start `MySQL`.

   `Apache` is optional for this project, but start it too if you want to use phpMyAdmin from the browser.

3. Open phpMyAdmin.

   ```text
   http://localhost/phpmyadmin
   ```

4. Install backend dependencies.

   ```powershell
   cd C:\Users\kendl\OneDrive\Desktop\copilot\agrismart-backend
   npm.cmd install
   ```

5. Create the XAMPP `.env` file.

   ```powershell
   Copy-Item .env.xampp.example .env
   ```

   XAMPP usually uses:

   ```text
   DB_USER=root
   DB_PASSWORD=
   DB_DRIVER=mysql
   DB_HOST=127.0.0.1
   DB_PORT=3306
   DB_NAME=agrismart
   ```

6. Create the database tables and seed starter data.

   ```powershell
   npm.cmd run db:setup
   ```

7. Verify all required tables exist.

   ```powershell
   npm.cmd run db:verify
   ```

8. Start the backend.

   ```powershell
   npm.cmd start
   ```

9. Start the frontend in a second terminal.

   ```powershell
   cd C:\Users\kendl\OneDrive\Desktop\copilot\agrismart-dashboard
   npm.cmd run dev
   ```

10. Open the dashboard.

   ```text
   http://127.0.0.1:3000
   ```

## General MySQL Setup Steps

Use these steps if you installed MySQL separately without XAMPP.

1. Install MySQL Server.

2. Install backend dependencies.

   ```powershell
   cd C:\Users\kendl\OneDrive\Desktop\copilot\agrismart-backend
   npm.cmd install
   ```

3. Create the backend `.env` file.

   ```powershell
   Copy-Item .env.example .env
   ```

4. Edit `.env` with your MySQL details.

   ```text
   PORT=8000
   CORS_ORIGIN=http://127.0.0.1:3000
   DB_DRIVER=mysql
   DB_HOST=127.0.0.1
   DB_PORT=3306
   DB_USER=root
   DB_PASSWORD=your_mysql_password
   DB_NAME=agrismart
   ```

5. Create the database and seed starter data.

   ```powershell
   npm.cmd run db:setup
   ```

6. Verify all required tables exist.

   ```powershell
   npm.cmd run db:verify
   ```

7. Start the backend.

   ```powershell
   npm.cmd start
   ```

8. Start the frontend in a second terminal.

   ```powershell
   cd C:\Users\kendl\OneDrive\Desktop\copilot\agrismart-dashboard
   npm.cmd run dev
   ```

9. Open the dashboard.

   ```text
   http://127.0.0.1:3000
   ```

## API Health Check

Use this to confirm the frontend can reach the backend:

```powershell
Invoke-RestMethod -Uri http://127.0.0.1:8000/api/health
```

Expected response:

```json
{
  "status": "ok",
  "service": "agrismart-backend"
}
```

## ESP32 Sensor Example

```http
POST /api/sensors/readings
Content-Type: application/json

{
  "readings": [
    { "type": "soil_moisture", "value": 32, "unit": "%", "rawValue": 1024 },
    { "type": "temperature", "value": 27.5, "unit": "C" },
    { "type": "humidity", "value": 58, "unit": "%" }
  ]
}
```

## Frontend API Contract

The React dashboard currently uses these endpoints:

```text
GET    /api/sensors/readings
GET    /api/sensors/calibration
PUT    /api/sensors/calibration
POST   /api/sensors/readings
GET    /api/pump/status
POST   /api/pump/toggle
POST   /api/pump/mode
GET    /api/ai/recommendations
GET    /api/alerts
PATCH  /api/alerts/:id
GET    /api/settings/system
PUT    /api/settings/system
GET    /api/analytics/history?days=7
GET    /api/analytics/insights
```
