import './index.css';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import { useState, useEffect, useRef, createContext, useContext } from 'react';
import { io } from 'socket.io-client';
import Dashboard from './pages/Dashboard';
import Map3D     from './pages/Map3D';
import History   from './pages/History';
import Alerts    from './pages/Alerts';

const SERVER = process.env.REACT_APP_SERVER_URL || 'http://localhost:5000';
const socket = io(SERVER, { transports: ['websocket', 'polling'] });
export { socket, SERVER };

// Theme context — shared with all pages
export const ThemeContext = createContext('dark');
export function useTheme() { return useContext(ThemeContext); }

const M = { fontFamily: 'var(--font-mono)' };
const S = { fontFamily: 'var(--font-sans)' };

const NAV = [
  { to: '/',        emoji: '📊', icon: 'M3 3h18v4H3zM3 9h12v4H3zM3 15h8v4H3z',  label: 'Dashboard',  sub: 'Live Overview' },
  { to: '/map3d',   emoji: '🗺',  icon: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5', label: '3D Map',  sub: 'Spatial Tracking' },
  { to: '/history', emoji: '📈', icon: 'M3 3v18h18M7 16l4-4 4 4 4-6',           label: 'Analytics',  sub: 'Data History' },
  { to: '/alerts',  emoji: '🚨', icon: 'M12 2L2 7l10 5 10-5M2 12l10 5 10-5',    label: 'Alerts',     sub: 'Hazard Log' },
];

function NavItem({ to, emoji, label, sub, alertCount }) {
  return (
    <NavLink to={to} end={to === '/'} style={({ isActive }) => ({
      display: 'block',
      textDecoration: 'none',
      padding: '10px 14px',
      margin: '2px 10px',
      borderRadius: '10px',
      background: isActive ? 'rgba(0,212,255,0.10)' : 'transparent',
      border: isActive ? '1px solid rgba(0,212,255,0.25)' : '1px solid transparent',
      boxShadow: isActive ? 'inset 0 0 20px rgba(0,212,255,0.05)' : 'none',
      transition: 'all 0.2s ease',
      position: 'relative',
    })}>
      {({ isActive }) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18,
            background: isActive ? 'rgba(0,212,255,0.15)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${isActive ? 'rgba(0,212,255,0.35)' : 'rgba(255,255,255,0.06)'}`,
            boxShadow: isActive ? '0 0 12px rgba(0,212,255,0.3)' : 'none',
            transition: 'all 0.2s',
          }}>{emoji}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              ...M, fontSize: 12, fontWeight: 600, letterSpacing: '0.05em',
              color: isActive ? 'var(--accent)' : 'rgba(200,225,255,0.75)',
              textShadow: isActive ? '0 0 10px rgba(0,212,255,0.5)' : 'none',
              marginBottom: 2,
            }}>{label}</div>
            <div style={{ ...M, fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.08em' }}>{sub}</div>
          </div>
          {alertCount > 0 && (
            <div style={{
              ...M, fontSize: 8, fontWeight: 700,
              background: 'var(--red)', color: 'white',
              borderRadius: '10px', padding: '2px 6px', minWidth: 18, textAlign: 'center',
            }}>{alertCount}</div>
          )}
          {isActive && (
            <div style={{
              position: 'absolute', right: -10, top: '50%', transform: 'translateY(-50%)',
              width: 3, height: 24, background: 'var(--accent)',
              borderRadius: '2px 0 0 2px',
              boxShadow: '0 0 8px var(--accent)',
            }} />
          )}
        </div>
      )}
    </NavLink>
  );
}

function Sidebar({ connected, roverLive, packetCount, lastTs, alertCount, theme, onToggleTheme }) {
  const isDark = theme === 'dark';
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, bottom: 0,
      width: 'var(--sidebar-w)', zIndex: 100,
      background: 'linear-gradient(180deg, rgba(6,12,24,0.98) 0%, rgba(3,5,12,0.99) 100%)',
      borderRight: '1px solid var(--border)',
      backdropFilter: 'blur(24px)',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Top accent line */}
      <div style={{ height: 2, background: 'linear-gradient(90deg, var(--accent), var(--purple), transparent)', flexShrink: 0 }} />

      {/* Logo area */}
      <div style={{ padding: '20px 18px 16px', borderBottom: '1px solid rgba(0,212,255,0.08)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10, flexShrink: 0,
            background: 'linear-gradient(135deg, rgba(0,212,255,0.2), rgba(124,58,237,0.2))',
            border: '1px solid rgba(0,212,255,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, boxShadow: '0 0 16px rgba(0,212,255,0.2)',
          }}>🛰</div>
          <div>
            <div style={{ ...M, fontSize: 12, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.12em',
              textShadow: '0 0 12px rgba(0,212,255,0.5)' }}>ROVER TWIN</div>
            <div style={{ ...M, fontSize: 8, color: 'var(--text-dim)', letterSpacing: '0.16em', marginTop: 2 }}>
              ENV MONITOR v3.0
            </div>
          </div>
        </div>
      </div>

      {/* Live status card */}
      <div style={{ padding: '12px 18px', borderBottom: '1px solid rgba(0,212,255,0.06)', flexShrink: 0 }}>
        <div style={{
          padding: '10px 14px', borderRadius: 10,
          background: connected ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.06)',
          border: `1px solid ${connected ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className={`status-dot ${roverLive ? 'online' : 'offline'}`} />
              <span style={{ ...M, fontSize: 10, fontWeight: 600,
                color: roverLive ? 'var(--green)' : 'var(--red)',
                letterSpacing: '0.1em' }}>{roverLive ? 'ROVER LIVE' : 'NO DATA'}</span>
            </div>
            <span style={{ ...M, fontSize: 8, padding: '1px 5px', borderRadius: 3,
              background: connected ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
              border: `1px solid ${connected ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
              color: connected ? 'var(--green)' : 'var(--red)' }}>WS {connected ? '✓' : '✗'}</span>
          </div>
          <div style={{ display: 'flex', gap: 14 }}>
            <div>
              <div style={{ ...M, fontSize: 7, color: 'var(--text-dim)', letterSpacing: '0.16em', marginBottom: 2 }}>PACKETS</div>
              <div style={{ ...M, fontSize: 14, fontWeight: 700, color: 'var(--accent)' }}>{packetCount}</div>
            </div>
            {lastTs && (
              <div>
                <div style={{ ...M, fontSize: 7, color: 'var(--text-dim)', letterSpacing: '0.16em', marginBottom: 2 }}>LAST RX</div>
                <div style={{ ...M, fontSize: 11, color: 'rgba(200,225,255,0.6)' }}>{lastTs}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: 'auto', padding: '10px 0' }}>
        <div style={{ ...M, fontSize: 8, color: 'var(--text-dim)', letterSpacing: '0.2em', padding: '6px 22px 8px', textTransform: 'uppercase' }}>
          Navigation
        </div>
        {NAV.map(item => (
          <NavItem key={item.to} {...item} alertCount={item.to === '/alerts' ? alertCount : 0} />
        ))}
      </nav>

      {/* Footer */}
      <div style={{ padding: '14px 18px', borderTop: '1px solid rgba(0,212,255,0.06)', flexShrink: 0 }}>
        <div style={{ ...S, fontSize: 9, color: 'var(--text-dim)', lineHeight: 1.7 }}>
          Cloud-Monitored Environmental Rover<br />
          <span style={{ ...M, color: 'rgba(0,212,255,0.3)' }}>Chirag Simepurushkar</span>
        </div>
        {/* Theme toggle */}
        <button
          onClick={onToggleTheme}
          title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          style={{
            marginTop: 10, width: '100%', padding: '8px 12px',
            borderRadius: 8, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)',
            border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)'}`,
            color: 'var(--text-secondary)',
            transition: 'all 0.3s',
            ...M, fontSize: 9, letterSpacing: '0.1em',
          }}
        >
          <span style={{ fontSize: 14 }}>{isDark ? '☀️' : '🌙'}</span>
          {isDark ? 'LIGHT MODE' : 'DARK MODE'}
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [connected,   setConnected]   = useState(false);
  const [roverLive,   setRoverLive]   = useState(false);
  const [packetCount, setPacketCount] = useState(0);
  const [lastTs,      setLastTs]      = useState('');
  const [alertCount,  setAlertCount]  = useState(0);
  const [theme,       setTheme]       = useState(() => localStorage.getItem('rover-theme') || 'dark');
  const lastDataTime = useRef(0);

  // Apply theme to DOM
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('rover-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  useEffect(() => {
    setConnected(socket.connected);

    socket.on('connect',    () => setConnected(true));
    socket.on('disconnect', () => { setConnected(false); setRoverLive(false); });
    socket.on('raw-data',   e  => {
      setPacketCount(e.id);
      setLastTs(new Date(e.ts).toLocaleTimeString());
      lastDataTime.current = Date.now();
      setRoverLive(true);
    });
    socket.on('newAlert', () => setAlertCount(n => n + 1));

    const pollId = setInterval(() => {
      setConnected(socket.connected);
      if (lastDataTime.current > 0 && Date.now() - lastDataTime.current > 30000) {
        setRoverLive(false);
      }
    }, 1000);

    return () => {
      clearInterval(pollId);
      socket.off('connect');
      socket.off('disconnect');
      socket.off('raw-data');
      socket.off('newAlert');
    };
  }, []);

  return (
    <ThemeContext.Provider value={theme}>
      <BrowserRouter>
        <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
          <Sidebar
            connected={connected}
            roverLive={roverLive}
            packetCount={packetCount}
            lastTs={lastTs}
            alertCount={alertCount}
            theme={theme}
            onToggleTheme={toggleTheme}
          />
          <main style={{
            marginLeft: 'var(--sidebar-w)',
            flex: 1,
            overflow: 'auto',
            position: 'relative',
            background: 'transparent',
          }}>
            <Routes>
              <Route path="/"        element={<Dashboard />} />
              <Route path="/map3d"   element={<Map3D />} />
              <Route path="/history" element={<History />} />
              <Route path="/alerts"  element={<Alerts />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </ThemeContext.Provider>
  );
}