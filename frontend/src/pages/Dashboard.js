// ══════════════════════════════════════════════════════════════
//  Dashboard.js  — Live Sensor Overview
//  Premium glassmorphism stats + live recharts
//  Upgraded from basic dashboard-code version
// ══════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import {
  AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { socket, SERVER } from '../App';

const mono = { fontFamily: 'var(--font-mono)' };

const glass = {
  background: 'rgba(5,11,23,0.80)',
  backdropFilter: 'blur(14px)',
  WebkitBackdropFilter: 'blur(14px)',
  border: '1px solid rgba(0,212,255,0.18)',
  borderRadius: 12,
};

function StatCard({ icon, label, value, unit, color, sub, danger }) {
  return (
    <div style={{ ...glass, padding: '16px 20px', borderLeft: `3px solid ${color}`, flex: 1, minWidth: 140 }}>
      <div style={{ ...mono, fontSize: 9, color: 'rgba(140,180,220,0.55)', letterSpacing: '0.2em', marginBottom: 6 }}>
        {icon} {label}
      </div>
      <div style={{ ...mono, fontSize: 28, fontWeight: 700, color, textShadow: `0 0 14px ${color}55`, lineHeight: 1 }}>
        {value}<span style={{ fontSize: 13, fontWeight: 400, marginLeft: 4, opacity: 0.7 }}>{unit}</span>
      </div>
      {sub && <div style={{ ...mono, fontSize: 9, color: 'rgba(140,180,220,0.5)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function GaugeBar({ label, value, max, color, unit }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ ...mono, fontSize: 10, color: 'rgba(140,180,220,0.65)' }}>{label}</span>
        <span style={{ ...mono, fontSize: 11, color, fontWeight: 600 }}>{value}{unit}</span>
      </div>
      <div style={{ height: 6, background: 'rgba(0,212,255,0.08)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${pct}%`, background: color,
          borderRadius: 4, boxShadow: `0 0 8px ${color}88`,
          transition: 'width 0.6s ease',
        }} />
      </div>
    </div>
  );
}

const CHART_COLORS = { temperature: '#ff7875', humidity: '#69c0ff', gas: '#ffa940' };

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ ...glass, padding: '10px 14px', ...mono, fontSize: 10 }}>
      <div style={{ color: 'rgba(140,180,220,0.6)', marginBottom: 4 }}>{label}</div>
      {payload.map(p => (
        <div key={p.dataKey} style={{ color: CHART_COLORS[p.dataKey] || 'white', marginBottom: 2 }}>
          {p.dataKey}: <strong>{typeof p.value === 'number' ? p.value.toFixed(1) : p.value}</strong>
        </div>
      ))}
    </div>
  );
};

export default function Dashboard() {
  const [chart,  setChart]  = useState([]); // rolling 60-point buffer
  const [latest, setLatest] = useState(null);
  const [stats,  setStats]  = useState({ maxGas: 0, maxTemp: 0, minTemp: 0, maxHum: 0, totalReadings: 0, cellsVisited: 0 });


  // Initial fetch
  useEffect(() => {
    fetch(`${SERVER}/chart-data`).then(r => r.json()).then(d => {
      if (Array.isArray(d) && d.length) { setChart(d); setLatest(d[d.length - 1]); }
    }).catch(() => {});

    fetch(`${SERVER}/map-state`).then(r => r.json()).then(d => {
      if (d.stats) setStats(d.stats);
    }).catch(() => {});

    fetch(`${SERVER}/health`).catch(() => {});
  }, []);

  // Live updates via socket
  useEffect(() => {
    const onChart = (point) => {
      setChart(prev => [...prev, point].slice(-60));
      setLatest(point);
    };
    const onChartInit = (buf) => {
      if (Array.isArray(buf) && buf.length) { setChart(buf); setLatest(buf[buf.length - 1]); }
    };
    const onMapUpdate = ({ stats: s }) => { if (s) setStats(s); };
    socket.on('chart-update', onChart);
    socket.on('chart-init',   onChartInit);
    socket.on('map-update',   onMapUpdate);
    return () => { socket.off('chart-update', onChart); socket.off('chart-init', onChartInit); socket.off('map-update', onMapUpdate); };
  }, []);

  const safetyColor = latest?.gas > 400 ? 'var(--red)' : latest?.gas > 250 ? 'var(--orange)' : 'var(--green)';
  const safetyLabel = latest?.gas > 400 ? '🔴 DANGER' : latest?.gas > 250 ? '🟡 WARNING' : '🟢 SAFE';

  return (
    <div style={{ height: '100vh', overflow: 'auto', padding: '20px 24px' }}>
      {/* Header */}
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ ...mono, fontSize: 16, color: 'var(--accent)', fontWeight: 700, letterSpacing: '0.1em',
            textShadow: '0 0 12px rgba(0,212,255,0.5)', marginBottom: 2 }}>LIVE DASHBOARD</h1>
          <div style={{ ...mono, fontSize: 9, color: 'rgba(140,180,220,0.45)', letterSpacing: '0.15em' }}>
            Real-time environmental sensor telemetry
          </div>
        </div>
        <div style={{ ...glass, padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ ...mono, fontSize: 20, color: safetyColor, fontWeight: 700,
            textShadow: `0 0 12px ${safetyColor}` }}>{safetyLabel}</div>
        </div>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <StatCard icon="🌡" label="TEMPERATURE" value={latest?.temperature?.toFixed(1) ?? '—'} unit="°C" color="#ff7875"
          sub={stats.maxTemp ? `Peak: ${stats.maxTemp}°C` : ''} />
        <StatCard icon="💧" label="HUMIDITY"    value={latest?.humidity?.toFixed(1) ?? '—'}    unit="%"  color="#69c0ff"
          sub={stats.maxHum ? `Peak: ${stats.maxHum}%` : ''} />
        <StatCard icon="💨" label="GAS LEVEL"   value={latest?.gas ?? '—'}                     unit="ppm" color="#ffa940"
          sub={stats.maxGas ? `Peak: ${stats.maxGas}ppm` : ''} />
        <StatCard icon="📡" label="READINGS"    value={stats.totalReadings ?? 0}               unit="" color="var(--accent)"
          sub={`${stats.cellsVisited ?? 0} cells mapped`} />
        <StatCard icon="📏" label="DISTANCE"    value={latest?.distance ?? '—'}                unit="cm" color="#b37feb" />
      </div>

      {/* Main area: chart + gauges */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: 16, marginBottom: 16 }}>
        {/* Live trend chart */}
        <div style={{ ...glass, padding: '16px 20px' }}>
          <div style={{ ...mono, fontSize: 10, color: 'rgba(140,180,220,0.55)', letterSpacing: '0.15em', marginBottom: 12 }}>
            📈 LIVE SENSOR TREND
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={chart} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <defs>
                {Object.entries(CHART_COLORS).map(([k, c]) => (
                  <linearGradient key={k} id={`grad-${k}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={c} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={c} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,212,255,0.06)" />
              <XAxis dataKey="time" tick={{ fill: 'rgba(140,180,220,0.4)', fontSize: 9, fontFamily: 'var(--font-mono)' }} />
              <YAxis tick={{ fill: 'rgba(140,180,220,0.4)', fontSize: 9, fontFamily: 'var(--font-mono)' }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontFamily: 'var(--font-mono)', fontSize: 10 }} />
              <Area type="monotone" dataKey="temperature" stroke={CHART_COLORS.temperature} fill={`url(#grad-temperature)`} strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="humidity"    stroke={CHART_COLORS.humidity}    fill={`url(#grad-humidity)`}    strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="gas"         stroke={CHART_COLORS.gas}         fill={`url(#grad-gas)`}         strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Gauges */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ ...glass, padding: '16px 20px', flex: 1 }}>
            <div style={{ ...mono, fontSize: 10, color: 'rgba(140,180,220,0.55)', letterSpacing: '0.15em', marginBottom: 14 }}>
              SENSOR GAUGES
            </div>
            <GaugeBar label="Temperature" value={latest?.temperature?.toFixed(1) ?? 0} max={60}  color="#ff7875" unit="°C" />
            <GaugeBar label="Humidity"    value={latest?.humidity?.toFixed(1) ?? 0}    max={100} color="#69c0ff" unit="%" />
            <GaugeBar label="Gas (ppm)"   value={latest?.gas ?? 0}                     max={600} color="#ffa940" unit="" />
            <GaugeBar label="Distance"    value={latest?.distance ?? 0}                max={200} color="#b37feb" unit="cm" />
          </div>
          <div style={{ ...glass, padding: '16px 20px' }}>
            <div style={{ ...mono, fontSize: 10, color: 'rgba(140,180,220,0.55)', letterSpacing: '0.15em', marginBottom: 12 }}>
              SESSION STATS
            </div>
            {[
              ['Max Gas',    `${stats.maxGas} ppm`, '#ffa940'],
              ['Max Temp',   `${stats.maxTemp}°C`,  '#ff7875'],
              ['Min Temp',   `${stats.minTemp}°C`,  '#69c0ff'],
              ['Area',       `${((stats.cellsVisited || 0) * 0.0625).toFixed(2)} m²`, 'var(--accent)'],
              ['Obstacles',  stats.obstacleCount ?? 0, '#b37feb'],
            ].map(([k, v, c]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0',
                borderBottom: '1px solid rgba(0,212,255,0.06)' }}>
                <span style={{ ...mono, fontSize: 10, color: 'rgba(140,180,220,0.5)' }}>{k}</span>
                <span style={{ ...mono, fontSize: 11, color: c, fontWeight: 600 }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent packets mini-log */}
      <div style={{ ...glass, padding: '14px 20px' }}>
        <div style={{ ...mono, fontSize: 10, color: 'rgba(140,180,220,0.55)', letterSpacing: '0.15em', marginBottom: 10 }}>
          📡 RECENT PACKETS
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead><tr>
              <th>Time</th><th>Temp (°C)</th><th>Humidity (%)</th><th>Gas (ppm)</th><th>Distance (cm)</th>
            </tr></thead>
            <tbody>
              {chart.slice(-8).reverse().map((r, i) => (
                <tr key={i}>
                  <td style={{ color: 'rgba(140,180,220,0.5)' }}>{r.time}</td>
                  <td style={{ color: '#ff7875' }}>{r.temperature?.toFixed?.(1) ?? r.temperature}</td>
                  <td style={{ color: '#69c0ff' }}>{r.humidity?.toFixed?.(1) ?? r.humidity}</td>
                  <td style={{ color: r.gas > 400 ? 'var(--red)' : r.gas > 250 ? 'var(--orange)' : '#ffa940' }}>{r.gas}</td>
                  <td style={{ color: '#b37feb' }}>{r.distance ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}