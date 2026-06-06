const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS so the React frontend and local mockup can access the server
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// In-Memory Database (State storage)
let state = {
  // Sensor readings
  temp: 24,
  humidity: 55,
  gas: 120,
  
  // Controls
  currentCommand: 'stop',
  ledStatus: 'off',
  autoMode: false,
  
  // Timing to determine online status
  lastRoverUpdate: 0
};

// Threshold for rover being considered offline (e.g., no updates for 10 seconds)
const OFFLINE_THRESHOLD_MS = 10000;

// Helper function to check if the rover is online
function isRoverOnline() {
  if (state.lastRoverUpdate === 0) return false;
  return (Date.now() - state.lastRoverUpdate) < OFFLINE_THRESHOLD_MS;
}

// Helper function to determine gas safety status
function getGasStatus(gasValue) {
  if (gasValue > 300) return 'Danger';
  if (gasValue > 200) return 'Warning';
  return 'Normal';
}

// --- API Endpoints ---

// 1. Welcome and debug landing page
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>IoT Rover Server</title>
        <style>
          body { font-family: sans-serif; background: #121212; color: #e0e0e0; padding: 40px; text-align: center; }
          .container { max-width: 600px; margin: 0 auto; background: #1e1e1e; padding: 30px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.5); }
          h1 { color: #4caf50; margin-bottom: 20px; }
          .status { font-size: 1.2rem; margin: 15px 0; }
          .online { color: #4caf50; font-weight: bold; }
          .offline { color: #f44336; font-weight: bold; }
          .routes { text-align: left; background: #2b2b2b; padding: 15px; border-radius: 8px; font-family: monospace; font-size: 0.9rem; }
          a { color: #2196f3; text-decoration: none; }
          a:hover { text-decoration: underline; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🤖 IoT Rover Server</h1>
          <p>The server is running successfully!</p>
          <div class="status">
            Rover Connection: <span class="${isRoverOnline() ? 'online' : 'offline'}">${isRoverOnline() ? '🟢 ONLINE' : '🔴 OFFLINE'}</span>
          </div>
          <p><strong>Current Command:</strong> <span style="color: #ff9800; font-weight:bold;">${state.currentCommand.toUpperCase()}</span></p>
          <p><strong>LED:</strong> ${state.ledStatus.toUpperCase()} | <strong>Auto Mode:</strong> ${state.autoMode ? 'ON' : 'OFF'}</p>
          <div class="routes">
            <strong>Endpoints:</strong><br>
            - <a href="/data">GET /data</a> - Get full JSON state<br>
            - <a href="/control?cmd=forward">GET /control?cmd=[command]</a> - Control rover<br>
            - <a href="/rover/command/raw">GET /rover/command/raw</a> - Raw command string (Arduino)<br>
            - <a href="/rover/led/raw">GET /rover/led/raw</a> - Raw LED status (Arduino)<br>
          </div>
        </div>
      </body>
    </html>
  `);
});

// 2. GET /data: Returns the entire current state (for app, website, and dashboard)
app.get('/data', (req, res) => {
  res.json({
    temp: state.temp,
    humidity: state.humidity,
    gas: state.gas,
    gasStatus: getGasStatus(state.gas),
    currentCommand: state.currentCommand,
    ledStatus: state.ledStatus,
    autoMode: state.autoMode,
    isOnline: isRoverOnline(),
    lastUpdated: state.lastRoverUpdate
  });
});

// 3. POST /data: Receives sensor data from the Arduino Rover
// Supports JSON: { temp: 34, humidity: 60, gas: 320 } or urlencoded payload
app.post('/data', (req, res) => {
  const { temp, humidity, gas } = req.body;
  
  if (temp !== undefined) state.temp = parseFloat(temp);
  if (humidity !== undefined) state.humidity = parseFloat(humidity);
  if (gas !== undefined) state.gas = parseInt(gas);
  
  state.lastRoverUpdate = Date.now();
  
  // Respond with the current controls so the rover can update its movement and LED in the same request
  res.json({
    success: true,
    command: state.currentCommand,
    ledStatus: state.ledStatus,
    autoMode: state.autoMode
  });
});

// 4. GET /control: Updates rover command from App or Website
// Usage: /control?cmd=forward (values: forward, backward, left, right, stop)
app.get('/control', (req, res) => {
  const { cmd } = req.query;
  
  if (cmd) {
    const validCommands = ['forward', 'backward', 'left', 'right', 'stop'];
    if (validCommands.includes(cmd.toLowerCase())) {
      state.currentCommand = cmd.toLowerCase();
      return res.json({ success: true, currentCommand: state.currentCommand });
    } else {
      return res.status(400).json({ success: false, error: 'Invalid command. Use forward, backward, left, right, or stop.' });
    }
  }
  
  res.json({ currentCommand: state.currentCommand });
});

// 5. GET/POST /led: Control LED state
// Usage: GET /led?state=on or POST /led with { state: "on" }
app.all('/led', (req, res) => {
  const inputState = req.query.state || req.body.state;
  
  if (inputState) {
    const cleanState = inputState.toLowerCase();
    if (cleanState === 'on' || cleanState === 'off') {
      state.ledStatus = cleanState;
      return res.json({ success: true, ledStatus: state.ledStatus });
    } else {
      return res.status(400).json({ success: false, error: 'Invalid LED state. Use "on" or "off".' });
    }
  }
  
  res.json({ ledStatus: state.ledStatus });
});

// 6. GET/POST /auto: Toggle Auto Mode
app.all('/auto', (req, res) => {
  const toggle = req.query.toggle || req.body.toggle;
  
  if (toggle !== undefined) {
    // Parse boolean (supporting string "true" or actual boolean)
    state.autoMode = toggle === 'true' || toggle === true;
    return res.json({ success: true, autoMode: state.autoMode });
  } else {
    // If no toggle param, just flip it
    state.autoMode = !state.autoMode;
    return res.json({ success: true, autoMode: state.autoMode });
  }
});

// 7. Arduino Hardware Friendly RAW Endpoints
// Arduino clients are memory-constrained. Raw text is much easier for Arduino to parse than JSON.

// GET /rover/command/raw -> returns plain text: 'forward', 'stop', etc.
app.get('/rover/command/raw', (req, res) => {
  res.setHeader('Content-Type', 'text/plain');
  res.send(state.currentCommand);
});

// GET /rover/led/raw -> returns plain text: 'on' or 'off'
app.get('/rover/led/raw', (req, res) => {
  res.setHeader('Content-Type', 'text/plain');
  res.send(state.ledStatus);
});

// Start the server
app.listen(PORT, () => {
  console.log(`===================================================`);
  console.log(`🚀 IoT Rover Express Server running on port ${PORT}`);
  console.log(`📡 Local network URL: http://localhost:${PORT}`);
  console.log(`===================================================`);
});
