// ═══════════════════════════════════════════════════
//  ENVIRONMENTAL ROVER — ROOM SCANNER v3.0
//  Stop-Scan-Move: servo sweep at each stop point
//  Builds occupancy grid map via 13-angle sonar sweep
//  Uploads to LOCAL Node.js Digital Twin Server
// ═══════════════════════════════════════════════════

#include <AFMotor.h>
#include <NewPing.h>
#include <Servo.h>
#include <DHT.h>
#include <SoftwareSerial.h>

// ── Pins ──────────────────────────────────────────
#define TRIG_PIN     A0
#define ECHO_PIN     A1
#define MQ_PIN       A2
#define DHT_PIN      A3

// ── Motor Settings ────────────────────────────────
#define MAX_DISTANCE  200
#define BASE_SPEED    180
#define BACK_BOOST    40

// ═══════════════════════════════════════════════════
//  NETWORK CONFIG  ← only edit these lines
// ═══════════════════════════════════════════════════
const char SSID[]      = "Roshani";           // your WiFi SSID
const char PASS[]      = "Nikant@9822";        // your WiFi password
const char SERVER_IP[] = "192.168.0.106";      // your laptop's LAN IP
const int  SERVER_PORT = 5000;                 // Node server port
// ═══════════════════════════════════════════════════

// ── Calibration ───────────────────────────────────
// IMPORTANT: measure your rover's actual forward speed!
// 1. Place rover, run forward 3s, measure distance in cm
// 2. SPEED_CMPS = measured_cm / 3.0
const float SPEED_CMPS   = 19.0;   // cm per second (calibrate!)
const float SCAN_DIST_CM = 40.0;   // scan every ~40 cm of travel

// ── Objects ───────────────────────────────────────
SoftwareSerial esp8266(A4, A5);
NewPing sonar(TRIG_PIN, ECHO_PIN, MAX_DISTANCE);
DHT dht(DHT_PIN, DHT11);

AF_DCMotor motor1(1, MOTOR12_1KHZ);
AF_DCMotor motor2(2, MOTOR12_1KHZ);
AF_DCMotor motor3(3, MOTOR34_1KHZ);
AF_DCMotor motor4(4, MOTOR34_1KHZ);
Servo myservo;

// ── State ─────────────────────────────────────────
bool  wifiReady      = false;
int   uploadFailCount = 0;
int   distance       = 100;
bool  goesForward    = false;

// ── Dead-Reckoning Position ────────────────────────
float roverX       = 0.0;   // cm from start
float roverY       = 0.0;   // cm from start
float roverHeading = 0.0;   // degrees (0=North, 90=East)
bool  isMovingFwd  = false;

// Movement timing for dead-reckoning
unsigned long moveStartTime  = 0;
float distSinceLastScan      = 0.0;

// ══════════════════════════════════════════════════
//  ESP8266 HELPERS
// ══════════════════════════════════════════════════
void espSend(String cmd) {
  for (int i = 0; i < cmd.length(); i++) { esp8266.write(cmd[i]); delay(3); }
  esp8266.write('\r'); esp8266.write('\n');
}

bool espWaitFor(const char* target, int timeout) {
  String buf = "";
  long t = millis();
  while (millis() - t < timeout) {
    if (esp8266.available()) {
      char c = esp8266.read();
      buf += c;
      if (buf.indexOf(target) != -1) return true;
      if (buf.length() > 300) buf = buf.substring(150);
    }
  }
  return false;
}

void espFlush() { delay(200); while (esp8266.available()) esp8266.read(); }

bool connectWiFi() {
  Serial.println(F("[WiFi] Connecting..."));
  espFlush();
  espSend("AT+CWMODE=1"); espWaitFor("OK", 2000); espFlush();
  String cmd = "AT+CWJAP=\""; cmd += SSID; cmd += "\",\""; cmd += PASS; cmd += "\"";
  espSend(cmd);
  if (espWaitFor("OK", 20000)) { Serial.println(F("[WiFi] Connected!")); return true; }
  Serial.println(F("[WiFi] Failed — running offline")); return false;
}

// ══════════════════════════════════════════════════
//  FULL SERVO SWEEP — 13 angles, 0° to 180°
//  Returns JSON array: [{"a":0,"d":125},{"a":15,"d":130},...]
// ══════════════════════════════════════════════════
String doFullScan() {
  String result = "[";
  int angles[] = {0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180};
  int numAngles = 13;

  for (int i = 0; i < numAngles; i++) {
    myservo.write(angles[i]);
    delay(320);  // wait for servo to reach position

    int d = sonar.ping_cm();
    if (d == 0) d = 200;  // 0 = nothing in range → max distance

    Serial.print(F("  Scan ")); Serial.print(angles[i]);
    Serial.print(F("°: ")); Serial.print(d); Serial.println(F(" cm"));

    result += "{\"a\":";
    result += String(angles[i]);
    result += ",\"d\":";
    result += String(d);
    result += "}";
    if (i < numAngles - 1) result += ",";
  }
  result += "]";

  myservo.write(90);  // return to center/forward
  delay(400);
  return result;
}

// ══════════════════════════════════════════════════
//  UPLOAD SCAN DATA TO DIGITAL TWIN SERVER
// ══════════════════════════════════════════════════
void uploadScanData(float temp, float hum, int gas, String scanJson) {
  Serial.println(F("\n[Upload] Sending scan packet..."));

  // Build JSON body with full scan array
  String body = "{";
  body += "\"x\":"       + String(roverX, 1)       + ",";
  body += "\"y\":"       + String(roverY, 1)        + ",";
  body += "\"heading\":" + String((int)roverHeading) + ",";
  body += "\"scan\":"    + scanJson                  + ",";
  body += "\"temp\":"    + String(temp, 1)            + ",";
  body += "\"gas\":"     + String(gas)                + ",";
  body += "\"hum\":"     + String(hum, 0)             + ",";
  body += "\"distance\":" + String(sonar.ping_cm() || 200);
  body += "}";

  String req  = "POST /rover-data HTTP/1.1\r\n";
  req += "Host: "; req += SERVER_IP; req += ":"; req += String(SERVER_PORT); req += "\r\n";
  req += "Connection: close\r\n";
  req += "Content-Type: application/json\r\n";
  req += "Content-Length: " + String(body.length()) + "\r\n\r\n";
  req += body;

  espFlush();
  String cipStart = "AT+CIPSTART=\"TCP\",\"";
  cipStart += SERVER_IP; cipStart += "\","; cipStart += String(SERVER_PORT);
  espSend(cipStart);

  if (!espWaitFor("CONNECT", 8000)) {
    Serial.println(F("[Upload] TCP connect failed"));
    espSend("AT+CIPCLOSE"); espFlush();
    uploadFailCount++;
    if (uploadFailCount >= 3) {
      Serial.println(F("[Upload] 3 failures — reconnecting WiFi..."));
      wifiReady = connectWiFi(); uploadFailCount = 0;
    }
    return;
  }

  espSend("AT+CIPSEND=" + String(req.length()));
  espWaitFor(">", 4000);
  for (int i = 0; i < req.length(); i++) { esp8266.write(req[i]); delay(3); }

  if (espWaitFor("SEND OK", 8000)) {
    uploadFailCount = 0;
    Serial.print(F("[Upload] OK  X="));  Serial.print(roverX, 0);
    Serial.print(F(" Y="));             Serial.print(roverY, 0);
    Serial.print(F(" Hdg="));           Serial.print((int)roverHeading);
    Serial.print(F(" T="));             Serial.print(temp);
    Serial.print(F(" H="));             Serial.print(hum);
    Serial.print(F(" G="));             Serial.println(gas);
  } else {
    Serial.println(F("[Upload] No SEND OK"));
  }

  delay(300);
  espSend("AT+CIPCLOSE"); espFlush();
}

// ── Stop, Sweep, Upload ────────────────────────────
void doScanStop() {
  moveStop();
  delay(300);  // let rover settle

  float temp = dht.readTemperature();
  float hum  = dht.readHumidity();
  int   gas  = analogRead(MQ_PIN);
  if (isnan(temp)) temp = 0;
  if (isnan(hum))  hum  = 0;

  Serial.println(F("\n═══ SCANNING ═══"));
  Serial.print(F("  Pos: X=")); Serial.print(roverX,0);
  Serial.print(F(" Y="));      Serial.print(roverY,0);
  Serial.print(F(" Hdg="));    Serial.println((int)roverHeading);
  Serial.print(F("  Temp: ")); Serial.print(temp); Serial.println(F("°C"));
  Serial.print(F("  Hum:  ")); Serial.print(hum);  Serial.println(F("%"));
  Serial.print(F("  Gas:  ")); Serial.println(gas);

  String scanJson = doFullScan();

  if (wifiReady) {
    uploadScanData(temp, hum, gas, scanJson);
  } else {
    Serial.println(F("  (Offline — scan captured locally)"));
  }

  distSinceLastScan = 0.0;
  goesForward = false;  // re-ramp motors cleanly after upload pause
}

// ══════════════════════════════════════════════════
//  DEAD-RECKONING
// ══════════════════════════════════════════════════
void updatePosition(unsigned long dt_ms) {
  // dt_ms = time in milliseconds since last call while moving forward
  float dist = SPEED_CMPS * (dt_ms / 1000.0);
  float rad  = roverHeading * PI / 180.0;
  roverX += dist * sin(rad);
  roverY += dist * cos(rad);
  distSinceLastScan += dist;
}

// ══════════════════════════════════════════════════
//  MOVEMENT FUNCTIONS
// ══════════════════════════════════════════════════
int clamp(int val) {
  if (val < 0) return 0;
  if (val > 255) return 255;
  return val;
}

int readPing() { delay(70); int cm = sonar.ping_cm(); if (cm == 0) cm = 250; return cm; }

int lookRight() { myservo.write(50); delay(500); int d=readPing(); myservo.write(90); return d; }
int lookLeft()  { myservo.write(170); delay(500); int d=readPing(); myservo.write(90); return d; }

void moveStop() {
  motor1.run(RELEASE); motor2.run(RELEASE);
  motor3.run(RELEASE); motor4.run(RELEASE);
  isMovingFwd = false; goesForward = false;
}

void moveForward() {
  if (!goesForward) {
    goesForward = true; isMovingFwd = true;
    motor1.run(FORWARD); motor1.setSpeed(clamp(BASE_SPEED)); delay(30);
    motor2.run(FORWARD); motor2.setSpeed(clamp(BASE_SPEED+BACK_BOOST)); delay(30);
    motor3.run(FORWARD); motor3.setSpeed(clamp(BASE_SPEED+BACK_BOOST)); delay(30);
    motor4.run(FORWARD); motor4.setSpeed(clamp(BASE_SPEED));
    moveStartTime = millis();
  } else {
    // Update dead-reckoning while already moving
    unsigned long now = millis();
    unsigned long dt  = now - moveStartTime;
    if (dt >= 100) {  // update every 100ms
      updatePosition(dt);
      moveStartTime = now;
    }
    motor1.run(FORWARD); motor1.setSpeed(clamp(BASE_SPEED));
    motor2.run(FORWARD); motor2.setSpeed(clamp(BASE_SPEED+BACK_BOOST));
    motor3.run(FORWARD); motor3.setSpeed(clamp(BASE_SPEED+BACK_BOOST));
    motor4.run(FORWARD); motor4.setSpeed(clamp(BASE_SPEED));
  }
}

void moveBackward() {
  goesForward = false; isMovingFwd = false;
  motor1.run(BACKWARD); motor1.setSpeed(clamp(BASE_SPEED)); delay(30);
  motor2.run(BACKWARD); motor2.setSpeed(clamp(BASE_SPEED+BACK_BOOST)); delay(30);
  motor3.run(BACKWARD); motor3.setSpeed(clamp(BASE_SPEED+BACK_BOOST)); delay(30);
  motor4.run(BACKWARD); motor4.setSpeed(clamp(BASE_SPEED));
}

void turnRight() {
  goesForward = false; isMovingFwd = false;
  motor1.run(FORWARD);  motor1.setSpeed(clamp(BASE_SPEED));
  motor2.run(FORWARD);  motor2.setSpeed(clamp(BASE_SPEED+BACK_BOOST));
  motor3.run(BACKWARD); motor3.setSpeed(clamp(BASE_SPEED+BACK_BOOST));
  motor4.run(BACKWARD); motor4.setSpeed(clamp(BASE_SPEED));
  delay(500);  // ~90° turn — calibrate this delay!
  roverHeading = fmod(roverHeading + 90.0, 360.0);
  moveStop();
}

void turnLeft() {
  goesForward = false; isMovingFwd = false;
  motor1.run(BACKWARD); motor1.setSpeed(clamp(BASE_SPEED));
  motor2.run(BACKWARD); motor2.setSpeed(clamp(BASE_SPEED+BACK_BOOST));
  motor3.run(FORWARD);  motor3.setSpeed(clamp(BASE_SPEED+BACK_BOOST));
  motor4.run(FORWARD);  motor4.setSpeed(clamp(BASE_SPEED));
  delay(500);  // ~90° turn — calibrate!
  roverHeading = fmod(roverHeading - 90.0 + 360.0, 360.0);
  moveStop();
}

// ══════════════════════════════════════════════════
//  SETUP
// ══════════════════════════════════════════════════
void setup() {
  Serial.begin(9600);
  esp8266.begin(9600);
  dht.begin();

  Serial.println(F("─────────────────────────"));
  Serial.println(F("  ROVER ROOM SCANNER v3.0"));
  Serial.println(F("  Stop-Scan-Move Mode    "));
  Serial.print(F("  POST → http://"));
  Serial.print(SERVER_IP); Serial.print(F(":")); Serial.print(SERVER_PORT);
  Serial.println(F("/rover-data"));
  Serial.println(F("─────────────────────────"));

  myservo.attach(10);
  myservo.write(90);  // center
  delay(2000);

  distance = readPing(); delay(100);
  distance = readPing();

  myservo.detach();
  wifiReady = connectWiFi();
  myservo.attach(10);

  // Initial scan at starting position
  Serial.println(F("─────────────────────────"));
  Serial.println(F("  INITIAL POSITION SCAN  "));
  Serial.println(F("─────────────────────────"));
  doScanStop();

  Serial.println(F("─────────────────────────"));
  Serial.println(F("  ROVER ACTIVE           "));
  Serial.println(F("─────────────────────────"));
}

// ══════════════════════════════════════════════════
//  MAIN LOOP — Stop-Scan-Move cycle
// ══════════════════════════════════════════════════
void loop() {
  delay(40);
  distance = readPing();
  Serial.print(F("Dist: ")); Serial.print(distance); Serial.println(F(" cm"));

  if (distance <= 35) {
    // ── OBSTACLE DETECTED ──────────────────────────
    Serial.println(F("OBSTACLE!"));
    moveStop(); delay(100);
    moveBackward(); delay(300);
    moveStop(); delay(200);

    // Scan at obstacle point before deciding direction
    doScanStop();

    // Quick left/right peek for avoidance
    int distR = lookRight(); delay(200);
    int distL = lookLeft();  delay(200);

    if (distR >= distL) { turnRight(); }
    else               { turnLeft();  }

    // Scan again after turn
    delay(200);
    doScanStop();

  } else {
    // ── MOVING FORWARD ─────────────────────────────
    moveForward();

    // Scan every SCAN_DIST_CM of travel
    if (distSinceLastScan >= SCAN_DIST_CM) {
      Serial.println(F("SCAN POINT REACHED"));
      doScanStop();
    }
  }
}
