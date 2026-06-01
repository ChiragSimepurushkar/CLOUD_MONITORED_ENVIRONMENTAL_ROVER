// ═══════════════════════════════════════════════════════════
//  EnvironmentMap3D.jsx  v3.0
//  Live 3D digital twin — Environmental Rover
//  React Three Fiber + Socket.io + glassmorphism UI
//  FIX: Camera target fixed at origin — rover movement now visible
// ═══════════════════════════════════════════════════════════

import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { io } from 'socket.io-client';
import * as THREE from 'three';
import {
  getTempColor, getGasColor, getHumidityColor,
  getCellHeight, rgbToHex, getSafetyLabel, getEmissiveIntensity
} from '../colorUtils';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3000';
const CELL_SCALE = 0.25; // 25 cm = 0.25 Three.js units

// ─────────────────────────────────────────────
//  GRID CELL
// ─────────────────────────────────────────────
function GridCell({ gx, gy, cell, mode }) {
  const meshRef  = useRef();
  const matRef   = useRef();
  const targetH  = useRef(0);
  const currentH = useRef(0);

  const { color, height, emissive, emissiveIntensity } = useMemo(() => {
    if (cell.isObstacle) {
      return { color: '#4a5568', height: 2.2, emissive: '#2d3748', emissiveIntensity: 0.1 };
    }
    let rgb;
    if      (mode === 'gas')  rgb = getGasColor(cell.avgGas   || 0);
    else if (mode === 'temp') rgb = getTempColor(cell.avgTemp  || 25);
    else                      rgb = getHumidityColor(cell.avgHum || 50);

    const ei = getEmissiveIntensity(cell.avgGas || 0, cell.avgTemp || 25);
    return {
      color:             rgbToHex(rgb),
      height:            getCellHeight(cell.avgGas || 0, cell.avgTemp || 25),
      emissive:          rgbToHex(rgb),
      emissiveIntensity: ei
    };
  }, [cell, mode]);

  useEffect(() => { targetH.current = height; }, [height]);

  useFrame((_, delta) => {
    if (!meshRef.current || !matRef.current) return;
    const h = currentH.current + (targetH.current - currentH.current) * Math.min(1, delta * 5);
    currentH.current = h;
    meshRef.current.scale.y    = Math.max(0.01, h / Math.max(height, 0.01));
    meshRef.current.position.y = h / 2;
    matRef.current.emissiveIntensity = emissiveIntensity * (0.5 + Math.sin(Date.now() * 0.003) * 0.15);
  });

  return (
    <mesh ref={meshRef} position={[gx * CELL_SCALE, height / 2, gy * CELL_SCALE]} castShadow receiveShadow>
      <boxGeometry args={[CELL_SCALE * 0.9, height, CELL_SCALE * 0.9]} />
      <meshStandardMaterial
        ref={matRef}
        color={color} emissive={emissive} emissiveIntensity={emissiveIntensity}
        transparent opacity={cell.isObstacle ? 0.92 : 0.85}
        roughness={cell.isObstacle ? 0.9 : 0.4} metalness={cell.isObstacle ? 0.05 : 0.2}
      />
    </mesh>
  );
}

// ─────────────────────────────────────────────
//  ROVER MARKER  — larger, more visible
// ─────────────────────────────────────────────
function RoverMarker({ rover }) {
  const groupRef = useRef();
  const ringRef  = useRef();
  const t        = useRef(0);

  // Smooth position interpolation so movement is animated, not a jump
  const posRef = useRef({ x: 0, z: 0 });

  useFrame((_, delta) => {
    t.current += delta;
    if (!groupRef.current) return;

    const targetX = (rover.x / 25) * CELL_SCALE;
    const targetZ = (rover.y / 25) * CELL_SCALE;

    // Lerp toward target position so movement is smooth & visible
    posRef.current.x += (targetX - posRef.current.x) * Math.min(1, delta * 3);
    posRef.current.z += (targetZ - posRef.current.z) * Math.min(1, delta * 3);

    const pulse = 1 + Math.sin(t.current * 3) * 0.08;
    groupRef.current.position.set(posRef.current.x, 0.5, posRef.current.z);
    groupRef.current.rotation.y = -((rover.heading * Math.PI) / 180);
    groupRef.current.scale.setScalar(pulse);

    if (ringRef.current) {
      ringRef.current.scale.setScalar(1 + (Math.sin(t.current * 2) * 0.5 + 0.5) * 0.7);
      ringRef.current.material.opacity = 0.7 - (Math.sin(t.current * 2) * 0.5 + 0.5) * 0.5;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Main cone — pointing forward */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.14, 0.42, 8]} />
        <meshStandardMaterial color="#00d4ff" emissive="#00d4ff" emissiveIntensity={1.4} roughness={0.1} metalness={0.5} />
      </mesh>
      {/* Base disc */}
      <mesh position={[0, -0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.16, 20]} />
        <meshStandardMaterial color="#00d4ff" emissive="#00d4ff" emissiveIntensity={1.0} transparent opacity={0.8} />
      </mesh>
      {/* Pulse ring */}
      <mesh ref={ringRef} position={[0, -0.07, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.18, 0.28, 28]} />
        <meshStandardMaterial color="#00d4ff" transparent opacity={0.6} side={THREE.DoubleSide} />
      </mesh>
      {/* Local glow light */}
      <pointLight color="#00d4ff" intensity={2.0} distance={2.0} decay={2} />
    </group>
  );
}

// ─────────────────────────────────────────────
//  ROVER PATH TRAIL  — shows where it's been
// ─────────────────────────────────────────────
function RoverTrail({ pathHistory }) {
  if (pathHistory.length < 2) return null;
  const points = pathHistory.map(p => new THREE.Vector3(
    (p.x / 25) * CELL_SCALE, 0.05, (p.y / 25) * CELL_SCALE
  ));
  const geom = new THREE.BufferGeometry().setFromPoints(points);
  return (
    <line geometry={geom}>
      <lineBasicMaterial color="#00d4ff" transparent opacity={0.35} linewidth={1} />
    </line>
  );
}

// ─────────────────────────────────────────────
//  CAMERA CONTROLLER — smooth rover follow
//  Lerps OrbitControls target toward rover pos
//  so movement is always visible in view
// ─────────────────────────────────────────────
function CameraController({ rover, orbitRef }) {
  const smooth = useRef(new THREE.Vector3(0, 0, 0));

  useFrame(() => {
    if (!orbitRef.current) return;
    const tx = (rover.x / 25) * CELL_SCALE;
    const tz = (rover.y / 25) * CELL_SCALE;
    // Slow lerp (0.03) — camera follows but doesn't snap, so movement is visible
    smooth.current.lerp(new THREE.Vector3(tx, 0, tz), 0.03);
    orbitRef.current.target.copy(smooth.current);
    orbitRef.current.update();
  });

  return null;
}

function StartMarker() {
  const meshRef = useRef();
  const t = useRef(0);
  useFrame((_, delta) => {
    t.current += delta;
    if (meshRef.current) meshRef.current.material.opacity = 0.4 + Math.sin(t.current * 1.5) * 0.25;
  });
  return (
    <mesh ref={meshRef} position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0, 0.26, 32]} />
      <meshStandardMaterial color="#39ff14" emissive="#39ff14" emissiveIntensity={0.9} transparent opacity={0.55} />
    </mesh>
  );
}

// ─────────────────────────────────────────────
//  SCAN RING
// ─────────────────────────────────────────────
function ScanRing({ rover }) {
  const ringRef = useRef();
  const t = useRef(0);
  const period = 3.5;
  useFrame((_, delta) => {
    t.current = (t.current + delta) % period;
    if (!ringRef.current) return;
    const p = t.current / period;
    ringRef.current.scale.setScalar(p * 8);
    ringRef.current.material.opacity = (1 - p) * 0.22;
    ringRef.current.position.set((rover.x / 25) * CELL_SCALE, 0.02, (rover.y / 25) * CELL_SCALE);
  });
  return (
    <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.18, 0.22, 48]} />
      <meshStandardMaterial color="#00d4ff" transparent opacity={0.2} side={THREE.DoubleSide} />
    </mesh>
  );
}

// ─────────────────────────────────────────────
//  SCENE LIGHTING
// ─────────────────────────────────────────────
function SceneLighting() {
  return (
    <>
      <ambientLight intensity={0.35} color="#0a1628" />
      <directionalLight position={[10, 18, 8]} intensity={0.9} color="#ffffff" castShadow
        shadow-mapSize={[2048, 2048]} shadow-camera-near={0.1} shadow-camera-far={100}
        shadow-camera-left={-20} shadow-camera-right={20} shadow-camera-top={20} shadow-camera-bottom={-20}
      />
      <directionalLight position={[-10, 12, -8]} intensity={0.35} color="#4477ff" />
      <pointLight position={[0, 12, 0]} intensity={0.5} color="#00d4ff" distance={40} />
      <pointLight position={[5, 5, -5]} intensity={0.25} color="#8866ff" distance={20} />
      <hemisphereLight skyColor="#0a1628" groundColor="#000510" intensity={0.5} />
    </>
  );
}

// ─────────────────────────────────────────────
//  FLOOR
// ─────────────────────────────────────────────
function SceneFloor() {
  return (
    <>
      <Grid args={[50, 50]} position={[0, 0, 0]}
        cellColor="rgba(0,212,255,0.06)" sectionColor="rgba(0,212,255,0.14)"
        cellSize={0.25} sectionSize={1} fadeDistance={35} fadeStrength={1.2} infiniteGrid
      />
      {/* X axis (red) */}
      <mesh position={[2.5, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[5, 0.012]} />
        <meshBasicMaterial color="#ff4466" transparent opacity={0.6} />
      </mesh>
      {/* Z axis (green) */}
      <mesh position={[0, 0.005, 2.5]} rotation={[-Math.PI / 2, 0, -Math.PI / 2]}>
        <planeGeometry args={[5, 0.012]} />
        <meshBasicMaterial color="#44ff88" transparent opacity={0.6} />
      </mesh>
    </>
  );
}

// ─────────────────────────────────────────────
//  STYLE HELPERS
// ─────────────────────────────────────────────
const glass = {
  background: 'rgba(5,11,23,0.78)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  border: '1px solid rgba(0,212,255,0.18)',
  borderRadius: 10,
};
const mono = { fontFamily: "'JetBrains Mono','Courier New',monospace" };
const sans = { fontFamily: "'Inter',sans-serif" };

function StatCard({ label, value, unit, color, subtext }) {
  return (
    <div style={{ ...glass, ...mono, padding: '10px 14px', minWidth: 110, borderLeft: `2px solid ${color}` }}>
      <div style={{ fontSize: 9, color: 'rgba(0,212,255,0.45)', letterSpacing: '0.18em', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color, lineHeight: 1.1 }}>
        {value}<span style={{ fontSize: 11, fontWeight: 400, marginLeft: 3, opacity: 0.7 }}>{unit}</span>
      </div>
      {subtext && <div style={{ fontSize: 9, color: 'rgba(0,212,255,0.35)', marginTop: 2 }}>{subtext}</div>}
    </div>
  );
}

function LegendRow({ color, label, dot, glow }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
      <div style={{
        width: dot ? 8 : 11, height: dot ? 8 : 7,
        borderRadius: dot ? '50%' : 3, background: color, flexShrink: 0,
        boxShadow: glow ? `0 0 6px ${color}` : 'none'
      }} />
      <span style={{ fontSize: 10, color: 'rgba(180,210,240,0.75)', ...sans }}>{label}</span>
    </div>
  );
}

function ModeBtn({ id, label, active, onClick }) {
  return (
    <button id={id} onClick={onClick} style={{
      ...mono, padding: '5px 14px', fontSize: 11,
      border: `1px solid ${active ? '#00d4ff' : 'rgba(0,212,255,0.2)'}`,
      background: active ? 'rgba(0,212,255,0.12)' : 'rgba(0,0,0,0.3)',
      color: active ? '#00d4ff' : 'rgba(0,212,255,0.4)',
      borderRadius: 6, cursor: 'pointer', transition: 'all 0.25s ease',
      boxShadow: active ? '0 0 10px rgba(0,212,255,0.2)' : 'none',
      letterSpacing: '0.08em'
    }}>{label}</button>
  );
}

// ─────────────────────────────────────────────
//  SIMULATE STEP STATE  (module-level, persists across renders)
// ─────────────────────────────────────────────
let simX = 0, simY = 0, simHeading = 0, simStep = 0;

// ─────────────────────────────────────────────
//  MAIN COMPONENT
// ─────────────────────────────────────────────
export default function EnvironmentMap3D() {
  const [grid,       setGrid]      = useState({});
  const [rover,      setRover]     = useState({ x: 0, y: 0, heading: 0 });
  const [stats,      setStats]     = useState({ maxGas: 0, maxTemp: 0, minTemp: 0, maxHumidity: 0, cellsVisited: 0, obstacleCount: 0, totalReadings: 0 });
  const [mode,       setMode]      = useState('gas');
  const [connected,  setConnected] = useState(false);
  const [lastUpdate, setLastUpdate]= useState(null);
  const [dbOnline,   setDbOnline]  = useState(false);
  const [rawLog,     setRawLog]    = useState([]);
  const [simulating, setSimulating]= useState(false);
  const [showLog,    setShowLog]   = useState(true);
  const [autoSim,    setAutoSim]   = useState(false);
  const [pathHistory,setPathHistory]= useState([]);
  const fpsRef    = useRef({ frames: 0, last: Date.now() });
  const logEndRef = useRef();
  const orbitRef  = useRef();   // ← shared with CameraController


  // Health check
  useEffect(() => {
    const check = () =>
      fetch(`${SERVER_URL}/health`, { signal: AbortSignal.timeout(2000) })
        .then(r => r.json()).then(d => setDbOnline(d.dbOnline)).catch(() => setDbOnline(false));
    check();
    const id = setInterval(check, 5000);
    return () => clearInterval(id);
  }, []);

  // Socket.io
  useEffect(() => {
    fetch(`${SERVER_URL}/map-state`)
      .then(r => r.json())
      .then(({ grid: g, rover: r, stats: s }) => {
        if (g) setGrid(g);
        if (r) setRover(r);
        if (s) setStats(s);
      }).catch(() => {});

    const socket = io(SERVER_URL, { transports: ['websocket', 'polling'] });
    socket.on('connect',    () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('map-update', ({ grid: g, rover: r, stats: s }) => {
      if (g) setGrid(prev => ({ ...prev, ...g }));
      if (r) {
        setRover(r);
        setPathHistory(prev => {
          const last = prev[prev.length - 1];
          if (!last || last.x !== r.x || last.y !== r.y) {
            return [...prev, { x: r.x, y: r.y }].slice(-80); // keep last 80 positions
          }
          return prev;
        });
      }
      if (s) setStats(s);
      setLastUpdate(new Date());
    });

    socket.on('raw-data', entry => {
      setRawLog(prev => [entry, ...prev].slice(0, 50));
    });

    socket.on('map-reset', () => {
      setGrid({});
      setRover({ x: 0, y: 0, heading: 0 });
      setStats({ maxGas: 0, maxTemp: 0, minTemp: 0, maxHumidity: 0, cellsVisited: 0, obstacleCount: 0, totalReadings: 0 });
      setRawLog([]);
      setPathHistory([]);
      simX = 0; simY = 0; simHeading = 0; simStep = 0;
    });

    return () => socket.disconnect();
  }, []);

  // Reset
  const handleReset = useCallback(() => {
    if (window.confirm('Reset the grid? All current scan data will be cleared.')) {
      fetch(`${SERVER_URL}/reset`, { method: 'POST' });
    }
  }, []);

  // ── SIMULATE — walks a realistic path so movement is clearly visible ──
  const handleSimulate = useCallback(async () => {
    setSimulating(true);

    // Walk forward — LARGE step so movement is clearly visible across grid
    simStep++;
    if (simStep % 3 === 0) {           // turn every 3 steps (not 6)
      simHeading = (simHeading + 90) % 360;
    }

    const rad = simHeading * Math.PI / 180;
    simX += 100 * Math.sin(rad);       // 100 cm = 4 cells per step
    simY += 100 * Math.cos(rad);

    const payload = {
      x:        +simX.toFixed(1),
      y:        +simY.toFixed(1),
      heading:  simHeading,
      temp:     +(22 + Math.sin(simStep * 0.4) * 12).toFixed(1),
      humidity: +(55 + Math.cos(simStep * 0.3) * 20).toFixed(1),
      gas:      Math.round(150 + Math.abs(Math.sin(simStep * 0.5)) * 400),
      obstacle: simStep % 8 === 0,
      distance: Math.round(40 + Math.random() * 160)
    };

    await fetch(`${SERVER_URL}/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).catch(() => {});

    setSimulating(false);
  }, []);

  // Auto-simulate: walk the rover every 1.5 s without clicking
  useEffect(() => {
    if (!autoSim) return;
    const id = setInterval(() => {
      handleSimulate();
    }, 1500);
    return () => clearInterval(id);
  }, [autoSim, handleSimulate]);

  const safety      = getSafetyLabel(stats.maxGas, stats.maxTemp);
  const cellCount   = Object.keys(grid).length;
  const areaCovered = (cellCount * 0.0625).toFixed(2);
  const timeStr     = lastUpdate ? lastUpdate.toLocaleTimeString() : '—';
  const MODES = [
    { id: 'btn-gas',  key: 'gas',  label: '💨 GAS'  },
    { id: 'btn-temp', key: 'temp', label: '🌡 TEMP'  },
    { id: 'btn-hum',  key: 'hum',  label: '💧 HUM'   },
  ];

  return (
    <div id="digital-twin-root" style={{
      width: '100%', height: '100vh',
      background: 'radial-gradient(ellipse at 20% 20%, #0d1e3b 0%, #050b17 60%, #020710 100%)',
      position: 'relative', overflow: 'hidden'
    }}>

      {/* Scanlines */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none',
        background: 'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,212,255,0.012) 2px,rgba(0,212,255,0.012) 4px)'
      }} />

      {/* ── TOP BAR ── */}
      <div id="topbar" style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 30,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 20px',
        background: 'rgba(5,11,23,0.9)',
        borderBottom: '1px solid rgba(0,212,255,0.2)',
        backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)'
      }}>
        {/* Left */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 9, height: 9, borderRadius: '50%',
            background: connected ? '#52c41a' : '#ff4d4f',
            boxShadow: connected ? '0 0 8px #52c41a,0 0 16px #52c41a66' : '0 0 8px #ff4d4f'
          }} />
          <span style={{ ...mono, color: '#00d4ff', fontSize: 13, fontWeight: 700, letterSpacing: '0.12em', textShadow: '0 0 12px rgba(0,212,255,0.5)' }}>
            🛰 3D ENVIRONMENTAL DIGITAL TWIN
          </span>
          <span style={{
            ...mono, fontSize: 9, padding: '2px 7px', borderRadius: 4,
            background: dbOnline ? 'rgba(82,196,26,0.12)' : 'rgba(255,77,79,0.12)',
            border: `1px solid ${dbOnline ? '#52c41a44' : '#ff4d4f44'}`,
            color: dbOnline ? '#52c41a' : '#ff4d4f'
          }}>DB {dbOnline ? '✓' : '✗'}</span>
        </div>

        {/* Centre mode buttons */}
        <div style={{ display: 'flex', gap: 6 }}>
          {MODES.map(({ id, key, label }) => (
            <ModeBtn key={key} id={id} label={label} active={mode === key} onClick={() => setMode(key)} />
          ))}
        </div>

        {/* Right action buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ ...mono, fontSize: 10, color: 'rgba(0,212,255,0.45)' }}>
            {timeStr !== '—' ? `↺ ${timeStr}` : 'Awaiting data…'}
          </span>
          <button id="btn-toggle-log" onClick={() => setShowLog(v => !v)} style={{
            ...mono, fontSize: 10, padding: '4px 10px',
            border: '1px solid rgba(0,212,255,0.25)',
            background: showLog ? 'rgba(0,212,255,0.1)' : 'rgba(0,0,0,0.3)',
            color: showLog ? '#00d4ff' : 'rgba(0,212,255,0.35)',
            borderRadius: 5, cursor: 'pointer', letterSpacing: '0.05em', transition: 'all 0.2s'
          }}>📡 LOG</button>
          <button id="btn-simulate" onClick={handleSimulate} disabled={simulating || autoSim}
            title="Walk the rover one step forward along its current heading"
            style={{
              ...mono, fontSize: 10, padding: '4px 10px',
              border: '1px solid rgba(82,196,26,0.4)',
              background: (simulating || autoSim) ? 'rgba(82,196,26,0.15)' : 'rgba(82,196,26,0.08)',
              color: (simulating || autoSim) ? 'rgba(82,196,26,0.45)' : 'rgba(82,196,26,0.7)',
              borderRadius: 5, cursor: (simulating || autoSim) ? 'not-allowed' : 'pointer',
              letterSpacing: '0.05em', transition: 'all 0.2s'
            }}
          >{simulating ? '⏳ SENDING…' : '⚡ SIMULATE'}</button>
          {/* Auto toggle */}
          <button id="btn-auto" onClick={() => setAutoSim(v => !v)}
            title={autoSim ? 'Stop auto-movement' : 'Start auto-movement (rover walks continuously)'}
            style={{
              ...mono, fontSize: 10, padding: '4px 10px',
              border: `1px solid ${autoSim ? '#52c41a' : 'rgba(82,196,26,0.25)'}`,
              background: autoSim ? 'rgba(82,196,26,0.2)' : 'rgba(0,0,0,0.3)',
              color: autoSim ? '#52c41a' : 'rgba(82,196,26,0.4)',
              borderRadius: 5, cursor: 'pointer', letterSpacing: '0.05em',
              transition: 'all 0.2s',
              boxShadow: autoSim ? '0 0 10px rgba(82,196,26,0.4)' : 'none'
            }}
          >{autoSim ? '■ STOP AUTO' : '▶ AUTO'}</button>
          <button id="btn-reset" onClick={handleReset} style={{
            ...mono, fontSize: 10, padding: '4px 10px',
            border: '1px solid rgba(255,77,79,0.3)',
            background: 'rgba(255,77,79,0.08)',
            color: 'rgba(255,77,79,0.6)',
            borderRadius: 5, cursor: 'pointer', letterSpacing: '0.05em', transition: 'all 0.2s'
          }}>⟳ RESET</button>
        </div>
      </div>

      {/* ── LEFT STATS ── */}
      <div style={{ position: 'absolute', top: 56, left: 16, zIndex: 20, display: 'flex', flexDirection: 'column', gap: 7 }}>
        <StatCard label="MAX GAS"   value={stats.maxGas}              unit="ppm" color="#ffa940" />
        <StatCard label="MAX TEMP"  value={`${stats.maxTemp}°`}       unit="C"   color="#ff4d4f"
          subtext={stats.minTemp < Infinity && stats.minTemp > 0 ? `min ${stats.minTemp}°C` : ''} />
        <StatCard label="MAX HUM"   value={`${stats.maxHumidity || 0}%`} unit="" color="#40a9ff" />
        <StatCard label="CELLS"     value={cellCount}                 unit=""    color="#00d4ff" subtext={`${areaCovered} m²`} />
        <StatCard label="OBSTACLES" value={stats.obstacleCount || 0}  unit=""    color="#b37feb" />
        <StatCard label="READINGS"  value={stats.totalReadings || 0}  unit=""    color="#36cfc9" />
        <div style={{ ...glass, padding: '10px 14px', borderLeft: `2px solid ${safety.color}`, boxShadow: `0 0 20px ${safety.glow}` }}>
          <div style={{ fontSize: 9, color: 'rgba(0,212,255,0.45)', letterSpacing: '0.18em', marginBottom: 3, ...mono }}>STATUS</div>
          <div style={{ ...mono, fontSize: 17, fontWeight: 700, color: safety.color, textShadow: `0 0 10px ${safety.color}` }}>
            {safety.label}
          </div>
        </div>
      </div>

      {/* ── LEGEND ── */}
      <div style={{ position: 'absolute', bottom: 20, left: 16, zIndex: 20, ...glass, padding: '12px 16px', minWidth: 160 }}>
        <div style={{ fontSize: 9, ...mono, color: 'rgba(0,212,255,0.45)', letterSpacing: '0.18em', marginBottom: 8 }}>LEGEND</div>
        {mode === 'gas'  && <><LegendRow color="#00c853" label="Safe (0–200 ppm)"  glow /><LegendRow color="#ffa940" label="Warning (200–400)" glow /><LegendRow color="#ff4d4f" label="Danger (400+)" glow /></>}
        {mode === 'temp' && <><LegendRow color="#4499ff" label="Cool (≤20°C)"      glow /><LegendRow color="#ffa940" label="Warm (~30°C)"     glow /><LegendRow color="#ff4d4f" label="Hot (45°C+)"  glow /></>}
        {mode === 'hum'  && <><LegendRow color="#91d5ff" label="Dry (0–30%)"       glow /><LegendRow color="#4499ff" label="Normal (~50%)"    glow /><LegendRow color="#003a8c" label="Humid (80%+)" glow /></>}
        <div style={{ borderTop: '1px solid rgba(0,212,255,0.1)', margin: '8px 0' }} />
        <LegendRow color="#4a5568" label="Obstacle / Wall" />
        <LegendRow color="#00d4ff" label="Rover (current pos)" dot glow />
        <LegendRow color="#39ff14" label="Start origin"        dot glow />
        <LegendRow color="rgba(0,212,255,0.35)" label="Path trail" />
        <div style={{ marginTop: 8, fontSize: 9, color: 'rgba(0,212,255,0.3)', ...sans }}>Bar height ∝ reading intensity</div>
      </div>

      {/* ── CAMERA CONTROLS HINT ── */}
      <div style={{ position: 'absolute', bottom: 20, right: 16, zIndex: 20, ...glass, padding: '10px 14px' }}>
        <div style={{ fontSize: 9, ...mono, color: 'rgba(0,212,255,0.45)', letterSpacing: '0.18em', marginBottom: 6 }}>CAMERA</div>
        {[['Left drag', 'Rotate'], ['Scroll', 'Zoom'], ['Right drag', 'Pan']].map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 20, marginBottom: 3 }}>
            <span style={{ fontSize: 10, color: 'rgba(0,212,255,0.35)', ...sans }}>{k}</span>
            <span style={{ fontSize: 10, color: 'rgba(0,212,255,0.6)', ...sans }}>{v}</span>
          </div>
        ))}
      </div>

      {/* ── ROVER COMPASS (top right) ── */}
      <div style={{ position: 'absolute', top: 56, right: 16, zIndex: 20, ...glass, padding: '12px 16px', textAlign: 'center' }}>
        <div style={{ fontSize: 9, ...mono, color: 'rgba(0,212,255,0.45)', letterSpacing: '0.18em', marginBottom: 6 }}>ROVER</div>
        <div style={{ position: 'relative', width: 64, height: 64, margin: '0 auto 8px' }}>
          <svg viewBox="0 0 64 64" style={{ width: 64, height: 64, opacity: 0.4 }}>
            <circle cx="32" cy="32" r="30" fill="none" stroke="rgba(0,212,255,0.5)" strokeWidth="1" />
            {['N', 'E', 'S', 'W'].map((d, i) => (
              <text key={d} x={32 + 22 * Math.sin(i * Math.PI / 2)} y={36 - 22 * Math.cos(i * Math.PI / 2)}
                textAnchor="middle" fontSize="8" fill="rgba(0,212,255,0.8)" fontFamily="monospace">{d}</text>
            ))}
          </svg>
          <div style={{
            position: 'absolute', top: 0, left: 0, width: 64, height: 64,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transform: `rotate(${rover.heading}deg)`, transition: 'transform 0.4s ease'
          }}>
            <div style={{
              width: 0, height: 0,
              borderLeft: '5px solid transparent', borderRight: '5px solid transparent',
              borderBottom: '20px solid #00d4ff', filter: 'drop-shadow(0 0 4px #00d4ff)'
            }} />
          </div>
        </div>
        <div style={{ ...mono, fontSize: 16, fontWeight: 700, color: '#00d4ff' }}>{Math.round(rover.heading)}°</div>
        <div style={{ fontSize: 9, color: 'rgba(0,212,255,0.35)', marginTop: 2 }}>
          X:{(rover.x / 100).toFixed(1)}m  Y:{(rover.y / 100).toFixed(1)}m
        </div>
      </div>

      {/* ── LIVE LOG PANEL ── */}
      {showLog && (
        <div id="packet-log" style={{
          position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
          zIndex: 25, width: 500, ...glass, overflow: 'hidden'
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 12px', borderBottom: '1px solid rgba(0,212,255,0.12)',
            background: 'rgba(0,212,255,0.04)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 7, height: 7, borderRadius: '50%',
                background: rawLog.length > 0 ? '#52c41a' : 'rgba(0,212,255,0.3)',
                boxShadow: rawLog.length > 0 ? '0 0 6px #52c41a' : 'none'
              }} />
              <span style={{ ...mono, fontSize: 9, color: 'rgba(0,212,255,0.6)', letterSpacing: '0.15em' }}>LIVE DATA FEED</span>
              <span style={{
                ...mono, fontSize: 9, padding: '1px 6px', borderRadius: 3,
                background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.2)',
                color: 'rgba(0,212,255,0.5)'
              }}>{rawLog.length} packets</span>
            </div>
            <span style={{ fontSize: 9, color: 'rgba(0,212,255,0.3)', ...sans }}>
              {rawLog.length === 0 ? 'Click ⚡ SIMULATE to test without rover' : `Last: #${rawLog[0]?.id}`}
            </span>
          </div>

          <div style={{ maxHeight: 175, overflowY: 'auto', padding: '4px 0' }}>
            {rawLog.length === 0 ? (
              <div style={{ padding: '18px 0', textAlign: 'center', ...mono, fontSize: 10, color: 'rgba(0,212,255,0.2)' }}>
                No packets yet — click ⚡ SIMULATE or start the rover
              </div>
            ) : rawLog.slice(0, 8).map((entry, i) => {
              const d     = entry.data;
              const isNew = i === 0;
              const isSim = entry.source === 'simulate';
              return (
                <div key={entry.id} style={{
                  display: 'flex', alignItems: 'baseline', gap: 6, padding: '5px 12px',
                  borderBottom: '1px solid rgba(0,212,255,0.06)',
                  background: isNew ? (isSim ? 'rgba(82,196,26,0.07)' : 'rgba(0,212,255,0.07)') : 'transparent',
                  transition: 'background 0.3s'
                }}>
                  <span style={{ ...mono, fontSize: 9, color: 'rgba(0,212,255,0.35)', minWidth: 28 }}>#{entry.id}</span>
                  <span style={{
                    ...mono, fontSize: 8, padding: '1px 5px', borderRadius: 3,
                    background: isSim ? 'rgba(82,196,26,0.12)' : 'rgba(0,212,255,0.1)',
                    color: isSim ? '#52c41a' : '#00d4ff',
                    border: `1px solid ${isSim ? '#52c41a44' : 'rgba(0,212,255,0.2)'}`,
                    minWidth: 52, textAlign: 'center'
                  }}>{isSim ? 'SIM' : 'ARDUINO'}</span>
                  <span style={{ ...mono, fontSize: 10, flex: 1, color: 'rgba(200,230,255,0.8)' }}>
                    <span style={{ color: '#ff7875' }}>T</span>{d.temp}°{'  '}
                    <span style={{ color: '#69c0ff' }}>H</span>{d.humidity}%{'  '}
                    <span style={{ color: '#ffa940' }}>G</span>{d.gas}{'  '}
                    <span style={{ color: '#b37feb' }}>D</span>{d.distance}cm{'  '}
                    <span style={{ color: 'rgba(0,212,255,0.5)' }}>
                      ({d.x != null ? (+d.x).toFixed(0) : 0},{d.y != null ? (+d.y).toFixed(0) : 0})
                    </span>
                    {d.obstacle && <span style={{ color: '#ff4d4f', marginLeft: 4 }}>⚠</span>}
                  </span>
                  <span style={{ ...mono, fontSize: 8, color: 'rgba(0,212,255,0.25)', whiteSpace: 'nowrap' }}>
                    {new Date(entry.ts).toLocaleTimeString()}
                  </span>
                </div>
              );
            })}
            <div ref={logEndRef} />
          </div>
        </div>
      )}

      {/* ── THREE.JS CANVAS ── */}
      <Canvas
        id="canvas-3d"
        camera={{ position: [4, 6, 4], fov: 55, near: 0.05, far: 300 }}
        shadows
        gl={{ antialias: true, alpha: false }}
        style={{ width: '100%', height: '100%' }}
        onCreated={({ gl }) => {
          gl.setClearColor(new THREE.Color('#050b17'));
          gl.shadowMap.enabled = true;
          gl.shadowMap.type = THREE.PCFSoftShadowMap;
        }}
      >
        <SceneLighting />
        <SceneFloor />
        <StartMarker />
        <ScanRing rover={rover} />
        <RoverTrail pathHistory={pathHistory} />

        {Object.entries(grid).map(([key, cell]) => {
          const [gx, gy] = key.split(',').map(Number);
          return <GridCell key={key} gx={gx} gy={gy} cell={cell} mode={mode} />;
        })}

        <RoverMarker rover={rover} />

        {/* Camera smoothly follows rover — movement always in view */}
        <CameraController rover={rover} orbitRef={orbitRef} />

        <OrbitControls
          ref={orbitRef}
          enableDamping
          dampingFactor={0.07}
          minDistance={0.5}
          maxDistance={80}
          maxPolarAngle={Math.PI / 2.05}
        />
      </Canvas>
    </div>
  );
}
