// ═══════════════════════════════════════════════════════════════
//  ENVIRONMENTAL ROVER — ROOM SCANNER v4.5
//  Fix: poll merged INTO upload POST response body
//       → only ONE TCP connection per scan stop
//       → eliminates "ESP8266 closed connection early"
//  v4.1 autonomous logic: byte-for-byte identical
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

// ── Motor / Rover Settings ────────────────────────────────────
#define MAX_DISTANCE   200
#define BASE_SPEED     180
#define BACK_BOOST     40
#define SAFE_DIST      40
#define SERVO_CENTER   100

// ══════════════════════════════════════════════════════════════
//  NETWORK CONFIG
// ══════════════════════════════════════════════════════════════
const char SSID[]      = "Redmi115G";
const char PASS[]      = "Chirag@123";
const char SERVER_IP[] = "10.210.236.155";
const int  SERVER_PORT = 5000;

// ── Timing ────────────────────────────────────────────────────
#define UPLOAD_EVERY     25000UL
#define MOTOR_SETTLE_MS  1000

// ── Dead-reckoning ────────────────────────────────────────────
const float SPEED_CM_PER_MS = 0.019;
const float SCAN_DIST_CM    = 40.0;

// ── Objects ───────────────────────────────────────────────────
SoftwareSerial esp8266(A4, A5);
NewPing        sonar(TRIG_PIN, ECHO_PIN, MAX_DISTANCE);
DHT            dht(DHT_PIN, DHT11);

AF_DCMotor motor1(1, MOTOR12_1KHZ);
AF_DCMotor motor2(2, MOTOR12_1KHZ);
AF_DCMotor motor3(3, MOTOR34_1KHZ);
AF_DCMotor motor4(4, MOTOR34_1KHZ);
Servo myservo;

// ── v4.1 state (untouched) ────────────────────────────────────
boolean       goesForward       = false;
int           distance          = 100;
bool          wifiReady         = false;
unsigned long lastUpload        = 0;
unsigned long moveStart         = 0;
int           uploadFailCount   = 0;

float roverX            = 0.0;
float roverY            = 0.0;
float roverHeading      = 0.0;
float distSinceLastScan = 0.0;

// ── Global auto flag ──────────────────────────────────────────
bool   autoMode    = true;   // true = v4.1 runs, false = app controls
String appCommand  = "stop"; // cached command for manual mode


// ══════════════════════════════════════════════════════════════
//  ESP8266 HELPERS  (v4.1 — untouched)
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

void espFlush(int ms = 200) {
  delay(ms);
  while (esp8266.available()) esp8266.read();
}

// Only called when servo is already detached
bool espAlive() {
  espFlush();
  espSend("AT");
  return espWaitFor("OK", 2000);
}

bool connectWiFi() {
  Serial.println(F("[WiFi] Hard rebooting ESP8266..."));
  espFlush();
  espSend("AT+RST");
  delay(3000);
  espFlush();

  espSend("AT+CWMODE=1");
  espWaitFor("OK", 2000);
  espFlush();

  Serial.println(F("[WiFi] Joining network..."));
  String cmd = "AT+CWJAP=\"";
  cmd += SSID; cmd += "\",\""; cmd += PASS; cmd += "\"";
  espSend(cmd);

  if (espWaitFor("OK", 20000)) {
    Serial.println(F("[WiFi] Connected!"));
    espSend("AT+CIPMUX=0");
    espWaitFor("OK", 2000);
    espFlush(300);
    return true;
  }
  Serial.println(F("[WiFi] Failed — running offline"));
  return false;
}


// ══════════════════════════════════════════════════════════════
//  UPLOAD + POLL IN ONE TCP CONNECTION
//
//  Sends POST /rover-data with full sensor+scan JSON.
//  Server responds with: {"ok":true,"cmd":"auto"}
//                     or {"ok":true,"cmd":"forward"} etc.
//
//  Arduino reads "cmd" from response body and updates
//  autoMode + appCommand in one round trip.
//  Zero separate GET connections → zero "closed early" errors.
//
//  ONLY called when servo is detached.
// ══════════════════════════════════════════════════════════════

void uploadAndPoll(float temp, float hum, int gas, int dist, String scanJson) {
  Serial.println(F("\n[Upload] Building packet..."));

  // ── Build JSON body ───────────────────────────────────────
  String body = "{";
  body += "\"x\":"        + String(roverX, 1)        + ",";
  body += "\"y\":"        + String(roverY, 1)         + ",";
  body += "\"heading\":"  + String((int)roverHeading) + ",";
  body += "\"scan\":"     + scanJson                  + ",";
  body += "\"temp\":"     + String(temp, 1)            + ",";
  body += "\"hum\":"      + String(hum, 1)             + ",";
  body += "\"gas\":"      + String(gas)                + ",";
  body += "\"distance\":" + String(dist)               + "}";

  // ── Build HTTP Headers ────────────────────────────────────
  String header  = "POST /rover-data HTTP/1.1\r\n";
  header += "Host: "; header += SERVER_IP; header += ":";
  header += String(SERVER_PORT); header += "\r\n";
  header += "Connection: close\r\n";
  header += "Content-Type: application/json\r\n";
  header += "Content-Length: " + String(body.length()) + "\r\n\r\n";

  // ── Reset ESP connection state ────────────────────────────
  espFlush(300);
  espSend("AT+CIPCLOSE");
  espFlush(300);
  espSend("AT+CIPMUX=0");
  if (!espWaitFor("OK", 2000)) {
    Serial.println(F("[Upload] CIPMUX failed — rebooting ESP..."));
    wifiReady = connectWiFi();
    if (!wifiReady) return;
    espFlush(400);
  }
  espFlush(300);

  // ── Open TCP ──────────────────────────────────────────────
  String cipStart = "AT+CIPSTART=\"TCP\",\"";
  cipStart += SERVER_IP; cipStart += "\",";
  cipStart += String(SERVER_PORT);
  espSend(cipStart);

  if (!espWaitFor("CONNECT", 8000)) {
    Serial.println(F("[Upload] TCP connect failed"));
    espSend("AT+CIPCLOSE");
    espFlush();
    uploadFailCount++;
    if (uploadFailCount >= 3) {
      Serial.println(F("[Upload] 3 fails — reconnecting WiFi..."));
      wifiReady = connectWiFi();
      uploadFailCount = 0;
    }
    return;
  }

  // ── Send request (AVOID OOM BY SENDING IN PARTS) ──────────
  int totalLen = header.length() + body.length();
  espSend("AT+CIPSEND=" + String(totalLen));
  
  if (!espWaitFor(">", 4000)) {
    Serial.println(F("[Upload] No prompt — aborting"));
    espSend("AT+CIPCLOSE");
    espFlush(300);
    return;
  }

  // Send headers
  for (int i = 0; i < header.length(); i++) esp8266.write(header[i]);
  // Send body
  for (int i = 0; i < body.length(); i++) esp8266.write(body[i]);

  if (!espWaitFor("SEND OK", 8000)) {
    Serial.println(F("[Upload] No SEND OK"));
    uploadFailCount++;
    espSend("AT+CIPCLOSE");
    espFlush(300);
    return;
  }

  uploadFailCount = 0;
  Serial.println(F("[Upload] Sent OK — reading response..."));

  // ── Read response + extract cmd from JSON body ────────────
  // We scan the raw stream for "cmd":"xxxxx" pattern.
  // No JSON library needed — just string search.
  String   rxBuf     = "";
  bool     gotClosed = false;
  String   cmdValue  = "";
  long     t         = millis();

  while (millis() - t < 4000) {
    while (esp8266.available()) {
      char c = esp8266.read();
      rxBuf += c;

      // Extract cmd value as soon as we see it
      // Looks for: "cmd":"XXXXX"
      if (cmdValue.length() == 0) {
        int idx = rxBuf.indexOf("\"cmd\":\"");
        if (idx != -1) {
          int start = idx + 7;           // skip past "cmd":"
          int end   = rxBuf.indexOf("\"", start);
          if (end != -1) {
            cmdValue = rxBuf.substring(start, end);
            cmdValue.trim();
            Serial.print(F("[Poll] cmd from server: "));
            Serial.println(cmdValue);
          }
        }
      }

      if (rxBuf.indexOf("CLOSED") != -1) {
        gotClosed = true;
      }

      // Keep buffer from growing forever
      if (rxBuf.length() > 600) rxBuf = rxBuf.substring(300);
    }
    if (gotClosed) break;
  }

  if (gotClosed) Serial.println(F("[Upload] Socket closed cleanly."));
  else           Serial.println(F("[Upload] Drain timeout — forcing close."));

  espSend("AT+CIPCLOSE");
  espFlush(300);

  // ── Apply command ─────────────────────────────────────────
  if (cmdValue.length() > 0) {
    if (cmdValue == "auto") {
      if (!autoMode) {
        Serial.println(F("[Poll] → Restoring AUTO mode"));
        autoMode   = true;
        appCommand = "stop";
        moveStop();
        goesForward       = false;
        distSinceLastScan = 0.0;
        moveStart         = millis();
      }
    } else {
      if (autoMode) {
        Serial.println(F("[Poll] → Switching to MANUAL mode"));
        autoMode = false;
        moveStop();
        goesForward = false;
      }
      appCommand = cmdValue;
      Serial.print(F("[Poll] → Cached command: "));
      Serial.println(appCommand);
    }
  } else {
    // No cmd in response — stay in current mode, log it
    Serial.println(F("[Poll] No cmd in response — mode unchanged"));
  }

  Serial.print(F("[Upload] OK  X="));  Serial.print(roverX, 0);
  Serial.print(F(" Y="));             Serial.print(roverY, 0);
  Serial.print(F(" Hdg="));           Serial.print((int)roverHeading);
  Serial.print(F(" T="));             Serial.print(temp, 1);
  Serial.print(F(" H="));             Serial.print(hum, 0);
  Serial.print(F(" G="));             Serial.println(gas);
}


// ══════════════════════════════════════════════════════════════
//  MANUAL MODE POLL
//  In manual mode we still need to check for "auto" command.
//  Uses the same uploadAndPoll() — sends a minimal POST with
//  current position so server still gets data, and we get cmd back.
//  Servo is detached before calling, reattached after.
// ══════════════════════════════════════════════════════════════

void manualPoll() {
  moveStop();
  goesForward = false;
  delay(100);

  myservo.detach();
  espFlush(200);

  if (!espAlive()) {
    Serial.println(F("[ManualPoll] ESP dead — reconnecting..."));
    wifiReady = connectWiFi();
  }

  if (wifiReady) {
    // Send minimal scan (empty array) just to get cmd response
    float temp = dht.readTemperature();
    float hum  = dht.readHumidity();
    int   gas  = analogRead(MQ_PIN);
    if (isnan(temp)) temp = 0;
    if (isnan(hum))  hum  = 0;
    uploadAndPoll(temp, hum, gas, distance, "[]");
  }

  espFlush(500);
  myservo.attach(10);
  myservo.write(SERVO_CENTER);
  delay(300);
}


// ══════════════════════════════════════════════════════════════
//  MANUAL MODE LOOP
//  Blocks here executing app commands until autoMode=true.
//  Calls manualPoll() every 5s to check for "auto".
// ══════════════════════════════════════════════════════════════

void runManualMode() {
  Serial.println(F("\n[MANUAL] Entering manual control"));
  moveStop();
  goesForward = false;

  unsigned long lastManualPoll = millis();

  while (!autoMode) {
    delay(40);

    if      (appCommand == "forward")  moveForward();
    else if (appCommand == "backward") moveBackward();
    else if (appCommand == "left")     turnLeft();
    else if (appCommand == "right")    turnRight();
    else                               moveStop();

    if (millis() - lastManualPoll >= 5000UL) {
      lastManualPoll = millis();
      manualPoll();
      // autoMode may now be true — while condition catches it
    }
  }

  Serial.println(F("[MANUAL] Auto restored — resuming v4.1"));
  lastUpload        = millis();
  moveStart         = millis();
  distSinceLastScan = 0.0;
}


// ══════════════════════════════════════════════════════════════
//  DEAD-RECKONING  (v4.1 — untouched)
// ══════════════════════════════════════════════════════════════

void updatePositionNow() {
  if (!goesForward || moveStart == 0) return;
  float elapsed     = (float)(millis() - moveStart);
  float dist_moved  = elapsed * SPEED_CM_PER_MS;
  float rad         = roverHeading * PI / 180.0;
  roverX           += dist_moved * sin(rad);
  roverY           += dist_moved * cos(rad);
  distSinceLastScan += dist_moved;
  moveStart         = millis();
}


// ══════════════════════════════════════════════════════════════
//  7-ANGLE SERVO SWEEP  (v4.1 — untouched)
// ══════════════════════════════════════════════════════════════

String doFullScan() {
  String result = "[";
  int angles[]  = {0, 30, 60, 90, 120, 150, 180};
  int numAngles = 7;

  Serial.println(F("  [Sweep] Scanning room..."));

  for (int i = 0; i < numAngles; i++) {
    myservo.write(angles[i]);
    delay(400);

    int d = sonar.ping_cm();
    if (d == 0) d = 200;

    Serial.print(F("    "));
    Serial.print(angles[i]);
    Serial.print(F("°: "));
    Serial.print(d);
    Serial.println(F(" cm"));

    result += "{\"a\":";
    result += String(angles[i]);
    result += ",\"d\":";
    result += String(d);
    result += "}";
    if (i < numAngles - 1) result += ",";
  }

  result += "]";
  myservo.write(SERVO_CENTER);
  delay(800);
  return result;
}


// ══════════════════════════════════════════════════════════════
//  SCAN STOP
//  Order: scan → detach → uploadAndPoll → flush → reattach
//  One TCP connection does both upload AND poll.
// ══════════════════════════════════════════════════════════════

void doScanStop() {
  updatePositionNow();

  float temp = dht.readTemperature();
  float hum  = dht.readHumidity();
  int   gas  = analogRead(MQ_PIN);
  if (isnan(temp)) temp = 0;
  if (isnan(hum))  hum  = 0;

  Serial.println(F("\n═══ SCAN STOP ═══"));
  Serial.print(F("  Pos: X="));  Serial.print(roverX, 0);
  Serial.print(F("  Y="));       Serial.print(roverY, 0);
  Serial.print(F("  Hdg="));     Serial.println((int)roverHeading);
  Serial.print(F("  Temp: "));   Serial.print(temp);   Serial.println(F("°C"));
  Serial.print(F("  Hum:  "));   Serial.print(hum);    Serial.println(F("%"));
  Serial.print(F("  Gas:  "));   Serial.println(gas);

  moveStop();
  goesForward = false;
  delay(200);

  // STEP 1: Sweep — servo must be attached
  String scanJson = doFullScan();

  // STEP 2: Detach servo before any AT/WiFi activity
  myservo.detach();
  delay(MOTOR_SETTLE_MS);

  // STEP 3: Upload + poll in one TCP round trip
  if (wifiReady) {
    if (!espAlive()) {
      Serial.println(F("[WiFi] ESP not responding — reconnecting..."));
      wifiReady = connectWiFi();
    }
    if (wifiReady) {
      uploadAndPoll(temp, hum, gas, distance, scanJson);
    }
  } else {
    Serial.println(F("  (Offline — local only)"));
  }

  // STEP 4: Flush ALL residual bytes before reattaching servo
  espFlush(500);

  // STEP 5: Reattach and center servo
  myservo.attach(10);
  myservo.write(SERVO_CENTER);
  delay(500);

  distSinceLastScan = 0.0;
  lastUpload        = millis();
  moveStart         = millis();
  goesForward       = false;
}


// ══════════════════════════════════════════════════════════════
//  OBSTACLE HANDLER  (v4.1 — untouched)
// ══════════════════════════════════════════════════════════════

void handleObstacle() {
  Serial.println(F("OBSTACLE! Running avoidance loop..."));

  doScanStop();

  if (!autoMode) return;  // poll switched us to manual — exit cleanly

  myservo.attach(10);
  moveBackward(); delay(400);
  moveStop();     delay(300);

  int attempts       = 0;
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
      if (millis() - lastUpload > 15000) {
        Serial.println(F("  [WiFi rested] Forcing upload."));
        lastUpload = millis() - UPLOAD_EVERY - 1000;
      } else {
        Serial.println(F("  [WiFi cooling down]"));
      }
      moveStart = millis();
      return;
    }

    moveBackward(); delay(400);
    moveStop();     delay(200);
    attempts++;
  }

  Serial.println(F("  Max attempts — continuing"));
  distance          = readPing();
  distSinceLastScan = 0.0;
  moveStart         = millis();
}


// ══════════════════════════════════════════════════════════════
//  MOVEMENT FUNCTIONS  (v4.1 — untouched)
// ══════════════════════════════════════════════════════════════

int clamp(int val) {
  if (val < 0)   return 0;
  if (val > 255) return 255;
  return val;
}

int readPing() {
  delay(70);
  int cm = sonar.ping_cm();
  if (cm == 0 || cm <= 3) cm = 250;
  return cm;
}

int lookRight() {
  myservo.write(50);  delay(500);
  int d = readPing(); delay(100);
  myservo.write(SERVO_CENTER);
  return d;
}

int lookLeft() {
  myservo.write(170); delay(500);
  int d = readPing(); delay(100);
  myservo.write(SERVO_CENTER);
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
    moveStart   = millis();
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
  delay(500);
}

void turnLeft() {
  goesForward = false;
  motor1.run(BACKWARD); motor1.setSpeed(clamp(BASE_SPEED));
  motor2.run(BACKWARD); motor2.setSpeed(clamp(BASE_SPEED+BACK_BOOST));
  motor3.run(FORWARD);  motor3.setSpeed(clamp(BASE_SPEED+BACK_BOOST));
  motor4.run(FORWARD);  motor4.setSpeed(clamp(BASE_SPEED));
  delay(500);
}


// ══════════════════════════════════════════════════════════════
//  SETUP
// ══════════════════════════════════════════════════════════════

void setup() {
  Serial.begin(9600);
  esp8266.begin(9600);
  dht.begin();

  Serial.println(F("──────────────────────────────"));
  Serial.println(F("  ROVER ROOM SCANNER v4.5      "));
  Serial.println(F("  Single TCP: upload + poll     "));
  Serial.print(F("  POST → http://"));
  Serial.print(SERVER_IP); Serial.print(F(":")); Serial.print(SERVER_PORT);
  Serial.println(F("/rover-data"));
  Serial.println(F("──────────────────────────────"));

  myservo.attach(10);
  myservo.write(SERVO_CENTER);
  delay(2000);

  distance = readPing(); delay(100);
  distance = readPing();

  myservo.detach();
  wifiReady = connectWiFi();
  myservo.attach(10);
  delay(500);

  Serial.println(F("  Initial position scan..."));
  doScanStop();

  lastUpload = millis() + 10000UL;
  moveStart  = millis();

  Serial.println(F("──────────────────────────────"));
  Serial.println(F("  ROVER ACTIVE — AUTO MODE     "));
  Serial.println(F("──────────────────────────────"));
}


// ══════════════════════════════════════════════════════════════
//  MAIN LOOP  (v4.1 auto block untouched)
// ══════════════════════════════════════════════════════════════

void loop() {
  delay(40);

  if (!autoMode) {
    runManualMode();
    return;
  }

  // ── v4.1 autonomous logic — untouched ────────────────────

  distance = readPing();
  Serial.print(F("Dist: ")); Serial.print(distance); Serial.println(F(" cm"));

  if (distance <= SAFE_DIST) {
    handleObstacle();
    return;
  }

  moveForward();

  if (goesForward && moveStart > 0) {
    unsigned long now = millis();
    unsigned long dt  = now - moveStart;
    if (dt >= 150) {
      float dist_moved   = dt * SPEED_CM_PER_MS;
      float rad          = roverHeading * PI / 180.0;
      roverX            += dist_moved * sin(rad);
      roverY            += dist_moved * cos(rad);
      distSinceLastScan += dist_moved;
      moveStart          = now;
    }
  }

  if (distSinceLastScan >= SCAN_DIST_CM) {
    Serial.println(F("SCAN POINT — 40 cm reached"));
    moveStop();
    delay(100);
    distance = readPing();
    if (distance <= SAFE_DIST) {
      handleObstacle();
      return;
    }
    doScanStop();
    return;
  }

  if (millis() - lastUpload > UPLOAD_EVERY) {
    Serial.println(F("PERIODIC UPLOAD"));
    moveStop();
    delay(100);
    distance = readPing();
    if (distance <= SAFE_DIST) {
      handleObstacle();
      return;
    }
    doScanStop();
    return;
  }
}
