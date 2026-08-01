#include <DHT.h>

#define DHTPIN 2
#define DHTTYPE DHT22
DHT dht(DHTPIN, DHTTYPE);

#define ENA 6   // Left Motor Speed
#define IN1 7   // Left Motor Direction 1
#define IN2 8   // Left Motor Direction 2
#define ENB 9   // Right Motor Speed
#define IN3 10  // Right Motor Direction 1
#define IN4 11  // Right Motor Direction 2

// 3. Ultrasonic Sensor (HC-SR04)
#define TRIG_PIN 12
#define ECHO_PIN 13

// 4. Gas Sensor & Alerts
#define GAS_PIN A0
#define BUZZER_PIN A1
#define GAS_THRESHOLD 500 

void setup() {
  // Start the Serial Monitor
  Serial.begin(9600);
  dht.begin();

  // Set Motor pins as Outputs
  pinMode(ENA, OUTPUT);
  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
  pinMode(ENB, OUTPUT);
  pinMode(IN3, OUTPUT);
  pinMode(IN4, OUTPUT);

  // Set Sensor & Alert pins
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(GAS_PIN, INPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  
  Serial.println("Rover System Initialized...");
}

void loop() {

  int gasLevel = analogRead(GAS_PIN);
  if (gasLevel > GAS_THRESHOLD) {
    digitalWrite(BUZZER_PIN, HIGH); // Sound the alarm!
  } else {
    digitalWrite(BUZZER_PIN, LOW);  // Turn off alarm
  }

  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  long duration = pulseIn(ECHO_PIN, HIGH);
  int distance = duration * 0.034 / 2; // Convert to centimeters


  if (distance > 0 && distance < 20) { 
    // If a wall is closer than 20cm, stop and turn
    stopMotors();
    delay(500);
    turnRight();
    delay(500);
  } else {
    // Path is clear, drive forward
    moveForward();
  }


  float temp = dht.readTemperature();
  float hum = dht.readHumidity();

  // Print a clean data string to the terminal
  Serial.print("Temp: "); Serial.print(temp); Serial.print("C | ");
  Serial.print("Humidity: "); Serial.print(hum); Serial.print("% | ");
  Serial.print("Gas: "); Serial.print(gasLevel); Serial.print(" | ");
  Serial.print("Dist: "); Serial.print(distance); Serial.println("cm");

  delay(500); // Wait half a second before reading everything again
}


void moveForward() {
  analogWrite(ENA, 150); // Set speed (0-255)
  analogWrite(ENB, 150);
  digitalWrite(IN1, HIGH);
  digitalWrite(IN2, LOW);
  digitalWrite(IN3, HIGH);
  digitalWrite(IN4, LOW);
}

void turnRight() {
  analogWrite(ENA, 150);
  analogWrite(ENB, 150);
  digitalWrite(IN1, HIGH); // Left wheels move forward
  digitalWrite(IN2, LOW);
  digitalWrite(IN3, LOW);  // Right wheels move backward
  digitalWrite(IN4, HIGH);
}

void stopMotors() {
  digitalWrite(IN1, LOW);
  digitalWrite(IN2, LOW);
  digitalWrite(IN3, LOW);
  digitalWrite(IN4, LOW);
}