// ═══════════════════════════════════════════════════
//  GRID MAP ENGINE — Environmental Rover Digital Twin
//  Converts rover x,y coordinates → 25cm grid cells
//  Accumulates sensor readings, computes averages
// ═══════════════════════════════════════════════════

const CELL_SIZE = 25; // each cell = 25cm × 25cm

const environmentGrid = {};
let roverPosition = { x: 0, y: 0, heading: 0 };
let stats = { maxGas: 0, maxTemp: 0, cellsVisited: 0 };

function posToGrid(x, y) {
  return {
    gx: Math.round(x / CELL_SIZE),
    gy: Math.round(y / CELL_SIZE)
  };
}

function average(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function getObstacleCellKey(x, y, heading) {
  const rad = (heading * Math.PI) / 180;
  const ox = x + 30 * Math.sin(rad);
  const oy = y + 30 * Math.cos(rad);
  const { gx, gy } = posToGrid(ox, oy);
  return `${gx},${gy}`;
}

/**
 * Update the grid with new rover data.
 * @param {Object} data - { x, y, heading, temp, humidity, gas, obstacle, distance }
 * @returns {{ grid, rover, stats }}
 */
function updateGrid(data) {
  const { gx, gy } = posToGrid(data.x, data.y);
  const key = `${gx},${gy}`;

  // Create cell if new
  if (!environmentGrid[key]) {
    environmentGrid[key] = {
      gx,
      gy,
      temps: [],
      gases: [],
      humidities: [],
      isObstacle: false,
      visitCount: 0
    };
    stats.cellsVisited++;
  }

  const cell = environmentGrid[key];
  cell.visitCount++;

  // Accumulate readings (keep last 10 per cell)
  cell.temps.push(Number(data.temp) || 0);
  cell.gases.push(Number(data.gas) || 0);
  cell.humidities.push(Number(data.humidity) || 0);

  if (cell.temps.length > 10) cell.temps.shift();
  if (cell.gases.length > 10) cell.gases.shift();
  if (cell.humidities.length > 10) cell.humidities.shift();

  // Running averages
  cell.avgTemp = parseFloat(average(cell.temps).toFixed(1));
  cell.avgGas  = parseFloat(average(cell.gases).toFixed(0));
  cell.avgHum  = parseFloat(average(cell.humidities).toFixed(1));

  // Mark obstacle in the cell ahead of rover
  if (data.obstacle && Number(data.distance) < 30) {
    const obstKey = getObstacleCellKey(data.x, data.y, data.heading);
    if (!environmentGrid[obstKey]) {
      environmentGrid[obstKey] = {
        gx: 0, gy: 0,
        temps: [], gases: [], humidities: [],
        isObstacle: true,
        visitCount: 0
      };
      // Recalculate gx/gy from key
      const parts = obstKey.split(',').map(Number);
      environmentGrid[obstKey].gx = parts[0];
      environmentGrid[obstKey].gy = parts[1];
    }
    environmentGrid[obstKey].isObstacle = true;
  }

  // Update rover marker
  roverPosition = {
    x: Number(data.x) || 0,
    y: Number(data.y) || 0,
    heading: Number(data.heading) || 0
  };

  // Update global stats
  if (cell.avgGas > stats.maxGas)   stats.maxGas  = cell.avgGas;
  if (cell.avgTemp > stats.maxTemp) stats.maxTemp = cell.avgTemp;

  return {
    grid: environmentGrid,
    rover: roverPosition,
    stats
  };
}

function resetGrid() {
  Object.keys(environmentGrid).forEach(k => delete environmentGrid[k]);
  roverPosition = { x: 0, y: 0, heading: 0 };
  stats = { maxGas: 0, maxTemp: 0, cellsVisited: 0 };
}

function getGrid() {
  return { grid: environmentGrid, rover: roverPosition, stats };
}

module.exports = { updateGrid, resetGrid, getGrid, CELL_SIZE };
