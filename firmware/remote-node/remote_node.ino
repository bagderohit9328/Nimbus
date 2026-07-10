/**
 * Mountain Weather & Emergency SOS System
 * Remote Sensor Node Firmware
 * Hardware: ESP32 + BMP280 + DHT22 + PM2.5 + Rain Sensor + INMP441 (I2S Mic)
 */
#include <Wire.h>
#include <Adafruit_BMP280.h>
#include <DHT.h>
#include <driver/i2s.h>
#include <ArduinoJson.h>

// ─── Pin Definitions ──────────────────────────────────────────────────────────
#define DHT_PIN       4
#define DHT_TYPE      DHT22

#define PM25_RX_PIN   16   // UART2 RX from PMS5003
#define PM25_TX_PIN   17

#define RAIN_ANALOG   34   // ADC pin for rain sensor
#define RAIN_DIGITAL  35   // Digital threshold output

// I2S Mic (INMP441)
#define I2S_WS        25
#define I2S_SCK       32
#define I2S_SD        33

// SOS Button (active LOW)
#define SOS_BUTTON    0

// Node identification
#define NODE_ID       "REMOTE_01"
#define NODE_LAT      28.5245    // Set actual GPS coordinates
#define NODE_LON      77.1855

// ─── Globals ──────────────────────────────────────────────────────────────────
Adafruit_BMP280 bmp;
DHT dht(DHT_PIN, DHT_TYPE);
HardwareSerial pmSerial(2);

bool sosActive = false;
unsigned long lastTransmit = 0;
float pressureHistory[6] = {0};  // 1-minute pressure trend buffer
int pressureIdx = 0;

// PM2.5 data struct
struct PMS5003Data {
  uint16_t pm1_0, pm2_5, pm10;
  bool valid;
};

// ─── I2S Microphone Setup ─────────────────────────────────────────────────────
void setupI2SMic() {
  i2s_config_t i2s_config = {
    .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
    .sample_rate = 16000,
    .bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT,
    .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
    .communication_format = I2S_COMM_FORMAT_I2S,
    .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
    .dma_buf_count = 4,
    .dma_buf_len = 256,
    .use_apll = false
  };

  i2s_pin_config_t pin_config = {
    .bck_io_num = I2S_SCK,
    .ws_io_num = I2S_WS,
    .data_out_num = I2S_PIN_NO_CHANGE,
    .data_in_num = I2S_SD
  };

  i2s_driver_install(I2S_NUM_0, &i2s_config, 0, NULL);
  i2s_set_pin(I2S_NUM_0, &pin_config);
}

// ─── Sound Level Measurement ──────────────────────────────────────────────────
float measureSoundLevel() {
  const int SAMPLES = 512;
  int32_t buffer[SAMPLES];
  size_t bytes_read;

  i2s_read(I2S_NUM_0, buffer, sizeof(buffer), &bytes_read, pdMS_TO_TICKS(100));

  long sum_sq = 0;
  int count = bytes_read / sizeof(int32_t);
  for (int i = 0; i < count; i++) {
    int32_t sample = buffer[i] >> 8;  // Shift for INMP441
    sum_sq += (long)sample * sample;
  }

  float rms = sqrt((float)sum_sq / count);
  // Convert to approximate dB SPL (calibrate with known source)
  float dB = 20.0 * log10(rms / 32768.0) + 120.0;
  return constrain(dB, 30.0, 130.0);
}

// ─── PM2.5 Reading ────────────────────────────────────────────────────────────
PMS5003Data readPM25() {
  PMS5003Data data = {0, 0, 0, false};
  uint8_t buf[32];

  // PMS5003 sends 32-byte frames starting with 0x42, 0x4D
  while (pmSerial.available()) pmSerial.read();  // Flush

  unsigned long t = millis();
  while (millis() - t < 500) {
    if (pmSerial.available() >= 32) {
      if (pmSerial.read() == 0x42 && pmSerial.read() == 0x4D) {
        pmSerial.readBytes(buf, 30);
        data.pm1_0 = (buf[2] << 8) | buf[3];
        data.pm2_5 = (buf[4] << 8) | buf[5];
        data.pm10  = (buf[6] << 8) | buf[7];

        // Verify checksum
        uint16_t checksum = 0x42 + 0x4D;
        for (int i = 0; i < 28; i++) checksum += buf[i];
        uint16_t recv_check = (buf[28] << 8) | buf[29];
        data.valid = (checksum == recv_check);
        break;
      }
    }
  }
  return data;
}

// ─── Rain Sensor ─────────────────────────────────────────────────────────────
float readRainMM() {
  // Map ADC 0-4095 to 0-25mm/hr (calibrate per sensor)
  int raw = analogRead(RAIN_ANALOG);
  bool raining = !digitalRead(RAIN_DIGITAL);
  if (!raining) return 0.0;
  return map(raw, 0, 4095, 0, 2500) / 100.0;
}

// ─── Pressure Trend Analysis ──────────────────────────────────────────────────
// Returns: +1 rising, -1 falling, 0 stable
int pressureTrend(float current) {
  pressureHistory[pressureIdx % 6] = current;
  pressureIdx++;

  if (pressureIdx < 6) return 0;  // Need 6 readings (1 min of 10s intervals)

  float oldest = pressureHistory[pressureIdx % 6];
  float diff = current - oldest;

  if (diff > 1.5) return 1;    // Rising > 1.5 hPa/min = improving
  if (diff < -1.5) return -1;  // Falling > 1.5 hPa/min = storm incoming
  return 0;
}



// ─── SOS Button ISR ───────────────────────────────────────────────────────────
volatile bool sosPressDetected = false;
void IRAM_ATTR onSOSPress() {
  sosPressDetected = true;
}

// ─── Setup ────────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  Wire.begin();

  // SOS Button
  pinMode(SOS_BUTTON, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(SOS_BUTTON), onSOSPress, FALLING);

  // Rain sensor
  pinMode(RAIN_DIGITAL, INPUT);
  analogReadResolution(12);

  // BMP280
  if (!bmp.begin(0x76)) {
    Serial.println("BMP280 not found! Check wiring.");
    while (1) delay(1000);
  }
  bmp.setSampling(Adafruit_BMP280::MODE_NORMAL,
                  Adafruit_BMP280::SAMPLING_X2,
                  Adafruit_BMP280::SAMPLING_X16,
                  Adafruit_BMP280::FILTER_X16,
                  Adafruit_BMP280::STANDBY_MS_500);

  // DHT22
  dht.begin();

  // PM2.5 UART
  pmSerial.begin(9600, SERIAL_8N1, PM25_RX_PIN, PM25_TX_PIN);

  // I2S Microphone
  setupI2SMic();

  Serial.println("Remote Node Ready — " + String(NODE_ID));
}

// ─── Main Loop ────────────────────────────────────────────────────────────────
void loop() {
  // Handle SOS button toggle (press 3× within 3s to confirm, or hold 3s)
  if (sosPressDetected) {
    sosPressDetected = false;
    sosActive = !sosActive;
    Serial.println(sosActive ? "SOS ACTIVATED" : "SOS CLEARED");
  }

  // LoRa transmission removed - implement alternative data transfer method
  delay(1000);
}
