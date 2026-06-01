// ═══════════════════════════════════════════════════
//  ROVER DIGITAL TWIN — Node.js Server v2.0
//  Receives data from Arduino via ESP8266 WiFi
//  Pushes live map updates via Socket.io
//  Credentials loaded from .env file
// ═══════════════════════════════════════════════════

require('dotenv').config();

const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const cors       = require('cors');
const mongoose   = require('mongoose');
const { updateGrid, resetGrid, getGrid } = require('./gridMap');

const app    = express();
const server = http.createServer(app);

// ── CORS from env ─────────────────────────────────
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',').map(o => o.trim());

const io = new Server(server, {
  cors: { origin: allowedOrigins, methods: ['GET', 'POST'] }
});

app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

// ── MongoDB ────────────────────────────────────────
const readingSchema = new mongoose.Schema({
  x:         Number,
  y:         Number,
  heading:   Number,
  temp:      Number,
  humidity:  Number,
  gas:       Number,
  obstacle:  Boolean,
  distance:  Number,
  sessionId: String,
  createdAt: { type: Date, default: Date.now }
});

let SensorReading = null;
let sessionId = `session_${Date.now()}`;

// ── In-memory packet log (last 50 raw payloads) ───
const packetLog = [];
let   packetCount = 0;
function logPacket(data, source = 'arduino') {
  const entry = {
    id:        ++packetCount,
    source,
    ts:        new Date().toISOString(),
    data
  };
  packetLog.unshift(entry);
  if (packetLog.length > 50) packetLog.pop();
  return entry;
}

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/rover-twin';

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('[MongoDB] ✅ Connected to:', MONGODB_URI.replace(/\/\/.*@/, '//***@'));
    SensorReading = mongoose.model('SensorReading', readingSchema);
  })
  .catch(err => {
    console.warn('[MongoDB] ⚠️  Not available — running without persistence');
    console.warn('           Reason:', err.message);
    console.warn('           Start MongoDB or set MONGODB_URI in .env to enable.');
  });

// ══════════════════════════════════════════════════
//  ROUTES
// ══════════════════════════════════════════════════

// ── POST /rover-data ──────────────────────────────
// Arduino posts sensor data here every ~1.5 seconds
app.post('/rover-data', async (req, res) => {
  const data = req.body;

  // Validate required fields
  if (data.x === undefined || data.y === undefined) {
    return res.status(400).json({ error: 'Missing required fields: x, y' });
  }

  // Persist to MongoDB (non-fatal if unavailable)
  if (SensorReading) {
    try {
      await SensorReading.create({ ...data, sessionId });
    } catch (err) {
      // Keep serving even if DB write fails
    }
  }

  // Update in-memory grid
  const { grid, rover, stats } = updateGrid(data);

  // Log + broadcast raw packet so the dashboard can show it
  const entry = logPacket(data, 'arduino');
  io.emit('raw-data',   entry);                         // live log panel
  io.emit('map-update', { grid, rover, stats });         // 3D map

  // Also log to server console with timestamp
  console.log(`[#${entry.id}] T=${data.temp}°C  H=${data.humidity}%  G=${data.gas}ppm  D=${data.distance}cm  X=${data.x}  Y=${data.y}`);

  res.json({
    status:  'ok',
    packetId: entry.id,
    cells:   Object.keys(grid).length,
    sessionId
  });
});

// ── GET /map-state ────────────────────────────────
// Dashboard fetches initial grid state on first load
app.get('/map-state', (req, res) => {
  res.json({ ...getGrid(), sessionId });
});

// ── POST /reset ───────────────────────────────────
// Clear the grid and start a new session
app.post('/reset', (req, res) => {
  resetGrid();
  sessionId = `session_${Date.now()}`;
  io.emit('map-reset');
  packetLog.length = 0;
  packetCount = 0;
  res.json({ status: 'reset', sessionId });
});

// ── GET /history ──────────────────────────────────
// Last 200 readings from MongoDB
app.get('/history', async (req, res) => {
  if (!SensorReading) return res.json([]);
  const readings = await SensorReading
    .find()
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();
  res.json(readings.reverse());
});

// ── GET /sessions ─────────────────────────────────
// List all past sessions stored in MongoDB
app.get('/sessions', async (req, res) => {
  if (!SensorReading) return res.json([]);
  const sessions = await SensorReading.distinct('sessionId');
  res.json(sessions);
});

// ── GET /packets ──────────────────────────────────
// Returns the last 50 raw packets received
app.get('/packets', (req, res) => {
  res.json({ count: packetCount, packets: packetLog });
});

// ── POST /simulate ────────────────────────────────
// Send a fake Arduino packet from the browser (for testing)
app.post('/simulate', async (req, res) => {
  const defaults = {
    x: 50, y: 50, heading: 0,
    temp: 28, humidity: 62, gas: 210,
    obstacle: false, distance: 120
  };
  const data = { ...defaults, ...req.body };

  const { grid, rover, stats } = updateGrid(data);
  const entry = logPacket(data, 'simulate');
  io.emit('raw-data',   entry);
  io.emit('map-update', { grid, rover, stats });

  console.log(`[SIM #${entry.id}] T=${data.temp}  H=${data.humidity}  G=${data.gas}  D=${data.distance}`);
  res.json({ status: 'simulated', packetId: entry.id });
});

// ── GET /health ───────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status:       'ok',
    cells:        Object.keys(getGrid().grid).length,
    packetCount,
    sessionId,
    dbOnline:     SensorReading !== null,
    uptime:       process.uptime().toFixed(1) + 's'
  });
});

// ══════════════════════════════════════════════════
//  SOCKET.IO
// ══════════════════════════════════════════════════

io.on('connection', (socket) => {
  console.log('[Socket] 🌐 Browser connected:', socket.id);

  // Send current state immediately on connect
  socket.emit('map-update', getGrid());

  socket.on('disconnect', () => {
    console.log('[Socket] ❌ Browser disconnected:', socket.id);
  });
});

// ══════════════════════════════════════════════════
//  START SERVER
// ══════════════════════════════════════════════════

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  const localIP = getLocalIP();
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  🛰  ROVER DIGITAL TWIN SERVER  v2.0
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Local:   http://localhost:${PORT}
  Network: http://${localIP}:${PORT}  ← SET THIS IN ARDUINO

  POST /rover-data    ← Arduino sends here
  POST /simulate      ← Browser test (no rover needed)
  GET  /packets       ← Last 50 raw packets
  GET  /map-state     ← Dashboard initial load
  POST /reset         ← Reset grid + log
  GET  /history       ← Past 200 readings (MongoDB)
  GET  /health        ← Server status
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Each Arduino packet is logged here in real-time.
  Open http://localhost:${PORT}/packets to see raw data.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
});

// Helper: get local LAN IP for Arduino config
function getLocalIP() {
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return '127.0.0.1';
}
