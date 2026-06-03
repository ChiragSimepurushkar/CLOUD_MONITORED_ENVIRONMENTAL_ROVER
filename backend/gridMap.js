// ══════════════════════════════════════════════════════════════
//  OCCUPANCY GRID ENGINE  — Bresenham Ray-Tracing
//  Builds a probabilistic room map from ultrasonic sweep scans
//  Each cell = 25cm × 25cm real-world space
// ══════════════════════════════════════════════════════════════

const CELL_CM    = 25;    // cm per grid cell
const MAX_DIST   = 400;   // HC-SR04 range is ~400cm; was 180 (too aggressive filter)
const FREE_STEP  = 0.12;  // probability decrease per ray pass-through
const OCC_BOOST  = 0.22;  // probability increase per ray hit (was 0.18)
const WALL_MIN_HITS = 2;  // minimum hits to confirm a wall (was 3 — too strict)
const HIST_MAX   = 500;   // max history points kept

// ── State ─────────────────────────────────────────────────────
const occupancyGrid = {};  // "cx,cy" → { prob, hits, type, firstSeen, lastSeen }
const sensorGrid    = {};  // "cx,cy" → { temps[], gases[], hums[], avgTemp, avgGas, avgHum }
const roverHistory  = [];  // [{ x, y, heading, ts }]
const scanHistory   = [];  // last 200 full scan packets for replay

let roverCurrent = { x: 0, y: 0, heading: 0 };
let sessionStats = {
  maxGas: 0, maxTemp: -Infinity, minTemp: Infinity, maxHum: 0,
  totalReadings: 0, wallCells: 0, freeCells: 0, scanCount: 0,
  startTime: Date.now()
};

// ── Helpers ────────────────────────────────────────────────────
function toCell(x_cm, y_cm) {
  return { cx: Math.round(x_cm / CELL_CM), cy: Math.round(y_cm / CELL_CM) };
}

function cellKey(cx, cy) { return `${cx},${cy}`; }

function getOrCreate(key, cx, cy) {
  if (!occupancyGrid[key]) {
    occupancyGrid[key] = { cx, cy, prob: 0.5, hits: 0, type: 'unknown', firstSeen: Date.now(), lastSeen: Date.now() };
  }
  return occupancyGrid[key];
}

// ── Bresenham line algorithm ────────────────────────────────────
// Returns array of ALL grid cells along the line from (x0,y0) to (x1,y1)
function bresenham(x0, y0, x1, y1) {
  const cells = [];
  let dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
  let dy = Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  while (true) {
    cells.push({ cx: x0, cy: y0 });
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 <  dx) { err += dx; y0 += sy; }
    // Safety limit
    if (cells.length > 50) break;
  }
  return cells;
}

// ── Main packet processor ───────────────────────────────────────
function processPacket(data) {
  // data = { x, y, heading, scan:[{a,d},...], temp, gas, hum }
  //   OR legacy: { x, y, heading, temp, humidity, gas, obstacle, distance }

  const x   = data.x       || 0;
  const y   = data.y       || 0;
  const hdg = data.heading || 0;

  roverCurrent = { x, y, heading: hdg };
  roverHistory.push({ x, y, heading: hdg, ts: Date.now() });
  if (roverHistory.length > HIST_MAX) roverHistory.shift();

  const origin = toCell(x, y);

  // ── Process sweep scan array (new firmware) ──────────────────
  if (Array.isArray(data.scan) && data.scan.length > 0) {
    sessionStats.scanCount++;

    // Log individual ray distances for debugging
    const rayDists = data.scan.map(r => r.d || 0);
    console.log(`  rays: [${rayDists.join(', ')}]`);

    data.scan.forEach(ray => {
      const d = ray.d || ray.dist || 0;
      if (d <= 0 || d > MAX_DIST) return;

      // Servo 90° = forward; offset so 90→0 relative
      // world angle = rover heading + (servo_angle - 90)
      const servoOffset  = (ray.a || 0) - 90;
      const worldAngleDeg = (hdg + servoOffset + 360) % 360;
      const rad  = worldAngleDeg * Math.PI / 180;

      // Hit point in real-world cm
      const hitX = x + d * Math.sin(rad);
      const hitY = y + d * Math.cos(rad);
      const hitCell = toCell(hitX, hitY);

      // Trace Bresenham ray: all cells = FREE except endpoint
      const rayCells = bresenham(origin.cx, origin.cy, hitCell.cx, hitCell.cy);

      rayCells.forEach((cell, idx) => {
        const key = cellKey(cell.cx, cell.cy);
        const c   = getOrCreate(key, cell.cx, cell.cy);
        c.lastSeen = Date.now();

        if (idx === rayCells.length - 1) {
          // Endpoint = potential wall (only if ray didn't max out)
          if (d < MAX_DIST - 20) {
            c.prob  = Math.min(0.97, c.prob + OCC_BOOST);
            c.hits += 1;
            if (c.prob > 0.65 && c.hits >= WALL_MIN_HITS) {
              if (c.type !== 'wall') { c.type = 'wall'; sessionStats.wallCells++; }
            } else if (c.type === 'unknown') {
              c.type = 'suspect'; // not yet confirmed wall
            }
          }
        } else {
          // Along ray = free space
          c.prob = Math.max(0.03, c.prob - FREE_STEP);
          if (c.prob < 0.35) {
            if (c.type !== 'free') { c.type = 'free'; sessionStats.freeCells++; }
          }
        }
      });
    });

    // Save for replay
    scanHistory.push({
      ts: Date.now(), x, y, heading: hdg,
      scan: data.scan,
      temp: data.temp, gas: data.gas, hum: data.hum
    });
    if (scanHistory.length > 200) scanHistory.shift();

  } else if (data.distance !== undefined) {
    // ── Legacy single-point data (old firmware) ──────────────────
    // Treat as a forward-facing single ray
    const fwdAngle = hdg * Math.PI / 180;
    const d = Math.min(data.distance || 100, MAX_DIST);
    const hitX = x + d * Math.sin(fwdAngle);
    const hitY = y + d * Math.cos(fwdAngle);
    const hitCell = toCell(hitX, hitY);
    const rayCells = bresenham(origin.cx, origin.cy, hitCell.cx, hitCell.cy);

    rayCells.forEach((cell, idx) => {
      const key = cellKey(cell.cx, cell.cy);
      const c   = getOrCreate(key, cell.cx, cell.cy);
      if (idx === rayCells.length - 1) {
        if (data.obstacle) {
          c.prob = Math.min(0.97, c.prob + OCC_BOOST * 2);
          c.hits += 2;
          if (c.hits >= WALL_MIN_HITS) { if (c.type !== 'wall') { c.type = 'wall'; sessionStats.wallCells++; } }
        }
      } else {
        c.prob = Math.max(0.03, c.prob - FREE_STEP);
        if (c.prob < 0.35 && c.type !== 'wall') { if (c.type !== 'free') { c.type = 'free'; sessionStats.freeCells++; } }
      }
    });

    // Also mark current rover cell as free
    const rKey = cellKey(origin.cx, origin.cy);
    const rc   = getOrCreate(rKey, origin.cx, origin.cy);
    rc.prob = Math.max(0.03, rc.prob - FREE_STEP * 2);
    if (rc.prob < 0.35 && rc.type !== 'wall') { if (rc.type !== 'free') { rc.type = 'free'; sessionStats.freeCells++; } }
  }

  // ── Sensor overlay at current cell ──────────────────────────
  const sKey = cellKey(origin.cx, origin.cy);
  if (!sensorGrid[sKey]) sensorGrid[sKey] = { temps: [], gases: [], hums: [] };
  const sc = sensorGrid[sKey];
  const temp = data.temp ?? data.temperature ?? null;
  const gas  = data.gas  ?? null;
  const hum  = data.hum  ?? data.humidity ?? null;

  if (temp !== null) { sc.temps.push(temp); if (sc.temps.length > 10) sc.temps.shift(); }
  if (gas  !== null) { sc.gases.push(gas);  if (sc.gases.length > 10) sc.gases.shift(); }
  if (hum  !== null) { sc.hums.push(hum);   if (sc.hums.length  > 10) sc.hums.shift();  }

  if (sc.temps.length) sc.avgTemp = +(sc.temps.reduce((a,b)=>a+b) / sc.temps.length).toFixed(1);
  if (sc.gases.length) sc.avgGas  = +(sc.gases.reduce((a,b)=>a+b) / sc.gases.length).toFixed(0);
  if (sc.hums.length)  sc.avgHum  = +(sc.hums.reduce((a,b)=>a+b)  / sc.hums.length).toFixed(1);

  // ── Session stats ─────────────────────────────────────────────
  sessionStats.totalReadings++;
  if (gas  !== null && gas  > sessionStats.maxGas)  sessionStats.maxGas  = gas;
  if (temp !== null && temp > sessionStats.maxTemp) sessionStats.maxTemp = +temp.toFixed(1);
  if (temp !== null && temp < sessionStats.minTemp) sessionStats.minTemp = +temp.toFixed(1);
  if (hum  !== null && hum  > sessionStats.maxHum)  sessionStats.maxHum  = +hum.toFixed(1);

  return getState();
}

// ── Get full state ─────────────────────────────────────────────
function getState() {
  return {
    occupancy: occupancyGrid,
    sensors:   sensorGrid,
    rover:     roverCurrent,
    history:   roverHistory.slice(-200),
    stats:     { ...sessionStats },
    cellCount: Object.keys(occupancyGrid).length,
    coverage:  sessionStats.freeCells + sessionStats.wallCells > 0
      ? Math.round((sessionStats.freeCells / Math.max(1, sessionStats.freeCells + sessionStats.wallCells)) * 100)
      : 0
  };
}

// ── Get recent scans for replay ────────────────────────────────
function getScanHistory() {
  return scanHistory;
}

// ── Reset everything ───────────────────────────────────────────
function reset() {
  Object.keys(occupancyGrid).forEach(k => delete occupancyGrid[k]);
  Object.keys(sensorGrid).forEach(k => delete sensorGrid[k]);
  roverHistory.length = 0;
  scanHistory.length  = 0;
  roverCurrent = { x: 0, y: 0, heading: 0 };
  Object.assign(sessionStats, {
    maxGas: 0, maxTemp: -Infinity, minTemp: Infinity, maxHum: 0,
    totalReadings: 0, wallCells: 0, freeCells: 0, scanCount: 0,
    startTime: Date.now()
  });
}

module.exports = { processPacket, getState, getScanHistory, reset, CELL_CM };
