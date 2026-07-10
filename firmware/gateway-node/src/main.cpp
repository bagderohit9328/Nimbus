#include <Arduino.h>

/**
 * Mountain Weather & Emergency SOS System
 * Gateway Node Firmware
 * Hardware: ESP32 + 20x4 LCD (I2C) + MAX98357A (I2S Amp) + 12V Solar + 7.4V BMS
 */

#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <WiFi.h>
#include <FirebaseESP32.h>
#include <ArduinoJson.h>
#include <driver/i2s.h>
#include <math.h>

// ─── Credentials (use secrets.h in production) ───────────────────────────────
#define WIFI_SSID       "YOUR_WIFI_SSID"
#define WIFI_PASSWORD   "YOUR_WIFI_PASSWORD"
#define FIREBASE_HOST   "your-project-default-rtdb.firebaseio.com"
#define FIREBASE_AUTH   "YOUR_DATABASE_SECRET"

// ─── Pin Definitions ──────────────────────────────────────────────────────────
// LCD (I2C address 0x27, 20 cols, 4 rows)
#define LCD_ADDR      0x27
#define LCD_COLS      20
#define LCD_ROWS      4

// MAX98357A I2S Amplifier
#define I2S_BCLK      27
#define I2S_LRCK      25
#define I2S_DATA      22

// Battery monitoring
#define BATTERY_ADC   35   // Voltage divider from 7.4V battery
#define SOLAR_ADC     34   // Solar panel voltage monitor

// Status LED
#define LED_WIFI      2

// ─── Globals ──────────────────────────────────────────────────────────────────
LiquidCrystal_I2C lcd(LCD_ADDR, LCD_COLS, LCD_ROWS);
FirebaseData fbData;
FirebaseAuth fbAuth;
FirebaseConfig fbConfig;

bool sirenActive = false;
bool wifiConnected = false;
unsigned long lastLCDUpdate = 0;
unsigned long lastFirebaseCheck = 0;
unsigned long sirenStartTime = 0;
int lcdPage = 0;

// Last received sensor data
struct SensorData {
  String nodeId;
  float temp, humidity, pressure, altitude, heatIndex;
  float rainMM, sounddB;
  int pm25, pm10;
  int pressTrend;
  bool sosActive;
  float lat, lon;
  unsigned long receivedAt;
  int rssi;
  float snr;
  bool valid = false;
} lastData;

// ─── I2S Audio (MAX98357A) ────────────────────────────────────────────────────
void setupI2SAmp() {
  i2s_config_t i2s_config = {
    .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_TX),
    .sample_rate = 44100,
    .bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT,
    .channel_format = I2S_CHANNEL_FMT_RIGHT_LEFT,
    .communication_format = I2S_COMM_FORMAT_I2S_MSB,
    .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
    .dma_buf_count = 8,
    .dma_buf_len = 64,
    .use_apll = false,
    .tx_desc_auto_clear = true
  };

  i2s_pin_config_t pin_config = {
    .bck_io_num = I2S_BCLK,
    .ws_io_num = I2S_LRCK,
    .data_out_num = I2S_DATA,
    .data_in_num = I2S_PIN_NO_CHANGE
  };

  i2s_driver_install(I2S_NUM_0, &i2s_config, 0, NULL);
  i2s_set_pin(I2S_NUM_0, &pin_config);
}

// ─── Siren Waveform Generator ─────────────────────────────────────────────────
// Generates a 800Hz↔1200Hz sweep for emergency alert
void playSirenChunk() {
  static float phase = 0;
  static unsigned long sirenChunkTime = 0;
  const int CHUNK = 512;

  int16_t buffer[CHUNK * 2];  // Stereo
  unsigned long elapsed = millis() - sirenStartTime;

  // Sweep frequency: 800-1200 Hz over 1 second
  float sweep = 800.0 + 400.0 * (0.5 + 0.5 * sin(2 * PI * elapsed / 1000.0));
  float phaseIncrement = 2 * PI * sweep / 44100.0;

  for (int i = 0; i < CHUNK; i++) {
    int16_t sample = (int16_t)(20000 * sin(phase));
    buffer[i * 2]     = sample;  // L
    buffer[i * 2 + 1] = sample;  // R
    phase += phaseIncrement;
    if (phase > 2 * PI) phase -= 2 * PI;
  }

  size_t written;
  i2s_write(I2S_NUM_0, buffer, sizeof(buffer), &written, pdMS_TO_TICKS(10));
}

void stopSiren() {
  // Write silence
  int16_t silence[128] = {0};
  size_t written;
  i2s_write(I2S_NUM_0, silence, sizeof(silence), &written, pdMS_TO_TICKS(10));
}

// ─── Battery Monitoring ───────────────────────────────────────────────────────
float readBatteryVoltage() {
  // Voltage divider: 7.4V max → 3.3V (use 10k/4.7k divider)
  int raw = analogRead(BATTERY_ADC);
  return (raw / 4095.0) * 3.3 * (10.0 + 4.7) / 4.7;
}

int batteryPercent(float voltage) {
  // Li-ion 2S: 8.4V full, 6.0V empty
  return constrain((int)((voltage - 6.0) / (8.4 - 6.0) * 100), 0, 100);
}

// ─── LCD Display Pages ────────────────────────────────────────────────────────
void updateLCD() {
  lcd.clear();
  float battV = readBatteryVoltage();
  int battPct = batteryPercent(battV);

  String trendStr = (lastData.pressTrend == 1) ? "↑Rise" :
                    (lastData.pressTrend == -1) ? "↓Fall" : "→Stbl";

  if (!lastData.valid) {
    lcd.setCursor(0, 0); lcd.print("  WELCOME TO NIMBUS  ");
    lcd.setCursor(0, 1); lcd.print("Waiting for signal..");
    String wifiLine = "WiFi: ";
    wifiLine.concat(wifiConnected ? "OK  " : "FAIL");
    lcd.setCursor(0, 2); lcd.print(wifiLine);
    String batteryLine = "Batt: ";
    batteryLine.concat(String(battPct));
    batteryLine.concat("%  ");
    batteryLine.concat(String(battV, 1));
    batteryLine.concat("V");
    lcd.setCursor(0, 3); lcd.print(batteryLine);
    return;
  }

  switch (lcdPage % 3) {
    case 0: { // Weather page
      lcd.setCursor(0, 0);
      String line = "T:";
      line.concat(String(lastData.temp, 1));
      line.concat("C H:");
      line.concat(String(lastData.humidity, 0));
      line.concat("% ");
      line.concat(trendStr);
      lcd.print(line);
      lcd.setCursor(0, 1);
      String line2 = "P:";
      line2.concat(String(lastData.pressure, 1));
      line2.concat("hPa");
      lcd.print(line2);
      lcd.setCursor(0, 2);
      String line3 = "Rain:";
      line3.concat(String(lastData.rainMM, 1));
      line3.concat("mm PM25:");
      line3.concat(String(lastData.pm25));
      lcd.print(line3);
      lcd.setCursor(0, 3);
      String line4 = "Bat:";
      line4.concat(String(battPct));
      line4.concat("% RSSI:");
      line4.concat(String(lastData.rssi));
      lcd.print(line4);
      break;
    }

    case 1: { // Node status page
      String line5 = "NODE: ";
      line5.concat(lastData.nodeId);
      lcd.setCursor(0, 0); lcd.print(line5);
      String line6 = "Alt:";
      line6.concat(String(lastData.altitude, 0));
      line6.concat("m Snd:");
      line6.concat(String(lastData.sounddB, 0));
      line6.concat("dB");
      lcd.setCursor(0, 1); lcd.print(line6);
      String line7 = "SNR:";
      line7.concat(String(lastData.snr, 1));
      line7.concat("dB");
      lcd.setCursor(0, 2); lcd.print(line7);
      lcd.setCursor(0, 3); lcd.print(lastData.sosActive ? "*** SOS ACTIVE ***" : "Status: NORMAL");
      break;
    }

    case 2: { // SOS / Alert page
      if (lastData.sosActive) {
        lcd.setCursor(0, 0); lcd.print("!! EMERGENCY SOS !!");
        String line8 = "Node: ";
        line8.concat(lastData.nodeId);
        lcd.setCursor(0, 1); lcd.print(line8);
        String line9 = "Lat:";
        line9.concat(String(lastData.lat, 4));
        lcd.setCursor(0, 2); lcd.print(line9);
        String line10 = "Lon:";
        line10.concat(String(lastData.lon, 4));
        lcd.setCursor(0, 3); lcd.print(line10);
      } else {
        lcd.setCursor(0, 0); lcd.print("  System Normal     ");
        String line11 = "WiFi: ";
        line11.concat(wifiConnected ? "Connected   " : "Disconnected");
        lcd.setCursor(0, 1); lcd.print(line11);
        lcd.setCursor(0, 2); lcd.print("Firebase: Active");
        String line12 = "Bat:";
        line12.concat(String(battPct));
        line12.concat("% ");
        line12.concat(String(battV, 1));
        line12.concat("V");
        lcd.setCursor(0, 3); lcd.print(line12);
      }
      break;
    }
  }

  lcdPage++;
}

// ─── Firebase Push ────────────────────────────────────────────────────────────
void pushToFirebase(const SensorData& d) {
  if (!wifiConnected) return;

  // Push live weather to Realtime Database
  String path = "/weather_nodes/";
  path.concat(d.nodeId);

  FirebaseJson json;
  json.set("timestamp/.sv", "timestamp");
  json.set("temp", d.temp);
  json.set("humidity", d.humidity);
  json.set("pressure", d.pressure);
  json.set("altitude", d.altitude);
  json.set("heat_index", d.heatIndex);
  json.set("rain_mm", d.rainMM);
  json.set("sound_db", d.sounddB);
  json.set("pm2_5", d.pm25);
  json.set("pm10", d.pm10);
  json.set("pressure_trend", d.pressTrend);
  json.set("active_sos", d.sosActive);
  json.set("lat", d.lat);
  json.set("lon", d.lon);
  json.set("rssi", d.rssi);
  json.set("snr", d.snr);

  if (!Firebase.updateNode(fbData, path.c_str(), json)) {
    String s = "Firebase error: ";
    s.concat(fbData.errorReason());
    Serial.println(s);
  }

  // If SOS active, also write to sos_events
  if (d.sosActive) {
    FirebaseJson sosJson;
    sosJson.set("node_id", d.nodeId);
    sosJson.set("lat", d.lat);
    sosJson.set("lon", d.lon);
    sosJson.set("timestamp/.sv", "timestamp");
    sosJson.set("resolved", false);
    String sosPath = "/sos_events/";
    sosPath.concat(d.nodeId);
    Firebase.updateNode(fbData, sosPath.c_str(), sosJson);
  }

  // Check if Firebase has cleared SOS (admin resolved it)
  String activePath = path;
  activePath.concat("/active_sos");
  if (Firebase.getBool(fbData, activePath.c_str())) {
    bool remoteSOSState = fbData.boolData();
    if (!remoteSOSState && d.sosActive) {
      Serial.println("SOS cleared by admin via Firebase");
    }
  }
}

// ─── Check Firebase for Siren Command ─────────────────────────────────────────
void checkFirebaseSirenCmd() {
  if (!wifiConnected) return;
  if (millis() - lastFirebaseCheck < 3000) return;
  lastFirebaseCheck = millis();

  if (Firebase.getBool(fbData, "/system/trigger_siren")) {
    sirenActive = fbData.boolData();
    if (sirenActive) sirenStartTime = millis();
  }
}

// ─── WiFi Connection ──────────────────────────────────────────────────────────
void connectWiFi() {
  Serial.print("Connecting WiFi...");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  wifiConnected = (WiFi.status() == WL_CONNECTED);
  digitalWrite(LED_WIFI, wifiConnected ? HIGH : LOW);

  if (wifiConnected) {
    String wifiMsg = "\nWiFi OK: ";
    wifiMsg.concat(WiFi.localIP().toString());
    Serial.println(wifiMsg);
  } else {
    Serial.println("\nWiFi FAILED — operating offline");
  }
}



// ─── Setup ────────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  Wire.begin();

  pinMode(LED_WIFI, OUTPUT);

  // LCD init
  lcd.init();
  lcd.backlight();
  lcd.clear();
  lcd.setCursor(4, 0); lcd.print("MOUNTAIN SOS");
  lcd.setCursor(6, 1); lcd.print("SYSTEM");
  lcd.setCursor(3, 3); lcd.print("Initializing...");
  delay(2000);

  // I2S Amplifier
  setupI2SAmp();

  // WiFi + Firebase
  connectWiFi();

  if (wifiConnected) {
    fbConfig.host = FIREBASE_HOST;
    fbConfig.signer.tokens.legacy_token = FIREBASE_AUTH;
    Firebase.begin(&fbConfig, &fbAuth);
    Firebase.reconnectWiFi(true);
    Serial.println("Firebase ready");
  }

  lcd.clear();
  lcd.setCursor(0, 0); lcd.print("Gateway Ready");
  String s = "WiFi: ";
  s.concat(wifiConnected ? "OK" : "FAIL");
  lcd.setCursor(0, 1); lcd.print(s);
  lcd.setCursor(0, 2); lcd.print("Firebase Connected");
  delay(2000);
}

// ─── Main Loop ────────────────────────────────────────────────────────────────
void loop() {
  // LoRa communication removed - data now sourced from Firebase or other means

  // --- Siren playback ---
  if (sirenActive) {
    playSirenChunk();
    // Auto-stop after 60 seconds if not refreshed
    if (millis() - sirenStartTime > 60000) {
      sirenActive = false;
      stopSiren();
    }
  }

  // --- LCD update every 4 seconds ---
  if (millis() - lastLCDUpdate > 4000) {
    lastLCDUpdate = millis();
    updateLCD();
  }

  // --- Check Firebase for remote siren command ---
  checkFirebaseSirenCmd();

  // --- WiFi reconnect if dropped ---
  if (WiFi.status() != WL_CONNECTED) {
    wifiConnected = false;
    digitalWrite(LED_WIFI, LOW);
    if (millis() % 30000 < 100) connectWiFi();
  }
}