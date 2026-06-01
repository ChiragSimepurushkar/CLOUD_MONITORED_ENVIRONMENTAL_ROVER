// ═══════════════════════════════════════════════════
//  ENVIRONMENTAL ROVER — FINAL COMPLETE CODE v2.0
//  Obstacle Avoidance + Sensors
//  Uploads to LOCAL Node.js Digital Twin Server
//  (replaces ThingSpeak)
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
//  NETWORK CONFIG  ← only edit these three lines
// ═══════════════════════════════════════════════════
const char SSID[]      = "Roshani";           // your WiFi SSID
const char PASS[]      = "Nikant@9822";        // your WiFi password
const char SERVER_IP[] = "192.168.0.106";      // your laptop's LAN IP (confirmed via ipconfig)
//                         ↑ copy the IP printed by the Node server on startup
const int  SERVER_PORT = 3000;                 // Node server port (default 3000)
// ═══════════════════════════════════════════════════

#define UPLOAD_EVERY  5000UL   // 5 s — gives motors time to settle before upload

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
boolean goesForward  = false;
int     distance     = 100;
bool    wifiReady    = false;
unsigned long lastUpload = 0;
int     uploadFailCount = 0;   // consecutive TCP failures → triggers WiFi reconnect

// ── Dead-Reckoning Position (cm) ──────────────────
float roverX       = 0.0;   // cm from start
float roverY       = 0.0;   // cm from start
float roverHeading = 0.0;   // degrees (0 = North, 90 = East)
bool  isMovingFwd  = false;
const float STEP_CM = 6.0;  // cm travelled per loop iteration (tune if needed)

// ══════════════════════════════════════════════════
//  ESP8266 HELPERS  (unchanged from original)
// ══════════════════════════════════════════════════

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

// ── WiFi Connect  (unchanged) ─────────────────────
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

// ══════════════════════════════════════════════════
//  UPLOAD TO DIGITAL TWIN SERVER  (replaces ThingSpeak)
//  POSTs JSON to  POST http://<SERVER_IP>:3000/rover-data
// ══════════════════════════════════════════════════

void uploadData(float temp, float hum, int gas, int dist) {
  Serial.println(F("[Upload] Sending to Digital Twin server..."));

  // Build JSON body
  // All fields the 3D map needs: x, y, heading, temp, humidity, gas, obstacle, distance
  bool obstacle = (dist < 30);

  String body = "{";
  body += "\"x\":"        + String(roverX, 1)       + ",";
  body += "\"y\":"        + String(roverY, 1)        + ",";
  body += "\"heading\":"  + String((int)roverHeading) + ",";
  body += "\"temp\":"     + String(temp, 1)           + ",";
  body += "\"humidity\":" + String(hum, 1)            + ",";
  body += "\"gas\":"      + String(gas)               + ",";
  body += "\"obstacle\":" + String(obstacle ? "true" : "false") + ",";
  body += "\"distance\":" + String(dist);
  body += "}";

  // HTTP POST request
  String req  = "POST /rover-data HTTP/1.1\r\n";
  // Host MUST include port for HTTP/1.1 compliance
  req += "Host: "; req += SERVER_IP; req += ":"; req += String(SERVER_PORT); req += "\r\n";
  req += "Connection: close\r\n";
  req += "Content-Type: application/json\r\n";
  req += "Content-Length: " + String(body.length()) + "\r\n\r\n";
  req += body;

  espFlush();

  // Open TCP connection to laptop server
  String cipStart = "AT+CIPSTART=\"TCP\",\"";
  cipStart += SERVER_IP;
  cipStart += "\",";
  cipStart += String(SERVER_PORT);
  espSend(cipStart);

  if (!espWaitFor("CONNECT", 8000)) {
    Serial.println(F("[Upload] TCP connect failed"));
    espSend("AT+CIPCLOSE");
    espFlush();
    uploadFailCount++;
    if (uploadFailCount >= 3) {
      // 3 consecutive failures — WiFi likely dropped due to power spike
      Serial.println(F("[Upload] 3 failures — reconnecting WiFi..."));
      wifiReady = connectWiFi();
      uploadFailCount = 0;
    }
    goesForward = false;
    return;
  }

  espSend("AT+CIPSEND=" + String(req.length()));
  espWaitFor(">", 4000);

  for (int i = 0; i < req.length(); i++) {
    esp8266.write(req[i]);
    delay(3);
  }

  if (espWaitFor("SEND OK", 6000)) {
    uploadFailCount = 0;  // reset fail counter on success
    Serial.print(F("[Upload] OK  X="));   Serial.print(roverX, 0);
    Serial.print(F(" Y="));              Serial.print(roverY, 0);
    Serial.print(F(" Hdg="));            Serial.print((int)roverHeading);
    Serial.print(F(" T="));              Serial.print(temp);
    Serial.print(F(" H="));              Serial.print(hum);
    Serial.print(F(" G="));              Serial.print(gas);
    Serial.print(F(" D="));              Serial.println(dist);
  } else {
    Serial.println(F("[Upload] No SEND OK — check server"));
  }

  delay(300);
  espSend("AT+CIPCLOSE");
  espFlush();
  goesForward = false;  // let rover ramp up again after pause
}

// ── Sensor Read + Upload ──────────────────────────
void readAndUpload() {
  float temp = dht.readTemperature();
  float hum  = dht.readHumidity();
  int   gas  = analogRead(MQ_PIN);

  if (isnan(temp)) temp = 0;
  if (isnan(hum))  hum  = 0;

  Serial.println(F("\n Sensor Data "));
  Serial.print(F("  Temp: "));      Serial.print(temp);    Serial.println(F(" C"));
  Serial.print(F("  Humidity: "));  Serial.print(hum);     Serial.println(F(" %"));
  Serial.print(F("  Gas: "));       Serial.println(gas);
  Serial.print(F("  Distance: "));  Serial.print(distance); Serial.println(F(" cm"));
  Serial.print(F("  Position: "));
  Serial.print(F("X=")); Serial.print(roverX, 0);
  Serial.print(F(" Y=")); Serial.print(roverY, 0);
  Serial.print(F(" Hdg=")); Serial.println((int)roverHeading);

  if (wifiReady) {
    moveStop();                        // pause rover during upload
    uploadData(temp, hum, gas, distance);
    // goesForward is reset to false inside uploadData()
    // so the next loop iteration will ramp motors back up cleanly
  } else {
    Serial.println(F("  (Offline - local only)"));
  }
}

// ══════════════════════════════════════════════════
//  DEAD-RECKONING  — update x,y,heading
//  Called whenever movement direction changes
// ══════════════════════════════════════════════════

void updatePosition(bool forward) {
  if (!forward) return;  // only track forward movement
  float rad = roverHeading * PI / 180.0;
  roverX += STEP_CM * sin(rad);
  roverY += STEP_CM * cos(rad);
}

// ══════════════════════════════════════════════════
//  MOVEMENT FUNCTIONS  (unchanged from original)
// ══════════════════════════════════════════════════

int clamp(int val) {
  if (val < 0)   return 0;
  if (val > 255) return 255;
  return val;
}

int lookRight() {
  myservo.write(50);  delay(500);
  int d = readPing();
  Serial.print(F("Right: ")); Serial.println(d);
  delay(100); myservo.write(115); return d;
}

int lookLeft() {
  myservo.write(170); delay(500);
  int d = readPing();
  Serial.print(F("Left: ")); Serial.println(d);
  delay(100); myservo.write(115); return d;
}

int readPing() {
  delay(70);
  int cm = sonar.ping_cm();
  if (cm == 0) cm = 250;
  return cm;
}

void moveStop() {
  motor1.run(RELEASE); motor2.run(RELEASE);
  motor3.run(RELEASE); motor4.run(RELEASE);
  isMovingFwd = false;
}

void moveForward() {
  if (!goesForward) {
    goesForward = true;
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
  isMovingFwd = true;
  updatePosition(true);   // advance dead-reckoning
}

void moveBackward() {
  goesForward = false;
  motor1.run(BACKWARD); motor1.setSpeed(clamp(BASE_SPEED));            delay(30);
  motor2.run(BACKWARD); motor2.setSpeed(clamp(BASE_SPEED+BACK_BOOST)); delay(30);
  motor3.run(BACKWARD); motor3.setSpeed(clamp(BASE_SPEED+BACK_BOOST)); delay(30);
  motor4.run(BACKWARD); motor4.setSpeed(clamp(BASE_SPEED));
  isMovingFwd = false;
}

void turnRight() {
  goesForward  = false;
  isMovingFwd  = false;
  roverHeading = fmod(roverHeading + 90.0, 360.0);   // +90° heading
  motor1.run(FORWARD);  motor1.setSpeed(clamp(BASE_SPEED));
  motor2.run(FORWARD);  motor2.setSpeed(clamp(BASE_SPEED+BACK_BOOST));
  motor3.run(BACKWARD); motor3.setSpeed(clamp(BASE_SPEED+BACK_BOOST));
  motor4.run(BACKWARD); motor4.setSpeed(clamp(BASE_SPEED));
  delay(500);
}

void turnLeft() {
  goesForward  = false;
  isMovingFwd  = false;
  roverHeading = fmod(roverHeading - 90.0 + 360.0, 360.0);  // -90° heading
  motor1.run(BACKWARD); motor1.setSpeed(clamp(BASE_SPEED));
  motor2.run(BACKWARD); motor2.setSpeed(clamp(BASE_SPEED+BACK_BOOST));
  motor3.run(FORWARD);  motor3.setSpeed(clamp(BASE_SPEED+BACK_BOOST));
  motor4.run(FORWARD);  motor4.setSpeed(clamp(BASE_SPEED));
  delay(500);
}

// ══════════════════════════════════════════════════
//  SETUP
// ══════════════════════════════════════════════════
void setup() {
  Serial.begin(9600);
  esp8266.begin(9600);
  dht.begin();

  Serial.println(F("─────────────────────────"));
  Serial.println(F("  ENVIRONMENTAL ROVER    "));
  Serial.println(F("  Digital Twin Edition   "));
  Serial.println(F("─────────────────────────"));
  Serial.print(F("  POST → http://"));
  Serial.print(SERVER_IP);
  Serial.print(F(":"));
  Serial.print(SERVER_PORT);
  Serial.println(F("/rover-data"));
  Serial.println(F("─────────────────────────"));

  myservo.attach(10);
  myservo.write(115);
  delay(2000);

  distance = readPing(); delay(100);
  distance = readPing(); delay(100);

  myservo.detach();
  wifiReady = connectWiFi();
  myservo.attach(10);

  Serial.println(F("─────────────────────────"));
  Serial.println(F("  ROVER ACTIVE — SCANNING"));
  Serial.println(F("─────────────────────────"));
}

// ══════════════════════════════════════════════════
//  MAIN LOOP  (obstacle avoidance unchanged)
// ══════════════════════════════════════════════════
void loop() {
  int distanceR = 0, distanceL = 0;
  delay(40);

  Serial.print(F("Dist: "));
  Serial.print(distance); Serial.println(F(" cm"));

  if (distance <= 35) {
    Serial.println(F("OBSTACLE!"));
    moveStop();     delay(100);
    moveBackward(); delay(300);
    moveStop();     delay(200);

    distanceR = lookRight(); delay(200);
    distanceL = lookLeft();  delay(200);

    if (distanceR >= distanceL) { turnRight(); moveStop(); }
    else                         { turnLeft();  moveStop(); }
  } else {
    moveForward();
  }

  distance = readPing();

  // Upload every 1.5 seconds to feed the live 3D map
  if (millis() - lastUpload > UPLOAD_EVERY) {
    lastUpload = millis();
    readAndUpload();
  }
}
