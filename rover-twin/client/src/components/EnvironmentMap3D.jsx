// ═══════════════════════════════════════════════════════════
//  EnvironmentMap3D.jsx
//  Live 3D digital twin of the rover's scanned environment
//  Uses React Three Fiber + Socket.io
// ═══════════════════════════════════════════════════════════

import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text, Grid } from '@react-three/drei';
import { useEffect, useRef, useState, useMemo } from 'react';
import { io } from 'socket.io-client';
import { getTempColor, getGasColor, getHumidityColor, getCellHeight, rgbToHex, getSafetyLabel } from './colorUtils';

const SERVER_URL = 'http://localhost:3000';
const CELL_SCALE = 0.25; // 25cm = 0.25 three.js units

// ══════════════════════════════
//  Single grid cell (coloured box)
// ══════════════════════════════
function GridCell({ gx, gy, cell, mode }) {
  const meshRef = useRef();
  const prevHeightRef = useRef(0);

  const { color, height } = useMemo(() => {
    if (cell.isObstacle) {
      return { color: '#888780', height: 2.0 };
    }
    let colorRgb;
    if (mode === 'gas')      colorRgb = getGasColor(cell.avgGas || 0);
    else if (mode === 'temp') colorRgb = getTempColor(cell.avgTemp || 25);
    else                      colorRgb = getHumidityColor(cell.avgHum || 50);

    return {
      color:  rgbToHex(colorRgb),
      height: getCellHeight(cell.avgGas || 0, cell.avgTemp || 25)
    };
  }, [cell, mode]);

  // Animate height changes
  useFrame((_, delta) => {
    if (!meshRef.current) return;
    const target = height;
    const current = prevHeightRef.current;
    if (Math.abs(current - target) > 0.001) {
      const next = current + (target - current) * Math.min(1, delta * 4);
      prevHeightRef.current = next;
      meshRef.current.scale.y = next / height;
      meshRef.current.position.y = next / 2;
    }
  });

  useEffect(() => {
    prevHeightRef.current = height;
  }, []);

  return (
    <mesh
      ref={meshRef}
      position={[gx * CELL_SCALE, height / 2, gy * CELL_SCALE]}
    >
      <boxGeometry args={[CELL_SCALE * 0.92, height, CELL_SCALE * 0.92]} />
      <meshStandardMaterial
        color={color}
        transparent
        opacity={cell.isObstacle ? 0.95 : 0.82}
        roughness={0.6}
        metalness={0.1}
      />
    </mesh>
  );
}

// ══════════════════════════════
//  Animated rover marker (cyan cone)
// ══════════════════════════════
function RoverMarker({ rover }) {
  const groupRef = useRef();
  const pulseRef = useRef(0);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    pulseRef.current += delta * 2;
    const pulse = 0.9 + Math.sin(pulseRef.current) * 0.1;
    groupRef.current.scale.setScalar(pulse);
    groupRef.current.position.set(
      (rover.x / 25) * CELL_SCALE,
      0.35,
      (rover.y / 25) * CELL_SCALE
    );
    groupRef.current.rotation.y = -((rover.heading * Math.PI) / 180);
  });

  return (
    <group ref={groupRef}>
      {/* Direction cone */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.12, 0.35, 6]} />
        <meshStandardMaterial color="#00d4ff" emissive="#00d4ff" emissiveIntensity={0.4} />
      </mesh>
      {/* Base ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
        <ringGeometry args={[0.14, 0.19, 16]} />
        <meshStandardMaterial color="#00d4ff" transparent opacity={0.5} />
      </mesh>
    </group>
  );
}

// ══════════════════════════════
//  Start marker
// ══════════════════════════════
function StartMarker() {
  return (
    <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[0.18, 16]} />
      <meshStandardMaterial color="#00ff88" transparent opacity={0.6} />
    </mesh>
  );
}

// ══════════════════════════════
//  Scene lighting
// ══════════════════════════════
function SceneLighting() {
  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 15, 5]}  intensity={0.8} castShadow />
      <directionalLight position={[-8, 10, -5]} intensity={0.3} color="#4499ff" />
      <pointLight       position={[0, 8, 0]}    intensity={0.4} color="#00d4ff" />
    </>
  );
}

// ══════════════════════════════
//  Main exported component
// ══════════════════════════════
export default function EnvironmentMap3D() {
  const [grid,  setGrid]   = useState({});
  const [rover, setRover]  = useState({ x: 0, y: 0, heading: 0 });
  const [stats, setStats]  = useState({ maxGas: 0, maxTemp: 0, cellsVisited: 0 });
  const [mode,  setMode]   = useState('gas');
  const [connected, setConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);

  useEffect(() => {
    // Fetch current state immediately
    fetch(`${SERVER_URL}/map-state`)
      .then(r => r.json())
      .then(({ grid, rover, stats }) => {
        setGrid(grid || {});
        if (rover) setRover(rover);
        if (stats) setStats(stats);
      })
      .catch(() => {});

    // Live updates via Socket.io
    const socket = io(SERVER_URL);

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('map-update', ({ grid, rover, stats }) => {
      setGrid(prev => ({ ...prev, ...grid }));
      if (rover) setRover(rover);
      if (stats) setStats(stats);
      setLastUpdate(new Date());
    });

    socket.on('map-reset', () => {
      setGrid({});
      setRover({ x: 0, y: 0, heading: 0 });
      setStats({ maxGas: 0, maxTemp: 0, cellsVisited: 0 });
    });

    return () => socket.disconnect();
  }, []);

  const safety = getSafetyLabel(stats.maxGas, stats.maxTemp);
  const cellCount = Object.keys(grid).length;
  const areaCovered = (cellCount * 0.0625).toFixed(2); // 25cm² each → m²

  return (
    <div style={{ width: '100%', height: '100vh', background: '#070d1a', position: 'relative', fontFamily: 'monospace' }}>

      {/* ── Top bar ── */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 20px',
        background: 'rgba(7,13,26,0.85)',
        borderBottom: '1px solid rgba(0,212,255,0.2)',
        backdropFilter: 'blur(8px)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: connected ? '#00ff88' : '#e24b4a', boxShadow: connected ? '0 0 8px #00ff88' : '0 0 8px #e24b4a' }} />
          <span style={{ color: '#00d4ff', fontSize: 13, fontWeight: 700, letterSpacing: '0.1em' }}>
            3D ENVIRONMENTAL DIGITAL TWIN
          </span>
        </div>

        {/* Mode toggles */}
        <div style={{ display: 'flex', gap: 6 }}>
          {[['gas', '💨 Gas'], ['temp', '🌡 Temp'], ['hum', '💧 Humidity']].map(([m, label]) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                padding: '4px 12px', fontSize: 11, fontFamily: 'monospace',
                border: `1px solid ${mode === m ? '#00d4ff' : 'rgba(0,212,255,0.25)'}`,
                background: mode === m ? 'rgba(0,212,255,0.15)' : 'transparent',
                color: mode === m ? '#00d4ff' : 'rgba(0,212,255,0.5)',
                borderRadius: 4, cursor: 'pointer', transition: 'all 0.2s'
              }}
            >{label}</button>
          ))}
        </div>

        {/* Status */}
        <div style={{ fontSize: 11, color: 'rgba(0,212,255,0.6)' }}>
          {lastUpdate ? `Last update: ${lastUpdate.toLocaleTimeString()}` : 'Awaiting data...'}
        </div>
      </div>

      {/* ── Stats panel (left) ── */}
      <div style={{
        position: 'absolute', top: 56, left: 16, zIndex: 20,
        display: 'flex', flexDirection: 'column', gap: 8
      }}>
        {[
          { label: 'MAX GAS',   value: stats.maxGas,        unit: 'ppm',  color: '#ef9f27' },
          { label: 'MAX TEMP',  value: `${stats.maxTemp}°`, unit: 'C',    color: '#e24b4a' },
          { label: 'CELLS',     value: cellCount,            unit: '',     color: '#00d4ff' },
          { label: 'AREA',      value: areaCovered,          unit: 'm²',   color: '#1d9e75' },
        ].map(({ label, value, unit, color }) => (
          <div key={label} style={{
            background: 'rgba(7,13,26,0.8)',
            border: `1px solid rgba(0,212,255,0.15)`,
            borderRadius: 6, padding: '8px 12px', minWidth: 110,
            backdropFilter: 'blur(4px)'
          }}>
            <div style={{ fontSize: 9, color: 'rgba(0,212,255,0.5)', letterSpacing: '0.15em' }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color, lineHeight: 1.2 }}>
              {value}<span style={{ fontSize: 10, marginLeft: 2 }}>{unit}</span>
            </div>
          </div>
        ))}

        {/* Safety status */}
        <div style={{
          background: 'rgba(7,13,26,0.8)',
          border: `1px solid ${safety.color}`,
          borderRadius: 6, padding: '8px 12px',
          backdropFilter: 'blur(4px)'
        }}>
          <div style={{ fontSize: 9, color: 'rgba(0,212,255,0.5)', letterSpacing: '0.15em' }}>STATUS</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: safety.color }}>{safety.label}</div>
        </div>
      </div>

      {/* ── Legend (bottom left) ── */}
      <div style={{
        position: 'absolute', bottom: 20, left: 16, zIndex: 20,
        background: 'rgba(7,13,26,0.8)',
        border: '1px solid rgba(0,212,255,0.15)',
        borderRadius: 6, padding: '10px 14px',
        backdropFilter: 'blur(4px)'
      }}>
        <div style={{ fontSize: 9, color: 'rgba(0,212,255,0.5)', letterSpacing: '0.15em', marginBottom: 6 }}>LEGEND</div>
        {mode === 'gas' && (
          <>
            <LegendRow color="#1d9e75" label="Safe (0–200)" />
            <LegendRow color="#ef9f27" label="Warning (200–400)" />
            <LegendRow color="#e24b4a" label="Danger (400+)" />
          </>
        )}
        {mode === 'temp' && (
          <>
            <LegendRow color="#4499ff" label="Cool (≤20°C)" />
            <LegendRow color="#ef9f27" label="Warm (30°C)" />
            <LegendRow color="#e24b4a" label="Hot (45°C)" />
          </>
        )}
        {mode === 'hum' && (
          <>
            <LegendRow color="#a8d8ff" label="Dry (0–30%)" />
            <LegendRow color="#4499ff" label="Normal (50%)" />
            <LegendRow color="#0c447c" label="Humid (80%+)" />
          </>
        )}
        <LegendRow color="#888780" label="Obstacle / Wall" />
        <LegendRow color="#00d4ff" label="Rover position" dot />
        <LegendRow color="#00ff88" label="Start point" dot />
        <div style={{ marginTop: 6, fontSize: 9, color: 'rgba(0,212,255,0.4)' }}>
          Taller bar = higher reading
        </div>
      </div>

      {/* ── Controls hint (bottom right) ── */}
      <div style={{
        position: 'absolute', bottom: 20, right: 16, zIndex: 20,
        fontSize: 10, color: 'rgba(0,212,255,0.4)',
        background: 'rgba(7,13,26,0.8)',
        border: '1px solid rgba(0,212,255,0.1)',
        borderRadius: 6, padding: '8px 12px',
        backdropFilter: 'blur(4px)'
      }}>
        <div>🖱 Drag — rotate</div>
        <div>🖱 Scroll — zoom</div>
        <div>🖱 Right-drag — pan</div>
      </div>

      {/* ── THREE.JS CANVAS ── */}
      <Canvas
        camera={{ position: [4, 6, 4], fov: 55, near: 0.1, far: 200 }}
        shadows
        style={{ width: '100%', height: '100%' }}
      >
        <SceneLighting />

        {/* Floor grid */}
        <Grid
          args={[40, 40]}
          position={[0, 0, 0]}
          cellColor="rgba(0,212,255,0.08)"
          sectionColor="rgba(0,212,255,0.15)"
          cellSize={0.25}
          sectionSize={1}
          fadeDistance={30}
          fadeStrength={1}
          infiniteGrid
        />

        {/* Start marker */}
        <StartMarker />

        {/* Render all grid cells */}
        {Object.entries(grid).map(([key, cell]) => {
          const [gx, gy] = key.split(',').map(Number);
          return (
            <GridCell
              key={key}
              gx={gx}
              gy={gy}
              cell={cell}
              mode={mode}
            />
          );
        })}

        {/* Rover marker */}
        <RoverMarker rover={rover} />

        {/* Orbit camera controls */}
        <OrbitControls
          enableDamping
          dampingFactor={0.08}
          minDistance={1}
          maxDistance={50}
          maxPolarAngle={Math.PI / 2.1}
        />
      </Canvas>
    </div>
  );
}

function LegendRow({ color, label, dot }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
      <div style={{
        width: dot ? 8 : 10, height: dot ? 8 : 10,
        borderRadius: dot ? '50%' : 2,
        background: color,
        flexShrink: 0
      }} />
      <span style={{ fontSize: 10, color: 'rgba(200,220,240,0.7)' }}>{label}</span>
    </div>
  );
}
