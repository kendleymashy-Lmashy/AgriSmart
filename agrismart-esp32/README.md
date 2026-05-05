# AgriSmart ESP32 Hardware Setup

This firmware connects the ESP32 field node to the AgriSmart backend.

Flow:

```text
DHT11 + soil sensor -> ESP32 -> Wi-Fi HTTP -> backend -> MySQL -> frontend
backend AI command -> ESP32 -> relay -> 5V pump
```

## 1. Install Arduino Tools

In Arduino IDE:

1. Install the ESP32 board package.
2. Select your board, usually `ESP32 Dev Module`.
3. Install these libraries from Library Manager:
   - `DHT sensor library` by Adafruit
   - `Adafruit Unified Sensor`
   - `ArduinoJson` by Benoit Blanchon

## 2. Wire The Sensors

Use these pins from the diagram:

```text
DHT11 data             -> ESP32 GPIO4
DHT11 VCC              -> ESP32 3V3
DHT11 GND              -> common GND

Soil sensor analog/AO  -> ESP32 GPIO34
Soil sensor VCC        -> ESP32 3V3
Soil sensor GND        -> common GND

Relay IN/SIGNAL        -> ESP32 GPIO18
Relay VCC              -> stable 5V output
Relay GND              -> common GND
```

Important: GPIO34 must never receive more than 3.3V. Power the capacitive soil sensor from 3.3V, or use a voltage divider if your sensor must run at 5V.

## 3. Wire The Pump

Do not power the pump from the ESP32.

Typical relay wiring:

```text
5V pump positive supply -> relay COM
relay NO                -> pump positive wire
pump negative wire      -> 5V supply GND
```

The relay only switches the pump power line. The ESP32 only controls the relay signal.

Use a flyback diode across the pump terminals if your pump/relay board does not already include protection.

## 4. Power System

From the diagram:

```text
USB/solar 5V -> TP4056 charging module -> 3.7V battery pack -> boost converter -> stable 5V
```

Use the boost converter 5V output for:

```text
ESP32 VIN/5V pin
relay VCC
5V pump supply
```

Keep all grounds connected together:

```text
ESP32 GND
DHT11 GND
soil sensor GND
relay GND
pump power GND
boost converter GND
```

Do not connect 5V to the ESP32 `3V3` pin.

## 5. Configure The Firmware

Open:

```text
AgriSmartNode/AgriSmartNode.ino
```

Change these lines:

```cpp
const char* WIFI_SSID = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* API_BASE = "http://YOUR_LAPTOP_IP:8000/api";
```

Find your laptop IP address:

```powershell
ipconfig
```

Use the Wi-Fi IPv4 address, for example:

```cpp
const char* API_BASE = "http://192.168.1.25:8000/api";
```

Do not use `localhost` or `127.0.0.1` in the ESP32 code.

## 6. Start The Backend

Start XAMPP MySQL first.

Then run:

```powershell
cd C:\Users\kendl\OneDrive\Desktop\copilot\agrismart-backend
npm.cmd run db:verify
npm.cmd start
```

Open this in your browser:

```text
http://127.0.0.1:8000/api/health
```

You should see backend health data.

If ESP32 cannot connect, allow Node.js through Windows Firewall or open inbound TCP port `8000` on private networks.

## 7. Upload To ESP32

1. Connect ESP32 by USB.
2. Select the correct board and COM port.
3. Upload `AgriSmartNode.ino`.
4. Open Serial Monitor at `115200` baud.

You should see:

```text
Wi-Fi connected. ESP32 IP: ...
POST .../sensors/readings -> 201
GET .../device/command -> 200
```

## 8. What The Firmware Does

Every 5 seconds:

1. Reads soil moisture from `GPIO34`.
2. Reads temperature/humidity from DHT11 on `GPIO4`.
3. Sends readings to:

```text
POST /api/sensors/readings
```

4. Gets the backend AI pump decision from:

```text
GET /api/device/command
```

5. Controls relay on `GPIO18`:

```text
start_pump -> relay ON
stop_pump  -> relay OFF
standby    -> relay OFF in automatic mode
```

## 9. Calibrate Soil Moisture

Open Serial Monitor and check the printed `rawValue`.

Put the sensor in dry soil/air and record the raw value. Put it in wet soil and record the raw value. Update:

```cpp
const int SOIL_RAW_DRY = 1680;
const int SOIL_RAW_WET = 420;
```

Dry is usually higher, wet is usually lower.

## 10. Relay Direction

If the pump turns ON when the app says OFF, change:

```cpp
const bool RELAY_ACTIVE_LOW = true;
```

to:

```cpp
const bool RELAY_ACTIVE_LOW = false;
```

Upload again.

## 11. Frontend Check

Start the frontend:

```powershell
cd C:\Users\kendl\OneDrive\Desktop\copilot\agrismart-dashboard
npm.cmd run dev
```

Open:

```text
http://127.0.0.1:3000
```

The dashboard polls the backend every 5 seconds, so real hardware readings should appear automatically.
