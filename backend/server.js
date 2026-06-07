// ══════════════════════════════════════════════════════════════
//  COMBINED SERVER  v4.1  — Room Scanning Edition
//  Cloud-Monitored Environmental Rover  +  Real Occupancy Grid
//  ─ Bresenham ray-tracing via gridMap.js
//  ─ Backward-compatible: works with old AND new Arduino firmware
//  ─ /rover-data with scan[] → occupancy grid
//  ─ /rover-data without scan[] → legacy simple grid
//  ─ MIT App Inventor: /control /auto /led /data endpoints
//  ─ Error handler AFTER routes (Express requirement)
// ══════════════════════════════════════════════════════════════

const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const cors       = require('cors');
const mongoose   = require('mongoose');
const { networkInterfaces } = require('os');
const gridEngine = require('./gridMap');

require('dotenv').config();

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json({ limit: '512kb' }));  // scan[] payloads can be large

// ─────────────────────────────────────────────
//  MongoDB — dual schema
// ─────────────────────────────────────────────
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/rover-combined';

let SensorReading = null;
let Alert         = null;
let GridReading   = null;
let sessionId     = `session_${Date.now()}`;

// ── MIT App Inventor control state ──────────────────────────
let currentCommand = "stop";  // last movement command from app
let autoMode       = true;    // true = autonomous rover, false = app-controlled
let ledState       = "off";   // LED state

mongoose.connect(MONGO_URI)
  .then(() => {
    console.log('[MongoDB] ✅ Connected');

    const sensorSchema = new mongoose.Schema({
      temperature: Number, humidity: Number, gas: Number,
      createdAt: { type: Date, default: Date.now }
    });
    SensorReading = mongoose.model('SensorReading', sensorSchema);

    const alertSchema = new mongoose.Schema({
      type: String, message: String,
      createdAt: { type: Date, default: Date.now }
    });
    Alert = mongoose.model('Alert', alertSchema);

    // Extended schema — stores scan arrays for replay
    const gridSchema = new mongoose.Schema({
      x: Number, y: Number, heading: Number,
      temp: Number, humidity: Number, gas: Number,
      obstacle: Boolean, distance: Number,
      scan: [{ a: Number, d: Number }],
      sessionId: String,
      createdAt: { type: Date, default: Date.now }
    });
    GridReading = mongoose.model('GridReading', gridSchema);
  })
  .catch(err => console.warn('[MongoDB] ⚠️  Not available —', err.message));

// ─────────────────────────────────────────────
//  In-memory packet log + chart buffer
// ─────────────────────────────────────────────
const packetLog   = [];
const chartBuffer = [];
let   packetCount = 0;

function logPacket(data, source) {
  const entry = { id: ++packetCount, source, ts: new Date().toISOString(), data };
  packetLog.unshift(entry);
  if (packetLog.length > 50) packetLog.pop();

  const point = {
    time:        new Date().toLocaleTimeString(),
    temperature: data.temp        ?? data.temperature ?? 0,
    humidity:    data.hum         ?? data.humidity    ?? 0,
    gas:         data.gas         ?? 0,
    distance:    data.distance    ?? 0,
  };
  chartBuffer.push(point);
  if (chartBuffer.length > 60) chartBuffer.shift();
  return entry;
}

// ── Check and emit alert ──────────────────────────────────────
async function checkAlert(data, x, y) {
  const gas     = data.gas ?? 0;
  const payload = gas > 400 ? { type: 'DANGER',  message: `Gas ${gas} ppm at (${Math.round(x)},${Math.round(y)}) cm` }
                : gas > 250 ? { type: 'WARNING', message: `Elevated gas ${gas} ppm at (${Math.round(x)},${Math.round(y)}) cm` }
                : null;
  if (payload && Alert) {
    try { const a = await Alert.create(payload); io.emit('newAlert', a); } catch(_) {}
  }
}

// ══════════════════════════════════════════════
//  ROUTES
// ══════════════════════════════════════════════

// ── GET /data — MIT App polls this every 2s for sensor readings
app.get('/data', (req, res) => {
  const latest = chartBuffer.length > 0 ? chartBuffer[chartBuffer.length - 1] : { temperature: 0, humidity: 0, gas: 0, distance: 0 };
  res.json({
    temp:           latest.temperature,
    humidity:       latest.humidity,
    gas:            latest.gas,
    distance:       latest.distance,
    autoMode:       autoMode,
    currentCommand: currentCommand,
    ledStatus:      ledState
  });
});

// ── GET /control — MIT App sends movement commands
// Usage: /control?cmd=forward  (forward|backward|left|right|stop)
app.get('/control', (req, res) => {
  const cmd = req.query.cmd;
  if (cmd) {
    currentCommand = cmd;
    autoMode       = false;   // ← switching to manual the moment app sends a command
    console.log(`📱 App command: ${currentCommand} → Manual Mode ON`);
    res.send(`Command ${currentCommand} received`);
  } else {
    res.status(400).send("No command provided");
  }
});

// ── GET /auto — Toggle autonomous / manual mode
// App calls: /auto?toggle=true  → autonomous ON
//            /auto?toggle=false → manual (app takes control)
app.get('/auto', (req, res) => {
  const toggle = req.query.toggle;
  if (toggle !== undefined) {
    autoMode = (toggle === 'true');
  } else {
    autoMode = !autoMode;   // flip if no param
  }
  if (autoMode) currentCommand = 'stop';  // clear manual cmd when going auto
  console.log(`🤖 Auto Mode: ${autoMode ? 'ON  (rover drives itself)' : 'OFF (app in control)'}`);
  res.json({ success: true, autoMode });
});

// ── GET /led — LED control
// App calls: /led?state=on  or  /led?state=off
app.get('/led', (req, res) => {
  const st = (req.query.state || '').toLowerCase();
  if (st === 'on' || st === 'off') {
    ledState = st;
    console.log(`💡 LED: ${ledState.toUpperCase()}`);
    res.send(`LED ${ledState}`);
  } else {
    res.status(400).send('Use ?state=on or ?state=off');
  }
});

// ── GET /rover/command/raw — Arduino plain-text fallback poll
// Returns "auto" when rover should drive itself,
// or "forward" / "backward" / "left" / "right" / "stop"
app.get('/rover/command/raw', (req, res) => {
  res.setHeader('Content-Type', 'text/plain');
  res.send(autoMode ? 'auto' : currentCommand);
});

// ── POST /rover-data — Arduino sends sensor + scan data
// Key fix: body-parse errors are handled inline, valid packets
// never reach the error handler below.
// Reply includes cmd so Arduino gets poll + upload in ONE round trip.
app.post('/rover-data', (req, res) => {
  // Guard: body must exist and have x ────────────────────────
  const d = req.body;
  if (!d || d.x === undefined) {
    console.log('⚠️ [rover-data] Empty or missing x — ignored');
    return res.status(400).end();
  }

  try {
    const mapData   = gridEngine.processPacket(d);
    const entry     = logPacket(d, Array.isArray(d.scan) ? 'arduino-scan' : 'arduino-legacy');
    const scanCount = Array.isArray(d.scan) ? d.scan.length : 0;

    console.log(`[#${entry.id}][${entry.source}] X=${d.x.toFixed(0)} Y=${d.y.toFixed(0)} Hdg=${d.heading}° T=${d.temp ?? d.temperature ?? '?'}°C H=${d.hum ?? d.humidity ?? '?'}% G=${d.gas}ppm Rays=${scanCount}`);

    // Deep clone before emitting — avoids mutable reference issues
    const safeEntry = JSON.parse(JSON.stringify(entry));
    const safeMap   = JSON.parse(JSON.stringify({ ...mapData, lastScan: Array.isArray(d.scan) ? d.scan : null }));
    const safeChart = JSON.parse(JSON.stringify(chartBuffer.slice(-1)[0] || {}));

    io.emit('raw-data',     safeEntry);
    io.emit('map-update',   safeMap);
    io.emit('chart-update', safeChart);
    console.log(`  → broadcast to ${io.engine.clientsCount} browser(s)`);

    // Fire-and-forget async (alerts, DB) — don't block the response
    checkAlert(d, d.x, d.y).catch(() => {});
    if (GridReading) GridReading.create({ ...d, sessionId }).catch(() => {});

    // Reply includes cmd so Arduino gets poll + upload in one round trip.
    // "auto" = rover drives itself | "forward" etc. = manual command from app
    res.json({ ok: true, cmd: autoMode ? 'auto' : currentCommand });

  } catch(err) {
    console.error('[/rover-data] Error:', err.message);
    try { res.status(500).end(); } catch(_) {}
  }
});

// ── POST /sensor-data  (legacy endpoint)
app.post('/sensor-data', async (req, res) => {
  const { temperature, humidity, gas } = req.body;
  const data = { temp: temperature, temperature, humidity, hum: humidity, gas, x: 0, y: 0, heading: 0, distance: 0, obstacle: false };
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

// ── POST /simulate  (browser test — fake 13-ray scan)
app.post('/simulate', (req, res) => {
  try {
    const d       = buildSimPacket(req.body);
    const mapData = gridEngine.processPacket(d);
    const entry   = logPacket(d, 'simulate');
    io.emit('raw-data',   entry);
    io.emit('map-update', { ...mapData, lastScan: d.scan || null });
    io.emit('chart-update', chartBuffer.slice(-1)[0]);
    console.log(`[SIM HTTP #${entry.id}] X=${d.x} Y=${d.y}`);
    res.json({ status: 'simulated', packetId: entry.id, mapCells: mapData.cellCount });
  } catch(err) {
    console.error('[/simulate] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/map-state',  (req, res) => res.json(gridEngine.getState()));
app.get('/chart-data', (req, res) => res.json(chartBuffer));
app.get('/replay',     (req, res) => res.json(gridEngine.getScanHistory()));

app.get('/sensor-data', async (req, res) => {
  if (SensorReading) {
    const data = await SensorReading.find().sort({ createdAt: -1 }).limit(60).lean().catch(() => []);
    return res.json(data);
  }
  res.json([]);
});

app.get('/alerts', async (req, res) => {
  if (Alert) {
    const alerts = await Alert.find().sort({ createdAt: -1 }).limit(50).lean().catch(() => []);
    return res.json(alerts);
  }
  res.json([]);
});

app.get('/packets', (req, res) => res.json({ count: packetCount, packets: packetLog }));

app.post('/reset', (req, res) => {
  gridEngine.reset();
  packetLog.length   = 0;
  chartBuffer.length = 0;
  packetCount        = 0;
  sessionId          = `session_${Date.now()}`;
  io.emit('map-reset');
  res.json({ status: 'reset', sessionId });
});

app.get('/health', (req, res) => {
  const state = gridEngine.getState();
  res.json({
    status: 'ok', packetCount, sessionId,
    cells: state.cellCount, coverage: state.coverage,
    wallCells: state.stats.wallCells, freeCells: state.stats.freeCells,
    dbOnline: SensorReading !== null,
    uptime: process.uptime().toFixed(1) + 's'
  });
});

// ─────────────────────────────────────────────
//  SOCKET.IO
// ─────────────────────────────────────────────

function buildSimPacket(override = {}) {
  return {
    x: 50, y: 50, heading: 0,
    temp: 28, hum: 62, gas: 210,
    obstacle: false, distance: 120,
    scan: [
      {a:0,d:120},{a:15,d:130},{a:30,d:145},{a:45,d:160},
      {a:60,d:175},{a:75,d:180},{a:90,d:120},{a:105,d:130},
      {a:120,d:150},{a:135,d:140},{a:150,d:125},{a:165,d:115},{a:180,d:100}
    ],
    ...override
  };
}

io.on('connection', socket => {
  console.log('[Socket] Browser connected:', socket.id);

  // Send current state immediately on connect
  const state = gridEngine.getState();
  socket.emit('map-update', JSON.parse(JSON.stringify({ ...state, lastScan: null })));
  socket.emit('chart-init', JSON.parse(JSON.stringify(chartBuffer)));

  socket.on('client-simulate', (data) => {
    try {
      const d       = buildSimPacket(data || {});
      const mapData = gridEngine.processPacket(d);
      const entry   = logPacket(d, 'simulate');
      io.emit('raw-data',     JSON.parse(JSON.stringify(entry)));
      io.emit('map-update',   JSON.parse(JSON.stringify({ ...mapData, lastScan: d.scan })));
      io.emit('chart-update', JSON.parse(JSON.stringify(chartBuffer.slice(-1)[0] || {})));
      console.log(`[SIM WS #${entry.id}] X=${d.x} Y=${d.y} Hdg=${d.heading} → ${io.engine.clientsCount} browser(s)`);
    } catch(err) {
      console.error('[client-simulate] Error:', err.message);
      socket.emit('sim-error', { error: err.message });
    }
  });

  socket.on('client-reset', () => {
    gridEngine.reset();
    io.emit('map-reset');
    console.log('[Socket] Map reset by browser');
  });

  socket.on('disconnect', () => console.log('[Socket] Disconnected:', socket.id));
});

// ─────────────────────────────────────────────
//  ERROR HANDLER — MUST be after all routes
//  Express requires 4-argument handlers at the bottom.
//  Placing this before routes caused every Arduino POST
//  to be intercepted as an error before matching the route.
// ─────────────────────────────────────────────
app.use((err, req, res, next) => {
  if (err.type === 'request.aborted' || err.code === 'ECONNRESET') {
    // ESP8266 closed connection before body was fully received.
    // This is harmless — the packet was incomplete so we discard it.
    // Do NOT call res.send() here — the socket is already gone.
    console.log('⚠️ [Network] ESP8266 closed connection early. Ignoring packet.');
    return;
  }
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    console.log('⚠️ [Network] Malformed JSON. Ignoring packet.');
    try { res.status(400).end(); } catch(_) {}
    return;
  }
  console.error('[Server Error]', err.message);
  try { res.status(500).end(); } catch(_) {}
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
  🛰  ROVER ROOM SCANNER SERVER  v4.1
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Local:   http://localhost:${PORT}
  Network: http://${ip}:${PORT}  ← SET THIS IN ARDUINO

  POST /rover-data    ← Arduino (scan[] or legacy)
  POST /simulate      ← Browser test with fake 13-ray scan
  GET  /map-state     ← Full occupancy grid
  GET  /chart-data    ← Live sensor chart buffer
  GET  /replay        ← Scan history for replay
  GET  /alerts        ← Alert history
  GET  /health        ← Server status + coverage %

  MIT App Inventor:
  GET  /data          ← Sensor readings for phone
  GET  /control?cmd=  ← Movement command from phone
  GET  /auto?toggle=  ← Switch autonomous / manual
  GET  /led?state=    ← LED on/off from phone
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
});