// History.js — Advanced Analytics & Data History
import { useEffect, useState } from 'react';
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine
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

const COLORS = { temperature: '#ff7875', humidity: '#69c0ff', gas: '#ffa940', distance: '#b37feb' };

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ ...glass, padding: '10px 14px', ...mono, fontSize: 10 }}>
      <div style={{ color: 'rgba(140,180,220,0.6)', marginBottom: 4 }}>{label}</div>
      {payload.map(p => (
        <div key={p.dataKey} style={{ color: COLORS[p.dataKey] || 'white', marginBottom: 2 }}>
          {p.dataKey}: <strong>{typeof p.value === 'number' ? p.value.toFixed(1) : p.value}</strong>
        </div>
      ))}
    </div>
  );
};

function ChartCard({ title, children }) {
  return (
    <div style={{ ...glass, padding: '16px 20px', marginBottom: 16 }}>
      <div style={{ ...mono, fontSize: 10, color: 'rgba(140,180,220,0.55)', letterSpacing: '0.15em', marginBottom: 14 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

export default function History() {
  const [data, setData] = useState([]);
  const [filter, setFilter] = useState('all');

  const load = () =>
    fetch(`${SERVER}/chart-data`).then(r => r.json())
      .then(d => setData(Array.isArray(d) ? d : [])).catch(() => {});

  useEffect(() => {
    load();
    const onChart = pt => setData(prev => [...prev, pt].slice(-60));
    const onInit  = buf => { if (Array.isArray(buf)) setData(buf); };
    socket.on('chart-update', onChart);
    socket.on('chart-init',   onInit);
    return () => { socket.off('chart-update', onChart); socket.off('chart-init', onInit); };
  }, []);

  const displayed = filter === 'all' ? data : data.filter(d =>
    filter === 'danger'  ? d.gas > 400 :
    filter === 'warning' ? d.gas > 250 && d.gas <= 400 : d.gas <= 250
  );

  const avg = (key) => data.length ? (data.reduce((s, d) => s + (d[key] || 0), 0) / data.length).toFixed(1) : '—';
  const max = (key) => data.length ? Math.max(...data.map(d => d[key] || 0)).toFixed(1) : '—';
  const min = (key) => data.length ? Math.min(...data.map(d => d[key] || 0)).toFixed(1) : '—';

  const exportCSV = () => {
    const hdr = 'Time,Temperature,Humidity,Gas,Distance';
    const rows = data.map(r => `${r.time},${r.temperature},${r.humidity},${r.gas},${r.distance}`);
    const blob = new Blob([hdr + '\n' + rows.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `rover_data_${Date.now()}.csv`; a.click();
  };

  return (
    <div style={{ height: '100vh', overflow: 'auto', padding: '20px 24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ ...mono, fontSize: 16, color: 'var(--accent)', fontWeight: 700, letterSpacing: '0.1em',
            textShadow: '0 0 12px rgba(0,212,255,0.5)', marginBottom: 2 }}>ANALYTICS & HISTORY</h1>
          <div style={{ ...mono, fontSize: 9, color: 'rgba(140,180,220,0.45)', letterSpacing: '0.15em' }}>
            {data.length} readings in session
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {['all', 'safe', 'warning', 'danger'].map(f => (
            <button key={f} className={`btn ${filter === f ? 'btn-primary' : 'btn-success'}`}
              onClick={() => setFilter(f)} style={{ textTransform: 'uppercase' }}>{f}</button>
          ))}
          <button className="btn btn-danger" onClick={exportCSV}>⬇ CSV</button>
        </div>
      </div>

      {/* Summary row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        {[
          { label: 'AVG TEMP',  value: `${avg('temperature')}°C`, color: '#ff7875' },
          { label: 'AVG HUM',   value: `${avg('humidity')}%`,     color: '#69c0ff' },
          { label: 'MAX GAS',   value: `${max('gas')} ppm`,       color: '#ffa940' },
          { label: 'MIN GAS',   value: `${min('gas')} ppm`,       color: 'var(--green)' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ ...glass, padding: '12px 16px', borderLeft: `2px solid ${color}` }}>
            <div style={{ ...mono, fontSize: 9, color: 'rgba(140,180,220,0.5)', letterSpacing: '0.18em', marginBottom: 4 }}>{label}</div>
            <div style={{ ...mono, fontSize: 20, fontWeight: 700, color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Temperature chart */}
      <ChartCard title="🌡 TEMPERATURE OVER TIME (°C)">
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={displayed}>
            <defs>
              <linearGradient id="gt" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#ff7875" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#ff7875" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,212,255,0.06)" />
            <XAxis dataKey="time" tick={{ fill: 'rgba(140,180,220,0.4)', fontSize: 9 }} />
            <YAxis tick={{ fill: 'rgba(140,180,220,0.4)', fontSize: 9 }} />
            <Tooltip content={<CustomTooltip />} />
            <Area type="monotone" dataKey="temperature" stroke="#ff7875" fill="url(#gt)" strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Humidity + Gas combined */}
      <ChartCard title="💧 HUMIDITY (%) + 💨 GAS LEVEL (ppm)">
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={displayed}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,212,255,0.06)" />
            <XAxis dataKey="time" tick={{ fill: 'rgba(140,180,220,0.4)', fontSize: 9 }} />
            <YAxis tick={{ fill: 'rgba(140,180,220,0.4)', fontSize: 9 }} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontFamily: 'var(--font-mono)', fontSize: 10 }} />
            <ReferenceLine y={400} stroke="rgba(255,77,79,0.4)" strokeDasharray="4 4" label={{ value: 'Danger', fill: '#ff4d4f', fontSize: 9 }} />
            <ReferenceLine y={250} stroke="rgba(255,169,64,0.4)" strokeDasharray="4 4" label={{ value: 'Warning', fill: '#ffa940', fontSize: 9 }} />
            <Line type="monotone" dataKey="humidity" stroke="#69c0ff" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="gas"      stroke="#ffa940" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Gas bar chart */}
      <ChartCard title="💨 GAS READINGS BAR VIEW">
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={displayed} barSize={6}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,212,255,0.06)" />
            <XAxis dataKey="time" tick={{ fill: 'rgba(140,180,220,0.4)', fontSize: 9 }} />
            <YAxis tick={{ fill: 'rgba(140,180,220,0.4)', fontSize: 9 }} />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={400} stroke="rgba(255,77,79,0.5)" />
            <Bar dataKey="gas" fill="#ffa940" radius={[2, 2, 0, 0]}
              label={false}
              style={{ filter: 'drop-shadow(0 0 4px rgba(255,169,64,0.5))' }} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Data table */}
      <div style={{ ...glass, padding: '16px 20px' }}>
        <div style={{ ...mono, fontSize: 10, color: 'rgba(140,180,220,0.55)', letterSpacing: '0.15em', marginBottom: 12 }}>
          📋 DATA TABLE ({displayed.length} rows)
        </div>
        <div style={{ maxHeight: 240, overflowY: 'auto' }}>
          <table className="data-table">
            <thead><tr>
              <th>Time</th><th>Temp (°C)</th><th>Humidity (%)</th><th>Gas (ppm)</th><th>Distance (cm)</th><th>Status</th>
            </tr></thead>
            <tbody>
              {displayed.slice().reverse().map((r, i) => (
                <tr key={i}>
                  <td style={{ color: 'rgba(140,180,220,0.5)' }}>{r.time}</td>
                  <td style={{ color: '#ff7875' }}>{typeof r.temperature === 'number' ? r.temperature.toFixed(1) : r.temperature}</td>
                  <td style={{ color: '#69c0ff' }}>{typeof r.humidity === 'number' ? r.humidity.toFixed(1) : r.humidity}</td>
                  <td style={{ color: r.gas > 400 ? 'var(--red)' : r.gas > 250 ? 'var(--orange)' : '#ffa940', fontWeight: r.gas > 400 ? 700 : 400 }}>{r.gas}</td>
                  <td style={{ color: '#b37feb' }}>{r.distance ?? '—'}</td>
                  <td><span style={{ ...mono, fontSize: 9, padding: '2px 7px', borderRadius: 4,
                    background: r.gas > 400 ? 'rgba(255,77,79,0.12)' : r.gas > 250 ? 'rgba(255,169,64,0.12)' : 'rgba(82,196,26,0.12)',
                    color: r.gas > 400 ? 'var(--red)' : r.gas > 250 ? 'var(--orange)' : 'var(--green)',
                    border: `1px solid ${r.gas > 400 ? 'rgba(255,77,79,0.3)' : r.gas > 250 ? 'rgba(255,169,64,0.3)' : 'rgba(82,196,26,0.3)'}`,
                  }}>{r.gas > 400 ? 'DANGER' : r.gas > 250 ? 'WARNING' : 'SAFE'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}