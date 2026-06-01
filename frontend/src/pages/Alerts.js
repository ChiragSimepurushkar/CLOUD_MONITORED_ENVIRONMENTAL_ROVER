import { useEffect, useState } from 'react';
import { socket, SERVER } from '../App';

const M = { fontFamily: 'var(--font-mono)' };
const S = { fontFamily: 'var(--font-sans)' };

const SEVERITY = {
  DANGER:  { color: '#ef4444', bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.30)',  glow: 'rgba(239,68,68,0.25)',  emoji: '🔴' },
  WARNING: { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.30)', glow: 'rgba(245,158,11,0.20)', emoji: '🟡' },
};

const GlassCard = ({ children, style = {}, glow }) => (
  <div style={{
    background: 'var(--bg-card)', backdropFilter: 'blur(20px) saturate(180%)',
    border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
    position: 'relative', overflow: 'hidden',
    boxShadow: glow ? `0 0 32px ${glow}` : 'none',
    ...style,
  }}>
    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg,rgba(255,255,255,0.025) 0%,transparent 60%)', pointerEvents: 'none' }} />
    {children}
  </div>
);

function AlertCard({ alert, isNew }) {
  const sev = SEVERITY[alert.type] || SEVERITY.WARNING;
  return (
    <div className={isNew ? 'alert-item new' : 'alert-item'} style={{
      background: sev.bg,
      borderColor: sev.color,
      borderLeftColor: sev.color,
      boxShadow: isNew ? `0 0 24px ${sev.glow}, 0 4px 16px rgba(0,0,0,0.3)` : '0 2px 8px rgba(0,0,0,0.2)',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        <div style={{ fontSize: 24, lineHeight: 1, flexShrink: 0 }}>{sev.emoji}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
            <span style={{ ...M, fontSize: 10, fontWeight: 700, color: sev.color, letterSpacing: '0.12em' }}>
              {alert.type}
            </span>
            {isNew && (
              <span style={{ ...M, fontSize: 7, padding: '2px 6px', borderRadius: 4,
                background: sev.bg, border: `1px solid ${sev.border}`, color: sev.color,
                animation: 'pulse 1.5s ease infinite', letterSpacing: '0.1em' }}>NEW</span>
            )}
          </div>
          <p style={{ ...S, fontSize: 13, color: 'rgba(220,240,255,0.85)', lineHeight: 1.5, marginBottom: 6 }}>
            {alert.message}
          </p>
          <div style={{ ...M, fontSize: 9, color: 'var(--text-dim)' }}>
            {new Date(alert.createdAt || Date.now()).toLocaleString()}
          </div>
        </div>
      </div>
    </div>
  );
}

function HeroAlert({ alert }) {
  if (!alert) return null;
  const sev = SEVERITY[alert.type] || SEVERITY.WARNING;
  return (
    <div style={{
      padding: '20px 24px', borderRadius: 'var(--radius-lg)',
      background: sev.bg, backdropFilter: 'blur(20px)',
      border: `1px solid ${sev.border}`,
      boxShadow: `0 0 60px ${sev.glow}, inset 0 0 60px ${sev.glow.replace('0.25','0.04')}`,
      display: 'flex', alignItems: 'center', gap: 20,
    }}>
      <div style={{ fontSize: 56, lineHeight: 1, filter: `drop-shadow(0 0 16px ${sev.color})` }}>
        {alert.type === 'DANGER' ? '🚨' : '⚠️'}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <div style={{ ...M, fontSize: 22, fontWeight: 800, color: sev.color,
            textShadow: `0 0 20px ${sev.color}, 0 0 40px ${sev.color}55`, letterSpacing: '0.05em' }}>
            {alert.type}
          </div>
          <div style={{ ...M, fontSize: 8, padding: '3px 10px', borderRadius: 20,
            background: `${sev.color}20`, border: `1px solid ${sev.color}40`, color: sev.color }}>
            LATEST
          </div>
        </div>
        <p style={{ ...S, fontSize: 15, color: 'rgba(220,240,255,0.88)', marginBottom: 8, lineHeight: 1.5 }}>
          {alert.message}
        </p>
        <div style={{ ...M, fontSize: 10, color: 'var(--text-dim)' }}>
          {new Date(alert.createdAt || Date.now()).toLocaleString()}
        </div>
      </div>
    </div>
  );
}

function StatTile({ label, value, color, sub }) {
  return (
    <div style={{ padding: '16px 20px', borderRadius: 'var(--radius-md)',
      background: `${color}08`, border: `1px solid ${color}20`, borderLeft: `3px solid ${color}` }}>
      <div style={{ ...M, fontSize: 8, color: 'var(--text-dim)', letterSpacing: '0.2em', marginBottom: 8 }}>{label}</div>
      <div style={{ ...M, fontSize: 30, fontWeight: 700, color, textShadow: `0 0 16px ${color}55`, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ ...M, fontSize: 9, color: 'var(--text-dim)', marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

export default function Alerts() {
  const [alerts,  setAlerts]  = useState([]);
  const [newIds,  setNewIds]  = useState(new Set());
  const [filter,  setFilter]  = useState('all');

  useEffect(() => {
    fetch(`${SERVER}/alerts`).then(r => r.json())
      .then(d => { if (Array.isArray(d)) setAlerts(d); }).catch(() => {});

    const onAlert = (a) => {
      setAlerts(p => [a, ...p].slice(0, 100));
      const id = a._id || a.createdAt || Date.now();
      setNewIds(p => new Set([...p, id]));
      setTimeout(() => setNewIds(p => { const s = new Set(p); s.delete(id); return s; }), 6000);
    };
    socket.on('newAlert', onAlert);
    return () => socket.off('newAlert', onAlert);
  }, []);

  const danger  = alerts.filter(a => a.type === 'DANGER').length;
  const warning = alerts.filter(a => a.type !== 'DANGER').length;
  const displayed = filter === 'all' ? alerts
    : alerts.filter(a => filter === 'danger' ? a.type === 'DANGER' : a.type !== 'DANGER');

  const latest = alerts[0];

  const filterDef = [
    { key: 'all',     label: 'ALL',     color: 'var(--accent)' },
    { key: 'danger',  label: 'DANGER',  color: 'var(--red)' },
    { key: 'warning', label: 'WARNING', color: 'var(--orange)' },
  ];

  return (
    <div style={{ height: '100vh', overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Alert Center</div>
          <div style={{ ...M, fontSize: 10, color: 'var(--text-dim)' }}>
            Real-time environmental hazard detection
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {filterDef.map(({ key, label, color }) => (
            <button key={key} onClick={() => setFilter(key)} style={{
              ...M, fontSize: 9, padding: '6px 16px', borderRadius: 6, cursor: 'pointer',
              background: filter === key ? `${color}15` : 'rgba(255,255,255,0.03)',
              border: `1px solid ${filter === key ? color + '40' : 'rgba(255,255,255,0.08)'}`,
              color: filter === key ? color : 'var(--text-dim)',
              fontWeight: filter === key ? 700 : 400,
              boxShadow: filter === key ? `0 0 12px ${color}20` : 'none',
              transition: 'all 0.2s', letterSpacing: '0.1em',
            }}>{label}</button>
          ))}
        </div>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <StatTile label="TOTAL ALERTS"  value={alerts.length} color="var(--accent)"  sub="All time this session" />
        <StatTile label="🔴 DANGER"     value={danger}        color="var(--red)"     sub="Gas > 400 ppm" />
        <StatTile label="🟡 WARNING"    value={warning}       color="var(--orange)"  sub="Gas 250–400 ppm" />
      </div>

      {/* Hero alert */}
      {latest && <HeroAlert alert={latest} />}

      {/* Alert list */}
      <GlassCard style={{ padding: '16px 20px', flex: 1 }}>
        <div className="section-header">🔔 ALERT LOG ({displayed.length})</div>
        <div style={{ maxHeight: 'calc(100vh - 420px)', overflowY: 'auto' }}>
          {displayed.length === 0 ? (
            <div style={{ padding: '60px 0', textAlign: 'center',
              ...M, fontSize: 12, color: 'var(--text-dim)', lineHeight: 2 }}>
              ✅ No {filter === 'all' ? '' : filter} alerts detected<br />
              <span style={{ fontSize: 9 }}>Hazards are automatically logged when gas {'>'} 250 ppm</span>
            </div>
          ) : (
            displayed.map((a, i) => (
              <AlertCard key={a._id || i} alert={a}
                isNew={newIds.has(a._id || a.createdAt)} />
            ))
          )}
        </div>
      </GlassCard>
    </div>
  );
}