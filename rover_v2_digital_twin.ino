// ═══════════════════════════════════════════════════════════════
//  ENVIRONMENTAL ROVER — ROOM SCANNER v4.0  (FINAL)
//  Merges: v3.0 fixes (obstacle loop, ESP alive, time-based pos)
//          + Room Scanner (13-angle servo sweep, scan[] upload)
//  Works perfectly with server.js v4.0 + gridMap.js Bresenham engine
// ═══════════════════════════════════════════════════════════════

#include <AFMotor.h>
#include <NewPing.h>
#include <Servo.h>
#include <DHT.h>
#include <SoftwareSerial.h>

// ── Pins ──────────────────────────────────────────────────────
#define TRIG_PIN     A0
#define ECHO_PIN     A1
#define MQ_PIN       A2
#define DHT_PIN      A3

// ── Motor Settings ────────────────────────────────────────────
#define MAX_DISTANCE   200
#define BASE_SPEED     180
#define BACK_BOOST     40
#define SAFE_DIST      40     // cm — path must exceed this to drive

// ══════════════════════════════════════════════════════════════
//  NETWORK CONFIG  ← Edit these 3 lines only
// ══════════════════════════════════════════════════════════════
const char SSID[]      = "Roshani";
const char PASS[]      = "Nikant@9822";
const char SERVER_IP[] = "192.168.0.106";   // ← run 'ipconfig', use IPv4
const int  SERVER_PORT = 5000;              // ← Node server port (5000, NOT 3000)
// ══════════════════════════════════════════════════════════════

// ── Timing ────────────────────────────────────────────────────
// FIX 1: 25 sec between uploads (not 3 sec — TCP kills WiFi power)
#define UPLOAD_EVERY     25000UL

// FIX 3: Wait 1 sec after motors stop before ESP8266 talks
#define MOTOR_SETTLE_MS  1000

// ── Scanning & Position ───────────────────────────────────────
// HOW TO CALIBRATE SPEED:
//   1. Place rover at 0 cm mark, run forward exactly 3 seconds
//   2. Measure actual distance in cm
//   3. SPEED_CM_PER_MS = measured_cm / 3000.0
//
// Typical small rover (BASE_SPEED=180): ~19 cm/s = 0.019 cm/ms
// Your code had 0.3 cm/ms = 300 cm/s — that is 50× too fast!
const float SPEED_CM_PER_MS = 0.019;  // ← TUNE THIS (see above)

// Rover stops and does full 13-ray scan every ~40 cm of travel
const float SCAN_DIST_CM    = 40.0;

// ── Objects ───────────────────────────────────────────────────
SoftwareSerial esp8266(A4, A5);
NewPing sonar(TRIG_PIN, ECHO_PIN, MAX_DISTANCE);
DHT dht(DHT_PIN, DHT11);

AF_DCMotor motor1(1, MOTOR12_1KHZ);
AF_DCMotor motor2(2, MOTOR12_1KHZ);
AF_DCMotor motor3(3, MOTOR34_1KHZ);
AF_DCMotor motor4(4, MOTOR34_1KHZ);
Servo myservo;

// ── State ─────────────────────────────────────────────────────
boolean goesForward      = false;
int     distance         = 100;
bool    wifiReady        = false;
unsigned long lastUpload = 0;
unsigned long moveStart  = 0;
int     uploadFailCount  = 0;

// Dead-reckoning position (cm from start)
float roverX       = 0.0;
float roverY       = 0.0;
float roverHeading = 0.0;   // degrees: 0=North, 90=East, 180=South, 270=West

// Distance travelled since last scan stop
float distSinceLastScan = 0.0;

// ══════════════════════════════════════════════════════════════
//  ESP8266 HELPERS
// ══════════════════════════════════════════════════════════════

void espSend(String cmd) {
  for (int i = 0; i < cmd.length(); i++) {
    esp8266.write(cmd[i]);
    delay(3);
  }
  esp8266.write('\r');
  esp8266.write('\n');
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

void espFlush() {
  delay(200);
  while (esp8266.available()) esp8266.read();
}

// FIX 3: Check ESP8266 is alive before each upload
bool espAlive() {
  espFlush();
  espSend("AT");
  return espWaitFor("OK", 2000);
}

// ── WiFi Connect ──────────────────────────────────────────────
bool connectWiFi() {
  Serial.println(F("[WiFi] Connecting..."));
  espFlush();
  espSend("AT+CWMODE=1");
  espWaitFor("OK", 2000);
  espFlush();

  String cmd = "AT+CWJAP=\"";
  cmd += SSID; cmd += "\",\""; cmd += PASS; cmd += "\"";
  espSend(cmd);

  if (espWaitFor("OK", 20000)) {
    Serial.println(F("[WiFi] Connected!"));
    return true;
  }
  Serial.println(F("[WiFi] Failed — running offline"));
  return false;
}

// ══════════════════════════════════════════════════════════════
//  DEAD-RECKONING — time-based position update
// ══════════════════════════════════════════════════════════════

void updatePositionNow() {
  if (!goesForward || moveStart == 0) return;
  float elapsed    = (float)(millis() - moveStart);
  float dist_moved = elapsed * SPEED_CM_PER_MS;
  float rad        = roverHeading * PI / 180.0;
  roverX           += dist_moved * sin(rad);
  roverY           += dist_moved * cos(rad);
  distSinceLastScan += dist_moved;
  moveStart        = millis();  // reset clock
}

// ══════════════════════════════════════════════════════════════
//  FULL 13-ANGLE SERVO SWEEP
//  Returns JSON array:  [{"a":0,"d":125},{"a":15,"d":130},...]
//  Servo: 90° = forward, 0° = right, 180° = left
// ══════════════════════════════════════════════════════════════

String doFullScan() {
  String result = "[";
  
  // REDUCED FROM 13 TO 7 ANGLES: This prevents the Wi-Fi chip from choking on massive data strings!
  int angles[]  = {0, 30, 60, 90, 120, 150, 180};
  int numAngles = 7;

  Serial.println(F("  [Sweep] Scanning..."));

  for (int i = 0; i < numAngles; i++) {
    myservo.write(angles[i]);
    delay(400);               // Wait slightly longer for servo to settle

    int d = sonar.ping_cm();
    if (d == 0) d = 200;      // 0 = nothing in range → use max

    Serial.print(F("    ")); Serial.print(angles[i]);
    Serial.print(F("°: "));  Serial.print(d); Serial.println(F(" cm"));

    result += "{\"a\":";
    result += String(angles[i]);
    result += ",\"d\":";
    result += String(d);
    result += "}";
    if (i < numAngles - 1) result += ",";
  }

  result += "]";
  myservo.write(90);   // return to center (forward)
  delay(350);
  return result;
}

// ══════════════════════════════════════════════════════════════
//  UPLOAD — sends FULL scan[] packet to gridMap.js on server
//  JSON format:
//    { x, y, heading, scan:[{a,d},...], temp, gas, hum, distance }
// ══════════════════════════════════════════════════════════════

void uploadScanPacket(float temp, float hum, int gas, int dist, String scanJson) {
  Serial.println(F("\n[Upload] Building packet..."));

  // ─ Build JSON body ────────────────────────────────────────
  String body = "{";
  body += "\"x\":"        + String(roverX, 1)        + ",";
  body += "\"y\":"        + String(roverY, 1)         + ",";
  body += "\"heading\":"  + String((int)roverHeading) + ",";
  body += "\"scan\":"     + scanJson                  + ",";  // ← 13-ray sweep
  body += "\"temp\":"     + String(temp, 1)            + ",";
  body += "\"hum\":"      + String(hum, 1)             + ",";  // ← server reads 'hum'
  body += "\"gas\":"      + String(gas)                + ",";
  body += "\"distance\":" + String(dist)               + "}";

  // ─ HTTP POST ──────────────────────────────────────────────
  String req  = "POST /rover-data HTTP/1.1\r\n";
  req += "Host: "; req += SERVER_IP; req += ":"; req += String(SERVER_PORT); req += "\r\n";
  req += "Connection: close\r\n";
  req += "Content-Type: application/json\r\n";
  req += "Content-Length: " + String(body.length()) + "\r\n\r\n";
  req += body;

  espFlush();

  // ─ Open TCP ───────────────────────────────────────────────
  String cipStart = "AT+CIPSTART=\"TCP\",\"";
  cipStart += SERVER_IP; cipStart += "\","; cipStart += String(SERVER_PORT);
  espSend(cipStart);

  if (!espWaitFor("CONNECT", 8000)) {
    Serial.println(F("[Upload] TCP connect failed"));
    espSend("AT+CIPCLOSE"); espFlush();
    uploadFailCount++;
    if (uploadFailCount >= 3) {
      Serial.println(F("[Upload] 3 fails — reconnecting WiFi..."));
      wifiReady = connectWiFi();
      uploadFailCount = 0;
    }
    return;
  }

  // ─ Send data ──────────────────────────────────────────────
  espSend("AT+CIPSEND=" + String(req.length()));
  espWaitFor(">", 4000);

  for (int i = 0; i < req.length(); i++) {
    esp8266.write(req[i]);
    delay(5); // Increased from 3ms to 5ms for stability
  }

  if (espWaitFor("SEND OK", 8000)) {
    uploadFailCount = 0;
    Serial.print(F("[Upload] OK  X="));   Serial.print(roverX, 0);
    Serial.print(F(" Y="));              Serial.print(roverY, 0);
    Serial.print(F(" Hdg="));            Serial.print((int)roverHeading);
    Serial.print(F(" T="));              Serial.print(temp, 1);
    Serial.print(F(" H="));              Serial.print(hum, 0);
    Serial.print(F(" G="));              Serial.println(gas);
  } else {
    Serial.println(F("[Upload] No SEND OK"));
    uploadFailCount++;
  }

  // INCREASE THIS DELAY to give Node.js time to digest the data!
  delay(1500); 
  espSend("AT+CIPCLOSE");
  espFlush();
}

// ══════════════════════════════════════════════════════════════
//  SCAN STOP — Stop rover, sweep 13 angles, upload, resume
//  Called: (a) every SCAN_DIST_CM of travel, (b) at obstacles
// ══════════════════════════════════════════════════════════════

void doScanStop() {
  // Capture time-based position before stopping
  updatePositionNow();

  float temp = dht.readTemperature();
  float hum  = dht.readHumidity();
  int   gas  = analogRead(MQ_PIN);
  if (isnan(temp)) temp = 0;
  if (isnan(hum))  hum  = 0;

  Serial.println(F("\n═══ SCAN STOP ═══"));
  Serial.print(F("  Pos: X="));   Serial.print(roverX, 0);
  Serial.print(F("  Y="));        Serial.print(roverY, 0);
  Serial.print(F("  Hdg="));      Serial.println((int)roverHeading);
  Serial.print(F("  Temp: "));    Serial.print(temp);    Serial.println(F("°C"));
  Serial.print(F("  Hum:  "));    Serial.print(hum);     Serial.println(F("%"));
  Serial.print(F("  Gas:  "));    Serial.println(gas);

  moveStop();
  goesForward = false;

  // FIX 3: Detach servo from motor shield power bus during WiFi
  myservo.detach();
  delay(MOTOR_SETTLE_MS);

  if (wifiReady) {
    // FIX 3: Check ESP alive before sending
    if (!espAlive()) {
      Serial.println(F("[WiFi] ESP dead — reconnecting..."));
      wifiReady = connectWiFi();
    }

    if (wifiReady) {
      String scanJson = doFullScan();   // ← 13-angle sweep
      uploadScanPacket(temp, hum, gas, distance, scanJson);
    }
  } else {
    // Offline: still do the sweep (for obstacle avoidance), skip upload
    Serial.println(F("  (Offline — sweep only, no upload)"));
    doFullScan();
  }

  myservo.attach(10);
  myservo.write(90);

  // Reset timers after the upload pause
  distSinceLastScan = 0.0;
  lastUpload  = millis();
  moveStart   = millis();
  goesForward = false;  // so moveForward() re-ramps motors cleanly
}

// ══════════════════════════════════════════════════════════════
//  FIX 2: OBSTACLE LOOP — keeps trying until path is clear
// ══════════════════════════════════════════════════════════════

void handleObstacle() {
  Serial.println(F("OBSTACLE! Running avoidance loop..."));

  // First: scan and upload at the obstacle position
  doScanStop();

  // Back up safely
  myservo.attach(10);
  moveBackward(); delay(400);
  moveStop();     delay(300);

  int attempts = 0;
  const int MAX_ATTEMPTS = 8;

  while (attempts < MAX_ATTEMPTS) {
    int distR = lookRight(); delay(200);
    int distL = lookLeft();  delay(200);

    Serial.print(F("  Attempt ")); Serial.print(attempts + 1);
    Serial.print(F(": R="));      Serial.print(distR);
    Serial.print(F(" L="));       Serial.println(distL);

    if (distR >= distL) {
      Serial.println(F("  → Turn RIGHT"));
      turnRight();
      roverHeading = fmod(roverHeading + 90.0, 360.0);
    } else {
      Serial.println(F("  → Turn LEFT"));
      turnLeft();
      roverHeading = fmod(roverHeading - 90.0 + 360.0, 360.0);
    }
    moveStop(); delay(300);

    int newDist = readPing();
    Serial.print(F("  Dist after turn: ")); Serial.println(newDist);

    if (newDist > SAFE_DIST) {
      Serial.println(F("  Path clear!"));
      distance          = newDist;
      distSinceLastScan = 0.0;
      moveStart         = millis();
      return;
    }

    // Still blocked — back up and try again
    moveBackward(); delay(400);
    moveStop();     delay(200);
    attempts++;
  }

  Serial.println(F("  Max attempts — continuing anyway"));
  distance          = readPing();
  distSinceLastScan = 0.0;
  moveStart         = millis();
}

// ══════════════════════════════════════════════════════════════
//  MOVEMENT FUNCTIONS
// ══════════════════════════════════════════════════════════════

int clamp(int val) {
  if (val < 0)   return 0;
  if (val > 255) return 255;
  return val;
}

// Quick single-ping — used for obstacle detection and avoidance
int readPing() {
  delay(70);
  int cm = sonar.ping_cm();
  if (cm == 0) cm = 250;
  return cm;
}

// Quick left/right peeks (for avoidance choice ONLY, not mapping)
int lookRight() {
  myservo.write(50);  delay(500);
  int d = readPing(); delay(100);
  myservo.write(90);
  return d;
}

int lookLeft() {
  myservo.write(170); delay(500);
  int d = readPing(); delay(100);
  myservo.write(90);
  return d;
}

void moveStop() {
  motor1.run(RELEASE); motor2.run(RELEASE);
  motor3.run(RELEASE); motor4.run(RELEASE);
  goesForward = false;
}

void moveForward() {
  if (!goesForward) {
    goesForward = true;
    moveStart   = millis();   // start position clock
    motor1.run(FORWARD); motor1.setSpeed(clamp(BASE_SPEED));            delay(30);
    motor2.run(FORWARD); motor2.setSpeed(clamp(BASE_SPEED+BACK_BOOST)); delay(30);
    motor3.run(FORWARD); motor3.setSpeed(clamp(BASE_SPEED+BACK_BOOST)); delay(30);
    motor4.run(FORWARD); motor4.setSpeed(clamp(BASE_SPEED));
  } else {
    motor1.run(FORWARD); motor1.setSpeed(clamp(BASE_SPEED));
    motor2.run(FORWARD); motor2.setSpeed(clamp(BASE_SPEED+BACK_BOOST));
    motor3.run(FORWARD); motor3.setSpeed(clamp(BASE_SPEED+BACK_BOOST));
    motor4.run(FORWARD); motor4.setSpeed(clamp(BASE_SPEED));
  }
}

void moveBackward() {
  goesForward = false;
  motor1.run(BACKWARD); motor1.setSpeed(clamp(BASE_SPEED));            delay(30);
  motor2.run(BACKWARD); motor2.setSpeed(clamp(BASE_SPEED+BACK_BOOST)); delay(30);
  motor3.run(BACKWARD); motor3.setSpeed(clamp(BASE_SPEED+BACK_BOOST)); delay(30);
  motor4.run(BACKWARD); motor4.setSpeed(clamp(BASE_SPEED));
}

void turnRight() {
  goesForward = false;
  motor1.run(FORWARD);  motor1.setSpeed(clamp(BASE_SPEED));
  motor2.run(FORWARD);  motor2.setSpeed(clamp(BASE_SPEED+BACK_BOOST));
  motor3.run(BACKWARD); motor3.setSpeed(clamp(BASE_SPEED+BACK_BOOST));
  motor4.run(BACKWARD); motor4.setSpeed(clamp(BASE_SPEED));
  delay(500);           // ~90° — calibrate this delay on your rover
}

void turnLeft() {
  goesForward = false;
  motor1.run(BACKWARD); motor1.setSpeed(clamp(BASE_SPEED));
  motor2.run(BACKWARD); motor2.setSpeed(clamp(BASE_SPEED+BACK_BOOST));
  motor3.run(FORWARD);  motor3.setSpeed(clamp(BASE_SPEED+BACK_BOOST));
  motor4.run(FORWARD);  motor4.setSpeed(clamp(BASE_SPEED));
  delay(500);           // ~90° — calibrate
}

// ══════════════════════════════════════════════════════════════
//  SETUP
// ══════════════════════════════════════════════════════════════

void setup() {
  Serial.begin(9600);
  esp8266.begin(9600);
  dht.begin();

  Serial.println(F("──────────────────────────────"));
  Serial.println(F("  ROVER ROOM SCANNER v4.0      "));
  Serial.println(F("  Stop-Scan-Move + All Fixes    "));
  Serial.print(F("  POST → http://"));
  Serial.print(SERVER_IP); Serial.print(F(":")); Serial.print(SERVER_PORT);
  Serial.println(F("/rover-data"));
  Serial.println(F("──────────────────────────────"));

  myservo.attach(10);
  myservo.write(90);   // center
  delay(2000);

  // Get initial distance
  distance = readPing(); delay(100);
  distance = readPing();

  // Connect WiFi — motors must be OFF during this
  myservo.detach();
  wifiReady = connectWiFi();
  myservo.attach(10);

  // Initial scan at start position (builds first data point)
  Serial.println(F("  Initial position scan..."));
  doScanStop();

  // Give rover 10s to start moving before UPLOAD_EVERY kicks in
  lastUpload = millis() + 10000UL;
  moveStart  = millis();

  Serial.println(F("──────────────────────────────"));
  Serial.println(F("  ROVER ACTIVE                 "));
  Serial.println(F("──────────────────────────────"));
}

// ══════════════════════════════════════════════════════════════
//  MAIN LOOP — Stop-Scan-Move cycle
// ══════════════════════════════════════════════════════════════

void loop() {
  delay(40);

  distance = readPing();
  Serial.print(F("Dist: ")); Serial.print(distance); Serial.println(F(" cm"));

  // ── OBSTACLE ─────────────────────────────────────────────────
  if (distance <= SAFE_DIST) {
    // FIX 2: full avoidance loop (includes scan+upload at obstacle)
    handleObstacle();

  } else {
    // ── MOVING FORWARD ─────────────────────────────────────────
    moveForward();

    // Update dead-reckoning while moving
    if (goesForward && moveStart > 0) {
      unsigned long now = millis();
      unsigned long dt  = now - moveStart;
      if (dt >= 150) {  // update every 150ms to avoid float drift
        float dist_moved = dt * SPEED_CM_PER_MS;
        float rad        = roverHeading * PI / 180.0;
        roverX           += dist_moved * sin(rad);
        roverY           += dist_moved * cos(rad);
        distSinceLastScan += dist_moved;
        moveStart        = now;
      }
    }

    // ── PERIODIC SCAN (every SCAN_DIST_CM of travel) ───────────
    if (distSinceLastScan >= SCAN_DIST_CM) {
      Serial.println(F("SCAN POINT — 40 cm reached"));
      doScanStop();
    }
  }

  // ── FALLBACK UPLOAD (every UPLOAD_EVERY) ───────────────────
  // Only fires if the rover hasn't done a scan stop recently
  // and the path ahead is clear (safe to pause)
  if (millis() - lastUpload > UPLOAD_EVERY && distance > SAFE_DIST) {
    Serial.println(F("PERIODIC UPLOAD"));
    doScanStop();
  }
}
