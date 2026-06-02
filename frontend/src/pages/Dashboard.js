import { useEffect, useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { socket, SERVER } from '../App';

const M = { fontFamily: 'var(--font-mono)' };

const COLORS = {
  temperature: '#f87171',
  humidity:    '#38bdf8',
  gas:         '#fb923c',
  distance:    '#a78bfa',
};

const GlassCard = ({ children, style = {} }) => (
  <div style={{
    background: 'var(--bg-card)',
    backdropFilter: 'blur(20px) saturate(180%)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    position: 'relative', overflow: 'hidden',
    ...style,
  }}>
    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg,rgba(255,255,255,0.03) 0%,transparent 60%)', pointerEvents: 'none' }} />
    {children}
  </div>
);

function MetricCard({ icon, label, value, unit, color, sub, peak }) {
  return (
    <GlassCard style={{ flex: 1, minWidth: 130, padding: '18px 20px',
      borderLeft: `3px solid ${color}`,
      boxShadow: `0 0 24px ${color}18, inset 0 0 24px ${color}05`,
      transition: 'all 0.3s ease',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div style={{ ...M, fontSize: 9, letterSpacing: '0.2em', color: 'var(--text-dim)', fontWeight: 600 }}>
          {icon} {label}
        </div>
        {peak && (
          <div style={{ ...M, fontSize: 8, padding: '2px 6px', borderRadius: 4,
            background: `${color}18`, border: `1px solid ${color}30`, color }}>
            ↑{peak}
          </div>
        )}
      </div>
      <div style={{ ...M, fontSize: 34, fontWeight: 700, color,
        textShadow: `0 0 20px ${color}55`, lineHeight: 1, letterSpacing: '-0.02em',
      }}>
        {value ?? '—'}
        <span style={{ fontSize: 14, fontWeight: 400, marginLeft: 4, opacity: 0.6 }}>{unit}</span>
      </div>
      {sub && <div style={{ ...M, fontSize: 9, color: 'var(--text-dim)', marginTop: 8 }}>{sub}</div>}
    </GlassCard>
  );
}

function GaugeBar({ label, value, max, color, unit }) {
  const pct = Math.min(100, ((+value || 0) / max) * 100);
  const segments = 20;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ ...M, fontSize: 10, color: 'var(--text-secondary)' }}>{label}</span>
        <span style={{ ...M, fontSize: 11, color, fontWeight: 600 }}>{value}{unit}</span>
      </div>
      {/* Segmented gauge */}
      <div style={{ display: 'flex', gap: 2 }}>
        {Array.from({ length: segments }).map((_, i) => {
          const filled = (i / segments) * 100 < pct;
          const opacity = filled ? (0.3 + (i / segments) * 0.7) : 0.06;
          return (
            <div key={i} style={{
              flex: 1, height: 5, borderRadius: 2,
              background: filled ? color : 'rgba(255,255,255,0.06)',
              boxShadow: filled ? `0 0 4px ${color}88` : 'none',
              opacity,
              transition: 'all 0.5s ease',
            }} />
          );
        })}
      </div>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'rgba(6,12,24,0.95)', backdropFilter: 'blur(16px)',
      border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px',
    }}>
      <div style={{ ...M, fontSize: 9, color: 'var(--text-dim)', marginBottom: 8 }}>{label}</div>
      {payload.map(p => (
        <div key={p.dataKey} style={{ ...M, fontSize: 11, color: COLORS[p.dataKey] || 'white',
          marginBottom: 4, display: 'flex', justifyContent: 'space-between', gap: 16 }}>
          <span style={{ opacity: 0.7 }}>{p.dataKey}</span>
          <span style={{ fontWeight: 600 }}>{typeof p.value === 'number' ? p.value.toFixed(1) : p.value}</span>
        </div>
      ))}
    </div>
  );
};

export default function Dashboard() {
  const [chart,  setChart]  = useState([]);
  const [latest, setLatest] = useState(null);
  const [stats,  setStats]  = useState({ maxGas:0, maxTemp:-Infinity, minTemp:Infinity, maxHum:0, totalReadings:0, cellsVisited:0, obstacleCount:0 });
  const [online, setOnline] = useState(false);

  useEffect(() => {
    socket.on('connect',    () => setOnline(true));
    socket.on('disconnect', () => setOnline(false));
    fetch(`${SERVER}/chart-data`).then(r => r.json())
      .then(d => { if (Array.isArray(d) && d.length) { setChart(d); setLatest(d[d.length-1]); } })
      .catch(() => {});
    fetch(`${SERVER}/map-state`).then(r => r.json())
      .then(d => { if (d.stats) setStats(d.stats); }).catch(() => {});

    const onChart = pt  => { setChart(p => [...p, pt].slice(-60)); setLatest(pt); };
    const onInit  = buf => { if (Array.isArray(buf) && buf.length) { setChart(buf); setLatest(buf[buf.length-1]); } };
    const onMap   = ({ stats: s }) => { if (s) setStats(s); };
    socket.on('chart-update', onChart);
    socket.on('chart-init',   onInit);
    socket.on('map-update',   onMap);
    return () => {
      socket.off('connect'); socket.off('disconnect');
      socket.off('chart-update', onChart); socket.off('chart-init', onInit); socket.off('map-update', onMap);
    };
  }, []);

  const gasStatus = latest?.gas > 400 ? { label: 'DANGER',  color: 'var(--red)',    bg: 'var(--red-dim)' }
                  : latest?.gas > 250 ? { label: 'WARNING', color: 'var(--orange)', bg: 'var(--orange-dim)' }
                  :                     { label: 'SAFE',    color: 'var(--green)',  bg: 'var(--green-dim)' };

  return (
    <div style={{ height: '100vh', overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ─ Header ─ */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <div style={{ ...M, fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>Live Dashboard</div>
            <div style={{
              ...M, fontSize: 8, padding: '3px 10px', borderRadius: 20,
              background: online ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
              border: `1px solid ${online ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
              color: online ? 'var(--green)' : 'var(--red)',
              display: 'flex', alignItems: 'center', gap: 5,
            }}>
              <span className={`status-dot ${online ? 'online' : 'offline'}`} style={{ width: 5, height: 5 }} />
              {online ? 'LIVE STREAM' : 'DISCONNECTED'}
            </div>
          </div>
          <div style={{ ...M, fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.08em' }}>
            Real-time environmental telemetry • {stats.totalReadings || 0} readings • {stats.cellsVisited || 0} cells mapped
          </div>
        </div>
        {/* Safety status badge */}
        <div style={{
          padding: '10px 20px', borderRadius: 12,
          background: gasStatus.bg,
          border: `1px solid ${gasStatus.color}30`,
          boxShadow: `0 0 24px ${gasStatus.color}20`,
        }}>
          <div style={{ ...M, fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.15em', marginBottom: 3 }}>AIR QUALITY</div>
          <div style={{ ...M, fontSize: 20, fontWeight: 700, color: gasStatus.color,
            textShadow: `0 0 14px ${gasStatus.color}` }}>{gasStatus.label}</div>
        </div>
      </div>

      {/* ─ Metric cards ─ */}
      <div style={{ display: 'flex', gap: 12 }}>
        <MetricCard icon="🌡" label="TEMPERATURE" value={latest?.temperature?.toFixed(1)} unit="°C" color="#f87171"
          peak={stats.maxTemp !== -Infinity ? `${stats.maxTemp}°` : null}
          sub={`Min: ${stats.minTemp !== Infinity ? stats.minTemp + '°C' : '—'}`} />
        <MetricCard icon="💧" label="HUMIDITY"    value={latest?.humidity?.toFixed(1)}    unit="%"  color="#38bdf8"
          peak={stats.maxHum ? `${stats.maxHum}%` : null} />
        <MetricCard icon="💨" label="GAS LEVEL"   value={latest?.gas}                      unit="ppm" color="#fb923c"
          peak={stats.maxGas ? `${stats.maxGas}` : null}
          sub={latest?.gas > 400 ? '⚠ Dangerous' : latest?.gas > 250 ? '⚠ Elevated' : '✓ Normal'} />
        <MetricCard icon="📏" label="DISTANCE"    value={latest?.distance}                  unit="cm" color="#a78bfa" />
        <MetricCard icon="🗺" label="AREA MAPPED"  value={((stats.cellsVisited||0)*0.0625).toFixed(2)} unit="m²" color="#34d399"
          sub={`${stats.obstacleCount||0} obstacles`} />
      </div>

      {/* ─ Chart + Gauges row ─ */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16 }}>

        {/* Area chart */}
        <GlassCard style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column' }}>
          <div className="section-header">📈 LIVE SENSOR TREND</div>
          <div>
            <ResponsiveContainer width="100%" height={340}>
              <AreaChart data={chart} margin={{ top: 5, right: 5, left: -28, bottom: 0 }}>
                <defs>
                  {Object.entries(COLORS).map(([k, c]) => (
                    <linearGradient key={k} id={`g-${k}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={c} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={c} stopOpacity={0} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="2 4" stroke="rgba(0,212,255,0.05)" />
                <XAxis dataKey="time"
                  tick={{ fill: 'rgba(148,180,220,0.45)', fontSize: 8, fontFamily: 'var(--font-mono)' }}
                  axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fill: 'rgba(148,180,220,0.45)', fontSize: 8, fontFamily: 'var(--font-mono)' }}
                  axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontFamily: 'var(--font-mono)', fontSize: 9, paddingTop: 8 }} />
                <Area type="monotone" dataKey="temperature" stroke={COLORS.temperature} fill={`url(#g-temperature)`} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                <Area type="monotone" dataKey="humidity"    stroke={COLORS.humidity}    fill={`url(#g-humidity)`}    strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                <Area type="monotone" dataKey="gas"         stroke={COLORS.gas}         fill={`url(#g-gas)`}         strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>

        {/* Right column: gauges + session stats */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <GlassCard style={{ padding: '16px 18px' }}>
            <div className="section-header">SENSOR GAUGES</div>
            <GaugeBar label="Temperature" value={latest?.temperature?.toFixed(1) ?? 0} max={60}  color="#f87171" unit="°C" />
            <GaugeBar label="Humidity"    value={latest?.humidity?.toFixed(1) ?? 0}    max={100} color="#38bdf8" unit="%" />
            <GaugeBar label="Gas Level"   value={latest?.gas ?? 0}                      max={600} color="#fb923c" unit="" />
            <GaugeBar label="Distance"    value={latest?.distance ?? 0}                 max={200} color="#a78bfa" unit="cm" />
          </GlassCard>
          <GlassCard style={{ padding: '16px 18px', flex: 1 }}>
            <div className="section-header">SESSION STATS</div>
            {[
              ['Peak Gas',    `${stats.maxGas} ppm`,                                    '#fb923c'],
              ['Peak Temp',   `${stats.maxTemp !== -Infinity ? stats.maxTemp : '—'}°C`, '#f87171'],
              ['Min Temp',    `${stats.minTemp !== Infinity ? stats.minTemp : '—'}°C`,  '#38bdf8'],
              ['Area',        `${((stats.cellsVisited||0)*0.0625).toFixed(2)} m²`,      '#34d399'],
              ['Obstacles',   stats.obstacleCount ?? 0,                                 '#a78bfa'],
              ['Total Reads', stats.totalReadings ?? 0,                                 '#06b6d4'],
            ].map(([k, v, c]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '7px 0', borderBottom: '1px solid rgba(0,212,255,0.05)' }}>
                <span style={{ ...M, fontSize: 10, color: 'var(--text-dim)' }}>{k}</span>
                <span style={{ ...M, fontSize: 11, color: c, fontWeight: 600 }}>{v}</span>
              </div>
            ))}
          </GlassCard>
        </div>
      </div>

      {/* ─ Packet log ─ */}
      <GlassCard style={{ padding: '14px 20px' }}>
        <div className="section-header">📡 RECENT PACKETS</div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead><tr>
              <th>TIME</th><th>TEMP (°C)</th><th>HUMIDITY (%)</th><th>GAS (ppm)</th><th>DIST (cm)</th><th>STATUS</th>
            </tr></thead>
            <tbody>
              {chart.slice(-8).reverse().map((r, i) => {
                const st = r.gas > 400 ? ['DANGER','var(--red)','var(--red-dim)'] : r.gas > 250 ? ['WARN','var(--orange)','var(--orange-dim)'] : ['SAFE','var(--green)','var(--green-dim)'];
                return (
                  <tr key={i}>
                    <td style={{ color: 'var(--text-dim)' }}>{r.time}</td>
                    <td style={{ color: '#f87171', fontWeight: 500 }}>{typeof r.temperature === 'number' ? r.temperature.toFixed(1) : r.temperature}</td>
                    <td style={{ color: '#38bdf8', fontWeight: 500 }}>{typeof r.humidity === 'number' ? r.humidity.toFixed(1) : r.humidity}</td>
                    <td style={{ color: '#fb923c', fontWeight: r.gas > 400 ? 700 : 500 }}>{r.gas}</td>
                    <td style={{ color: '#a78bfa' }}>{r.distance ?? '—'}</td>
                    <td><span style={{ ...M, fontSize: 8, padding: '3px 8px', borderRadius: 4,
                      background: st[2], border: `1px solid ${st[1]}30`, color: st[1], fontWeight: 700 }}>{st[0]}</span></td>
                  </tr>
                );
              })}
              {chart.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '20px' }}>
                  No data yet — start the backend server or hit ⚡ STEP in the 3D Map page
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  );
}