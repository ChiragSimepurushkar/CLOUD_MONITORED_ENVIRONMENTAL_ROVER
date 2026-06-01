import './index.css';
import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import Dashboard from './pages/Dashboard';
import Map3D     from './pages/Map3D';
import History   from './pages/History';
import Alerts    from './pages/Alerts';

const SERVER = process.env.REACT_APP_SERVER_URL || 'http://localhost:5000';
const socket = io(SERVER, { transports: ['websocket', 'polling'] });

export { socket, SERVER };

const mono = { fontFamily: 'var(--font-mono)' };
const sans = { fontFamily: 'var(--font-sans)' };

const NAV_ITEMS = [
  { to: '/',        icon: '📊', label: 'Dashboard'  },
  { to: '/map3d',   icon: '🛰',  label: '3D Live Map' },
  { to: '/history', icon: '📈', label: 'Analytics'  },
  { to: '/alerts',  icon: '🚨', label: 'Alerts'     },
];

function Sidebar({ connected, packetCount, lastTs }) {
  const loc = useLocation();
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, bottom: 0,
      width: 'var(--sidebar-w)', zIndex: 100,
      background: 'rgba(3,8,18,0.96)',
      borderRight: '1px solid var(--border)',
      backdropFilter: 'blur(20px)',
      display: 'flex', flexDirection: 'column',
      padding: '0 0 16px',
    }}>
      {/* Logo */}
      <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid rgba(0,212,255,0.12)' }}>
        <div style={{ ...mono, fontSize: 11, color: 'var(--accent)', letterSpacing: '0.18em', fontWeight: 700,
          textShadow: '0 0 12px rgba(0,212,255,0.5)', marginBottom: 2 }}>🛰 ROVER TWIN</div>
        <div style={{ ...mono, fontSize: 8, color: 'var(--text-secondary)', letterSpacing: '0.14em' }}>ENVIRONMENTAL MONITOR</div>
      </div>

      {/* Connection status */}
      <div style={{ padding: '12px 20px', borderBottom: '1px solid rgba(0,212,255,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span className={`status-dot ${connected ? 'online' : 'offline'}`} />
          <span style={{ ...mono, fontSize: 10, color: connected ? 'var(--green)' : 'var(--red)' }}>
            {connected ? 'LIVE' : 'OFFLINE'}
          </span>
        </div>
        <div style={{ ...mono, fontSize: 8, color: 'var(--text-secondary)' }}>Packets: {packetCount}</div>
        {lastTs && <div style={{ ...mono, fontSize: 8, color: 'var(--text-secondary)', marginTop: 2 }}>Last: {lastTs}</div>}
      </div>

      {/* Nav links */}
      <nav style={{ flex: 1, padding: '8px 0' }}>
        {NAV_ITEMS.map(({ to, icon, label }) => (
          <NavLink key={to} to={to} end={to === '/'} style={({ isActive }) => ({
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '11px 20px', textDecoration: 'none',
            ...mono, fontSize: 12, letterSpacing: '0.06em',
            color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
            background: isActive ? 'rgba(0,212,255,0.07)' : 'transparent',
            borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
            transition: 'all 0.2s',
          })}>
            <span style={{ fontSize: 16 }}>{icon}</span>
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div style={{ padding: '0 20px' }}>
        <div style={{ ...sans, fontSize: 9, color: 'var(--text-secondary)', lineHeight: 1.5, opacity: 0.6 }}>
          Cloud-Monitored Environmental Rover<br />v3.0 Combined Dashboard
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [connected,   setConnected]   = useState(false);
  const [packetCount, setPacketCount] = useState(0);
  const [lastTs,      setLastTs]      = useState('');

  useEffect(() => {
    socket.on('connect',    () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('raw-data',   e  => {
      setPacketCount(e.id);
      setLastTs(new Date(e.ts).toLocaleTimeString());
    });
    return () => { socket.off('connect'); socket.off('disconnect'); socket.off('raw-data'); };
  }, []);

  return (
    <BrowserRouter>
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
        <Sidebar connected={connected} packetCount={packetCount} lastTs={lastTs} />
        <main style={{ marginLeft: 'var(--sidebar-w)', flex: 1, overflow: 'hidden', position: 'relative' }}>
          <Routes>
            <Route path="/"        element={<Dashboard />} />
            <Route path="/map3d"   element={<Map3D />} />
            <Route path="/history" element={<History />} />
            <Route path="/alerts"  element={<Alerts />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}