#include <Arduino.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <HTTPClient.h>
#include <WiFi.h>

// Change these before uploading.
const char* WIFI_SSID = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// Use your laptop Wi-Fi IPv4 address, not localhost or 127.0.0.1.
// Example: const char* API_BASE = "http://192.168.1.25:8000/api";
const char* API_BASE = "http://YOUR_LAPTOP_IP:8000/api";
const char* DEVICE_UID = "AGRISMART-NODE-01";

const uint8_t DHT_PIN = 4;
const uint8_t DHT_TYPE = DHT11;
const uint8_t SOIL_PIN = 34;
const uint8_t RELAY_PIN = 18;

// Many 5V relay modules are active LOW. If your relay turns on backwards,
// flip this value.
const bool RELAY_ACTIVE_LOW = true;

// Calibrate these with your real soil sensor values.
// Dry usually reads higher, wet usually reads lower on capacitive sensors.
const int SOIL_RAW_DRY = 1680;
const int SOIL_RAW_WET = 420;

const unsigned long SAMPLE_INTERVAL_MS = 5000;
const unsigned long WIFI_RETRY_MS = 10000;
const uint16_t HTTP_TIMEOUT_MS = 6000;

DHT dht(DHT_PIN, DHT_TYPE);

unsigned long lastSampleAt = 0;
unsigned long lastWifiAttemptAt = 0;
unsigned long autoStopAt = 0;
bool pumpOn = false;

uint8_t relayOnLevel() {
  return RELAY_ACTIVE_LOW ? LOW : HIGH;
}

uint8_t relayOffLevel() {
  return RELAY_ACTIVE_LOW ? HIGH : LOW;
}

void setPump(bool on) {
  pumpOn = on;
  digitalWrite(RELAY_PIN, on ? relayOnLevel() : relayOffLevel());
  Serial.println(on ? "Pump relay: ON" : "Pump relay: OFF");
}

String apiUrl(const char* path) {
  return String(API_BASE) + path;
}

bool ensureWifi() {
  if (WiFi.status() == WL_CONNECTED) {
    return true;
  }

  const unsigned long now = millis();
  if (now - lastWifiAttemptAt < WIFI_RETRY_MS) {
    return false;
  }

  lastWifiAttemptAt = now;
  Serial.print("Connecting to Wi-Fi");
  WiFi.mode(WIFI_STA);
  WiFi.disconnect();
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  const unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 12000) {
    delay(400);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Wi-Fi connection failed");
    return false;
  }

  Serial.print("Wi-Fi connected. ESP32 IP: ");
  Serial.println(WiFi.localIP());
  return true;
}

int soilPercentFromRaw(int rawValue) {
  const int percent = map(rawValue, SOIL_RAW_DRY, SOIL_RAW_WET, 0, 100);
  return constrain(percent, 0, 100);
}

bool postJson(const String& url, const String& body, String& responseBody) {
  HTTPClient http;
  http.begin(url);
  http.setTimeout(HTTP_TIMEOUT_MS);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Id", DEVICE_UID);

  const int status = http.POST(body);
  responseBody = http.getString();
  http.end();

  Serial.print("POST ");
  Serial.print(url);
  Serial.print(" -> ");
  Serial.println(status);

  return status >= 200 && status < 300;
}

bool getJson(const String& url, String& responseBody) {
  HTTPClient http;
  http.begin(url);
  http.setTimeout(HTTP_TIMEOUT_MS);
  http.addHeader("X-Device-Id", DEVICE_UID);

  const int status = http.GET();
  responseBody = http.getString();
  http.end();

  Serial.print("GET ");
  Serial.print(url);
  Serial.print(" -> ");
  Serial.println(status);

  return status >= 200 && status < 300;
}

bool sendSensorReadings() {
  const int soilRaw = analogRead(SOIL_PIN);
  const int soilPercent = soilPercentFromRaw(soilRaw);
  const float temperature = dht.readTemperature();
  const float humidity = dht.readHumidity();

  StaticJsonDocument<640> doc;
  JsonArray readings = doc.createNestedArray("readings");

  JsonObject soil = readings.createNestedObject();
  soil["type"] = "soil_moisture";
  soil["value"] = soilPercent;
  soil["unit"] = "%";
  soil["rawValue"] = soilRaw;

  if (!isnan(temperature)) {
    JsonObject temp = readings.createNestedObject();
    temp["type"] = "temperature";
    temp["value"] = roundf(temperature * 10.0f) / 10.0f;
    temp["unit"] = "C";
  } else {
    Serial.println("DHT temperature read failed");
  }

  if (!isnan(humidity)) {
    JsonObject hum = readings.createNestedObject();
    hum["type"] = "humidity";
    hum["value"] = roundf(humidity * 10.0f) / 10.0f;
    hum["unit"] = "%";
  } else {
    Serial.println("DHT humidity read failed");
  }

  String body;
  serializeJson(doc, body);

  Serial.print("Sensor payload: ");
  Serial.println(body);

  String response;
  const bool ok = postJson(apiUrl("/sensors/readings"), body, response);
  if (!ok) {
    Serial.print("Sensor upload failed: ");
    Serial.println(response);
  }

  return ok;
}

void applyBackendCommand(const String& response) {
  StaticJsonDocument<1024> doc;
  const DeserializationError error = deserializeJson(doc, response);
  if (error) {
    Serial.print("Command JSON parse failed: ");
    Serial.println(error.c_str());
    return;
  }

  const char* mode = doc["mode"] | "automatic";
  const char* command = doc["command"] | "standby";
  const char* manualPump = doc["pump"] | "standby";
  const int durationMinutes = doc["durationMinutes"] | 0;
  const char* reason = doc["reason"] | "";

  Serial.print("Backend mode: ");
  Serial.print(mode);
  Serial.print(", command: ");
  Serial.print(command);
  Serial.print(", pump: ");
  Serial.print(manualPump);
  Serial.print(", duration: ");
  Serial.println(durationMinutes);
  Serial.println(reason);

  if (strcmp(mode, "manual") == 0) {
    if (strcmp(manualPump, "start") == 0) {
      setPump(true);
    } else if (strcmp(manualPump, "stop") == 0) {
      setPump(false);
      autoStopAt = 0;
    }
    return;
  }

  if (strcmp(command, "start_pump") == 0) {
    setPump(true);
    if (durationMinutes > 0) {
      autoStopAt = millis() + (unsigned long)durationMinutes * 60000UL;
    }
  } else if (strcmp(command, "stop_pump") == 0 || strcmp(manualPump, "stop") == 0 || strcmp(command, "standby") == 0) {
    setPump(false);
    autoStopAt = 0;
  }
}

bool fetchAndApplyCommand() {
  String response;
  const bool ok = getJson(apiUrl("/device/command"), response);
  if (!ok) {
    Serial.print("Command fetch failed: ");
    Serial.println(response);
    return false;
  }

  applyBackendCommand(response);
  return true;
}

void setup() {
  Serial.begin(115200);
  delay(200);

  pinMode(RELAY_PIN, OUTPUT);
  setPump(false);

  analogReadResolution(12);
  analogSetPinAttenuation(SOIL_PIN, ADC_11db);
  dht.begin();

  Serial.println("AgriSmart ESP32 node starting");
  ensureWifi();
}

void loop() {
  if (!ensureWifi()) {
    delay(500);
    return;
  }

  const unsigned long now = millis();

  if (pumpOn && autoStopAt > 0 && now > autoStopAt) {
    Serial.println("Local safety timeout reached");
    setPump(false);
    autoStopAt = 0;
  }

  if (now - lastSampleAt >= SAMPLE_INTERVAL_MS) {
    lastSampleAt = now;
    sendSensorReadings();
    fetchAndApplyCommand();
  }
}
