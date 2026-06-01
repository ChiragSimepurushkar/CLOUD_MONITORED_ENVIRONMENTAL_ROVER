# 🗺️ Environmental Rover — 3D Digital Twin

Live 3D map of the rover's environment. As the rover scans, a grid builds in real time — colored by gas/temperature readings, taller bars for more dangerous zones, gray pillars for obstacles.

## Architecture

```
Arduino (ESP8266 WiFi)
    │  POST /rover-data every 1.5s
    ▼
Node.js Server (server.js)
    │  gridMap.js → updates 25cm × 25cm grid
    │  MongoDB → persists readings
    │  Socket.io → pushes to browser
    ▼
React Dashboard (EnvironmentMap3D.jsx)
    │  Three.js → renders 3D colored cells
    │  OrbitControls → drag/zoom/pan
    ▼
User sees live 3D environmental heat map
```

## Quick Start

### 1. Server
```bash
cd server
npm install
node server.js
# Server runs at http://localhost:3000
```

### 2. React Frontend (add to existing React app)
```bash
npm install three @react-three/fiber @react-three/drei socket.io-client
```

Copy `client/src/colorUtils.js` and `client/src/components/EnvironmentMap3D.jsx` into your React project.

```jsx
// In your App.jsx
import EnvironmentMap3D from './components/EnvironmentMap3D';

export default function App() {
  return <EnvironmentMap3D />;
}
```

### 3. Arduino
The Arduino code in the main project (`rover_final.ino`) already sends the correct JSON payload to the server every 1.5 seconds:

```json
{
  "x": 125.5,
  "y": 75.0,
  "heading": 90,
  "temp": 31.5,
  "humidity": 64.0,
  "gas": 287,
  "obstacle": false,
  "distance": 85
}
```

Make sure `SERVER_IP` in the Arduino code points to your laptop's IP address.

## API Endpoints

| Method | Route         | Description                        |
|--------|---------------|----------------------------------- |
| POST   | /rover-data   | Arduino sends data here            |
| GET    | /map-state    | Dashboard fetches on first load    |
| POST   | /reset        | Clear the grid (new scan session)  |
| GET    | /history      | Last 200 sensor readings           |
| GET    | /health       | Server status check                |

## Color Mapping

### Gas Map
| Range      | Color  | Meaning  |
|-----------|--------|----------|
| 0–200     | Green  | Safe     |
| 200–400   | Yellow | Warning  |
| 400+      | Red    | Danger   |

### Temperature Map
| Range   | Color  | Meaning  |
|---------|--------|----------|
| ≤20°C   | Blue   | Cool     |
| ~30°C   | Orange | Warm     |
| 45°C+   | Red    | Hot      |

### Obstacle cells
Always rendered as tall **gray pillars** (2.0 units high).

## Grid Engine (gridMap.js)

- Cell size: **25cm × 25cm**
- Max readings per cell: **10** (rolling window)
- Position tracking: **dead reckoning** (heading + speed × time)
- Obstacle detection: marks cell in front of rover when `distance < 30cm`

## File Structure

```
rover-twin/
├── server/
│   ├── server.js       ← Express + Socket.io backend
│   ├── gridMap.js      ← Grid mapping engine
│   └── package.json
└── client/src/
    ├── colorUtils.js               ← Sensor → colour mapping
    └── components/
        └── EnvironmentMap3D.jsx    ← 3D React Three Fiber component
```
