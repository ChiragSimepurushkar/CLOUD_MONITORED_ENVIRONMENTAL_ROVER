// ═══════════════════════════════════════
//  COLOR UTILITIES — Sensor Heat Mapping
// ═══════════════════════════════════════

/**
 * Map temperature to a colour.
 * 20°C = cool blue, 30°C = warm orange, 45°C = hot red
 */
export function getTempColor(temp) {
  const t = Math.max(0, Math.min(1, (temp - 20) / 25));
  return {
    r: Math.round(t * 255),
    g: Math.round((1 - t * 0.8) * 200),
    b: Math.round((1 - t) * 255)
  };
}

/**
 * Map gas value to a colour.
 * 0–200 = green (safe), 200–400 = yellow (warning), 400+ = red (danger)
 */
export function getGasColor(gas) {
  if (gas < 200) {
    return { r: 0, g: 200, b: 80 };
  }
  if (gas < 400) {
    const t = (gas - 200) / 200;
    return { r: Math.round(t * 255), g: 200, b: 0 };
  }
  const t = Math.min(1, (gas - 400) / 200);
  return { r: 255, g: Math.round((1 - t) * 180), b: 0 };
}

/**
 * Map humidity to a colour.
 * 0% = pale blue, 80%+ = deep blue
 */
export function getHumidityColor(hum) {
  const t = Math.max(0, Math.min(1, hum / 100));
  return {
    r: Math.round((1 - t) * 60),
    g: Math.round((1 - t * 0.5) * 160),
    b: 255
  };
}

/**
 * Cell bar height proportional to danger level.
 * Higher = more dangerous reading.
 */
export function getCellHeight(gas, temp) {
  const gasH  = Math.min(gas / 80, 5);
  const tempH = Math.max(0, (temp - 20) / 4);
  return Math.max(0.08, (gasH + tempH) / 2);
}

export function rgbToHex({ r, g, b }) {
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

export function getSafetyLabel(gas, temp) {
  if (gas > 500 || temp > 42) return { label: 'DANGER',  color: '#e24b4a' };
  if (gas > 300 || temp > 36) return { label: 'WARNING', color: '#ef9f27' };
  return { label: 'SAFE', color: '#1d9e75' };
}
