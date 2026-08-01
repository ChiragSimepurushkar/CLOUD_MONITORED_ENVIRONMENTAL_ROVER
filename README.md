<div align="center">

# 🛰 Cloud-Monitored Environmental Rover

### *An Autonomous Room-Scanning Robot with Real-Time 3D Mapping, Environmental Monitoring & Mobile Control*

<br/>

![Arduino](https://img.shields.io/badge/Arduino-UNO_R3-00979D?style=for-the-badge&logo=arduino&logoColor=white)
![ESP8266](https://img.shields.io/badge/WiFi-ESP8266--01-E7352C?style=for-the-badge&logo=espressif&logoColor=white)
![Node.js](https://img.shields.io/badge/Backend-Node.js_v5-339933?style=for-the-badge&logo=node.js&logoColor=white)
![React](https://img.shields.io/badge/Frontend-React_19-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![MongoDB](https://img.shields.io/badge/Database-MongoDB-47A248?style=for-the-badge&logo=mongodb&logoColor=white)
![Socket.IO](https://img.shields.io/badge/Realtime-Socket.IO_v4-010101?style=for-the-badge&logo=socket.io&logoColor=white)
![MIT App](https://img.shields.io/badge/Mobile-MIT_App_Inventor-FFA000?style=for-the-badge&logo=android&logoColor=white)

---

**Goa College of Engineering** · Department of Computer Engineering  
SE COMP — Batch A · Academic Year 2024–2025  
Internet of Things (IoT) — Final Capstone Project

</div>

---

## 📑 Table of Contents

<details>
<summary><b>Click to expand full table of contents</b></summary>

1. [Project Overview](#-project-overview)
2. [The Problem We Solve](#-the-problem-we-solve)
3. [Key Features](#-key-features)
4. [System Architecture](#-system-architecture)
5. [Hardware Components](#-hardware-components)
6. [Complete Wiring Guide](#-complete-wiring-guide)
7. [Software Stack](#-software-stack)
8. [Arduino Firmware v4.5](#-arduino-firmware-v45)
9. [Node.js Backend Server v4.1](#-nodejs-backend-server-v41)
10. [Occupancy Grid Mapping Algorithm](#-occupancy-grid-mapping-algorithm)
11. [React Web Dashboard](#-react-web-dashboard)
12. [MIT App Inventor Mobile App](#-mit-app-inventor-mobile-app)
13. [Complete API Reference](#-complete-api-reference)
14. [Communication Protocol Deep-Dive](#-communication-protocol-deep-dive)
15. [Simulation & 3D Modelling](#-simulation--3d-modelling)
16. [Setup & Installation](#-setup--installation)
17. [Component Testing Guide](#-component-testing-guide)
18. [Development Journey & Challenges](#-development-journey--challenges)
19. [Troubleshooting Quick Reference](#-troubleshooting-quick-reference)
20. [Project File Structure](#-project-file-structure)
21. [Future Improvements](#-future-improvements)
22. [Team Contributions](#-team-contributions)
23. [References](#-references)

</details>

---

## 🌍 Project Overview

The **Cloud-Monitored Environmental Rover** is a full-stack IoT system that combines **robotics**, **environmental sensing**, **real-time networking**, and **cloud visualization** into a single integrated platform. The rover autonomously navigates indoor spaces, builds a live occupancy grid map using ultrasonic scanning, and continuously monitors environmental parameters — streaming everything to a stunning 3D web dashboard.

### What It Does
```
🤖 Drives autonomously → avoids obstacles → maps the room
🌡️ Measures temperature, humidity, and gas at every position
📡 Streams data over WiFi to a local Node.js cloud server
🗺️ Builds a real-time 2D/3D occupancy grid using Bresenham ray-tracing
📊 Visualises everything on a React dashboard with live charts
📱 Can be remotely controlled from an Android phone app
🚨 Triggers DANGER/WARNING alerts for hazardous gas readings
```

---

## 🎯 The Problem We Solve

Indoor air quality monitoring typically relies on **expensive, stationary sensors**. You get data from one spot — but you have no idea what's happening in the corners, behind furniture, near ventilation systems, or in areas with poor air circulation.

### Our Solution

A **mobile robotic platform** that goes everywhere in the room, collecting spatial environmental data:

| Traditional Approach | Our Approach |
|---|---|
| Fixed sensor, single point | Mobile rover, covers entire room |
| No spatial context | GPS-like X/Y position for every reading |
| Manual placement required | Fully autonomous navigation |
| Expensive commercial systems | Built from affordable Arduino components |
| Data stays on device | Real-time cloud dashboard + mobile app |

The result: **spatial environmental heatmaps** — you can see exactly which corners of the room are hotter, more humid, or have elevated gas concentrations.

---

## ⭐ Key Features

| Category | Feature | Description |
|---|---|---|
| 🤖 **Autonomy** | Obstacle Avoidance | 7-angle ultrasonic sweep detects walls; up to 8 avoidance attempts per obstacle |
| 🤖 **Autonomy** | Dead Reckoning | Tracks X, Y position and heading using motor timing (`SPEED_CM_PER_MS = 0.019`) |
| 🤖 **Autonomy** | Scan-on-Distance | Automatically stops and full-scans every **40 cm** of forward travel |
| 🤖 **Autonomy** | Periodic Upload | Forces a scan stop every **25 seconds** even if no obstacle detected |
| 🌐 **Networking** | Single-TCP Protocol | Upload + command poll merged into one HTTP POST round-trip **(v4.5 innovation)** |
| 🌐 **Networking** | WiFi Auto-Reconnect | Hard `AT+RST` reboot with 15s cooldown on connection loss |
| 🌐 **Networking** | CLOSED-drain Fix | Waits for TCP `CLOSED` before `AT+CIPCLOSE` — eliminates zombie sockets |
| 🌐 **Networking** | Ghost Filter | Ignores ultrasonic readings ≤ 3cm (sensor noise artifacts) |
| 📊 **Dashboard** | 3D Occupancy Grid | Bresenham ray-traced map with walls, free space, and rover trail |
| 📊 **Dashboard** | Live Sensor Charts | Real-time temperature, humidity, gas, and distance graphs via Recharts |
| 📊 **Dashboard** | Alert System | Automatic **DANGER** (gas > 400 ppm) and **WARNING** (gas > 250 ppm) alerts |
| 📊 **Dashboard** | Replay Mode | Re-watch the rover's entire mapping session step by step |
| 📱 **Mobile** | D-Pad Control | Forward, Backward, Left, Right, Stop buttons via MIT App Inventor |
| 📱 **Mobile** | Auto/Manual Toggle | Switch between autonomous driving and app control in real time |
| 📱 **Mobile** | Live Sensor Display | Temperature, humidity, gas readings updated every 2 seconds |
| 📱 **Mobile** | LED/Buzzer Control | Toggle headlight LED and alert buzzer from the app |
| 💾 **Database** | MongoDB Persistence | All sensor readings, grid data, and alerts stored for post-analysis |
| 🔄 **Replay** | Scan History | Last 200 full scan packets stored for complete session replay |

---

## 🏗 System Architecture

The project follows a **three-layer IoT architecture** — Perception, Network, and Application — all connected over a shared 2.4 GHz WiFi LAN.

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         APPLICATION LAYER                                │
│                                                                          │
│   ┌──────────────┐      Socket.IO       ┌──────────────────────────────┐ │
│   │  🌐 React    │◄═══════════════════►│      🖥️  Node.js Server      │ │
│   │  Dashboard   │   map-update         │      Express + Socket.IO     │ │
│   │  (Browser)   │   chart-update       │                              │ │
│   │              │   raw-data           │   ┌──────────┐  ┌─────────┐ │ │
│   │  • 3D Map    │   newAlert           │   │gridMap.js│  │MongoDB  │ │ │
│   │  • Charts    │                      │   │Bresenham │  │Mongoose │ │ │
│   │  • Alerts    │                      │   │Ray-Trace │  │         │ │ │
│   └──────────────┘                      │   └──────────┘  └─────────┘ │ │
│                                         │                              │ │
│   ┌──────────────┐    HTTP GET          │   Routes:                    │ │
│   │  📱 MIT App  │◄══════════════════►│   POST /rover-data           │ │
│   │  (Android)   │   /control?cmd=     │   GET  /data                 │ │
│   │  • D-Pad     │   /data             │   GET  /control?cmd=         │ │
│   │  • Sensors   │   /auto?toggle=     │   GET  /auto?toggle=         │ │
│   │  • LED/Auto  │   /led?state=       │   GET  /led?state=           │ │
│   └──────────────┘                      └──────────────┬───────────────┘ │
│                                                        │                 │
└────────────────────────────────────────────────────────┼─────────────────┘
                                                         │
                            ═══════ NETWORK LAYER ═══════╪═══════
                                                         │
                                    POST /rover-data     │ WiFi 2.4 GHz
                                    ← {ok, cmd} response │ via ESP8266 AT
                                                         │
                            ═══════ PERCEPTION LAYER ════╪═══════
                                                         │
                                               ┌─────────▼──────────┐
                                               │   🤖 Arduino UNO    │
                                               │   + L293D Shield    │
                                               │                     │
                                               │  ┌───────┐┌──────┐ │
                                               │  │SG90   ││DHT11 │ │
                                               │  │Servo  ││Temp  │ │
                                               │  │+HC-SR04│Humid │ │
                                               │  └───────┘└──────┘ │
                                               │  ┌───────┐┌──────┐ │
                                               │  │MQ-2   ││ESP   │ │
                                               │  │Gas    ││8266  │ │
                                               │  │Sensor ││WiFi  │ │
                                               │  └───────┘└──────┘ │
                                               │   4× DC BO Motors  │
                                               │   4WD Chassis      │
                                               └────────────────────┘
```

### Data Flow — One Complete Scan Cycle

| Step | Action | Actor |
|---|---|---|
| 1 | Rover drives forward autonomously, tracking X/Y via dead reckoning every 150ms | Arduino |
| 2 | Every 40cm or 25s: rover stops and performs **7-angle ultrasonic sweep** (0°–180°) | Arduino + Servo |
| 3 | Servo detaches. Arduino builds JSON: `{x, y, heading, scan, temp, hum, gas, distance}` | Arduino |
| 4 | ESP8266 POSTs JSON to `/rover-data` on Node.js server via single TCP connection | ESP8266 |
| 5 | Server processes scan with **Bresenham ray-tracing**; updates occupancy grid + MongoDB | Node.js |
| 6 | Server responds: `{"ok":true, "cmd":"auto"}` — rover reads this to know its mode | Node.js → Arduino |
| 7 | Server broadcasts updated grid + sensor data via **Socket.IO** to all browsers | Socket.IO |
| 8 | React dashboard **re-renders** the 3D map, charts, and alerts in real time | React |
| 9 | MIT App polls `/data` every 2s for live sensor readings | MIT App |
| 10 | If user presses a button → `GET /control?cmd=forward` → server stores command → next rover POST gets `{"cmd":"forward"}` → rover enters manual mode | MIT App → Node.js → Arduino |

---

## 🔩 Hardware Components

### Bill of Materials

| # | Component | Specification | Purpose | Qty |
|---|---|---|---|---|
| 1 | **Arduino UNO R3 SMD** | ATmega328P, 32KB Flash, **2KB SRAM** | Main microcontroller | 1 |
| 2 | **L293D Motor Shield** (AFMotor) | 4-channel DC motor driver | Motor control | 1 |
| 3 | **DC Gear Motors (BO)** | 3–6V, ~200 RPM | Rover propulsion | 4 |
| 4 | **Robot Car Chassis** (4WD) | Acrylic platform, 4-wheel | Structural frame | 1 |
| 5 | **HC-SR04 Ultrasonic** | 2–400cm range, ±3mm accuracy | Distance sensing + mapping | 1 |
| 6 | **SG90 Servo Motor** | 180° rotation, 9g | Pans ultrasonic for sweep | 1 |
| 7 | **DHT11 Sensor** | 0–50°C, 20–90% RH, ±2°C | Temperature & humidity | 1 |
| 8 | **MQ-2 Gas Sensor** | LPG, smoke, CO, alcohol (100–10000 ppm) | Air quality monitoring | 1 |
| 9 | **ESP8266-01** (ESP-01) | 802.11 b/g/n, AT commands, 3.3V | WiFi communication | 1 |
| 10 | **18650 Li-ion Cells** | 2000mAh, 3.7V each | Primary power source | 4 |
| 11 | **3S BMS Board** | 20A protection | Battery protection | 1 |
| 12 | **LM2596 Buck Converter** | Input 4–35V, Output 1.25–30V | 5V for Arduino VIN | 1 |
| 13 | **AMS1117-3.3 Regulator** | 3.3V 1A LDO | Clean 3.3V for ESP8266 | 1 |
| 14 | **1kΩ + 2.2kΩ Resistors** | Through-hole, ¼W | Voltage divider for ESP RX | 1 each |
| 15 | **LED + Buzzer** | Standard 5mm LED, 5V buzzer | Visual & audio alerts | 1 each |
| 16 | **Breadboard + Jumpers** | 830-point mini breadboard | Prototyping connections | 1 set |

### Power Architecture

```
  ┌──────────────────┐
  │  4× 18650 Cells  │   11.1V nominal (12.6V charged)
  │  3S1P / 2000mAh  │   Protected by 3S 20A BMS board
  └────────┬─────────┘
           │
    ┌──────▼──────┐
    │  3S BMS     │   Over-charge / over-discharge / short protection
    └──────┬──────┘
           │
     ┌─────┴──────────────────────┐
     │                            │
  ┌──▼───────────┐      ┌────────▼────────┐
  │ Motor Shield │      │ LM2596 Buck     │
  │ EXT POWER    │      │ 12V → 5V        │
  │ (4 motors)   │      └────────┬────────┘
  └──────────────┘               │
                          ┌──────┴─────┐
                          │            │
                    ┌─────▼─────┐  ┌──▼──────────┐
                    │ Arduino   │  │ AMS1117-3.3  │
                    │ VIN (5V)  │  │ 5V → 3.3V   │
                    └───────────┘  └──────┬──────┘
                                          │
                                   ┌──────▼──────┐
                                   │  ESP8266-01  │
                                   │  (3.3V ONLY) │
                                   └─────────────┘
```

> ⚠️ **CRITICAL:** The Arduino's onboard 3.3V pin (max 50mA) is **insufficient** for the ESP8266 under WiFi load. A dedicated AMS1117-3.3 regulator is mandatory — using the Arduino pin causes ESP8266 **brownouts** during WiFi transmission, corrupting data packets.

---

## 🔌 Complete Wiring Guide

### Arduino Pin Map

| Arduino Pin | Connected To | Direction | Function |
|---|---|---|---|
| M1–M4 (Shield) | 4× DC Motors | OUT | Via AFMotor shield screw terminals |
| Pin 10 (Shield SER2) | Servo Signal (Orange) | OUT | SG90 control PWM |
| A0 | HC-SR04 TRIG | OUT | Ultrasonic trigger pulse |
| A1 | HC-SR04 ECHO | IN | Ultrasonic echo return |
| A2 | MQ-2 AO (Analog Out) | IN | Gas concentration (0–1023 ADC) |
| A3 | DHT11 DAT | IN/OUT | Temperature + humidity one-wire |
| A4 | ESP8266 TX (direct wire) | IN | SoftwareSerial RX — 3.3V safe for Arduino |
| A5 → Divider → ESP RX | ESP8266 RX via 1kΩ + 2.2kΩ | OUT | Voltage divider: 5V → 3.43V |
| Pin 13 (optional) | LED via 220Ω | OUT | Alert indicator |

### ESP8266-01 Pinout

Hold the module with the **gold zig-zag antenna pointing UP** and the **black chip facing you**:

```
       ╔══════════════════════════╗
       ║   ⚡ (Antenna Pattern)   ║
       ║                          ║
       ║      ┌──────────┐       ║
       ║      │ Black IC │       ║
       ║      └──────────┘       ║
       ╚══════════════════════════╝
        │    │    │    │    │    │    │    │
       TX  CH_PD RST  VCC  GND GPIO2 GPIO0 RX
```

| ESP-01 Pin | Connect To | Why |
|---|---|---|
| **VCC** | AMS1117-3.3 output (3.3V) | ⚠️ **NEVER 5V — will permanently destroy the chip** |
| **GND** | Common ground rail | Shared ground with Arduino and battery |
| **CH_PD** (EN) | 3.3V rail | Must be **HIGH** to enable the chip |
| **GPIO0** | 3.3V rail | **HIGH** = normal run; LOW = flash mode |
| **TX** | Arduino A4 (direct wire) | 3.3V signal — safe for Arduino 5V digital input |
| **RX** | Voltage divider output | Arduino 5V must be stepped down to ~3.3V |
| **RST** | Not connected | Leave floating |
| **GPIO2** | Not connected | Leave floating |

### Voltage Divider Detail

Arduino A5 outputs 5V, but the ESP8266 RX pin is strictly 3.3V. A simple resistor voltage divider steps it down:

```
Arduino A5 ──── [1kΩ] ────●──── [2.2kΩ] ──── GND
                           │
                           └──► ESP8266 RX

   Output = 5V × 2.2kΩ ÷ (1kΩ + 2.2kΩ) = 3.43V  ✅ Safe
```

> **Note:** 2kΩ also works (gives 3.33V). 2.2kΩ is a more common standard value and is equally safe. Resistors have no polarity — orientation doesn't matter.

### DHT11 Wiring (3-Pin Module)

| DHT11 Pin | Connect To |
|---|---|
| VCC | 5V rail (breadboard +) |
| DAT | Arduino A3 |
| GND | Ground rail (breadboard −) |

> If using the **bare 4-pin sensor** (no PCB), add a **10kΩ pull-up resistor** between DAT and VCC. The 3-pin module has this built-in.

---

## 💻 Software Stack

| Layer | Technology | Version | Role |
|---|---|---|---|
| **Firmware** | Arduino C++ | v4.5 | Sensor reading, motor control, WiFi AT commands |
| **Backend** | Node.js + Express | v5.2 | REST API, data processing, command relay |
| **Real-time** | Socket.IO | v4.8 | WebSocket broadcasts to dashboard |
| **Database** | MongoDB + Mongoose | v9.6 | Persistent storage of all readings |
| **Frontend** | React + Recharts | v19 | 3D occupancy map, live charts, alerts |
| **Mobile** | MIT App Inventor 2 | — | Android remote control app |
| **Grid Engine** | Custom `gridMap.js` | — | Bresenham ray-traced occupancy mapping |
| **Simulation** | SimulIDE | — | Arduino circuit simulation |
| **3D Modelling** | Tinkercad | — | Rover chassis design & documentation |

---

## 🤖 Arduino Firmware v4.5

The firmware (`rover_arduino/rover_arduino.ino` — 758 lines) handles everything the rover does physically.

### Operating Modes

| Mode | Trigger | Behavior |
|---|---|---|
| **Autonomous** (default) | Boot / `cmd:"auto"` in POST response | Drives forward, avoids obstacles, scans every 40cm |
| **Manual** | Any movement command from MIT App | Executes app commands, polls server every 5s |

### Autonomous Loop Logic

```
loop():
  ├─ if (!autoMode) → runManualMode() [blocks until auto restored]
  │
  ├─ distance = readPing()
  ├─ if distance ≤ 40cm → handleObstacle()
  │   ├─ doScanStop() [full 7-angle sweep + upload + poll]
  │   ├─ if now in manual mode → return (poll switched us)
  │   ├─ moveBackward(400ms)
  │   ├─ lookRight() + lookLeft()
  │   ├─ turn toward more open side
  │   └─ repeat up to 8 times until path clear
  │
  ├─ else → moveForward()
  │   ├─ update dead-reckoning (X, Y, heading) every 150ms
  │   ├─ if 40cm traveled → doScanStop()
  │   └─ if 25s elapsed → doScanStop()
```

### Scan Stop Procedure (The Core)

| Step | Action |
|---|---|
| 1 | `updatePositionNow()` — snapshot latest dead-reckoning position |
| 2 | Read DHT11 (temp, humidity) and MQ-2 analog (gas ppm) |
| 3 | `moveStop()` — release all 4 motors |
| 4 | **Servo sweep**: 0°, 30°, 60°, 90°, 120°, 150°, 180° — 400ms settle + `ping_cm()` at each |
| 5 | `myservo.detach()` — **critical**: prevents SoftwareSerial timer conflict with servo PWM |
| 6 | `delay(1000)` — motors fully stop, power stabilizes for ESP8266 |
| 7 | `espAlive()` check — send `AT`, verify `OK` within 2s; reconnect with `AT+RST` if dead |
| 8 | Build HTTP headers + JSON body as **separate Strings** (avoids OOM) |
| 9 | `AT+CIPSEND` — send headers first, then body sequentially |
| 10 | Parse response body for `"cmd":"..."` using `String.indexOf()` |
| 11 | Drain until `CLOSED` — guarantees TCP socket fully released |
| 12 | `myservo.attach(10)` — re-attach servo; reset counters; resume driving |

### Dead Reckoning

```cpp
SPEED_CM_PER_MS = 0.019  // calibrated experimentally

// Every 150ms while driving forward:
distance_moved = elapsed_ms × SPEED_CM_PER_MS
roverX += distance_moved × sin(heading_radians)
roverY += distance_moved × cos(heading_radians)
```

> **Limitation:** Dead reckoning drifts over time due to wheel slippage. Accurate enough for environmental monitoring — not for precision navigation. Future improvement: wheel encoders.

### Memory Optimization (2KB SRAM Budget)

The Arduino UNO's **2048 bytes of SRAM** is the tightest constraint in the entire system:

| Technique | Bytes Saved | Details |
|---|---|---|
| `F()` macro on all `Serial.print()` | ~800 bytes | Moves string literals from SRAM → Flash |
| Split header/body transmission | ~400 bytes peak | No single String exceeds ~200 bytes |
| 7-angle sweep instead of 13 | ~120 bytes | Scan JSON is 46% shorter |
| `String.indexOf()` JSON parsing | ~200 bytes | Avoids ArduinoJson library overhead |
| `byte` instead of `int` for pins | ~20 bytes | 1 byte vs 2 bytes per constant |

---

## 🖥 Node.js Backend Server v4.1

The server (`backend/server.js`) is the central data hub — receives rover uploads, processes occupancy grids, stores data in MongoDB, and pushes live updates to all clients.

### Key Design Decisions

| Decision | Rationale |
|---|---|
| `express.text()` on `/rover-data` | `express.json()` throws `request.aborted` when ESP8266 closes TCP early — `express.text()` + manual `JSON.parse()` catches truncated packets gracefully |
| Error handler **after** all routes | Express requires 4-argument error handlers at the bottom; placing before routes intercepted all valid requests |
| POST response includes `cmd` | Eliminates separate GET poll — one TCP round-trip per scan cycle |
| `JSON.parse(JSON.stringify())` before `io.emit()` | Prevents silent Socket.IO failures from shared mutable object references |
| Fire-and-forget async DB writes | MongoDB writes don't block HTTP response — Arduino gets its command immediately |
| 15s WiFi cooldown after obstacle avoidance | Prevents back-to-back uploads when rover is clearing obstacles |

### In-Memory Buffers

| Buffer | Max Size | Purpose |
|---|---|---|
| `packetLog[]` | 50 packets | Raw packet inspector |
| `chartBuffer[]` | 60 points | Live sensor chart data |
| `occupancyGrid{}` | Unlimited (keyed) | The actual room map |
| `scanHistory[]` | 200 scans | Replay mode |
| `sensorGrid{}` | Unlimited (keyed) | Per-cell environmental averages |

---

## 🗺 Occupancy Grid Mapping Algorithm

The heart of the mapping system is `backend/gridMap.js` — a **probabilistic occupancy grid** built using **Bresenham's line algorithm** for ray-tracing.

### How It Works

```
For each scan stop:
  7 ultrasonic readings at servo angles: 0°, 30°, 60°, 90°, 120°, 150°, 180°

For each ray:
  1. world_angle = rover_heading + (servo_angle − 90°)
  2. hit_x = roverX + distance × sin(world_angle)
     hit_y = roverY + distance × cos(world_angle)
  3. Convert (roverX, roverY) and (hit_x, hit_y) to grid cells (÷ CELL_CM)
  4. Bresenham line trace: rover cell → hit cell → list of intermediate cells
  5. All intermediate cells: probability −= 0.12 (ray passed through = FREE)
  6. Endpoint cell: probability += 0.22 (ray terminated here = WALL)
  7. Clamp to [0.03, 0.97]; classify as WALL if prob > 0.65 AND hits ≥ 2
```

### Grid Cell Data Structure

```javascript
occupancyGrid["cx,cy"] = {
  cx, cy,              // Grid coordinates
  prob: 0.5,           // Occupancy probability (0 = free, 1 = wall)
  hits: 0,             // Number of ray endpoints landing here
  type: 'unknown',     // 'free' | 'wall' | 'suspect' | 'unknown'
  firstSeen: Date,     // When first observed
  lastSeen: Date       // Most recent observation
}
```

### Sensor Overlay (Environmental Heatmaps)

Each grid cell also accumulates rolling averages of environmental data:
- **`avgTemp`** — Temperature readings at that location
- **`avgGas`** — Gas concentration
- **`avgHum`** — Humidity

This enables **spatial heatmaps** — the dashboard can color cells by environmental conditions, showing exactly which areas of the room are hotter, more humid, or have higher gas readings.

### Tuning Constants

| Constant | Value | Effect |
|---|---|---|
| `CELL_CM` | 25 | Grid resolution — 25cm × 25cm per cell |
| `FREE_STEP` | 0.12 | Probability decrease per ray pass-through |
| `OCC_BOOST` | 0.22 | Probability increase per ray hit |
| `WALL_MIN_HITS` | 2 | Minimum hits before confirming wall |
| `MAX_DIST` | 400 | HC-SR04 max range — beyond this = noise |

---

## 📊 React Web Dashboard

A sleek, dark-themed, modern SPA built with React, featuring glassmorphism design elements and real-time data streaming.

### Pages

| Page | Component | Key Features |
|---|---|---|
| **Dashboard** | `Dashboard.js` | Live vital stats (temp, humidity, gas), connection status, rover position (X/Y/heading), packet counter |
| **3D Map** | `Map3D.js` | Occupancy grid visualization, rover trail, wall/free-space coloring, scan ray overlay, simulate button |
| **Analytics** | `History.js` | Historical area/line/bar charts via Recharts — filterable by metric and time |
| **Alerts** | `Alerts.js` | Real-time alert feed — DANGER (red, gas > 400) and WARNING (amber, gas > 250) |

### Design System

- **Typography**: JetBrains Mono (monospace) + Inter (sans-serif) via Google Fonts
- **Palette**: Deep navy backgrounds (`#030812`), electric cyan accent (`#00D4FF`), status colors (green/amber/red)
- **Effects**: Glassmorphism cards, `backdrop-filter: blur()`, CSS pulse animations, status dot indicators
- **Layout**: Fixed sidebar navigation, fluid grid, fully responsive

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

The Android app provides a handheld remote control interface for the rover — built with MIT App Inventor 2.

### Screen Layout

```
┌──────────────────────────────────────┐
│       🛰 ENVIRONMENTAL ROVER         │  ← Title Label
│         🟢 Online                    │  ← Status Label
├──────────────────────────────────────┤
│                                      │
│  🌡️ Temp: 28.5°C    💧 Hum: 65%     │  ← Sensor Dashboard
│  💨 Gas: 210 ppm    📐 Dist: 45cm   │    (TableArrangement 2×3)
│                                      │
├──────────────────────────────────────┤
│                                      │
│            [ ▲ FWD ]                 │
│                                      │
│     [ ◄ L ]  [ STOP ]  [ R ► ]      │  ← D-Pad Control
│                                      │    (TableArrangement 3×3)
│            [ ▼ BWD ]                 │
│                                      │
├──────────────────────────────────────┤
│                                      │
│     [ AUTO ON ]    [ AUTO OFF ]      │  ← Mode Toggle
│     [ LED ON  ]    [ LED OFF  ]      │  ← LED/Buzzer Control
│                                      │
└──────────────────────────────────────┘
```

### Block Logic

| Component Event | HTTP Request URL | Purpose |
|---|---|---|
| `Clock1.Timer` (2s interval) | `GET http://<IP>:5000/data` | Fetch & display latest sensor readings |
| `btn_forward.Click` | `GET http://<IP>:5000/control?cmd=forward` | Drive forward |
| `btn_backward.Click` | `GET http://<IP>:5000/control?cmd=backward` | Drive backward |
| `btn_left.Click` | `GET http://<IP>:5000/control?cmd=left` | Turn left |
| `btn_right.Click` | `GET http://<IP>:5000/control?cmd=right` | Turn right |
| `btn_stop.Click` | `GET http://<IP>:5000/control?cmd=stop` | Emergency stop |
| `btn_auto_on.Click` | `GET http://<IP>:5000/auto?toggle=true` | Switch to autonomous |
| `btn_auto_off.Click` | `GET http://<IP>:5000/auto?toggle=false` | Switch to manual |
| `btn_led_on.Click` | `GET http://<IP>:5000/led?state=on` | Turn on LED |
| `btn_led_off.Click` | `GET http://<IP>:5000/led?state=off` | Turn off LED |

---

## 📡 Complete API Reference

### Arduino → Server

| Method | Endpoint | Body | Response |
|---|---|---|---|
| `POST` | `/rover-data` | `{"x","y","heading","scan":[{"a","d"},...],"temp","hum","gas","distance"}` | `{"ok":true, "cmd":"auto"|"forward"|...}` |

### MIT App → Server

| Method | Endpoint | Parameters | Response |
|---|---|---|---|
| `GET` | `/data` | — | `{"temp","humidity","gas","distance","autoMode","currentCommand","ledStatus"}` |
| `GET` | `/control` | `?cmd=forward\|backward\|left\|right\|stop` | `"Command forward received"` |
| `GET` | `/auto` | `?toggle=true\|false` | `{"success":true, "autoMode":true}` |
| `GET` | `/led` | `?state=on\|off` | `"LED on"` |

### Dashboard → Server

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/map-state` | Full occupancy grid (initial page load) |
| `GET` | `/chart-data` | Chart buffer (last 60 readings) |
| `GET` | `/replay` | Scan history for replay mode |
| `GET` | `/alerts` | Alert history from MongoDB |
| `GET` | `/health` | Server status, coverage %, cell counts, uptime |
| `GET` | `/packets` | Raw packet log (last 50) |
| `POST` | `/simulate` | Inject fake scan data for testing |
| `POST` | `/reset` | Clear all map data and counters |

### Legacy Endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/sensor-data` | Old-format sensor upload |
| `GET` | `/sensor-data` | MongoDB historical query (last 60) |
| `GET` | `/rover/command/raw` | Plain-text command fallback for old firmware |

---

## 🔗 Communication Protocol Deep-Dive

### The "ESP8266 Closed Connection Early" Problem — Full Story

This was the **single most challenging bug** in the entire project, requiring fixes across all three system layers.

#### The Symptom
```
[MongoDB] ✅ Connected
⚠️ [Network] ESP8266 closed connection early. Ignoring packet.
⚠️ [Network] ESP8266 closed connection early. Ignoring packet.
⚠️ [Network] ESP8266 closed connection early. Ignoring packet.
```
No data appeared on the dashboard. The server was alive but received nothing useful.

#### Root Cause Chain

```
1. Arduino UNO has only 2KB SRAM
                    ↓
2. Code concatenated HTTP headers (~150 bytes) + JSON body (~250 bytes)
   into ONE String variable (~400 bytes)
                    ↓
3. Arduino's String class needs DOUBLE memory during concatenation
   (old string + new string temporarily coexist)
                    ↓
4. Sensors + motors + libraries already consuming ~1.5KB
   → Only ~500 bytes remain → can't handle ~800 byte temporary allocation
                    ↓
5. String is SILENTLY TRUNCATED — Arduino tells ESP "send 400 bytes"
   but only provides 150 bytes of actual content
                    ↓
6. ESP8266 sends a truncated HTTP request to the server
                    ↓
7. express.json() sees incomplete body → throws "request.aborted"
                    ↓
8. Error handler was BEFORE routes → intercepted every request
                    ↓
9. Dashboard: permanently OFFLINE. Zero data received.
```

#### The Three-Layer Fix (v4.5)

| Layer | Problem | Fix |
|---|---|---|
| **Arduino** | Single massive String caused OOM | Send `header` and `body` as **separate** Strings — never concatenated |
| **Arduino** | Socket closed before server response | Wait for server HTTP response + `CLOSED` confirmation before `AT+CIPCLOSE` |
| **Server** | `express.json()` crashed on truncated payload | Route-level `express.text()` + manual `JSON.parse()` with try/catch |
| **Server** | Error handler intercepted valid requests | Moved 4-argument error handler to **after** all routes (Express requirement) |
| **Server** | `res.send()` on dead socket threw second error | Changed to plain `return` — don't attempt to respond on aborted connections |

---

## 🧪 Simulation & 3D Modelling

### SimulIDE Circuit Simulation

A complete SimulIDE circuit simulation was built replicating the Arduino UNO connected to DHT11, MQ-2, HC-SR04, and L293D motor driver. The simulation validated:
- Serial output formatting
- Sensor read sequences and timing
- Motor direction logic
- ADC reading ranges for MQ-2

### Tinkercad 3D Model

A detailed 3D model of the rover was built in Tinkercad documenting:
- Acrylic chassis dimensions and motor mount positions
- Servo + HC-SR04 front bracket placement
- Arduino + breadboard platform layout
- Battery tray and ESP8266 mounting position
- Wire routing between components

---

## 🚀 Setup & Installation

### Prerequisites

| Requirement | Download Link |
|---|---|
| Node.js v16+ | [nodejs.org](https://nodejs.org/) |
| MongoDB | [mongodb.com/try](https://www.mongodb.com/try/download/community) or [Atlas Cloud](https://www.mongodb.com/atlas) |
| Arduino IDE 2.x | [arduino.cc/en/software](https://www.arduino.cc/en/software) |
| Git | [git-scm.com](https://git-scm.com/) |
| Android device | Same 2.4GHz WiFi network |

### Step 1: Clone the Repository

```bash
git clone https://github.com/ChiragSimepurushkar/CLOUD_MONITORED_ENVIRONMENTAL_ROVER.git
cd CLOUD_MONITORED_ENVIRONMENTAL_ROVER
```

### Step 2: Start the Backend Server

```bash
cd backend
npm install
node server.js
```

> 📝 **Note the Network IP** printed in the terminal (e.g., `http://192.168.0.104:5000`). You'll need this for Steps 3 and 4.

### Step 3: Start the React Frontend

```bash
cd frontend
npm install
npm start
```

Opens at `http://localhost:3000`. The dashboard will show **OFFLINE** until the rover connects.

### Step 4: Flash the Arduino

1. Open `rover_arduino/rover_arduino.ino` in Arduino IDE
2. **Install libraries** via `Sketch → Include Library → Manage Libraries`:
   - `Adafruit Motor Shield library` (AFMotor)
   - `NewPing` by Tim Eckel
   - `DHT sensor library` by Adafruit (**+ Adafruit Unified Sensor** when prompted)
   - `Servo` (built-in)
3. **Update network config** at the top:
   ```cpp
   const char SSID[]      = "Your_WiFi_Name";
   const char PASS[]      = "Your_WiFi_Password";
   const char SERVER_IP[] = "192.168.0.104";  // ← Your laptop's IP from Step 2
   const int  SERVER_PORT = 5000;
   ```
4. Select **Board: Arduino Uno**, correct **Port**
5. Click **Upload**

> ⚠️ Your WiFi **must be 2.4GHz**. The ESP8266-01 does **not** support 5GHz networks.

### Step 5: Setup the MIT App

1. Go to [MIT App Inventor](https://ai2.appinventor.mit.edu/)
2. Import the `.aia` project file
3. Update all server URL strings to `http://<YOUR_SERVER_IP>:5000`
4. **Build → Android App (.apk)** → Install on your phone
5. Ensure your phone is on the **same WiFi network** as the server

### Quick Verification Checklist

| Check | Expected Result |
|---|---|
| Arduino Serial Monitor | `WiFi Connected → Initial position scan → ROVER ACTIVE` |
| Server terminal | `[#1][arduino-scan] X=0 Y=0 Hdg=0° T=28°C H=65% G=210ppm Rays=7` |
| Dashboard | Status: **ONLINE** · Map shows first scan · Charts update |
| MIT App | Sensor values refresh every 2s · D-pad commands work |

---

## 🧪 Component Testing Guide

Before running the full rover, test each component individually using the included comprehensive test script.

### All-in-One Test Script

The test script runs 6 sequential tests, then offers an interactive menu:

| Test | Component | What to Look For |
|---|---|---|
| **Test 1** | DHT11 | 5 temperature/humidity readings · NaN = bad wiring |
| **Test 2** | MQ-2 | Gas baseline (~100–300 clean air) · Blow test (should spike > 400) |
| **Test 3** | HC-SR04 | 8 distance readings · Hand at 10cm → should read ~10 |
| **Test 4** | Servo | Sweep center→right→center→left→center · Visual check |
| **Test 5** | Motors | Forward 2s → Backward 2s → Right 1s → Left 1s |
| **Test 6** | ESP8266 | `AT` → `OK` · Firmware version · WiFi network scan |

After all tests complete, type `1`–`6` in Serial Monitor to re-run any individual test.

> **Important:** All `Serial.print()` strings use the `F()` macro to keep the test script within the 2KB SRAM limit.

---

## 🧗 Development Journey & Challenges

This project evolved through **8 development phases**, each solving a critical challenge:

| Phase | Challenge | Solution |
|---|---|---|
| **Phase 1: Obstacle Avoidance** | SRAM overflow causing random reboots when adding `Serial.print()` | `F()` macro — moved all string literals to Flash (~800 bytes freed) |
| **Phase 2: Sensing** | DHT11 returning `NaN` intermittently on first read | 3-reading warm-up in `setup()`; `isnan()` guard → replace with 0 |
| **Phase 3: WiFi** | Servo jittering/resetting during AT command traffic | `myservo.detach()` before every ESP8266 AT sequence |
| **Phase 3: WiFi** | ESP8266 RX pin damaged by 5V Arduino TX | Voltage divider (1kΩ + 2.2kΩ) verified with multimeter |
| **Phase 4: Dashboard** | Socket.IO silently not emitting updated grid | Deep clone: `JSON.parse(JSON.stringify())` before every `io.emit()` |
| **Phase 4: Dashboard** | Express error handler intercepting all requests | Moved 4-argument handler to **after** all routes |
| **Phase 5: Mobile App** | Two TCP connections per cycle → "closed early" | Merged poll into POST response body — single TCP (v4.5) |
| **Phase 6: JSON** | AVR `snprintf` printing `?` for all `%f` float values | Replaced all formatting with `dtostrf(value, 6, 1, buf)` |
| **Phase 6: JSON** | `express.json()` crashing on truncated ESP payload | Route-level `express.text()` + manual try/catch `JSON.parse()` |
| **Phase 7: WiFi Stability** | ESP8266 dying after 3–4 uploads | CLOSED-drain wait loop + `AT+RST` hard reboot on 3 failures |
| **Phase 8: Power** | Motor inrush current causing Arduino brownout | Staggered motor start (30ms per motor) + buck converter |

---

## 🔧 Troubleshooting Quick Reference

| Symptom | Most Likely Cause | Fix |
|---|---|---|
| `ESP8266 closed connection early` | Arduino OOM during String concatenation | Upgrade to firmware v4.5 (split header/body) |
| `?` characters in uploaded JSON | AVR `%f` bug in `snprintf` | Use `dtostrf()` for all float fields |
| ESP8266 no response to `AT` | Insufficient 3.3V or wrong baud rate | AMS1117-3.3 dedicated regulator; try 115200 baud |
| `DHT.h: No such file or directory` | Missing library | Arduino IDE → Library Manager → "DHT sensor library" by Adafruit |
| `data section exceeds available space` | SRAM overflow (> 2048 bytes) | `F()` on all `Serial.print()`; `byte` for pin constants |
| Servo jitters during WiFi | SoftwareSerial timer interrupt conflict | Always `myservo.detach()` before AT commands |
| Motors spin wrong direction | Polarity reversed | Swap wires for that motor on shield terminal |
| Dashboard shows OFFLINE | Socket.IO can't reach server | Check server IP matches laptop LAN IP; verify port 5000 |
| App commands not instant | Arduino polls at scan stops only | Expected — commands arrive within 5–25 seconds |
| MQ-2 reads 0 or full-scale | Sensor needs 24–48h burn-in | Pre-heat for 24h; calibrate in clean air |
| `MongoDB ⚠️ Not available` | MongoDB not running | Start `mongod` service or use Atlas URI in `.env` |

---

## 📁 Project File Structure

```
CLOUD_MONITORED_ENVIRONMENTAL_ROVER/
│
├── 📂 rover_arduino/
│   └── rover_arduino.ino          # Firmware v4.5 — autonomy, sensors, WiFi, scan
│
├── 📂 backend/
│   ├── server.js                   # Express + Socket.IO server v4.1
│   ├── gridMap.js                  # Bresenham occupancy grid engine (228 lines)
│   ├── package.json                # Dependencies: express, mongoose, socket.io, cors
│   ├── .env                        # MONGO_URI, PORT (not committed)
│   └── 📂 models/                  # Mongoose model files
│
├── 📂 frontend/
│   ├── 📂 public/
│   │   └── index.html
│   └── 📂 src/
│       ├── App.js                  # Root — sidebar, routing, Socket.IO client
│       ├── App.css                 # Reset (all styles in index.css)
│       ├── index.css               # Full design system — dark theme, glass, animations
│       ├── index.js                # React entry point
│       └── 📂 pages/
│           ├── Dashboard.js        # Live vital stats & connection health
│           ├── Map3D.js            # 3D occupancy grid visualization (46KB)
│           ├── History.js          # Historical sensor charts (Recharts)
│           ├── Alerts.js           # Gas alert feed (DANGER/WARNING)
│           └── Control.js          # Reserved for web-based control
│
├── 📂 mockup/                      # UI mockup files
├── .gitignore
└── README.md                       # ← You are here
```

---

## 🔮 Future Improvements

| Feature | Difficulty | Description |
|---|---|---|
| 🎯 LIDAR Upgrade | 🟡 Medium | Replace HC-SR04 with RPLidar for 360° scans at cm-level accuracy |
| 🧠 SLAM Algorithm | 🔴 Hard | Simultaneous Localization and Mapping to correct dead-reckoning drift |
| ☁️ Cloud Deployment | 🟢 Easy | Deploy to Render/Railway + MongoDB Atlas for internet-accessible dashboard |
| 📷 Camera Feed | 🟡 Medium | ESP32-CAM for live video streaming alongside the occupancy map |
| 🗺 Path Planning (A*) | 🔴 Hard | Efficient room-coverage algorithm replacing random exploration |
| 📡 OTA Firmware Updates | 🟡 Medium | Push Arduino code updates over WiFi instead of USB |
| ⚙️ Wheel Encoders | 🟡 Medium | Replace dead-reckoning with encoder-based odometry |
| 🌡 Environmental Heatmap | 🟢 Easy | Color grid cells by temperature/gas readings on dashboard |
| 🗣 Voice Alerts | 🟢 Easy | Browser Web Speech API reads out DANGER alerts |
| 🤖 Multi-Rover Support | 🔴 Hard | Multiple rovers mapping the same space collaboratively |

---

## 👥 Team Contributions

### Chirag Nikant Simepurushkar (24B-CO-015) — *Hardware Lead & Mapping Engine*
- Complete physical assembly: Arduino UNO + L293D Shield + all sensors (DHT11, MQ-2, HC-SR04, ESP8266, servo, LED, buzzer)
- Built and tested 4WD chassis: 4 BO motors, voltage divider, BMS board, power architecture
- Implemented and calibrated HC-SR04 + SG90 servo obstacle detection; dead-reckoning system
- Diagnosed and fixed the complete **v4.5 bug chain**: OOM → split transmission; `%f` → `dtostrf()`; `express.json()` → `express.text()`; zombie sockets → CLOSED-drain
- Designed `gridMap.js`: 25cm Bresenham ray-tracing, probabilistic occupancy update, sensor heatmap overlay
- Built React Three.js 3D visualization with BoxGeometry cells, rover marker, dual color mapping

### Girish Vishwanath Gawde (24B-CO-023) — *Simulation & 3D Modelling*
- Created SimulIDE circuit simulation replicating Arduino UNO with all sensors
- Built detailed Tinkercad 3D rover model: acrylic base, motor mounts, ultrasonic bracket, battery tray
- Cross-referenced physical layout with 3D model for accurate documentation

### Akshay Ajit Kumar Pillai (24B-CO-005) — *MERN Stack Web Dashboard*
- Set up Node.js + Express backend with MongoDB for rover data storage
- Implemented Socket.IO for real-time push of sensor data and grid map updates
- Built React frontend: live Recharts gauges, control panel, alert history table
- Added rover control API routes (`/control`, `/auto`, `/led`) for MIT App integration

### Harsh Sadanand Raikar (24B-CO-025) — *Mobile App Development*
- Designed Android control app in MIT App Inventor 2: D-pad, sensor dashboard, hardware toggles
- Implemented HTTP GET web components for two-way communication with Node.js server
- Configured background polling (Clock component) for live sensor readings every 2s
- Integrated device-level alerts for hazardous MQ-2 readings

---

## 📚 References

1. Adafruit Motor Shield V1 Library — [learn.adafruit.com/adafruit-motor-shield](https://learn.adafruit.com/adafruit-motor-shield)
2. NewPing Library — Tim Eckel — [github.com/livetronic/Arduino-NewPing](https://github.com/livetronic/Arduino-NewPing)
3. DHT Sensor Library — Adafruit — [github.com/adafruit/DHT-sensor-library](https://github.com/adafruit/DHT-sensor-library)
4. ESP8266 AT Command Reference v2.2.0 — Espressif Systems
5. Bresenham, J.E. (1965). *Algorithm for computer control of a digital plotter*. IBM Systems Journal, 4(1), 25-30.
6. Thrun, S., Burgard, W., & Fox, D. (2005). *Probabilistic Robotics*. MIT Press.
7. Socket.IO v4 Documentation — [socket.io/docs/v4](https://socket.io/docs/v4)
8. React Three Fiber — [docs.pmnd.rs/react-three-fiber](https://docs.pmnd.rs/react-three-fiber)
9. MongoDB Mongoose Documentation — [mongoosejs.com/docs](https://mongoosejs.com/docs/)
10. MIT App Inventor 2 Documentation — [ai2.appinventor.mit.edu](https://ai2.appinventor.mit.edu/)

---

<div align="center">

**Built with ❤️ by SE COMP Batch A — Goa College of Engineering — 2024–2025**

*Last updated: June 2026*

</div>

