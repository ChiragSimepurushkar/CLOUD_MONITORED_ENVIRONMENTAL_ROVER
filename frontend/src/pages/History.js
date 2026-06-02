import { useEffect, useState } from 'react';
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine
} from 'recharts';
import { socket, SERVER } from '../App';

const M = { fontFamily: 'var(--font-mono)' };

const GlassCard = ({ children, style = {} }) => (
  <div style={{
    background: 'var(--bg-card)', backdropFilter: 'blur(20px) saturate(180%)',
    border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
    position: 'relative', overflow: 'hidden', ...style,
  }}>
    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg,rgba(255,255,255,0.025) 0%,transparent 60%)', pointerEvents: 'none' }} />
    {children}
  </div>
);

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const colors = { temperature: '#f87171', humidity: '#38bdf8', gas: '#fb923c', distance: '#a78bfa' };
  return (
    <div style={{ background: 'rgba(6,12,24,0.96)', backdropFilter: 'blur(16px)',
      border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px' }}>
      <div style={{ ...M, fontSize: 9, color: 'var(--text-dim)', marginBottom: 8 }}>{label}</div>
      {payload.map(p => (
        <div key={p.dataKey} style={{ ...M, fontSize: 11, color: colors[p.dataKey] || '#fff',
          display: 'flex', justifyContent: 'space-between', gap: 20, marginBottom: 4 }}>
          <span style={{ opacity: 0.7 }}>{p.dataKey}</span>
          <strong>{typeof p.value === 'number' ? p.value.toFixed(1) : p.value}</strong>
        </div>
      ))}
    </div>
  );
};

function SummaryTile({ label, value, color }) {
  return (
    <div style={{ padding: '14px 18px', borderRadius: 'var(--radius-md)',
      background: `${color}0d`, border: `1px solid ${color}25`,
      borderLeft: `3px solid ${color}` }}>
      <div style={{ ...M, fontSize: 8, color: 'var(--text-dim)', letterSpacing: '0.2em', marginBottom: 6 }}>{label}</div>
      <div style={{ ...M, fontSize: 22, fontWeight: 700, color, textShadow: `0 0 16px ${color}55` }}>{value}</div>
    </div>
  );
}

export default function History() {
  const [data,   setData]   = useState([]);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetch(`${SERVER}/chart-data`).then(r => r.json())
      .then(d => { if (Array.isArray(d)) setData(d); }).catch(() => {});
    const onChart = pt  => setData(p => [...p, pt].slice(-60));
    const onInit  = buf => { if (Array.isArray(buf)) setData(buf); };
    socket.on('chart-update', onChart);
    socket.on('chart-init',   onInit);
    return () => { socket.off('chart-update', onChart); socket.off('chart-init', onInit); };
  }, []);

  const displayed = filter === 'all' ? data
    : data.filter(d => filter === 'danger' ? d.gas > 400
      : filter === 'warning' ? d.gas > 250 && d.gas <= 400 : d.gas <= 250);

  const num = key => data.filter(d => typeof d[key] === 'number').map(d => d[key]);
  const avg = key => { const a = num(key); return a.length ? (a.reduce((s,v)=>s+v,0)/a.length).toFixed(1) : '—'; };
  const max = key => { const a = num(key); return a.length ? Math.max(...a).toFixed(1) : '—'; };
  const min = key => { const a = num(key); return a.length ? Math.min(...a).toFixed(1) : '—'; };

  const exportCSV = () => {
    const rows = data.map(r => `${r.time},${r.temperature},${r.humidity},${r.gas},${r.distance}`);
    const blob = new Blob(['Time,Temperature,Humidity,Gas,Distance\n' + rows.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `rover_${Date.now()}.csv`; a.click();
  };

  const filters = ['all', 'safe', 'warning', 'danger'];
  const filterColors = { all: 'var(--accent)', safe: 'var(--green)', warning: 'var(--orange)', danger: 'var(--red)' };

  return (
    <div style={{ height: '100vh', overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Analytics & History</div>
          <div style={{ ...M, fontSize: 10, color: 'var(--text-dim)' }}>{data.length} readings in session buffer</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {filters.map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              ...M, fontSize: 9, padding: '6px 14px', borderRadius: 6, cursor: 'pointer',
              fontWeight: filter === f ? 700 : 400, letterSpacing: '0.1em',
              background: filter === f ? `${filterColors[f]}18` : 'rgba(255,255,255,0.03)',
              border: `1px solid ${filter === f ? filterColors[f] + '50' : 'rgba(255,255,255,0.08)'}`,
              color: filter === f ? filterColors[f] : 'var(--text-dim)',
              boxShadow: filter === f ? `0 0 12px ${filterColors[f]}25` : 'none',
              transition: 'all 0.2s',
              textTransform: 'uppercase',
            }}>{f}</button>
          ))}
          <button onClick={exportCSV} style={{
            ...M, fontSize: 9, padding: '6px 14px', borderRadius: 6, cursor: 'pointer',
            background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.3)',
            color: '#a78bfa', letterSpacing: '0.1em', fontWeight: 600,
          }}>↓ CSV</button>
        </div>
      </div>

      {/* Summary tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <SummaryTile label="AVG TEMPERATURE" value={`${avg('temperature')}°C`} color="#f87171" />
        <SummaryTile label="AVG HUMIDITY"    value={`${avg('humidity')}%`}     color="#38bdf8" />
        <SummaryTile label="PEAK GAS"        value={`${max('gas')} ppm`}       color="#fb923c" />
        <SummaryTile label="MIN GAS"         value={`${min('gas')} ppm`}       color="#34d399" />
      </div>

      {/* Temperature area chart */}
      <GlassCard style={{ padding: '18px 20px' }}>
        <div className="section-header">🌡 TEMPERATURE OVER TIME (°C)</div>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={displayed}>
            <defs>
              <linearGradient id="gT" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#f87171" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#f87171" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="2 4" stroke="rgba(0,212,255,0.04)" />
            <XAxis dataKey="time" tick={{ fill:'rgba(148,180,220,0.4)',fontSize:8 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill:'rgba(148,180,220,0.4)',fontSize:8 }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <Area type="monotone" dataKey="temperature" stroke="#f87171" fill="url(#gT)" strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </GlassCard>

      {/* Humidity + Gas dual chart */}
      <GlassCard style={{ padding: '18px 20px' }}>
        <div className="section-header">💧 HUMIDITY & 💨 GAS TREND</div>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={displayed}>
            <CartesianGrid strokeDasharray="2 4" stroke="rgba(0,212,255,0.04)" />
            <XAxis dataKey="time" tick={{ fill:'rgba(148,180,220,0.4)',fontSize:8 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill:'rgba(148,180,220,0.4)',fontSize:8 }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontFamily:'var(--font-mono)', fontSize:9, paddingTop:8 }} />
            <ReferenceLine y={400} stroke="rgba(239,68,68,0.4)"  strokeDasharray="4 3" label={{ value:'Danger', fill:'#ef4444', fontSize:8 }} />
            <ReferenceLine y={250} stroke="rgba(245,158,11,0.4)" strokeDasharray="4 3" label={{ value:'Warn',   fill:'#f59e0b', fontSize:8 }} />
            <Line type="monotone" dataKey="humidity" stroke="#38bdf8" strokeWidth={2} dot={false} activeDot={{ r:4,strokeWidth:0 }} />
            <Line type="monotone" dataKey="gas"      stroke="#fb923c" strokeWidth={2} dot={false} activeDot={{ r:4,strokeWidth:0 }} />
          </LineChart>
        </ResponsiveContainer>
      </GlassCard>

      {/* Gas bar chart */}
      <GlassCard style={{ padding: '18px 20px' }}>
        <div className="section-header">💨 GAS READINGS DISTRIBUTION</div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={displayed} barSize={5}>
            <CartesianGrid strokeDasharray="2 4" stroke="rgba(0,212,255,0.04)" />
            <XAxis dataKey="time" tick={{ fill:'rgba(148,180,220,0.4)',fontSize:8 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill:'rgba(148,180,220,0.4)',fontSize:8 }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={400} stroke="rgba(239,68,68,0.5)" strokeWidth={1} />
            <Bar dataKey="gas" fill="#fb923c" radius={[3,3,0,0]}
              style={{ filter:'drop-shadow(0 0 4px rgba(251,146,60,0.5))' }} />
          </BarChart>
        </ResponsiveContainer>
      </GlassCard>

      {/* Data table */}
      <GlassCard style={{ padding: '16px 20px' }}>
        <div className="section-header">📋 DATA TABLE ({displayed.length} ROWS)</div>
        <div style={{ maxHeight: 360, overflowY: 'auto' }}>
          <table className="data-table">
            <thead><tr>
              <th>TIME</th><th>TEMP (°C)</th><th>HUMIDITY (%)</th><th>GAS (ppm)</th><th>DIST (cm)</th><th>STATUS</th>
            </tr></thead>
            <tbody>
              {displayed.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign:'center', color:'var(--text-dim)', padding:'24px' }}>No data yet</td></tr>
              )}
              {displayed.slice().reverse().map((r, i) => {
                const st = r.gas > 400 ? ['DANGER','#ef4444'] : r.gas > 250 ? ['WARN','#f59e0b'] : ['SAFE','#10b981'];
                return (
                  <tr key={i}>
                    <td style={{ color:'var(--text-dim)' }}>{r.time}</td>
                    <td style={{ color:'#f87171', fontWeight:500 }}>{typeof r.temperature==='number'?r.temperature.toFixed(1):r.temperature}</td>
                    <td style={{ color:'#38bdf8', fontWeight:500 }}>{typeof r.humidity==='number'?r.humidity.toFixed(1):r.humidity}</td>
                    <td style={{ color:r.gas>400?'#ef4444':r.gas>250?'#f59e0b':'#fb923c', fontWeight:r.gas>400?700:400 }}>{r.gas}</td>
                    <td style={{ color:'#a78bfa' }}>{r.distance??'—'}</td>
                    <td><span style={{ ...M, fontSize:8, padding:'2px 8px', borderRadius:4,
                      background:`${st[1]}15`, border:`1px solid ${st[1]}30`, color:st[1], fontWeight:700 }}>{st[0]}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  );
}