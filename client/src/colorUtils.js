// ═══════════════════════════════════════
//  COLOR UTILITIES v2.0 — Sensor Heat Mapping
// ═══════════════════════════════════════

/**
 * Map temperature to RGB colour.
 * ≤20°C → cool blue │ ~30°C → warm orange │ 45°C+ → hot red
 */
export function getTempColor(temp) {
  const t = Math.max(0, Math.min(1, (temp - 20) / 25));
  if (t < 0.5) {
    const u = t * 2;
    return {
      r: Math.round(u * 255),
      g: Math.round((1 - u * 0.3) * 180),
      b: Math.round((1 - u) * 255)
    };
  }
  const u = (t - 0.5) * 2;
  return {
    r: 255,
    g: Math.round((1 - u) * 140),
    b: 0
  };
}

/**
 * Map gas reading to RGB colour.
 * 0–200 → green (safe)  │  200–400 → yellow (warning)  │  400+ → red (danger)
 */
export function getGasColor(gas) {
  if (gas < 200) {
    const t = gas / 200;
    return { r: Math.round(t * 80), g: Math.round(180 + t * 30), b: Math.round(80 * (1 - t)) };
  }
  if (gas < 400) {
    const t = (gas - 200) / 200;
    return { r: Math.round(80 + t * 175), g: Math.round(210 - t * 50), b: 0 };
  }
  const t = Math.min(1, (gas - 400) / 300);
  return { r: 255, g: Math.round((1 - t) * 160), b: 0 };
}

/**
 * Map humidity to RGB.
 * 0% → pale sky blue  │  50% → medium blue  │  80%+ → deep navy
 */
export function getHumidityColor(hum) {
  const t = Math.max(0, Math.min(1, hum / 100));
  return {
    r: Math.round((1 - t) * 80  + t * 10),
    g: Math.round((1 - t) * 170 + t * 80),
    b: Math.round(200 + t * 55)
  };
}

/**
 * Cell bar height proportional to danger level.
 * Gas and temperature both contribute.
 */
export function getCellHeight(gas, temp) {
  const gasH  = Math.min(gas / 70, 5.5);
  const tempH = Math.max(0, (temp - 18) / 5);
  return Math.max(0.06, (gasH * 0.65 + tempH * 0.35));
}

/** Convert { r, g, b } → hex string */
export function rgbToHex({ r, g, b }) {
  const clamp = v => Math.max(0, Math.min(255, Math.round(v)));
  return `#${clamp(r).toString(16).padStart(2, '0')}${clamp(g).toString(16).padStart(2, '0')}${clamp(b).toString(16).padStart(2, '0')}`;
}

/** Safety status based on worst reading */
export function getSafetyLabel(gas, temp) {
  if (gas > 500 || temp > 42) return { label: 'DANGER',  color: '#ff4d4f', glow: '#ff4d4f55' };
  if (gas > 300 || temp > 36) return { label: 'WARNING', color: '#ffa940', glow: '#ffa94055' };
  return                              { label: 'SAFE',    color: '#52c41a', glow: '#52c41a55' };
}

/** Colour intensity multiplier for emissive glow */
export function getEmissiveIntensity(gas, temp) {
  const gasLevel  = Math.min(1, gas / 500);
  const tempLevel = Math.min(1, Math.max(0, (temp - 20) / 25));
  return Math.max(0, (gasLevel * 0.6 + tempLevel * 0.4) - 0.1);
}
