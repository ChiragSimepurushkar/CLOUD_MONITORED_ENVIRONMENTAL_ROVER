// Alerts.js — Alert Center with live + historical alerts
import { useEffect, useState } from 'react';
import { socket, SERVER } from '../App';

const mono = { fontFamily: 'var(--font-mono)' };
const glass = {
  background: 'rgba(5,11,23,0.80)',
  backdropFilter: 'blur(14px)',
  WebkitBackdropFilter: 'blur(14px)',
  border: '1px solid rgba(0,212,255,0.18)',
  borderRadius: 12,
};

function AlertCard({ alert, isNew }) {
  const isDanger  = alert.type === 'DANGER';
  const color     = isDanger ? 'var(--red)' : 'var(--orange)';
  const bgColor   = isDanger ? 'rgba(255,77,79,0.07)' : 'rgba(255,169,64,0.07)';
  return (
    <div style={{
      background: isNew ? (isDanger ? 'rgba(255,77,79,0.12)' : 'rgba(255,169,64,0.12)') : bgColor,
      backdropFilter: 'blur(10px)',
      border: `1px solid ${isDanger ? 'rgba(255,77,79,0.3)' : 'rgba(255,169,64,0.3)'}`,
      borderLeft: `4px solid ${color}`,
      borderRadius: 10, padding: '14px 18px', marginBottom: 10,
      boxShadow: isNew ? `0 0 20px ${color}33` : 'none',
      transition: 'all 0.4s ease',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ ...mono, fontSize: 11, fontWeight: 700, color, letterSpacing: '0.12em' }}>
          {isDanger ? '🔴 DANGER' : '🟡 WARNING'}
        </span>
        {isNew && (
          <span style={{ ...mono, fontSize: 8, padding: '2px 8px', borderRadius: 4,
            background: `${color}22`, border: `1px solid ${color}44`, color, letterSpacing: '0.1em' }}>NEW</span>
        )}
      </div>
      <p style={{ fontSize: 13, color: 'rgba(220,240,255,0.85)', marginBottom: 6 }}>{alert.message}</p>
      <div style={{ ...mono, fontSize: 9, color: 'rgba(140,180,220,0.45)' }}>
        {new Date(alert.createdAt || Date.now()).toLocaleString()}
      </div>
    </div>
  );
}

function RingAlert({ alert }) {
  if (!alert) return null;
  const isDanger = alert.type === 'DANGER';
  const color = isDanger ? 'var(--red)' : 'var(--orange)';
  return (
    <div style={{
      ...glass, padding: '20px 24px', marginBottom: 20,
      border: `1px solid ${isDanger ? 'rgba(255,77,79,0.5)' : 'rgba(255,169,64,0.5)'}`,
      boxShadow: `0 0 40px ${isDanger ? 'rgba(255,77,79,0.2)' : 'rgba(255,169,64,0.2)'}`,
      display: 'flex', alignItems: 'center', gap: 20,
    }}>
      <div style={{ fontSize: 48, lineHeight: 1 }}>{isDanger ? '🚨' : '⚠️'}</div>
      <div>
        <div style={{ ...mono, fontSize: 20, fontWeight: 700, color, textShadow: `0 0 14px ${color}`, marginBottom: 4 }}>
          LATEST: {alert.type}
        </div>
        <div style={{ fontSize: 14, color: 'rgba(220,240,255,0.8)', marginBottom: 4 }}>{alert.message}</div>
        <div style={{ ...mono, fontSize: 9, color: 'rgba(140,180,220,0.45)' }}>
          {new Date(alert.createdAt || Date.now()).toLocaleString()}
        </div>
      </div>
    </div>
  );
}

export default function Alerts() {
  const [alerts,  setAlerts]  = useState([]);
  const [newIds,  setNewIds]  = useState(new Set());
  const [filter,  setFilter]  = useState('all');
  const [stats,   setStats]   = useState({ danger: 0, warning: 0 });

  useEffect(() => {
    fetch(`${SERVER}/alerts`).then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setAlerts(data);
          setStats({ danger: data.filter(a => a.type === 'DANGER').length, warning: data.filter(a => a.type !== 'DANGER').length });
        }
      }).catch(() => {});

    const onAlert = (alert) => {
      setAlerts(prev => [alert, ...prev].slice(0, 100));
      setNewIds(prev => new Set([...prev, alert._id || alert.createdAt]));
      setStats(prev => ({
        danger:  alert.type === 'DANGER'  ? prev.danger + 1  : prev.danger,
        warning: alert.type !== 'DANGER' ? prev.warning + 1 : prev.warning,
      }));
      setTimeout(() => setNewIds(prev => { const s = new Set(prev); s.delete(alert._id || alert.createdAt); return s; }), 6000);
    };

    socket.on('newAlert', onAlert);
    return () => socket.off('newAlert', onAlert);
  }, []);

  const displayed = filter === 'all' ? alerts
    : alerts.filter(a => filter === 'danger' ? a.type === 'DANGER' : a.type !== 'DANGER');

  const latest = alerts[0];

  return (
    <div style={{ height: '100vh', overflow: 'auto', padding: '20px 24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ ...mono, fontSize: 16, color: 'var(--accent)', fontWeight: 700, letterSpacing: '0.1em',
            textShadow: '0 0 12px rgba(0,212,255,0.5)', marginBottom: 2 }}>🚨 ALERT CENTER</h1>
          <div style={{ ...mono, fontSize: 9, color: 'rgba(140,180,220,0.45)', letterSpacing: '0.15em' }}>
            Real-time environmental hazard detection
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {['all', 'danger', 'warning'].map(f => (
            <button key={f} className={`btn ${filter === f ? 'btn-primary' : ''}`} style={{
              border: f === filter ? '1px solid var(--accent)' : '1px solid rgba(0,212,255,0.2)',
              background: f === filter ? 'rgba(0,212,255,0.12)' : 'rgba(0,0,0,0.3)',
              color: f === filter ? 'var(--accent)' : 'rgba(140,180,220,0.5)',
              padding: '5px 14px', borderRadius: 6, cursor: 'pointer',
              ...mono, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em',
            }} onClick={() => setFilter(f)}>{f}</button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'TOTAL ALERTS', value: alerts.length, color: 'var(--accent)' },
          { label: '🔴 DANGER',    value: stats.danger,  color: 'var(--red)' },
          { label: '🟡 WARNING',   value: stats.warning, color: 'var(--orange)' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ ...glass, padding: '14px 18px', borderLeft: `2px solid ${color}` }}>
            <div style={{ ...mono, fontSize: 9, color: 'rgba(140,180,220,0.5)', letterSpacing: '0.18em', marginBottom: 4 }}>{label}</div>
            <div style={{ ...mono, fontSize: 28, fontWeight: 700, color, textShadow: `0 0 14px ${color}55` }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Latest alert hero card */}
      {latest && <RingAlert alert={latest} />}

      {/* Alert list */}
      <div style={{ ...glass, padding: '16px 20px' }}>
        <div style={{ ...mono, fontSize: 10, color: 'rgba(140,180,220,0.55)', letterSpacing: '0.15em', marginBottom: 12 }}>
          ALERT LOG ({displayed.length})
        </div>
        <div style={{ maxHeight: 400, overflowY: 'auto' }}>
          {displayed.length === 0 ? (
            <div style={{ padding: '40px 0', textAlign: 'center', ...mono, fontSize: 11, color: 'rgba(140,180,220,0.3)' }}>
              ✅ No {filter === 'all' ? '' : filter} alerts
            </div>
          ) : displayed.map((a, i) => (
            <AlertCard key={a._id || i} alert={a} isNew={newIds.has(a._id || a.createdAt)} />
          ))}
        </div>
      </div>
    </div>
  );
}