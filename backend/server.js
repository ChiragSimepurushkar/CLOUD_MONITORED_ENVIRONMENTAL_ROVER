// ══════════════════════════════════════════════════════════════
//  COMBINED SERVER  v3.0
//  Cloud-Monitored Environmental Rover  +  3D Digital Twin
//  ─ Serves both /sensor-data (legacy) and /rover-data (3D map)
//  ─ Socket.io for live chart updates AND 3D map updates
//  ─ MongoDB persistence for both schemas
// ══════════════════════════════════════════════════════════════

const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const cors       = require('cors');
const mongoose   = require('mongoose');
const { networkInterfaces } = require('os');

require('dotenv').config();

const app    = express();
const server = http.createServer(app);

const io = new Server(server, { cors: { origin: '*' } });
app.use(cors());
app.use(express.json());

// ─────────────────────────────────────────────
//  MongoDB — dual schema
// ─────────────────────────────────────────────
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/rover-combined';

let SensorReading = null;
let Alert         = null;
let GridReading   = null;
let sessionId     = `session_${Date.now()}`;

mongoose.connect(MONGO_URI)
  .then(() => {
    console.log('[MongoDB] ✅ Connected');

    // Legacy sensor schema (dashboard-code)
    const sensorSchema = new mongoose.Schema({
      temperature: Number,
      humidity:    Number,
      gas:         Number,
      createdAt: { type: Date, default: Date.now }
    });
    SensorReading = mongoose.model('SensorReading', sensorSchema);

    const alertSchema = new mongoose.Schema({
      type:      String,
      message:   String,
      createdAt: { type: Date, default: Date.now }
    });
    Alert = mongoose.model('Alert', alertSchema);

    // 3D grid schema (digital twin)
    const gridSchema = new mongoose.Schema({
      x: Number, y: Number, heading: Number,
      temp: Number, humidity: Number, gas: Number,
      obstacle: Boolean, distance: Number,
      sessionId: String,
      createdAt: { type: Date, default: Date.now }
    });
    GridReading = mongoose.model('GridReading', gridSchema);
  })
  .catch(err => console.warn('[MongoDB] ⚠️  Not available —', err.message));

// ─────────────────────────────────────────────
//  In-memory 3D grid engine (25 cm cells)
// ─────────────────────────────────────────────
const grid  = {};
const stats = { maxGas: 0, maxTemp: -Infinity, minTemp: Infinity, maxHum: 0, cellsVisited: 0, obstacleCount: 0, totalReadings: 0 };
let   rover = { x: 0, y: 0, heading: 0 };

function updateGrid(data) {
  const gx = Math.round((data.x || 0) / 25);
  const gy = Math.round((data.y || 0) / 25);
  const key = `${gx},${gy}`;

  if (!grid[key]) {
    grid[key] = { gx, gy, readings: 0, avgGas: 0, avgTemp: 0, avgHum: 0, isObstacle: false };
    stats.cellsVisited++;
  }

  const c = grid[key];
  c.readings++;
  c.avgGas  = +(c.avgGas  + (data.gas       - c.avgGas)  / c.readings).toFixed(1);
  c.avgTemp = +(c.avgTemp + (data.temp       - c.avgTemp) / c.readings).toFixed(1);
  c.avgHum  = +(c.avgHum  + (data.humidity  - c.avgHum)  / c.readings).toFixed(1);
  if (data.obstacle) { c.isObstacle = true; stats.obstacleCount++; }

  stats.totalReadings++;
  if (data.gas  > stats.maxGas)  stats.maxGas  = data.gas;
  if (data.temp > stats.maxTemp) stats.maxTemp  = +data.temp.toFixed(1);
  if (data.temp < stats.minTemp) stats.minTemp  = +data.temp.toFixed(1);
  if (data.humidity > stats.maxHum) stats.maxHum = +data.humidity.toFixed(1);

  rover = { x: data.x || 0, y: data.y || 0, heading: data.heading || 0 };

  return { grid: { [key]: c }, rover, stats };
}

// ─────────────────────────────────────────────
//  In-memory packet log + chart data
// ─────────────────────────────────────────────
const packetLog   = [];   // last 50 raw packets
const chartBuffer = [];   // last 60 readings for live chart
let packetCount   = 0;

function logPacket(data, source) {
  const entry = { id: ++packetCount, source, ts: new Date().toISOString(), data };
  packetLog.unshift(entry);
  if (packetLog.length > 50) packetLog.pop();

  // chart buffer — unified format
  const point = {
    time:        new Date().toLocaleTimeString(),
    temperature: data.temp       ?? data.temperature ?? 0,
    humidity:    data.humidity   ?? 0,
    gas:         data.gas        ?? 0,
    distance:    data.distance   ?? 0,
  };
  chartBuffer.push(point);
  if (chartBuffer.length > 60) chartBuffer.shift();

  return entry;
}

// ══════════════════════════════════════════════
//  ROUTES
// ══════════════════════════════════════════════

// ── POST /rover-data  (Arduino 3D twin) ───────
app.post('/rover-data', async (req, res) => {
  const d = req.body;
  if (d.x === undefined) return res.status(400).json({ error: 'Missing x,y' });

  const { grid: g, rover: r, stats: s } = updateGrid(d);
  const entry = logPacket(d, 'arduino');

  // Alert on dangerous gas
  const alertPayload = d.gas > 400 ? { type: 'DANGER', message: `Gas ${d.gas} ppm at (${Math.round(d.x)},${Math.round(d.y)})` }
                     : d.gas > 250 ? { type: 'WARNING', message: `Elevated gas ${d.gas} ppm` } : null;

  if (alertPayload && Alert) {
    try { const a = await Alert.create(alertPayload); io.emit('newAlert', a); } catch(_) {}
  }
  if (GridReading) {
    GridReading.create({ ...d, sessionId }).catch(() => {});
  }

  io.emit('raw-data',   entry);
  io.emit('map-update', { grid: g, rover: r, stats: s });
  io.emit('chart-update', chartBuffer.slice(-1)[0]);

  console.log(`[#${entry.id}] T=${d.temp}°C H=${d.humidity}% G=${d.gas}ppm D=${d.distance}cm`);

  res.json({ status: 'ok', packetId: entry.id, sessionId });
});

// ── POST /sensor-data  (legacy endpoint) ──────
app.post('/sensor-data', async (req, res) => {
  const { temperature, humidity, gas } = req.body;
  const data = { temp: temperature, temperature, humidity, gas, x: 0, y: 0, heading: 0, distance: 0, obstacle: false };

  const entry = logPacket(data, 'legacy');
  if (SensorReading) await SensorReading.create({ temperature, humidity, gas }).catch(() => {});

  if (gas > 400 && Alert) {
    const a = await Alert.create({ type: 'DANGER', message: `Gas level reached ${gas}` }).catch(() => null);
    if (a) io.emit('newAlert', a);
  }

  io.emit('sensorUpdate', { temperature, humidity, gas, createdAt: new Date() });
  io.emit('chart-update', chartBuffer.slice(-1)[0]);
  res.json({ message: 'Sensor data stored' });
});

// ── POST /simulate  (browser test) ────────────
app.post('/simulate', (req, res) => {
  const defaults = { x: 50, y: 50, heading: 0, temp: 28, humidity: 62, gas: 210, obstacle: false, distance: 120 };
  const d = { ...defaults, ...req.body };
  const { grid: g, rover: r, stats: s } = updateGrid(d);
  const entry = logPacket(d, 'simulate');
  io.emit('raw-data',   entry);
  io.emit('map-update', { grid: g, rover: r, stats: s });
  io.emit('chart-update', chartBuffer.slice(-1)[0]);
  console.log(`[SIM #${entry.id}] T=${d.temp} H=${d.humidity} G=${d.gas}`);
  res.json({ status: 'simulated', packetId: entry.id });
});

// ── GET /map-state ─────────────────────────────
app.get('/map-state', (req, res) => res.json({ grid, rover, stats, sessionId }));

// ── GET /sensor-data  (legacy, last 60) ────────
app.get('/sensor-data', async (req, res) => {
  if (SensorReading) {
    const data = await SensorReading.find().sort({ createdAt: -1 }).limit(60).lean().catch(() => []);
    return res.json(data);
  }
  res.json([]);
});

// ── GET /chart-data  (unified live buffer) ─────
app.get('/chart-data', (req, res) => res.json(chartBuffer));

// ── GET /alerts ────────────────────────────────
app.get('/alerts', async (req, res) => {
  if (Alert) {
    const alerts = await Alert.find().sort({ createdAt: -1 }).limit(50).lean().catch(() => []);
    return res.json(alerts);
  }
  res.json([]);
});

// ── GET /packets ───────────────────────────────
app.get('/packets', (req, res) => res.json({ count: packetCount, packets: packetLog }));

// ── POST /reset ────────────────────────────────
app.post('/reset', (req, res) => {
  Object.keys(grid).forEach(k => delete grid[k]);
  Object.assign(stats, { maxGas: 0, maxTemp: -Infinity, minTemp: Infinity, maxHum: 0, cellsVisited: 0, obstacleCount: 0, totalReadings: 0 });
  rover = { x: 0, y: 0, heading: 0 };
  packetLog.length = 0;
  chartBuffer.length = 0;
  packetCount = 0;
  sessionId = `session_${Date.now()}`;
  io.emit('map-reset');
  res.json({ status: 'reset', sessionId });
});

// ── GET /health ────────────────────────────────
app.get('/health', (req, res) => res.json({
  status: 'ok', packetCount, sessionId,
  cells: Object.keys(grid).length,
  dbOnline: SensorReading !== null,
  uptime: process.uptime().toFixed(1) + 's'
}));

// ─────────────────────────────────────────────
//  SOCKET.IO
// ─────────────────────────────────────────────
io.on('connection', socket => {
  console.log('[Socket] 🌐 Browser connected:', socket.id);
  socket.emit('map-update', { grid, rover, stats });
  socket.emit('chart-init', chartBuffer);
  socket.on('disconnect', () => console.log('[Socket] ❌ Disconnected:', socket.id));
});

// ─────────────────────────────────────────────
//  START
// ─────────────────────────────────────────────
function getLocalIP() {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets))
    for (const net of nets[name])
      if (net.family === 'IPv4' && !net.internal) return net.address;
  return '127.0.0.1';
}

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  const ip = getLocalIP();
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  🛰  ROVER COMBINED SERVER  v3.0
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Local:   http://localhost:${PORT}
  Network: http://${ip}:${PORT}  ← SET THIS IN ARDUINO

  POST /rover-data     ← Arduino 3D twin data
  POST /sensor-data    ← Legacy endpoint
  POST /simulate       ← Browser test packet
  GET  /chart-data     ← Live chart buffer
  GET  /map-state      ← 3D grid state
  GET  /alerts         ← Alert history
  GET  /health         ← Server status
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
});