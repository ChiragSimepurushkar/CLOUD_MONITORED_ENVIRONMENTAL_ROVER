// ═══════════════════════════════════════════════════
//  ROVER DIGITAL TWIN — Node.js Server
//  Receives data from Arduino via ESP8266 WiFi
//  Pushes live map updates via Socket.io
// ═══════════════════════════════════════════════════

const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const cors       = require('cors');
const mongoose   = require('mongoose');
const { updateGrid, resetGrid, getGrid } = require('./gridMap');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(cors());
app.use(express.json());

// ── MongoDB Schema ─────────────────────────────────
const readingSchema = new mongoose.Schema({
  x:        Number,
  y:        Number,
  heading:  Number,
  temp:     Number,
  humidity: Number,
  gas:      Number,
  obstacle: Boolean,
  distance: Number,
  createdAt: { type: Date, default: Date.now }
});

let SensorReading;
try {
  mongoose.connect('mongodb://localhost:27017/rover-twin').then(() => {
    console.log('[MongoDB] Connected');
    SensorReading = mongoose.model('SensorReading', readingSchema);
  }).catch(err => {
    console.warn('[MongoDB] Not available — running without persistence:', err.message);
  });
} catch (e) {
  console.warn('[MongoDB] Skipped:', e.message);
}

// ══════════════════════════════════════════════════
//  ROUTES
// ══════════════════════════════════════════════════

// Arduino POST data here every ~1.5 seconds
app.post('/rover-data', async (req, res) => {
  const data = req.body;

  // Validate required fields
  if (data.x === undefined || data.y === undefined) {
    return res.status(400).json({ error: 'Missing x,y coordinates' });
  }

  // Persist to MongoDB (if available)
  if (SensorReading) {
    try {
      await SensorReading.create(data);
    } catch (err) {
      // Non-fatal — keep serving
    }
  }

  // Update in-memory grid
  const { grid, rover, stats } = updateGrid(data);

  // Push to all connected browsers instantly
  io.emit('map-update', { grid, rover, stats });

  res.json({ status: 'ok', cells: Object.keys(grid).length });
});

// Dashboard fetches initial state when page loads
app.get('/map-state', (req, res) => {
  res.json(getGrid());
});

// Reset grid (useful when testing a new run)
app.post('/reset', (req, res) => {
  resetGrid();
  io.emit('map-reset');
  res.json({ status: 'reset' });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', cells: Object.keys(getGrid().grid).length });
});

// ── History endpoint (last 200 readings) ──────────
app.get('/history', async (req, res) => {
  if (!SensorReading) {
    return res.json([]);
  }
  const readings = await SensorReading.find()
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();
  res.json(readings.reverse());
});

// ══════════════════════════════════════════════════
//  SOCKET.IO
// ══════════════════════════════════════════════════

io.on('connection', (socket) => {
  console.log('[Socket] Browser connected:', socket.id);

  // Send current state immediately on connect
  socket.emit('map-update', getGrid());

  socket.on('disconnect', () => {
    console.log('[Socket] Browser disconnected:', socket.id);
  });
});

// ══════════════════════════════════════════════════
//  START SERVER
// ══════════════════════════════════════════════════

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ROVER DIGITAL TWIN SERVER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  http://localhost:${PORT}
  
  POST /rover-data   ← Arduino sends here
  GET  /map-state    ← Dashboard initial load
  POST /reset        ← Reset the grid
  GET  /history      ← Past 200 readings
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `);
});
