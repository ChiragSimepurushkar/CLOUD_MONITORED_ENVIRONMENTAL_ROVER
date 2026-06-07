/**
 * 🤖 Arduino Uno + ESP8266 WiFi Shield - Rover Hardware Code
 * Teammate: Chirag (Hardware Developer)
 * 
 * This sketch runs on the main Arduino Uno. It uses SoftwareSerial to send AT 
 * commands to the ESP8266 (ESP-01) module to establish WiFi connection.
 * It reads sensor data (DHT11 & MQ-2 Gas) and sends them to the Node.js server.
 * It also polls the server for steering commands and controls the motor driver.
 * 
 * REQUIRED LIBRARIES (Install via Arduino IDE Library Manager):
 *   1. "WiFiEsp" by Bruno Portaluri (Wraps ESP8266 AT commands into WiFi Client)
 *   2. "DHT sensor library" by Adafruit
 *   3. "Adafruit Unified Sensor"
 */

#include "WiFiEsp.h"
#include <DHT.h>

// --- ESP8266 Software Serial Setup ---
// Arduino RX (Pin 2) -> ESP8266 TX
// Arduino TX (Pin 3) -> ESP8266 RX (Use voltage divider: 1k & 2k resistors!)
#ifndef HAVE_HWSERIAL1
#include "SoftwareSerial.h"
SoftwareSerial Serial1(2, 3); // RX, TX
#endif

// --- WiFi Credentials ---
char ssid[] = "YOUR_WIFI_NAME";            // Replace with your Hotspot/WiFi name
char pass[] = "YOUR_WIFI_PASSWORD";        // Replace with your WiFi password
int status = WL_IDLE_STATUS;

// --- Express Server Config ---
char server[] = "192.168.1.5";             // Replace with Person 2's laptop local IP!
int port = 3000;

// --- Sensor Pin Definitions ---
#define DHTPIN 4                           // DHT11 Temp/Humidity Sensor on Pin D4
#define DHTTYPE DHT11                      // DHT 11
DHT dht(DHTPIN, DHTTYPE);

#define GAS_PIN A0                         // MQ-2 Analog Gas Sensor on A0
#define LED_PIN 5                          // Headlight LED on D5

// --- L298N Motor Driver Pin Definitions ---
float roverX           = 0.0;
float roverY           = 0.0;
float roverHeading     = 0.0;  // 0=North 90=East 180=South 270=West
float distSinceLastScan = 0.0;

// ── MIT App Inventor control state ───────────────────────────
String       lastCommand    = "stop";  // last command received from app
bool         manualMode     = false;   // true = app is controlling the rover
unsigned long lastPollTime  = 0;
const unsigned long pollInterval = 3000; // check server every 3s
#define ENA 6                              // Left Motor Speed (Optional PWM)
#define IN1 7                              // Left Motor direction 1
#define IN2 8                              // Left Motor direction 2
#define IN3 9                              // Right Motor direction 1
#define IN4 10                             // Right Motor direction 2
#define ENB 11                             // Right Motor Speed (Optional PWM)

// Initialize the WiFi Client
WiFiEspClient client;

// Timers to avoid blocking code
unsigned long lastSendTime = 0;
const unsigned long sendInterval = 3000;   // Send sensor data every 3 seconds

void setup() {
  Serial.begin(9600);                      // Hardware serial for Arduino IDE Serial Monitor
  Serial1.begin(9600);                     // Software serial for ESP8266 (Must match ESP8266 AT baud rate)

  // Initialize sensors
  dht.begin();
  pinMode(GAS_PIN, INPUT);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  // Initialize Motor Driver Pins
  pinMode(ENA, OUTPUT);
  pinMode(ENB, OUTPUT);
  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
  pinMode(IN3, OUTPUT);
  pinMode(IN4, OUTPUT);
  
  // Set default speed (Max speed = 255)
  analogWrite(ENA, 200);
  analogWrite(ENB, 200);
  
  stopRover(); // Make sure rover doesn't move immediately

  // Initialize ESP8266 module
  Serial.println("Initializing ESP8266 WiFi module...");
  WiFi.init(&Serial1);

  // Check presence of shield
  if (WiFi.status() == WL_NO_SHIELD) {
    Serial.println("❌ ESP8266 WiFi shield not found!");
    while (true); // Halt execution
  }

  // Connect to WiFi network
  while (status != WL_CONNECTED) {
    Serial.print("Connecting to SSID: ");
    Serial.println(ssid);
    status = WiFi.begin(ssid, pass);
  }

  Serial.println("🟢 WiFi Connected Successfully!");
  printWifiStatus();
}

void loop() {
  delay(40);

  // ── Poll server for app command every 3s ────────────────────────────
  if (millis() - lastPollTime >= pollInterval) {
    lastPollTime = millis();
    pollCommand();
  }

  // ── MANUAL MODE: app has taken control ─────────────────────────────
  if (manualMode) {
    if      (lastCommand == "forward")  moveForward();
    else if (lastCommand == "backward") moveBackward();
    else if (lastCommand == "left")     turnLeft();
    else if (lastCommand == "right")    turnRight();
    else                                stopRover();
    return;  // ← skip ALL autonomous navigation below
  }

  // Task 2: Read sensors & POST data to server (Every 3 seconds)
  unsigned long currentTime = DateNowSimulator();
  if (currentTime - lastSendTime >= sendInterval) {
    lastSendTime = currentTime;
    postSensorData();
    pollLedState();
  }
}

// Wrapper for millis()
unsigned long DateNowSimulator() {
  return millis();
}

// ════════════════════════════════════════════════════════════
//  POLL SERVER — GET /rover/command/raw (lightweight, every 3s)
// ════════════════════════════════════════════════════════════
void pollCommand() {
  if (client.connect(server, port)) {
    client.println("GET /rover/command/raw HTTP/1.1");
    client.print("Host: ");
    client.println(server);
    client.println("Connection: close");
    client.println(); 

    String response = readRawResponse();
    response.trim();

    if (response.length() > 0) {
      if (response == "auto") {
        if (manualMode) {
          manualMode = false;
          stopRover();
        }
      } else {
        manualMode = true;
        lastCommand = response;
      }
    }
    client.stop();
  }
}

// 2. GET /rover/led/raw -> Read LED light status from Express server
void pollLedState() {
  if (client.connect(server, port)) {
    client.println("GET /rover/led/raw HTTP/1.1");
    client.print("Host: ");
    client.println(server);
    client.println("Connection: close");
    client.println();

    String response = readRawResponse();
    response.trim();

    if (response.length() > 0) {
      Serial.print("LED State: ");
      Serial.println(response);
      if (response == "on") {
        digitalWrite(LED_PIN, HIGH);
      } else {
        digitalWrite(LED_PIN, LOW);
      }
    }
    client.stop();
  }
}

// 3. POST /data -> Upload Temp, Humidity, and Gas values as JSON
void postSensorData() {
  float temp = dht.readTemperature();
  float humidity = dht.readHumidity();
  int gas = analogRead(GAS_PIN);

  // Check if readings failed
  if (isnan(temp) || isnan(humidity)) {
    Serial.println("⚠️ Failed to read from DHT sensor! Using fallback.");
    temp = 24.0;
    humidity = 50.0;
  }

  // Build JSON Payload
  String payload = "{\"temp\":" + String(temp, 1) + 
                   ",\"humidity\":" + String(humidity, 0) + 
                   ",\"gas\":" + String(gas) + "}";

  if (client.connect(server, port)) {
    Serial.println("Uploading sensor data...");
    
    // HTTP POST Headers
    client.println("POST /data HTTP/1.1");
    client.print("Host: ");
    client.println(server);
    client.println("Content-Type: application/json");
    client.print("Content-Length: ");
    client.println(payload.length());
    client.println("Connection: close");
    client.println(); // Header terminal marker
    client.print(payload); // Body payload
    
    client.stop();
    Serial.println("Upload complete.");
  } else {
    Serial.println("❌ Connection to server failed for POST.");
  }
}

// Helper to strip HTTP headers and return only the raw text body
String readRawResponse() {
  unsigned long timeout = millis();
  while (client.available() == 0) {
    if (millis() - timeout > 1500) {
      return ""; // Timeout
    }
  }

  String response = "";
  boolean isBody = false;
  
  while (client.available()) {
    String line = client.readStringUntil('\r');
    if (line == "\n") {
      isBody = true; // Body starts after empty line (\r\n)
      continue;
    }
    if (isBody) {
      response += line;
    }
  }
  return response;
}

// --- ROVER MOVEMENT LOGIC ---

void executeCommand(String cmd) {
  if (cmd == "forward") {
    moveForward();
  } else if (cmd == "backward") {
    moveBackward();
  } else if (cmd == "left") {
    turnLeft();
  } else if (cmd == "right") {
    turnRight();
  } else {
    stopRover();
  }
}

void moveForward() {
  digitalWrite(IN1, HIGH);
  digitalWrite(IN2, LOW);
  digitalWrite(IN3, HIGH);
  digitalWrite(IN4, LOW);
}

void moveBackward() {
  digitalWrite(IN1, LOW);
  digitalWrite(IN2, HIGH);
  digitalWrite(IN3, LOW);
  digitalWrite(IN4, HIGH);
}

void turnLeft() {
  digitalWrite(IN1, LOW);
  digitalWrite(IN2, HIGH); // Left motor back
  digitalWrite(IN3, HIGH);
  digitalWrite(IN4, LOW);  // Right motor forward
}

void turnRight() {
  digitalWrite(IN1, HIGH);
  digitalWrite(IN2, LOW);  // Left motor forward
  digitalWrite(IN3, LOW);
  digitalWrite(IN4, HIGH); // Right motor back
}

void stopRover() {
  digitalWrite(IN1, LOW);
  digitalWrite(IN2, LOW);
  digitalWrite(IN3, LOW);
  digitalWrite(IN4, LOW);
}

// --- DEBUG HELPER ---
void printWifiStatus() {
  // Print local IP address
  IPAddress ip = WiFi.localIP();
  Serial.print("IP Address: ");
  Serial.println(ip);
}
