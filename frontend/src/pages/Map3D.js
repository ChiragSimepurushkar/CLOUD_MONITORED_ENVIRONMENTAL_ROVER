// ══════════════════════════════════════════════════════════════
//  Map3D.js  — 3D Digital Twin page
//  Full React Three Fiber map embedded as a page in the combined app
//  Pulls shared socket from App.js context
// ══════════════════════════════════════════════════════════════

import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { socket, SERVER } from '../App';

const CELL_SCALE = 0.25;

// ── Color utilities ──────────────────────────────
function getTempColor(t) {
  const k = Math.max(0, Math.min(1, (t - 10) / 50));
  return { r: Math.round(k * 255), g: Math.round((1 - Math.abs(k - 0.5) * 2) * 180), b: Math.round((1 - k) * 255) };
}
function getGasColor(g) {
  if (g <= 0)   return { r: 0,   g: 200, b: 83  };
  if (g <= 200) return { r: Math.round(g / 200 * 200), g: 200, b: 83 };
  if (g <= 400) return { r: 255, g: Math.round(200 - (g - 200) / 200 * 200), b: 0 };
  return { r: 255, g: 0, b: Math.round(Math.min(1, (g - 400) / 200) * 80) };
}
function getHumColor(h) {
  const k = Math.max(0, Math.min(1, h / 100));
  return { r: Math.round((1 - k) * 145), g: Math.round((1 - k * 0.5) * 200), b: 255 };
}
function rgbHex({ r, g, b }) { return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`; }
function cellHeight(gas, temp) { return Math.max(0.08, (gas / 150) * 0.6 + (temp / 60) * 0.3); }
function emissiveInt(gas, temp) { return Math.min(1.2, gas / 400 * 0.7 + temp / 60 * 0.3); }
function safetyOf(gas, temp) {
  if (gas > 400 || temp > 45) return { label: 'DANGER',  color: '#ff4d4f', glow: 'rgba(255,77,79,0.4)' };
  if (gas > 250 || temp > 35) return { label: 'WARNING', color: '#ffa940', glow: 'rgba(255,169,64,0.3)' };
  return                              { label: 'SAFE',    color: '#52c41a', glow: 'rgba(82,196,26,0.3)' };
}

// ── Grid Cell ────────────────────────────────────
function GridCell({ gx, gy, cell, mode }) {
  const meshRef  = useRef();
  const matRef   = useRef();
  const targetH  = useRef(0.08);
  const currentH = useRef(0.08);

  const { color, height, emissive, ei } = useMemo(() => {
    if (cell.isObstacle) return { color: '#4a5568', height: 2.0, emissive: '#2d3748', ei: 0.1 };
    const rgb = mode === 'gas' ? getGasColor(cell.avgGas || 0) : mode === 'temp' ? getTempColor(cell.avgTemp || 25) : getHumColor(cell.avgHum || 50);
    return { color: rgbHex(rgb), height: cellHeight(cell.avgGas || 0, cell.avgTemp || 25), emissive: rgbHex(rgb), ei: emissiveInt(cell.avgGas || 0, cell.avgTemp || 25) };
  }, [cell, mode]);

  useEffect(() => { targetH.current = height; }, [height]);

  useFrame((_, delta) => {
    if (!meshRef.current || !matRef.current) return;
    const h = currentH.current + (targetH.current - currentH.current) * Math.min(1, delta * 5);
    currentH.current = h;
    meshRef.current.scale.y = Math.max(0.01, h / Math.max(height, 0.01));
    meshRef.current.position.y = h / 2;
    matRef.current.emissiveIntensity = ei * (0.5 + Math.sin(Date.now() * 0.003) * 0.15);
  });

  return (
    <mesh ref={meshRef} position={[gx * CELL_SCALE, height / 2, gy * CELL_SCALE]} castShadow receiveShadow>
      <boxGeometry args={[CELL_SCALE * 0.9, height, CELL_SCALE * 0.9]} />
      <meshStandardMaterial ref={matRef} color={color} emissive={emissive} emissiveIntensity={ei}
        transparent opacity={cell.isObstacle ? 0.92 : 0.85} roughness={0.4} metalness={0.2} />
    </mesh>
  );
}

// ── Rover Marker ─────────────────────────────────
function RoverMarker({ rover }) {
  const groupRef = useRef();
  const ringRef  = useRef();
  const t        = useRef(0);
  const posRef   = useRef({ x: 0, z: 0 });

  useFrame((_, delta) => {
    t.current += delta;
    if (!groupRef.current) return;
    const tx = (rover.x / 25) * CELL_SCALE;
    const tz = (rover.y / 25) * CELL_SCALE;
    posRef.current.x += (tx - posRef.current.x) * Math.min(1, delta * 3);
    posRef.current.z += (tz - posRef.current.z) * Math.min(1, delta * 3);
    groupRef.current.position.set(posRef.current.x, 0.5, posRef.current.z);
    groupRef.current.rotation.y = -((rover.heading * Math.PI) / 180);
    groupRef.current.scale.setScalar(1 + Math.sin(t.current * 3) * 0.07);
    if (ringRef.current) {
      ringRef.current.scale.setScalar(1 + (Math.sin(t.current * 2) * 0.5 + 0.5) * 0.7);
      ringRef.current.material.opacity = 0.7 - (Math.sin(t.current * 2) * 0.5 + 0.5) * 0.5;
    }
  });

  return (
    <group ref={groupRef}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.14, 0.42, 8]} />
        <meshStandardMaterial color="#00d4ff" emissive="#00d4ff" emissiveIntensity={1.4} roughness={0.1} metalness={0.5} />
      </mesh>
      <mesh position={[0, -0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.16, 20]} />
        <meshStandardMaterial color="#00d4ff" emissive="#00d4ff" emissiveIntensity={1.0} transparent opacity={0.8} />
      </mesh>
      <mesh ref={ringRef} position={[0, -0.07, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.18, 0.28, 28]} />
        <meshStandardMaterial color="#00d4ff" transparent opacity={0.6} side={THREE.DoubleSide} />
      </mesh>
      <pointLight color="#00d4ff" intensity={2.0} distance={2.0} decay={2} />
    </group>
  );
}

// ── Path trail ───────────────────────────────────
function RoverTrail({ history }) {
  if (history.length < 2) return null;
  const pts = history.map(p => new THREE.Vector3((p.x / 25) * CELL_SCALE, 0.05, (p.y / 25) * CELL_SCALE));
  const geom = new THREE.BufferGeometry().setFromPoints(pts);
  return <line geometry={geom}><lineBasicMaterial color="#00d4ff" transparent opacity={0.3} /></line>;
}

// ── Scan ring ────────────────────────────────────
function ScanRing({ rover }) {
  const ref = useRef(); const t = useRef(0); const period = 3.5;
  useFrame((_, delta) => {
    t.current = (t.current + delta) % period;
    if (!ref.current) return;
    const p = t.current / period;
    ref.current.scale.setScalar(p * 8);
    ref.current.material.opacity = (1 - p) * 0.22;
    ref.current.position.set((rover.x / 25) * CELL_SCALE, 0.02, (rover.y / 25) * CELL_SCALE);
  });
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.18, 0.22, 48]} />
      <meshStandardMaterial color="#00d4ff" transparent opacity={0.2} side={THREE.DoubleSide} />
    </mesh>
  );
}

// ── Camera follow ────────────────────────────────
function CameraFollow({ rover, orbitRef }) {
  const smooth = useRef(new THREE.Vector3());
  useFrame(() => {
    if (!orbitRef.current) return;
    const tx = (rover.x / 25) * CELL_SCALE, tz = (rover.y / 25) * CELL_SCALE;
    smooth.current.lerp(new THREE.Vector3(tx, 0, tz), 0.03);
    orbitRef.current.target.copy(smooth.current);
    orbitRef.current.update();
  });
  return null;
}

// ── Lighting ─────────────────────────────────────
function SceneLighting() {
  return (<>
    <ambientLight intensity={0.35} color="#0a1628" />
    <directionalLight position={[10, 18, 8]} intensity={0.9} castShadow shadow-mapSize={[2048, 2048]} />
    <directionalLight position={[-10, 12, -8]} intensity={0.35} color="#4477ff" />
    <pointLight position={[0, 12, 0]} intensity={0.5} color="#00d4ff" distance={40} />
    <hemisphereLight skyColor="#0a1628" groundColor="#000510" intensity={0.5} />
  </>);
}

// ── Simulate step state ──────────────────────────
let simX = 0, simY = 0, simHdg = 0, simStep = 0;

// ── Styles ───────────────────────────────────────
const mono = { fontFamily: 'var(--font-mono)' };
const glass = {
  background: 'rgba(5,11,23,0.80)', backdropFilter: 'blur(14px)',
  WebkitBackdropFilter: 'blur(14px)', border: '1px solid rgba(0,212,255,0.18)', borderRadius: 10,
};

export default function Map3D() {
  const [grid,     setGrid]    = useState({});
  const [rover,    setRover]   = useState({ x: 0, y: 0, heading: 0 });
  const [stats,    setStats]   = useState({ maxGas: 0, maxTemp: 0, minTemp: 0, maxHum: 0, cellsVisited: 0, obstacleCount: 0, totalReadings: 0 });
  const [mode,     setMode]    = useState('gas');
  const [rawLog,   setRawLog]  = useState([]);
  const [showLog,  setShowLog] = useState(true);
  const [autoSim,  setAutoSim] = useState(false);
  const [simBusy,  setSimBusy] = useState(false);
  const [pathHist, setPathHist]= useState([]);
  const orbitRef = useRef();

  useEffect(() => {
    fetch(`${SERVER}/map-state`).then(r => r.json()).then(({ grid: g, rover: r, stats: s }) => {
      if (g) setGrid(g); if (r) setRover(r); if (s) setStats(s);
    }).catch(() => {});

    const onMapUpdate = ({ grid: g, rover: r, stats: s }) => {
      if (g) setGrid(prev => ({ ...prev, ...g }));
      if (r) { setRover(r); setPathHist(prev => { const last = prev[prev.length - 1]; return (!last || last.x !== r.x || last.y !== r.y) ? [...prev, { x: r.x, y: r.y }].slice(-80) : prev; }); }
      if (s) setStats(s);
    };
    const onRaw  = e  => setRawLog(prev => [e, ...prev].slice(0, 50));
    const onReset = () => { setGrid({}); setRover({ x:0,y:0,heading:0 }); setStats({ maxGas:0,maxTemp:0,minTemp:0,maxHum:0,cellsVisited:0,obstacleCount:0,totalReadings:0 }); setRawLog([]); setPathHist([]); simX=0;simY=0;simHdg=0;simStep=0; };

    socket.on('map-update', onMapUpdate);
    socket.on('raw-data',   onRaw);
    socket.on('map-reset',  onReset);
    return () => { socket.off('map-update', onMapUpdate); socket.off('raw-data', onRaw); socket.off('map-reset', onReset); };
  }, []);

  const handleSimulate = useCallback(async () => {
    setSimBusy(true);
    simStep++;
    if (simStep % 3 === 0) simHdg = (simHdg + 90) % 360;
    const rad = simHdg * Math.PI / 180;
    simX += 100 * Math.sin(rad); simY += 100 * Math.cos(rad);
    await fetch(`${SERVER}/simulate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ x: +simX.toFixed(1), y: +simY.toFixed(1), heading: simHdg,
        temp: +(22 + Math.sin(simStep * 0.4) * 12).toFixed(1),
        humidity: +(55 + Math.cos(simStep * 0.3) * 20).toFixed(1),
        gas: Math.round(150 + Math.abs(Math.sin(simStep * 0.5)) * 400),
        obstacle: simStep % 8 === 0,
        distance: Math.round(40 + Math.random() * 160) })
    }).catch(() => {});
    setSimBusy(false);
  }, []);

  useEffect(() => {
    if (!autoSim) return;
    const id = setInterval(handleSimulate, 1500);
    return () => clearInterval(id);
  }, [autoSim, handleSimulate]);

  const handleReset = useCallback(() => {
    if (window.confirm('Reset grid?')) fetch(`${SERVER}/reset`, { method: 'POST' });
  }, []);

  const safety   = safetyOf(stats.maxGas, stats.maxTemp);
  const cellCount = Object.keys(grid).length;

  return (
    <div style={{ height: '100vh', position: 'relative', overflow: 'hidden' }}>

      {/* TOP BAR */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 30,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 16px', background: 'rgba(5,11,23,0.92)',
        borderBottom: '1px solid rgba(0,212,255,0.15)', backdropFilter: 'blur(16px)' }}>
        {/* Mode buttons */}
        <div style={{ display: 'flex', gap: 6 }}>
          {[['gas','💨 GAS'],['temp','🌡 TEMP'],['hum','💧 HUM']].map(([k, label]) => (
            <button key={k} onClick={() => setMode(k)} style={{
              ...mono, fontSize: 10, padding: '4px 12px', borderRadius: 5, cursor: 'pointer',
              border: `1px solid ${mode === k ? 'var(--accent)' : 'rgba(0,212,255,0.2)'}`,
              background: mode === k ? 'rgba(0,212,255,0.12)' : 'rgba(0,0,0,0.3)',
              color: mode === k ? 'var(--accent)' : 'rgba(0,212,255,0.4)',
              transition: 'all 0.2s',
            }}>{label}</button>
          ))}
        </div>

        {/* Status */}
        <div style={{ ...mono, fontSize: 16, color: safety.color, fontWeight: 700,
          textShadow: `0 0 10px ${safety.color}` }}>{safety.label}</div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 7 }}>
          <button onClick={() => setShowLog(v => !v)} className="btn" style={{
            border: `1px solid ${showLog ? 'var(--accent)' : 'rgba(0,212,255,0.2)'}`,
            background: showLog ? 'rgba(0,212,255,0.1)' : 'rgba(0,0,0,0.3)',
            color: showLog ? 'var(--accent)' : 'rgba(0,212,255,0.35)',
          }}>📡 LOG</button>
          <button onClick={handleSimulate} disabled={simBusy || autoSim} className="btn" style={{
            border: '1px solid rgba(82,196,26,0.4)',
            background: (simBusy || autoSim) ? 'rgba(82,196,26,0.12)' : 'rgba(82,196,26,0.06)',
            color: (simBusy || autoSim) ? 'rgba(82,196,26,0.4)' : 'rgba(82,196,26,0.7)',
            cursor: (simBusy || autoSim) ? 'not-allowed' : 'pointer',
          }}>⚡ STEP</button>
          <button onClick={() => setAutoSim(v => !v)} className="btn" style={{
            border: `1px solid ${autoSim ? 'var(--green)' : 'rgba(82,196,26,0.25)'}`,
            background: autoSim ? 'rgba(82,196,26,0.2)' : 'rgba(0,0,0,0.3)',
            color: autoSim ? 'var(--green)' : 'rgba(82,196,26,0.4)',
            boxShadow: autoSim ? '0 0 10px rgba(82,196,26,0.35)' : 'none',
            transition: 'all 0.2s',
          }}>{autoSim ? '■ STOP' : '▶ AUTO'}</button>
          <button onClick={handleReset} className="btn btn-danger">⟳ RESET</button>
        </div>
      </div>

      {/* STATS (left) */}
      <div style={{ position: 'absolute', top: 48, left: 12, zIndex: 20, display: 'flex', flexDirection: 'column', gap: 7 }}>
        {[
          ['MAX GAS',   `${stats.maxGas}`,        'ppm',  '#ffa940'],
          ['MAX TEMP',  `${stats.maxTemp}°`,       'C',    '#ff7875'],
          ['MAX HUM',   `${stats.maxHum || 0}%`,   '',     '#69c0ff'],
          ['CELLS',     cellCount,                 '',     'var(--accent)'],
          ['OBSTACLES', stats.obstacleCount || 0,  '',     '#b37feb'],
          ['READINGS',  stats.totalReadings || 0,  '',     '#36cfc9'],
        ].map(([label, value, unit, color]) => (
          <div key={label} style={{ ...glass, padding: '8px 12px', borderLeft: `2px solid ${color}`, minWidth: 100 }}>
            <div style={{ ...mono, fontSize: 8, color: 'rgba(140,180,220,0.4)', letterSpacing: '0.18em', marginBottom: 2 }}>{label}</div>
            <div style={{ ...mono, fontSize: 18, fontWeight: 700, color }}>
              {value}<span style={{ fontSize: 10, fontWeight: 400, marginLeft: 2, opacity: 0.7 }}>{unit}</span>
            </div>
          </div>
        ))}
      </div>

      {/* COMPASS (right) */}
      <div style={{ position: 'absolute', top: 48, right: 12, zIndex: 20, ...glass, padding: '12px 14px', textAlign: 'center' }}>
        <div style={{ ...mono, fontSize: 8, color: 'rgba(140,180,220,0.4)', letterSpacing: '0.18em', marginBottom: 6 }}>ROVER</div>
        <div style={{ position: 'relative', width: 56, height: 56, margin: '0 auto 8px' }}>
          <svg viewBox="0 0 56 56" width={56} height={56} style={{ opacity: 0.5 }}>
            <circle cx="28" cy="28" r="26" fill="none" stroke="rgba(0,212,255,0.5)" strokeWidth="1" />
            {['N','E','S','W'].map((d, i) => (
              <text key={d} x={28 + 18 * Math.sin(i * Math.PI / 2)} y={32 - 18 * Math.cos(i * Math.PI / 2)}
                textAnchor="middle" fontSize="7" fill="rgba(0,212,255,0.8)" fontFamily="monospace">{d}</text>
            ))}
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            transform: `rotate(${rover.heading}deg)`, transition: 'transform 0.4s ease' }}>
            <div style={{ width: 0, height: 0, borderLeft: '4px solid transparent', borderRight: '4px solid transparent',
              borderBottom: '18px solid #00d4ff', filter: 'drop-shadow(0 0 4px #00d4ff)' }} />
          </div>
        </div>
        <div style={{ ...mono, fontSize: 14, fontWeight: 700, color: 'var(--accent)' }}>{Math.round(rover.heading)}°</div>
        <div style={{ ...mono, fontSize: 8, color: 'rgba(140,180,220,0.35)', marginTop: 2 }}>
          {(rover.x / 100).toFixed(1)}m {(rover.y / 100).toFixed(1)}m
        </div>
      </div>

      {/* LOG PANEL (bottom centre) */}
      {showLog && (
        <div style={{ position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)',
          zIndex: 25, width: 480, ...glass, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '7px 12px', borderBottom: '1px solid rgba(0,212,255,0.1)',
            background: 'rgba(0,212,255,0.03)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%',
                background: rawLog.length ? 'var(--green)' : 'rgba(0,212,255,0.3)',
                boxShadow: rawLog.length ? '0 0 6px var(--green)' : 'none' }} />
              <span style={{ ...mono, fontSize: 9, color: 'rgba(140,180,220,0.55)', letterSpacing: '0.15em' }}>LIVE DATA FEED</span>
              <span style={{ ...mono, fontSize: 8, padding: '1px 6px', borderRadius: 3,
                background: 'rgba(0,212,255,0.07)', border: '1px solid rgba(0,212,255,0.18)',
                color: 'rgba(0,212,255,0.5)' }}>{rawLog.length} packets</span>
            </div>
            {rawLog[0] && <span style={{ ...mono, fontSize: 8, color: 'rgba(140,180,220,0.35)' }}>Last #{rawLog[0].id}</span>}
          </div>
          <div style={{ maxHeight: 150, overflowY: 'auto' }}>
            {rawLog.length === 0 ? (
              <div style={{ padding: '14px', textAlign: 'center', ...mono, fontSize: 10, color: 'rgba(140,180,220,0.25)' }}>
                Click ⚡ STEP or ▶ AUTO to test
              </div>
            ) : rawLog.slice(0, 6).map((entry, i) => {
              const d = entry.data;
              const isSim = entry.source === 'simulate';
              return (
                <div key={entry.id} style={{
                  display: 'flex', alignItems: 'baseline', gap: 6, padding: '4px 12px',
                  borderBottom: '1px solid rgba(0,212,255,0.05)',
                  background: i === 0 ? (isSim ? 'rgba(82,196,26,0.06)' : 'rgba(0,212,255,0.05)') : 'transparent',
                }}>
                  <span style={{ ...mono, fontSize: 8, color: 'rgba(140,180,220,0.3)', minWidth: 26 }}>#{entry.id}</span>
                  <span className={`badge ${isSim ? 'badge-sim' : 'badge-arduino'}`}>{isSim ? 'SIM' : 'ARDUINO'}</span>
                  <span style={{ ...mono, fontSize: 10, flex: 1, color: 'rgba(200,230,255,0.8)' }}>
                    <span style={{ color: '#ff7875' }}>T</span>{d.temp ?? d.temperature}°{'  '}
                    <span style={{ color: '#69c0ff' }}>H</span>{d.humidity}%{'  '}
                    <span style={{ color: '#ffa940' }}>G</span>{d.gas}{'  '}
                    <span style={{ color: '#b37feb' }}>D</span>{d.distance}cm{'  '}
                    <span style={{ color: 'rgba(0,212,255,0.4)' }}>({(+d.x).toFixed(0)},{(+d.y).toFixed(0)})</span>
                    {d.obstacle && <span style={{ color: 'var(--red)', marginLeft: 4 }}>⚠</span>}
                  </span>
                  <span style={{ ...mono, fontSize: 8, color: 'rgba(140,180,220,0.25)', whiteSpace: 'nowrap' }}>
                    {new Date(entry.ts).toLocaleTimeString()}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* LEGEND (bottom left) */}
      <div style={{ position: 'absolute', bottom: 14, left: 12, zIndex: 20, ...glass, padding: '10px 14px' }}>
        <div style={{ ...mono, fontSize: 8, color: 'rgba(140,180,220,0.4)', letterSpacing: '0.18em', marginBottom: 7 }}>LEGEND</div>
        {mode === 'gas'  && [['#00c853','Safe 0–200'],['#ffa940','Warning 200–400'],['#ff4d4f','Danger 400+']].map(([c, l]) => <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}><div style={{ width: 8, height: 8, background: c, borderRadius: 2, boxShadow: `0 0 5px ${c}` }} /><span style={{ ...mono, fontSize: 9, color: 'rgba(180,210,240,0.7)' }}>{l}</span></div>)}
        {mode === 'temp' && [['#4499ff','Cool ≤20°C'],['#ffa940','Warm ~30°C'],['#ff4d4f','Hot 45°C+']].map(([c, l]) => <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}><div style={{ width: 8, height: 8, background: c, borderRadius: 2, boxShadow: `0 0 5px ${c}` }} /><span style={{ ...mono, fontSize: 9, color: 'rgba(180,210,240,0.7)' }}>{l}</span></div>)}
        {mode === 'hum'  && [['#91d5ff','Dry 0–30%'],['#4499ff','Normal ~50%'],['#003a8c','Humid 80%+']].map(([c, l]) => <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}><div style={{ width: 8, height: 8, background: c, borderRadius: 2, boxShadow: `0 0 5px ${c}` }} /><span style={{ ...mono, fontSize: 9, color: 'rgba(180,210,240,0.7)' }}>{l}</span></div>)}
        <div style={{ borderTop: '1px solid rgba(0,212,255,0.1)', marginTop: 6, paddingTop: 6 }}>
          {[['#4a5568','Obstacle'],['#00d4ff','Rover'],['#39ff14','Origin']].map(([c,l]) => <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}><div style={{ width: 7, height: 7, background: c, borderRadius: '50%', boxShadow: `0 0 4px ${c}` }} /><span style={{ ...mono, fontSize: 9, color: 'rgba(180,210,240,0.6)' }}>{l}</span></div>)}
        </div>
      </div>

      {/* ── THREE.JS CANVAS ── */}
      <Canvas camera={{ position: [4, 6, 4], fov: 55, near: 0.05, far: 300 }}
        shadows gl={{ antialias: true, alpha: false }}
        style={{ width: '100%', height: '100%' }}
        onCreated={({ gl }) => {
          gl.setClearColor(new THREE.Color('#050b17'));
          gl.shadowMap.enabled = true;
          gl.shadowMap.type = THREE.PCFSoftShadowMap;
        }}>
        <SceneLighting />
        <Grid args={[50, 50]} position={[0, 0, 0]}
          cellColor="rgba(0,212,255,0.06)" sectionColor="rgba(0,212,255,0.14)"
          cellSize={0.25} sectionSize={1} fadeDistance={35} infiniteGrid />

        {/* Start origin */}
        <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0, 0.26, 32]} />
          <meshStandardMaterial color="#39ff14" emissive="#39ff14" emissiveIntensity={0.9} transparent opacity={0.55} />
        </mesh>

        <ScanRing rover={rover} />
        <RoverTrail history={pathHist} />

        {Object.entries(grid).map(([key, cell]) => {
          const [gx, gy] = key.split(',').map(Number);
          return <GridCell key={key} gx={gx} gy={gy} cell={cell} mode={mode} />;
        })}

        <RoverMarker rover={rover} />
        <CameraFollow rover={rover} orbitRef={orbitRef} />
        <OrbitControls ref={orbitRef} enableDamping dampingFactor={0.07} minDistance={0.5} maxDistance={80} maxPolarAngle={Math.PI / 2.05} />
      </Canvas>
    </div>
  );
}
