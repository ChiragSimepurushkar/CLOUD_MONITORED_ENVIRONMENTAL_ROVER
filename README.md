<![CDATA[# 🛰 Cloud-Monitored Environmental Rover

> **An autonomous room-scanning robot that maps its environment, monitors air quality in real-time, and streams everything to a stunning 3D web dashboard — controllable from your phone.**

<p align="center">
  <img src="https://img.shields.io/badge/Platform-Arduino%20UNO-00979D?style=for-the-badge&logo=arduino" />
  <img src="https://img.shields.io/badge/WiFi-ESP8266--01-E7352C?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Backend-Node.js%20%2B%20Express-339933?style=for-the-badge&logo=node.js" />
  <img src="https://img.shields.io/badge/Frontend-React%20%2B%20Recharts-61DAFB?style=for-the-badge&logo=react" />
  <img src="https://img.shields.io/badge/Database-MongoDB-47A248?style=for-the-badge&logo=mongodb" />
  <img src="https://img.shields.io/badge/Mobile-MIT%20App%20Inventor-FFA000?style=for-the-badge" />
</p>

---

## 📑 Table of Contents

1. [Project Overview](#-project-overview)
2. [Key Features](#-key-features)
3. [System Architecture](#-system-architecture)
4. [Hardware Components](#-hardware-components)
5. [Wiring Guide](#-wiring-guide)
6. [Software Stack](#-software-stack)
7. [Arduino Firmware (v4.5)](#-arduino-firmware-v45)
8. [Node.js Backend Server (v4.1)](#-nodejs-backend-server-v41)
9. [React Web Dashboard](#-react-web-dashboard)
10. [MIT App Inventor Mobile App](#-mit-app-inventor-mobile-app)
11. [API Reference](#-api-reference)
12. [Occupancy Grid Algorithm](#-occupancy-grid-algorithm)
13. [Communication Protocol](#-communication-protocol)
14. [Setup & Installation](#-setup--installation)
15. [Component Testing Guide](#-component-testing-guide)
16. [Development Journey & Challenges](#-development-journey--challenges)
17. [Troubleshooting](#-troubleshooting)
18. [Project Structure](#-project-structure)
19. [Future Improvements](#-future-improvements)
20. [Team & Credits](#-team--credits)

---

## 🌍 Project Overview

The **Cloud-Monitored Environmental Rover** is a full-stack IoT system built for an Engineering Capstone Project. It combines **robotics**, **environmental sensing**, **real-time networking**, and **cloud visualization** into a single integrated platform.

### The Problem
Indoor air quality monitoring typically requires expensive, stationary sensors. You get data from one spot, but you don't know what's happening in the corners, behind furniture, or near ventilation systems.

### Our Solution
A **mobile robotic platform** that autonomously navigates a room, continuously scanning for:
- 🌡️ **Temperature** anomalies (hot spots, cold zones)
- 💧 **Humidity** variations
- 💨 **Gas concentrations** (smoke, CO, LPG — MQ-2 sensor)
- 📐 **Room geometry** via ultrasonic mapping

All data streams in real-time to a **3D web dashboard** that builds a live occupancy grid map of the room, overlaid with environmental heatmaps. A companion **Android mobile app** lets a user take manual control of the rover at any time.

---

## ⭐ Key Features

| Category | Feature | Description |
|---|---|---|
| 🤖 Autonomy | Obstacle Avoidance | 7-angle ultrasonic sweep detects walls and objects at every scan stop |
| 🤖 Autonomy | Dead Reckoning | Tracks X, Y position and heading using motor timing |
| 🤖 Autonomy | Scan-on-Distance | Automatically stops and scans every 40cm of forward travel |
| 🌐 Networking | Single-TCP Protocol | Upload + command poll merged into one HTTP round-trip (v4.5) |
| 🌐 Networking | WiFi Auto-Reconnect | Hard ESP8266 reboot with 15s cooldown on connection loss |
| 📊 Dashboard | 3D Occupancy Grid | Bresenham ray-traced map with walls, free space, and rover trail |
| 📊 Dashboard | Live Sensor Charts | Real-time temperature, humidity, gas, and distance graphs |
| 📊 Dashboard | Alert System | Automatic DANGER/WARNING alerts for high gas readings |
| 📱 Mobile | D-Pad Control | Forward, Backward, Left, Right, Stop buttons |
| 📱 Mobile | Auto/Manual Toggle | Switch between autonomous driving and app control |
| 📱 Mobile | Live Sensor Display | Temperature, humidity, gas readings updated every 2s |
| 💾 Database | MongoDB Persistence | All sensor readings, grid data, and alerts stored for analysis |
| 🔄 Replay | Scan History | Re-watch the rover's entire mapping session step by step |

---

## 🏗 System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CLOUD / LOCAL NETWORK                        │
│                                                                     │
│  ┌──────────────┐     HTTP/WS      ┌──────────────────────────────┐ │
│  │  📱 MIT App  │◄────────────────►│      🖥️ Node.js Server       │ │
│  │  (Android)   │  GET /control    │      (Express + Socket.IO)   │ │
│  │              │  GET /data       │                              │ │
│  └──────────────┘                  │  ┌─────────┐ ┌────────────┐ │ │
│                                    │  │gridMap.js│ │  MongoDB   │ │ │
│  ┌──────────────┐     Socket.IO    │  │Bresenham │ │  Mongoose  │ │ │
│  │  🌐 React    │◄────────────────►│  │Ray-Trace │ │            │ │ │
│  │  Dashboard   │  map-update      │  └─────────┘ └────────────┘ │ │
│  │  (Browser)   │  chart-update    │                              │ │
│  └──────────────┘  raw-data        └──────────────┬───────────────┘ │
│                                                   │                 │
└───────────────────────────────────────────────────┼─────────────────┘
                                                    │ POST /rover-data
                                                    │ (WiFi via ESP8266)
                                          ┌─────────▼─────────┐
                                          │   🤖 Arduino UNO   │
                                          │   + Motor Shield   │
                                          │                    │
                                          │  ┌──────┐ ┌─────┐ │
                                          │  │Servo │ │DHT11│ │
                                          │  │HC-SR04│ │MQ-2 │ │
                                          │  └──────┘ └─────┘ │
                                          │   4x DC Motors     │
                                          │   ESP8266-01 WiFi  │
                                          └────────────────────┘
```

### Data Flow (One Complete Cycle)
1. **Rover drives** forward autonomously, tracking distance via dead reckoning
2. **Every 40cm** (or 25 seconds), the rover **stops** and performs a **7-angle ultrasonic sweep**
3. Servo detaches → ESP8266 wakes up → Rover **POSTs** sensor + scan JSON to `/rover-data`
4. **Server** processes the scan with Bresenham ray-tracing, updates the occupancy grid
5. Server **responds** with `{"ok":true, "cmd":"auto"}` — the rover reads this to know its mode
6. Server **broadcasts** via Socket.IO to all connected browsers
7. **React dashboard** updates the 3D map, charts, and alerts in real-time
8. **MIT App** polls `/data` every 2 seconds for the latest sensor readings
9. If a user presses a button on the app, it sends `GET /control?cmd=forward` → server sets `autoMode=false` → next rover POST gets `{"cmd":"forward"}` → rover enters manual mode

---

## 🔩 Hardware Components

### Bill of Materials

| # | Component | Specification | Purpose | Qty |
|---|---|---|---|---|
| 1 | Arduino UNO R3 | ATmega328P, 2KB SRAM, 32KB Flash | Main controller | 1 |
| 2 | L298N Motor Shield (AFMotor) | 4-channel DC motor driver | Motor control | 1 |
| 3 | DC Gear Motors | 3–6V, ~200 RPM | Rover propulsion | 4 |
| 4 | Robot Car Chassis | 4WD acrylic platform | Structural frame | 1 |
| 5 | HC-SR04 Ultrasonic Sensor | 2cm–400cm range, ±3mm accuracy | Distance + mapping | 1 |
| 6 | SG90 Servo Motor | 180° rotation, 9g weight | Pans ultrasonic sensor | 1 |
| 7 | DHT11 | 0–50°C, 20–90% RH, ±2°C | Temperature & Humidity | 1 |
| 8 | MQ-2 Gas Sensor | Detects LPG, smoke, CO, alcohol | Air quality monitoring | 1 |
| 9 | ESP8266-01 (ESP-01) | 802.11 b/g/n, AT commands, 3.3V | WiFi communication | 1 |
| 10 | 1kΩ + 2.2kΩ Resistors | Through-hole, ¼W | Voltage divider for ESP RX | 1 each |
| 11 | Breadboard + Jumper Wires | Standard 830-point | Prototyping connections | 1 |
| 12 | 9V Battery / Battery Pack | 4×AA or 2×18650 | Power supply | 1 |

### Power Requirements
- **Arduino + Motors**: Powered via the motor shield's external terminal (7–12V recommended)
- **ESP8266**: **Strictly 3.3V!** Using the Arduino's 3.3V pin is unreliable under motor load. A dedicated AMS1117 3.3V regulator is recommended for production.
- **Sensors**: Powered from Arduino's 5V rail (DHT11, MQ-2, HC-SR04)

---

## 🔌 Wiring Guide

### Pin Map

| Arduino Pin | Connected To | Notes |
|---|---|---|
| M1–M4 (Shield) | 4× DC Motors | Via AFMotor shield screw terminals |
| Pin 10 (Shield SER2) | Servo Signal (Orange wire) | SG90 control wire |
| A0 | HC-SR04 TRIG | Ultrasonic trigger |
| A1 | HC-SR04 ECHO | Ultrasonic echo |
| A2 | MQ-2 AO (Analog Out) | Gas sensor analog reading |
| A3 | DHT11 DAT (Data) | Temperature/humidity data |
| A4 | ESP8266 TX | SoftwareSerial RX (receive from ESP) |
| A5 | → 1kΩ → node → 2.2kΩ → GND | Voltage divider output → ESP8266 RX |

### ESP8266-01 Pinout (Hold antenna UP, chip facing you)

```
       (Gold Zig-Zag Antenna Points UP)
       (Black Chip Visible on Top)

Top Row:    [ TX  ]  [CH_PD]  [ RST ]  [ VCC ]
Bottom Row: [ GND ]  [GPIO2]  [GPIO0]  [ RX  ]
```

### ESP8266-01 Wiring

| ESP-01 Pin | Connect To | Why |
|---|---|---|
| VCC | 3.3V rail | ⚠️ **NEVER 5V — will destroy the module** |
| GND | Ground rail | Common ground with Arduino |
| CH_PD (EN) | 3.3V rail | Must be HIGH to enable the chip |
| GPIO0 | 3.3V rail | Must be HIGH for normal operation (LOW = flash mode) |
| TX | Arduino A4 (direct wire) | ESP sends data to Arduino — 3.3V safe for Arduino input |
| RX | Voltage divider output | Arduino A5 is 5V — must be divided to ~3.3V |
| RST | Not connected | Leave floating |
| GPIO2 | Not connected | Leave floating |

### Voltage Divider Detail (A5 → ESP RX)

```
Arduino A5 ───[1kΩ]───●───[2.2kΩ]─── GND
                       │
                       └──► ESP8266 RX

Output voltage = 5V × 2.2kΩ / (1kΩ + 2.2kΩ) = 3.43V ✅ Safe for ESP
```

> **Note:** A 2kΩ resistor also works (gives 3.33V). The 2.2kΩ is a more common standard value and is equally safe.

### DHT11 Wiring (3-Pin Module)

| DHT11 Pin | Connect To |
|---|---|
| VCC | 5V rail (breadboard +) |
| DAT | Arduino A3 |
| GND | Ground rail (breadboard −) |

> If using the bare 4-pin sensor (no PCB), add a **10kΩ pull-up resistor** between DAT and VCC. The 3-pin module version has this resistor built-in.

---

## 💻 Software Stack

| Layer | Technology | Version | Role |
|---|---|---|---|
| Firmware | Arduino C++ | v4.5 | Sensor reading, motor control, WiFi |
| Backend | Node.js + Express | v5.2 | REST API, data processing |
| Real-time | Socket.IO | v4.8 | WebSocket broadcasts to dashboard |
| Database | MongoDB + Mongoose | v9.6 | Persistent storage of readings |
| Frontend | React + Recharts | v19 | 3D map, live charts, alerts |
| Mobile | MIT App Inventor | — | Android remote control app |
| Grid Engine | Custom Bresenham | — | Occupancy mapping from ultrasonic |

---

## 🤖 Arduino Firmware (v4.5)

The firmware (`rover_arduino/rover_arduino.ino`) handles everything the rover does physically.

### Operating Modes

| Mode | Trigger | Behavior |
|---|---|---|
| **Autonomous** (default) | Boot / `cmd: "auto"` from server | Drives forward, avoids obstacles, scans every 40cm |
| **Manual** | Any movement command from MIT App | Executes app commands, polls server every 5s for mode switch |

### Autonomous Loop Logic

```
loop():
  1. Read ultrasonic distance
  2. If distance ≤ 40cm → handleObstacle()
     a. Full scan stop (7-angle sweep + upload)
     b. Back up, look left/right, turn toward more open direction
     c. Repeat up to 8 times until path is clear
  3. Else → moveForward()
     a. Update dead-reckoning position (X, Y, heading)
     b. If 40cm traveled since last scan → doScanStop()
     c. If 25 seconds since last upload → doScanStop()
```

### Scan Stop Procedure

```
doScanStop():
  1. Read DHT11 (temp, humidity) and MQ-2 (gas)
  2. Stop motors
  3. Servo sweep: 0°, 30°, 60°, 90°, 120°, 150°, 180°
     → Record distance at each angle
  4. Detach servo (prevents SoftwareSerial interference)
  5. Build JSON body + HTTP headers as separate Strings (avoids OOM)
  6. POST to /rover-data → Read "cmd" from response
  7. Flush ESP buffer → Reattach servo
```

### Single-TCP Protocol (v4.5 Innovation)

Previous versions used **two separate TCP connections** per cycle — one POST for sensor data and one GET for command polling. This caused the notorious `"ESP8266 closed connection early"` error because:

1. The Arduino UNO has only **2KB SRAM** — concatenating a ~400-byte HTTP request into one `String` caused out-of-memory (OOM), silently truncating the payload
2. The ESP8266 has a small TCP buffer — back-to-back connections with no clean reset left zombie sockets

**v4.5 fixes both issues:**
- The server's POST response now includes the command: `{"ok":true, "cmd":"auto"}`
- The Arduino sends headers and body as **separate Strings** (never concatenated)
- The Arduino **waits for the server's HTTP response** before closing the socket
- Result: **zero separate GET connections, zero ghost TCP sockets, zero "closed early" errors**

### Dead Reckoning

The rover estimates its position using elapsed motor time:

```
SPEED_CM_PER_MS = 0.019  (calibrated experimentally)

Every 150ms while driving forward:
  distance_moved = elapsed_ms × SPEED_CM_PER_MS
  roverX += distance_moved × sin(heading_radians)
  roverY += distance_moved × cos(heading_radians)
```

> **Limitation:** Dead reckoning drifts over time due to wheel slippage. The map is approximate — accurate enough for environmental monitoring, not for precision navigation.

### Memory Optimization

The Arduino UNO's 2KB SRAM is the tightest constraint in the entire system:

| Technique | Savings |
|---|---|
| `F()` macro on all `Serial.print()` strings | ~800 bytes → Flash instead of RAM |
| Split header/body transmission (no concatenation) | Prevents OOM crashes during upload |
| 7-angle sweep instead of 13 | Cuts scan JSON size by 46% |
| String-based JSON parsing (`indexOf`) | Avoids ArduinoJson library overhead |
| `byte` instead of `int` for pin constants | 1 byte vs 2 bytes per variable |

---

## 🖥 Node.js Backend Server (v4.1)

The server (`backend/server.js`) is the brain of the cloud system — it receives rover data, processes it into an occupancy grid, stores it in MongoDB, and broadcasts it to all connected clients.

### Key Design Decisions

| Decision | Rationale |
|---|---|
| `express.text()` on `/rover-data` instead of `express.json()` | ESP8266 closes TCP sockets unpredictably — `express.json()` throws `request.aborted` errors that spam the console. Using `express.text()` + manual `JSON.parse()` lets us catch and log malformed packets gracefully. |
| Error handler placed **after** all routes | Express requires 4-argument error handlers at the bottom. Placing it before routes caused every request to be intercepted as an error. |
| Deep clone before `io.emit()` | Socket.IO can silently fail if objects contain shared/mutable references. `JSON.parse(JSON.stringify())` creates safe copies. |
| Fire-and-forget async for DB writes | MongoDB writes don't block the HTTP response — the Arduino gets its command immediately. |

### In-Memory Buffers

| Buffer | Size | Purpose |
|---|---|---|
| `packetLog[]` | Last 50 packets | Raw packet inspector on dashboard |
| `chartBuffer[]` | Last 60 data points | Live sensor chart data |
| `occupancyGrid{}` | Unlimited (keyed by cell) | The actual room map |
| `scanHistory[]` | Last 200 scans | Replay mode |

---

## 📊 React Web Dashboard

The frontend (`frontend/src/`) is a dark-themed, modern SPA built with React.

### Pages

| Page | File | Features |
|---|---|---|
| **Dashboard** | `Dashboard.js` | Live vital stats (temp, humidity, gas), connection status, rover position, packet counter |
| **3D Map** | `Map3D.js` | Occupancy grid visualization, rover trail, wall/free-space coloring, scan ray overlay, simulate button |
| **Analytics** | `History.js` | Historical area/line/bar charts using Recharts, filterable by metric |
| **Alerts** | `Alerts.js` | Real-time alert feed — DANGER (gas > 400 ppm) and WARNING (gas > 250 ppm) |

### Design System

- **Font**: JetBrains Mono (monospace) + Inter (sans-serif) via Google Fonts
- **Color Palette**: Deep navy backgrounds (`#030812`), cyan accent (`#00D4FF`), red alerts (`#ff4d4f`)
- **Effects**: Glassmorphism cards, backdrop blur, CSS animations, status dot pulse
- **Responsive**: Sidebar navigation, fluid grid layouts

### Socket.IO Events

| Event | Direction | Data |
|---|---|---|
| `raw-data` | Server → Browser | Full packet with sensor readings |
| `map-update` | Server → Browser | Updated occupancy grid + rover position |
| `chart-update` | Server → Browser | Latest chart data point |
| `chart-init` | Server → Browser (on connect) | Full chart buffer for initial render |
| `newAlert` | Server → Browser | New gas alert triggered |
| `map-reset` | Server → Browser | Grid cleared |
| `client-simulate` | Browser → Server | Inject fake scan data for testing |
| `client-reset` | Browser → Server | Clear all map data |

---

## 📱 MIT App Inventor Mobile App

The Android app provides a handheld remote control interface for the rover.

### Screen Layout

```
┌──────────────────────────────────┐
│     🛰 ENVIRONMENTAL ROVER       │  ← Title (VerticalArrangement)
│       🟢 Online                  │  ← Status Label
├──────────────────────────────────┤
│  🌡️ Temp: 28.5°C  💧 Hum: 65%  │  ← Sensor Dashboard
│  💨 Gas: 210 ppm                 │    (TableArrangement 2×3)
├──────────────────────────────────┤
│           [ ▲ ]                  │
│     [ ◄ ] [STOP] [ ► ]          │  ← D-Pad Control
│           [ ▼ ]                  │    (TableArrangement 3×3)
├──────────────────────────────────┤
│     [ AUTO ON ]  [ AUTO OFF ]    │  ← Mode Toggle
│     [ LED ON  ]  [ LED OFF  ]    │  ← LED Control
└──────────────────────────────────┘
```

### Block Logic (MIT App Inventor)

| Component Event | HTTP Request |
|---|---|
| `Clock1.Timer` (every 2s) | `GET http://<IP>:5000/data` → Parse JSON → Update labels |
| `btn_forward.Click` | `GET http://<IP>:5000/control?cmd=forward` |
| `btn_backward.Click` | `GET http://<IP>:5000/control?cmd=backward` |
| `btn_left.Click` | `GET http://<IP>:5000/control?cmd=left` |
| `btn_right.Click` | `GET http://<IP>:5000/control?cmd=right` |
| `btn_stop.Click` | `GET http://<IP>:5000/control?cmd=stop` |
| `btn_auto_on.Click` | `GET http://<IP>:5000/auto?toggle=true` |
| `btn_auto_off.Click` | `GET http://<IP>:5000/auto?toggle=false` |
| `btn_led_on.Click` | `GET http://<IP>:5000/led?state=on` |
| `btn_led_off.Click` | `GET http://<IP>:5000/led?state=off` |

---

## 📡 API Reference

### Arduino → Server

| Method | Endpoint | Body | Response | Purpose |
|---|---|---|---|---|
| `POST` | `/rover-data` | `{"x","y","heading","scan":[{"a","d"},...],"temp","hum","gas","distance"}` | `{"ok":true, "cmd":"auto"\|"forward"\|...}` | Main data upload + command poll |

### MIT App → Server

| Method | Endpoint | Params | Response | Purpose |
|---|---|---|---|---|
| `GET` | `/data` | — | `{"temp","humidity","gas","distance","autoMode","currentCommand","ledStatus"}` | Sensor polling |
| `GET` | `/control` | `?cmd=forward\|backward\|left\|right\|stop` | `"Command forward received"` | Movement command |
| `GET` | `/auto` | `?toggle=true\|false` | `{"success":true, "autoMode":true}` | Mode toggle |
| `GET` | `/led` | `?state=on\|off` | `"LED on"` | LED control |

### Dashboard → Server

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/map-state` | Full occupancy grid (initial page load) |
| `GET` | `/chart-data` | Chart buffer (last 60 readings) |
| `GET` | `/replay` | Scan history for replay mode |
| `GET` | `/alerts` | Alert history from MongoDB |
| `GET` | `/health` | Server status, coverage %, cell counts |
| `GET` | `/packets` | Raw packet log (last 50) |
| `POST` | `/simulate` | Inject fake scan data for testing |
| `POST` | `/reset` | Clear all map data and counters |

### Legacy Endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/sensor-data` | Old-format sensor upload (temp, humidity, gas) |
| `GET` | `/sensor-data` | MongoDB historical query (last 60 readings) |
| `GET` | `/rover/command/raw` | Plain-text command fallback for old firmware |

---

## 🗺 Occupancy Grid Algorithm

The heart of the mapping system is `backend/gridMap.js` — a probabilistic occupancy grid built using **Bresenham's line algorithm** for ray-tracing.

### How It Works

```
For each scan stop, the rover provides 7 ultrasonic distance readings
at angles: 0°, 30°, 60°, 90°, 120°, 150°, 180°

For each ray:
  1. Calculate world-angle = rover_heading + (servo_angle - 90)
  2. Calculate hit point: (x + d×sin(θ), y + d×cos(θ))
  3. Convert rover position and hit point to grid cells (25cm × 25cm each)
  4. Trace a Bresenham line from rover cell to hit cell
  5. All cells along the line → decrease probability (FREE)
  6. The endpoint cell → increase probability (WALL)
```

### Grid Cell Properties

| Property | Type | Description |
|---|---|---|
| `prob` | Float (0.03–0.97) | Occupancy probability (0 = free, 1 = wall) |
| `hits` | Integer | Number of times a ray endpoint landed here |
| `type` | String | `"free"`, `"wall"`, `"suspect"`, or `"unknown"` |
| `firstSeen` | Timestamp | When this cell was first observed |
| `lastSeen` | Timestamp | Last observation time |

### Tuning Constants

| Constant | Value | Effect |
|---|---|---|
| `CELL_CM` | 25 | Grid resolution — each cell is 25cm × 25cm |
| `FREE_STEP` | 0.12 | How much probability decreases per ray pass-through |
| `OCC_BOOST` | 0.22 | How much probability increases per ray hit |
| `WALL_MIN_HITS` | 2 | Minimum ray hits before confirming a wall |
| `MAX_DIST` | 400 | HC-SR04 maximum range (cm) — readings beyond this are ignored |

### Sensor Overlay

Each grid cell also accumulates environmental data:
- `avgTemp` — Rolling average of temperature readings at that location
- `avgGas` — Rolling average of gas concentration
- `avgHum` — Rolling average of humidity

This enables **spatial heatmaps** — you can see which corners of the room are hotter, more humid, or have higher gas readings.

---

## 🔗 Communication Protocol

### The "ESP8266 Closed Connection Early" Problem

This was the single most challenging bug in the entire project. Here's the full story:

**Symptoms:** The server would print `"ESP8266 closed connection early"` for every Arduino upload attempt, and no data would appear on the dashboard.

**Root Cause Chain:**
1. The Arduino UNO has only **2KB of SRAM**
2. The original code concatenated HTTP headers (~150 bytes) + JSON body (~250 bytes) into one `String` variable (~400 bytes)
3. Arduino's `String` class needs **double the memory** during concatenation (old + new copy)
4. With sensors, motors, and libraries already consuming ~1.5KB, the remaining ~500 bytes couldn't handle a ~800-byte temporary allocation
5. The `String` was **silently truncated** — the Arduino told the ESP8266 "send 400 bytes" but only provided 150
6. The ESP8266 sent a truncated HTTP request — the server saw an incomplete body and threw `request.aborted`
7. `express.json()` middleware bubbled this up as an error

**Fix (v4.5):** Three-layer solution:
1. **Arduino:** Send headers and body as separate `String` variables (never concatenate them)
2. **Arduino:** Wait for server HTTP response before closing TCP socket
3. **Server:** Use `express.text()` with manual `JSON.parse()` on `/rover-data` — catches truncated packets gracefully instead of crashing

---

## 🚀 Setup & Installation

### Prerequisites
- **Node.js** v16+ ([download](https://nodejs.org/))
- **MongoDB** (local or [Atlas cloud](https://www.mongodb.com/atlas))
- **Arduino IDE** 2.x ([download](https://www.arduino.cc/en/software))
- **Git** ([download](https://git-scm.com/))

### Step 1: Clone the Repository
```bash
git clone https://github.com/ChiragSimepurushkar/CLOUD_MONITORED_ENVIRONMENTAL_ROVER.git
cd CLOUD_MONITORED_ENVIRONMENTAL_ROVER
```

### Step 2: Backend Server
```bash
cd backend
npm install
node server.js
```
Note the **Network IP** printed in the terminal (e.g., `http://192.168.0.104:5000`). You'll need this for both the Arduino and the mobile app.

### Step 3: React Frontend
```bash
cd frontend
npm install
npm start
```
Opens at `http://localhost:3000`. The dashboard will show "OFFLINE" until the rover connects.

### Step 4: Arduino Firmware
1. Open `rover_arduino/rover_arduino.ino` in the Arduino IDE
2. Install required libraries via **Sketch → Include Library → Manage Libraries**:
   - `Adafruit Motor Shield library` (AFMotor)
   - `NewPing` by Tim Eckel
   - `DHT sensor library` by Adafruit (+ Adafruit Unified Sensor)
   - `Servo` (built-in)
3. Update the network config at the top of the file:
   ```cpp
   const char SSID[]      = "Your_WiFi_Name";
   const char PASS[]      = "Your_WiFi_Password";
   const char SERVER_IP[] = "192.168.0.104";  // ← Your laptop's IP
   ```
4. Select **Board: Arduino Uno** and the correct **Port**
5. Click **Upload**

> ⚠️ Your WiFi must be **2.4GHz**. The ESP8266-01 does not support 5GHz networks.

### Step 5: MIT App Inventor
1. Import or build the app in [MIT App Inventor](https://ai2.appinventor.mit.edu/)
2. Update all URLs in the blocks to your server IP
3. Build → `.apk` → Install on Android device
4. Ensure your phone is on the **same WiFi network** as the server

---

## 🧪 Component Testing Guide

Before running the full rover, test each component individually using the included test script. This helps isolate hardware issues.

### All-in-One Test

A comprehensive test script is available that tests all 6 components sequentially:
- **Test 1:** DHT11 — 5 temperature/humidity readings
- **Test 2:** MQ-2 — Gas baseline + "blow test"
- **Test 3:** HC-SR04 — 8 distance readings + hand detection test
- **Test 4:** Servo — Sweep center → right → center → left → center
- **Test 5:** Motors — Forward, backward, right turn, left turn (2s each)
- **Test 6:** ESP8266 — AT command, firmware version, WiFi scan

After all tests run, type `1–6` in the Serial Monitor to re-run any individual test.

> **Important:** All `Serial.print()` strings use the `F()` macro to store text in Flash memory instead of RAM. Without this, the test script exceeds the UNO's 2KB SRAM limit.

### Individual Sensor Tests

| Test | What to Check |
|---|---|
| **Ultrasonic** | Place hand at 10cm → should read ~10cm. Open space → reads 250 (max) |
| **DHT11** | Should read room temperature (20–35°C). If `NaN` → check DAT wire on A3 |
| **MQ-2** | Baseline 100–300 in clean air. Blow near sensor → should spike above 400 |
| **Servo** | Should physically sweep left-center-right. If not → check Pin 10 / SER2 connector |
| **Motors** | All 4 wheels should spin. If wrong direction → swap wire polarity on that motor |
| **ESP8266** | Should respond `OK` to AT command. If no response → check 3.3V power, TX→A4, RX→divider |

---

## 🧗 Development Journey & Challenges

This project evolved through multiple phases, each solving a critical challenge:

### Phase 1: Basic Obstacle Avoidance
Started with a simple 4WD car using HC-SR04 + servo for obstacle detection. The car would drive forward, detect walls within 15cm, and turn toward the more open direction.

### Phase 2: Environmental Sensing
Added DHT11 (temperature/humidity) and MQ-2 (gas) sensors. The challenge was **SRAM overflow** — simply adding `Serial.println()` statements pushed the code past the 2KB RAM limit. Solved with the `F()` macro.

### Phase 3: WiFi Communication
Integrated the ESP8266-01 via SoftwareSerial. Major challenges:
- **Voltage divider required** — ESP8266 RX is 3.3V, Arduino outputs 5V
- **SoftwareSerial conflicts with Servo** — both use timer interrupts. Solved by detaching the servo before any WiFi operations.
- **ESP8266 power issues** — Arduino's 3.3V pin can't supply enough current under motor load

### Phase 4: Cloud Dashboard
Built the Node.js backend and React frontend. Implemented the Bresenham ray-tracing occupancy grid for real-time room mapping.

### Phase 5: Mobile App Integration
Added MIT App Inventor endpoints for manual control. The key challenge was **merging two separate TCP connections into one** to prevent socket exhaustion on the ESP8266.

### Phase 6: The "Closed Connection Early" War
The most difficult bug in the entire project. Required understanding:
- Arduino's `String` class memory allocation behavior
- ESP8266 AT command TCP lifecycle
- Express.js middleware ordering rules
- Node.js body-parser error propagation

The final fix touched **all three layers** (Arduino, server middleware, server error handler) simultaneously.

---

## 🔧 Troubleshooting

| Problem | Likely Cause | Fix |
|---|---|---|
| `ESP8266 closed connection early` | Arduino OOM during string concatenation | Upgrade to firmware v4.5 (sends header/body separately) |
| ESP8266 doesn't respond to `AT` | Wrong baud rate or insufficient power | Try `esp8266.begin(115200)`. Use external 3.3V regulator. |
| `DHT.h: No such file or directory` | Missing library | Arduino IDE → Sketch → Include Library → Manage Libraries → Install "DHT sensor library" by Adafruit |
| `data section exceeds available space` | RAM overflow (>2048 bytes) | Wrap all `Serial.print("text")` in `F()`. Use `byte` instead of `int` for pins. |
| Servo jitters during WiFi operations | SoftwareSerial timer interrupt conflict | Always call `myservo.detach()` before any ESP8266 AT commands |
| Motor spins wrong direction | Wiring polarity reversed | Swap the two wires for that motor on the shield terminal |
| Dashboard shows "OFFLINE" | Socket.IO not connected | Check that the frontend is pointing to the correct server IP/port |
| App commands don't respond instantly | Arduino polls for commands only at scan stops | This is expected — commands arrive within 5–25 seconds depending on driving state |
| `MongoDB ⚠️ Not available` | MongoDB not running | Start MongoDB service, or set `MONGO_URI` in `.env` to an Atlas cluster |

---

## 📁 Project Structure

```
CLOUD_MONITORED_ENVIRONMENTAL_ROVER/
│
├── rover_arduino/
│   └── rover_arduino.ino      # Firmware v4.5 — autonomy, sensing, WiFi
│
├── backend/
│   ├── server.js               # Express + Socket.IO server v4.1
│   ├── gridMap.js              # Bresenham occupancy grid engine
│   ├── package.json            # Node.js dependencies
│   └── models/                 # (Optional) Mongoose model files
│
├── frontend/
│   ├── public/
│   │   └── index.html
│   └── src/
│       ├── App.js              # Root component — sidebar, routing, socket
│       ├── App.css             # (Reset — all styles in index.css)
│       ├── index.css           # Full design system — dark theme, glass, animations
│       ├── index.js            # React entry point
│       └── pages/
│           ├── Dashboard.js    # Live vital stats & connection health
│           ├── Map3D.js        # 3D occupancy grid visualization
│           ├── History.js      # Historical sensor charts (Recharts)
│           ├── Alerts.js       # Gas alert feed (DANGER / WARNING)
│           └── Control.js      # (Reserved for future web-based control)
│
├── mockup/                     # UI mockup files
├── .gitignore
└── README.md                   # ← You are here
```

---

## 🔮 Future Improvements

| Feature | Difficulty | Description |
|---|---|---|
| LIDAR upgrade | 🟡 Medium | Replace HC-SR04 with RPLidar for 360° scans and cm-level accuracy |
| SLAM algorithm | 🔴 Hard | Implement simultaneous localization and mapping to correct dead-reckoning drift |
| Cloud deployment | 🟢 Easy | Deploy server to Render/Railway with MongoDB Atlas for internet-accessible dashboard |
| Camera feed | 🟡 Medium | Add ESP32-CAM for live video streaming to the dashboard |
| Path planning | 🔴 Hard | A* algorithm for efficient room coverage instead of random exploration |
| OTA firmware updates | 🟡 Medium | Push Arduino code updates over WiFi instead of USB |
| Environmental heatmap | 🟢 Easy | Color the occupancy grid cells by temperature/gas on the dashboard |
| Multi-rover support | 🔴 Hard | Multiple rovers mapping the same space collaboratively |

---

## 👥 Team & Credits

**GEC IoT Engineering Capstone Project**

Built with ❤️ using Arduino, ESP8266, Node.js, React, MongoDB, and MIT App Inventor.

---

*Last updated: June 2026*
]]>
