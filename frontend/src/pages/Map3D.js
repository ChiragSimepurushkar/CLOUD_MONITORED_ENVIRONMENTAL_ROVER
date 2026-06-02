// ══════════════════════════════════════════════════════════════
//  Map3D.js — Real Room Occupancy Grid Viewer
//  Renders Bresenham-traced rooms: walls, floors, heatmaps, trail
//  Scan ray flash + 2D minimap + replay + coverage stats
// ══════════════════════════════════════════════════════════════

import { useEffect, useRef, useState, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import * as THREE from 'three';
import { socket, SERVER } from '../App';

const M = { fontFamily: 'var(--font-mono)' };

// ── Constants ─────────────────────────────────────────────────
const CELL_CM   = 25;    // must match backend gridMap.js
const CELL_UNIT = 1.0;   // 1 Three.js unit = 25 cm

// ── Color helpers ─────────────────────────────────────────────
function gasColor(ppm) {
  if (ppm > 400) return '#ef4444';
  if (ppm > 250) return '#f59e0b';
  return '#10b981';
}
function tempColor(c) {
  if (c > 40) return '#ef4444';
  if (c > 35) return '#f59e0b';
  if (c > 30) return '#fb923c';
  return '#38bdf8';
}
function lerpColor(a, b, t) {
  const ca = new THREE.Color(a), cb = new THREE.Color(b);
  return '#' + new THREE.Color(
    ca.r + (cb.r - ca.r) * t,
    ca.g + (cb.g - ca.g) * t,
    ca.b + (cb.b - ca.b) * t
  ).getHexString();
}

// ── Wall Cell ─────────────────────────────────────────────────
function WallCell({ cx, cy, prob, hits }) {
  const confidence = Math.min(1, hits / 10);
  const height  = 0.5 + prob * 1.5;
  const opacity = Math.min(0.98, 0.25 + hits * 0.08);
  const color   = lerpColor('#1a2e44', '#3a7ab4', confidence);

  return (
    <mesh position={[cx * CELL_UNIT, height / 2, cy * CELL_UNIT]} castShadow>
      <boxGeometry args={[CELL_UNIT * 0.92, height, CELL_UNIT * 0.92]} />
      <meshStandardMaterial
        color={color}
        transparent
        opacity={opacity}
        emissive={color}
        emissiveIntensity={0.08 + confidence * 0.12}
      />
    </mesh>
  );
}

// ── Suspect Wall (unconfirmed) ─────────────────────────────────
function SuspectCell({ cx, cy }) {
  return (
    <mesh position={[cx * CELL_UNIT, 0.08, cy * CELL_UNIT]}>
      <boxGeometry args={[CELL_UNIT * 0.85, 0.16, CELL_UNIT * 0.85]} />
      <meshStandardMaterial color="#2a4a62" transparent opacity={0.35} wireframe />
    </mesh>
  );
}

// ── Free Floor Cell ────────────────────────────────────────────
function FreeCell({ cx, cy, sensorData, viewMode }) {
  let color = '#0a1e35';
  let emissive = '#0a1e35';
  let emissiveIntensity = 0.04;
  let height = 0.04;

  if (sensorData) {
    if (viewMode === 'gas' && sensorData.avgGas != null) {
      color   = gasColor(sensorData.avgGas);
      emissive = color;
      emissiveIntensity = 0.15;
      height = 0.04 + (sensorData.avgGas / 600) * 0.3;
    } else if (viewMode === 'temp' && sensorData.avgTemp != null) {
      color   = tempColor(sensorData.avgTemp);
      emissive = color;
      emissiveIntensity = 0.12;
    } else if (viewMode === 'humidity' && sensorData.avgHum != null) {
      const h = sensorData.avgHum / 100;
      color   = lerpColor('#1e3a5f', '#38bdf8', h);
      emissive = color;
      emissiveIntensity = 0.1;
    }
  }

  return (
    <mesh position={[cx * CELL_UNIT, height / 2, cy * CELL_UNIT]} receiveShadow>
      <boxGeometry args={[CELL_UNIT * 0.96, height, CELL_UNIT * 0.96]} />
      <meshStandardMaterial
        color={color}
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
        transparent
        opacity={0.85}
      />
    </mesh>
  );
}

// ── Scan Ray Flash ─────────────────────────────────────────────
function ScanRayFlash({ rays, roverPos, fading }) {
  const opacity = fading ? 0 : 0.55;
  if (!rays || rays.length === 0) return null;
  const wx = (roverPos.x / CELL_CM) * CELL_UNIT;
  const wz = (roverPos.y / CELL_CM) * CELL_UNIT;

  return (
    <group>
      {rays.map((ray, i) => {
        const servoOffset  = (ray.a || 0) - 90;
        const worldAngleDeg = ((roverPos.heading || 0) + servoOffset + 360) % 360;
        const rad = worldAngleDeg * Math.PI / 180;
        const d   = (ray.d || 100) / CELL_CM * CELL_UNIT;
        const ex  = wx + d * Math.sin(rad);
        const ez  = wz + d * Math.cos(rad);
        const points = [new THREE.Vector3(wx, 0.12, wz), new THREE.Vector3(ex, 0.12, ez)];
        const geo = new THREE.BufferGeometry().setFromPoints(points);
        return (
          <primitive key={i} object={new THREE.Line(
            geo,
            new THREE.LineBasicMaterial({ color: 0x00d4ff, transparent: true, opacity })
          )} />
        );
      })}
    </group>
  );
}

// ── Rover Model (procedural) ───────────────────────────────────
function RoverModel({ position, heading }) {
  const groupRef = useRef();

  useFrame(() => {
    if (!groupRef.current) return;
    groupRef.current.position.lerp(new THREE.Vector3(...position), 0.12);
    const currentRot = groupRef.current.rotation.y;
    const diff = ((heading - currentRot + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    groupRef.current.rotation.y += diff * 0.12;
  });

  return (
    <group ref={groupRef} position={position}>
      {/* Chassis */}
      <mesh castShadow>
        <boxGeometry args={[0.7, 0.12, 0.85]} />
        <meshStandardMaterial color="#cc1515" emissive="#cc1515" emissiveIntensity={0.25} />
      </mesh>
      {/* Wheels */}
      {[[-0.38, -0.05, 0.28], [0.38, -0.05, 0.28], [-0.38, -0.05, -0.28], [0.38, -0.05, -0.28]].map(([x, y, z], i) => (
        <mesh key={i} position={[x, y, z]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.11, 0.11, 0.09, 12]} />
          <meshStandardMaterial color="#1a1a1a" />
        </mesh>
      ))}
      {/* Arduino */}
      <mesh position={[0, 0.1, 0.05]}>
        <boxGeometry args={[0.48, 0.06, 0.55]} />
        <meshStandardMaterial color="#1a5fb4" emissive="#1a5fb4" emissiveIntensity={0.3} />
      </mesh>
      {/* Sonar pole */}
      <mesh position={[0, 0.35, 0.36]}>
        <boxGeometry args={[0.06, 0.46, 0.06]} />
        <meshStandardMaterial color="#1a3a8a" />
      </mesh>
      {/* HC-SR04 eyes */}
      {[-0.1, 0.1].map((x, i) => (
        <mesh key={i} position={[x, 0.35, 0.42]}>
          <cylinderGeometry args={[0.045, 0.045, 0.06, 10]} rotation={[Math.PI / 2, 0, 0]} />
          <meshStandardMaterial color="#e0e0e0" emissive="white" emissiveIntensity={0.6} />
        </mesh>
      ))}
      {/* Direction indicator */}
      <mesh position={[0, 0.2, 0.44]}>
        <coneGeometry args={[0.1, 0.22, 6]} />
        <meshStandardMaterial color="#00d4ff" emissive="#00d4ff" emissiveIntensity={0.9} transparent opacity={0.85} />
      </mesh>
      {/* Glow ring */}
      <mesh position={[0, -0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.45, 0.55, 32]} />
        <meshStandardMaterial color="#00d4ff" emissive="#00d4ff" emissiveIntensity={1} transparent opacity={0.35} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

// ── Path Trail ────────────────────────────────────────────────
function PathTrail({ history }) {
  const lineRef = useRef();
  useEffect(() => {
    if (!lineRef.current || !history.length) return;
    const pts = history.map(h => new THREE.Vector3(
      (h.x / CELL_CM) * CELL_UNIT, 0.06, (h.y / CELL_CM) * CELL_UNIT
    ));
    lineRef.current.geometry.setFromPoints(pts);
  }, [history]);

  return (
    <line ref={lineRef}>
      <bufferGeometry />
      <lineBasicMaterial color="#00d4ff" transparent opacity={0.45} linewidth={2} />
    </line>
  );
}

// ── Camera that can follow rover ───────────────────────────────
function CameraRig({ target, follow }) {
  const { camera } = useThree();
  const smoothTarget = useRef(new THREE.Vector3(0, 0, 0));

  useFrame(() => {
    if (!follow) return;
    const t = new THREE.Vector3(target[0], target[1], target[2]);
    smoothTarget.current.lerp(t, 0.06);
    camera.position.set(
      smoothTarget.current.x + 5,
      smoothTarget.current.y + 7,
      smoothTarget.current.z + 5
    );
    camera.lookAt(smoothTarget.current);
  });
  return null;
}

// ── 2D Minimap Canvas ─────────────────────────────────────────
function Minimap2D({ occupancy, rover, size = 180 }) {
  const canvasRef = useRef();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#030810';
    ctx.fillRect(0, 0, size, size);

    if (!occupancy || Object.keys(occupancy).length === 0) {
      ctx.fillStyle = 'rgba(0,212,255,0.2)';
      ctx.font = '10px monospace';
      ctx.fillText('No data yet', 30, size / 2);
      return;
    }

    // Find bounds
    const cells = Object.values(occupancy);
    const cxs = cells.map(c => c.cx), cys = cells.map(c => c.cy);
    const minCx = Math.min(...cxs), maxCx = Math.max(...cxs);
    const minCy = Math.min(...cys), maxCy = Math.max(...cys);
    const spanX = Math.max(maxCx - minCx + 1, 1);
    const spanY = Math.max(maxCy - minCy + 1, 1);
    const cellPx = Math.min(size / spanX, size / spanY, 16);
    const offsetX = (size - spanX * cellPx) / 2;
    const offsetY = (size - spanY * cellPx) / 2;

    cells.forEach(cell => {
      const px = offsetX + (cell.cx - minCx) * cellPx;
      const py = offsetY + (cell.cy - minCy) * cellPx;
      if (cell.type === 'wall')    ctx.fillStyle = '#3a7ab4';
      else if (cell.type === 'free')   ctx.fillStyle = 'rgba(255,255,255,0.18)';
      else if (cell.type === 'suspect') ctx.fillStyle = 'rgba(58,122,180,0.25)';
      else                              ctx.fillStyle = 'transparent';
      if (cell.type !== 'unknown') ctx.fillRect(px, py, cellPx - 1, cellPx - 1);
    });

    // Rover dot
    const rx = offsetX + ((rover.x / CELL_CM) - minCx) * cellPx + cellPx / 2;
    const ry = offsetY + ((rover.y / CELL_CM) - minCy) * cellPx + cellPx / 2;
    ctx.beginPath();
    ctx.arc(rx, ry, Math.max(3, cellPx / 2), 0, Math.PI * 2);
    ctx.fillStyle = '#00d4ff';
    ctx.fill();

    // Heading arrow
    const hdgRad = ((rover.heading || 0) * Math.PI / 180);
    ctx.beginPath();
    ctx.moveTo(rx, ry);
    ctx.lineTo(rx + Math.sin(hdgRad) * 10, ry + Math.cos(hdgRad) * 10);
    ctx.strokeStyle = '#00d4ff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }, [occupancy, rover, size]);

  return (
    <canvas ref={canvasRef} width={size} height={size}
      style={{
        position: 'absolute', bottom: 20, left: 20,
        borderRadius: 8, border: '1px solid rgba(0,212,255,0.25)',
        background: '#030810',
        boxShadow: '0 0 16px rgba(0,212,255,0.2)',
      }}
    />
  );
}

// ── 3D Scene ───────────────────────────────────────────────────
function Scene({ occupancy, sensors, rover, history, scanRays, raysVisible, viewMode, followRover }) {
  const roverWorldPos = [
    (rover.x / CELL_CM) * CELL_UNIT,
    0,
    (rover.y / CELL_CM) * CELL_UNIT,
  ];
  const roverWorldRot = -(rover.heading || 0) * Math.PI / 180;

  return (
    <>
      <ambientLight intensity={0.35} />
      <directionalLight position={[8, 12, 8]} intensity={0.7} castShadow />
      <pointLight position={[roverWorldPos[0], 2, roverWorldPos[2]]} intensity={1.2} color="#00d4ff" distance={8} />

      {/* Ground plane */}
      <mesh position={[0, -0.01, 0]} receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[80, 80]} />
        <meshStandardMaterial color="#030810" />
      </mesh>

      {/* Grid lines */}
      <Grid
        position={[0, 0, 0]}
        args={[80, 80]}
        cellSize={CELL_UNIT}
        cellThickness={0.3}
        cellColor="#0d1e38"
        sectionSize={4}
        sectionThickness={0.5}
        sectionColor="#0f2244"
        fadeDistance={60}
        infiniteGrid
      />

      {/* Occupancy cells */}
      {Object.entries(occupancy).map(([key, cell]) => {
        const sData = sensors[key] || null;
        if (cell.type === 'wall') {
          return <WallCell key={key} cx={cell.cx} cy={cell.cy} prob={cell.prob} hits={cell.hits} />;
        } else if (cell.type === 'free') {
          return <FreeCell key={key} cx={cell.cx} cy={cell.cy} sensorData={sData} viewMode={viewMode} />;
        } else if (cell.type === 'suspect') {
          return <SuspectCell key={key} cx={cell.cx} cy={cell.cy} />;
        }
        return null;
      })}

      {/* Scan ray flash */}
      <ScanRayFlash rays={raysVisible ? scanRays : []} roverPos={rover} fading={!raysVisible} />

      {/* Path trail */}
      <PathTrail history={history} />

      {/* Rover */}
      <RoverModel position={roverWorldPos} heading={roverWorldRot} />

      {/* Camera rig */}
      <CameraRig target={roverWorldPos} follow={followRover} />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
//  MAIN MAP3D COMPONENT
// ═══════════════════════════════════════════════════════════════
export default function Map3D() {
  const [occupancy,   setOccupancy]   = useState({});
  const [sensors,     setSensors]     = useState({});
  const [rover,       setRover]       = useState({ x: 0, y: 0, heading: 0 });
  const [history,     setHistory]     = useState([]);
  const [stats,       setStats]       = useState({ wallCells:0, freeCells:0, totalReadings:0, scanCount:0, maxGas:0, maxTemp:-Infinity });
  const [coverage,    setCoverage]    = useState(0);
  const [scanRays,    setScanRays]    = useState([]);
  const [raysVisible, setRaysVisible] = useState(false);
  const [viewMode,    setViewMode]    = useState('default');
  const [followRover, setFollowRover] = useState(false);
  const [log,         setLog]         = useState([]);
  const [connected,   setConnected]   = useState(socket.connected);
  const [isReplaying, setIsReplaying] = useState(false);
  const raysTimer = useRef(null);

  // Fetch initial state
  useEffect(() => {
    fetch(`${SERVER}/map-state`).then(r => r.json()).then(d => {
      if (d.occupancy) setOccupancy(d.occupancy);
      if (d.sensors)   setSensors(d.sensors);
      if (d.rover)     setRover(d.rover);
      if (d.history)   setHistory(d.history);
      if (d.stats)     setStats(d.stats);
      if (d.coverage != null) setCoverage(d.coverage);
    }).catch(() => {});

    socket.on('connect',    () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('map-update', data => {
      if (data.occupancy) setOccupancy({ ...data.occupancy });
      if (data.sensors)   setSensors({ ...data.sensors });
      if (data.rover)     setRover(data.rover);
      if (data.history)   setHistory(data.history || []);
      if (data.stats)     setStats(data.stats);
      if (data.coverage != null) setCoverage(data.coverage);

      // Flash scan rays if the update contains scan data
      if (data.lastScan && data.rover) {
        flashRays(data.lastScan, data.rover);
      }
    });

    socket.on('map-reset', () => {
      setOccupancy({}); setSensors({}); setRover({ x:0,y:0,heading:0 });
      setHistory([]); setStats({ wallCells:0, freeCells:0, totalReadings:0, scanCount:0, maxGas:0, maxTemp:-Infinity });
      setCoverage(0); setLog([]);
    });

    return () => {
      socket.off('connect'); socket.off('disconnect');
      socket.off('map-update'); socket.off('map-reset');
    };
  }, []);

  // Flash scan rays on new packet
  const flashRays = useCallback((scan, roverPos) => {
    if (!Array.isArray(scan) || scan.length === 0) return;
    setScanRays(scan);
    setRaysVisible(true);
    clearTimeout(raysTimer.current);
    raysTimer.current = setTimeout(() => setRaysVisible(false), 900);
    setLog(prev => [{
      time: new Date().toLocaleTimeString(),
      text: `Scan @ (${Math.round(roverPos.x)}, ${Math.round(roverPos.y)}) — ${scan.length} rays`,
      source: 'scan',
    }, ...prev].slice(0, 30));
  }, []);

  // Simulate a scan packet (for testing without rover)
  const doSimulate = useCallback(async (customData) => {
    const angle = Math.random() * 360;
    const body  = customData || {
      x: rover.x + Math.sin(angle * Math.PI/180) * 40,
      y: rover.y + Math.cos(angle * Math.PI/180) * 40,
      heading: (rover.heading + (Math.random() > 0.8 ? 90 : 0)) % 360,
      temp: 28 + Math.random() * 10,
      hum: 55 + Math.random() * 20,
      gas: 180 + Math.random() * 300,
    };
    try {
      await fetch(`${SERVER}/simulate`, { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(body) });
      // Flash the scan rays (matching what the /simulate endpoint sends)
      flashRays([
        {a:0,d:120},{a:15,d:130},{a:30,d:145},{a:45,d:160},
        {a:60,d:175},{a:75,d:180},{a:90,d:120},{a:105,d:130},
        {a:120,d:150},{a:135,d:140},{a:150,d:125},{a:165,d:115},{a:180,d:100}
      ], body);
    } catch(e) {}
  }, [rover, flashRays]);

  // Replay mode — uses stored scan history, falls back to auto-simulate if empty
  const doReplay = useCallback(async () => {
    setIsReplaying(true);
    try {
      const r = await fetch(`${SERVER}/replay`);
      let scans = await r.json();

      // If no real scan history yet, generate a demo room automatically
      if (!Array.isArray(scans) || scans.length === 0) {
        const demoScans = [];
        const positions = [
          {x:0,   y:0,   heading:0},
          {x:0,   y:40,  heading:0},
          {x:0,   y:80,  heading:0},
          {x:40,  y:80,  heading:90},
          {x:80,  y:80,  heading:90},
          {x:80,  y:40,  heading:180},
          {x:80,  y:0,   heading:180},
          {x:40,  y:0,   heading:270},
        ];
        positions.forEach(pos => {
          const wallDist = 100 + Math.random() * 50;
          demoScans.push({
            ...pos, temp: 28 + Math.random()*8, gas: 180 + Math.random()*250, hum: 55 + Math.random()*20,
            scan: [
              {a:0,d:wallDist-10},{a:15,d:wallDist},{a:30,d:wallDist+15},
              {a:45,d:wallDist+20},{a:60,d:wallDist+10},{a:75,d:wallDist},
              {a:90,d:wallDist-5},{a:105,d:wallDist+5},{a:120,d:wallDist+15},
              {a:135,d:wallDist+10},{a:150,d:wallDist},{a:165,d:wallDist-15},{a:180,d:wallDist-20}
            ]
          });
        });
        scans = demoScans;
      }

      // Reset map then replay each scan
      await fetch(`${SERVER}/reset`, { method: 'POST' });
      let i = 0;
      const step = () => {
        if (i >= scans.length) { setIsReplaying(false); return; }
        const scan = scans[i++];
        fetch(`${SERVER}/simulate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...scan, hum: scan.hum || 60 })
        }).then(() => {
          if (scan.scan) flashRays(scan.scan, scan);
          setTimeout(step, 400);
        }).catch(() => setTimeout(step, 400));
      };
      step();
    } catch(e) { setIsReplaying(false); }
  }, [flashRays]);

  // Export map as JSON
  const doExport = useCallback(() => {
    const data = { occupancy, sensors, rover, history, stats, coverage, exported: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `room_scan_${Date.now()}.json`; a.click();
  }, [occupancy, sensors, rover, history, stats, coverage]);

  // Reset
  const doReset = useCallback(() => {
    fetch(`${SERVER}/reset`, { method: 'POST' }).catch(() => {});
  }, []);

  const wallCount     = Object.values(occupancy).filter(c => c.type === 'wall').length;
  const freeCount     = Object.values(occupancy).filter(c => c.type === 'free').length;
  const suspectCount  = Object.values(occupancy).filter(c => c.type === 'suspect').length;
  const qualityLevel  = stats.scanCount > 20 ? 'HIGH' : stats.scanCount > 5 ? 'MED' : 'LOW';

  return (
    <div style={{ height: '100vh', position: 'relative', overflow: 'hidden', background: '#030810' }}>

      {/* ── 3D Canvas ── */}
      <Canvas shadows camera={{ position: [6, 8, 6], fov: 50, near: 0.05, far: 500 }}>
        <Scene
          occupancy={occupancy}
          sensors={sensors}
          rover={rover}
          history={history}
          scanRays={scanRays}
          raysVisible={raysVisible}
          viewMode={viewMode}
          followRover={followRover}
        />
        <OrbitControls
          enableDamping dampingFactor={0.06}
          minDistance={2} maxDistance={80}
          target={[(rover.x / CELL_CM) * CELL_UNIT, 0, (rover.y / CELL_CM) * CELL_UNIT]}
        />
      </Canvas>

      {/* ── Header bar ── */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 50,
        background: 'rgba(3,8,16,0.92)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(0,212,255,0.15)',
        display: 'flex', alignItems: 'center', padding: '0 16px', gap: 10, zIndex: 50,
      }}>
        {/* Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className={`status-dot ${connected ? 'online' : 'offline'}`} />
          <span style={{ ...M, fontSize: 9, color: connected ? 'var(--green)' : 'var(--red)' }}>
            {connected ? 'LIVE' : 'OFFLINE'}
          </span>
        </div>
        <div style={{ ...M, fontSize: 9, color: 'var(--text-dim)' }}>|</div>
        <span style={{ ...M, fontSize: 10, color: 'var(--accent)', fontWeight: 700 }}>🛰 ROOM SCANNER</span>
        <div style={{ ...M, fontSize: 9, color: 'var(--text-dim)' }}>
          Coverage: <span style={{ color: '#34d399' }}>{coverage}%</span>
          &nbsp;|&nbsp;Walls: <span style={{ color: '#3a7ab4' }}>{wallCount}</span>
          &nbsp;|&nbsp;Floor: <span style={{ color: 'rgba(255,255,255,0.5)' }}>{freeCount}</span>
          &nbsp;|&nbsp;Scans: <span style={{ color: '#a78bfa' }}>{stats.scanCount || 0}</span>
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* View mode buttons */}
        {['default', 'gas', 'temp', 'humidity'].map(mode => (
          <button key={mode} onClick={() => setViewMode(mode)} style={{
            ...M, fontSize: 8, padding: '4px 10px', borderRadius: 5, cursor: 'pointer',
            background: viewMode === mode ? 'rgba(0,212,255,0.18)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${viewMode === mode ? 'rgba(0,212,255,0.5)' : 'rgba(255,255,255,0.1)'}`,
            color: viewMode === mode ? 'var(--accent)' : 'var(--text-dim)',
            transition: 'all 0.15s',
            textTransform: 'uppercase',
          }}>{mode}</button>
        ))}

        <div style={{ ...M, fontSize: 9, color: 'rgba(255,255,255,0.1)' }}>|</div>

        {/* Action buttons */}
        <button onClick={doSimulate} style={{ ...M, fontSize: 8, padding: '4px 10px', borderRadius: 5, cursor: 'pointer',
          background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', color: 'var(--green)' }}>
          ⚡ SIMULATE
        </button>
        <button onClick={doReplay} disabled={isReplaying} style={{ ...M, fontSize: 8, padding: '4px 10px', borderRadius: 5, cursor: 'pointer',
          background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.3)', color: '#a78bfa',
          opacity: isReplaying ? 0.5 : 1 }}>
          {isReplaying ? '⏸ REPLAYING' : '▶ REPLAY'}
        </button>
        <button onClick={doExport} style={{ ...M, fontSize: 8, padding: '4px 10px', borderRadius: 5, cursor: 'pointer',
          background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', color: 'var(--orange)' }}>
          ↓ EXPORT
        </button>
        <button onClick={doReset} style={{ ...M, fontSize: 8, padding: '4px 10px', borderRadius: 5, cursor: 'pointer',
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--red)' }}>
          ↺ RESET
        </button>
        <button onClick={() => setFollowRover(f => !f)} style={{ ...M, fontSize: 8, padding: '4px 10px', borderRadius: 5, cursor: 'pointer',
          background: followRover ? 'rgba(0,212,255,0.18)' : 'rgba(255,255,255,0.04)',
          border: `1px solid ${followRover ? 'rgba(0,212,255,0.4)' : 'rgba(255,255,255,0.1)'}`,
          color: followRover ? 'var(--accent)' : 'var(--text-dim)' }}>
          📍 FOLLOW
        </button>
      </div>

      {/* ── Right stats panel ── */}
      <div style={{
        position: 'absolute', top: 58, right: 12,
        width: 200, zIndex: 40,
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        {/* Rover live */}
        <div style={{ background: 'rgba(3,8,16,0.88)', backdropFilter: 'blur(12px)',
          border: '1px solid rgba(0,212,255,0.15)', borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ ...M, fontSize: 8, color: 'var(--text-dim)', letterSpacing: '0.2em', marginBottom: 8 }}>ROVER POSITION</div>
          {[
            ['X', `${rover.x.toFixed(0)} cm`, '#38bdf8'],
            ['Y', `${rover.y.toFixed(0)} cm`, '#38bdf8'],
            ['HDG', `${(rover.heading || 0).toFixed(0)}°`, '#a78bfa'],
          ].map(([k, v, c]) => (
            <div key={k} style={{ display:'flex', justifyContent:'space-between', marginBottom: 4 }}>
              <span style={{ ...M, fontSize: 9, color: 'var(--text-dim)' }}>{k}</span>
              <span style={{ ...M, fontSize: 10, color: c, fontWeight: 600 }}>{v}</span>
            </div>
          ))}
        </div>

        {/* Map stats */}
        <div style={{ background: 'rgba(3,8,16,0.88)', backdropFilter: 'blur(12px)',
          border: '1px solid rgba(0,212,255,0.15)', borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ ...M, fontSize: 8, color: 'var(--text-dim)', letterSpacing: '0.2em', marginBottom: 8 }}>MAP STATS</div>
          {[
            ['COVERAGE', `${coverage}%`, '#34d399'],
            ['WALLS',    wallCount,       '#3a7ab4'],
            ['SUSPECT',  suspectCount,    'rgba(58,122,180,0.6)'],
            ['FLOOR',    freeCount,       'rgba(255,255,255,0.4)'],
            ['SCANS',    stats.scanCount || 0, '#a78bfa'],
            ['READS',    stats.totalReadings||0, '#06b6d4'],
          ].map(([k, v, c]) => (
            <div key={k} style={{ display:'flex', justifyContent:'space-between', marginBottom: 4 }}>
              <span style={{ ...M, fontSize: 9, color: 'var(--text-dim)' }}>{k}</span>
              <span style={{ ...M, fontSize: 10, color: c, fontWeight: 600 }}>{v}</span>
            </div>
          ))}
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(0,212,255,0.08)' }}>
            <div style={{ ...M, fontSize: 8, color: 'var(--text-dim)', marginBottom: 3 }}>SCAN QUALITY</div>
            <div style={{ ...M, fontSize: 10, fontWeight: 700,
              color: qualityLevel==='HIGH' ? '#10b981' : qualityLevel==='MED' ? '#f59e0b' : '#6b7280' }}>
              {qualityLevel}
            </div>
          </div>
        </div>

        {/* Sensor peaks */}
        <div style={{ background: 'rgba(3,8,16,0.88)', backdropFilter: 'blur(12px)',
          border: '1px solid rgba(0,212,255,0.15)', borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ ...M, fontSize: 8, color: 'var(--text-dim)', letterSpacing: '0.2em', marginBottom: 8 }}>SENSOR PEAKS</div>
          {[
            ['MAX GAS',  stats.maxGas ? `${stats.maxGas} ppm` : '—', '#fb923c'],
            ['MAX TEMP', stats.maxTemp !== -Infinity ? `${stats.maxTemp}°C` : '—', '#f87171'],
            ['MIN TEMP', stats.minTemp !== Infinity  ? `${stats.minTemp}°C` : '—', '#38bdf8'],
            ['MAX HUM',  stats.maxHum ? `${stats.maxHum}%` : '—', '#a78bfa'],
          ].map(([k, v, c]) => (
            <div key={k} style={{ display:'flex', justifyContent:'space-between', marginBottom: 4 }}>
              <span style={{ ...M, fontSize: 9, color: 'var(--text-dim)' }}>{k}</span>
              <span style={{ ...M, fontSize: 10, color: c, fontWeight: 600 }}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Legend ── */}
      <div style={{
        position: 'absolute', bottom: 20, right: 12,
        background: 'rgba(3,8,16,0.88)', backdropFilter: 'blur(12px)',
        border: '1px solid rgba(0,212,255,0.15)', borderRadius: 10, padding: '10px 14px',
        zIndex: 40, minWidth: 130,
      }}>
        <div style={{ ...M, fontSize: 8, color: 'var(--text-dim)', letterSpacing: '0.2em', marginBottom: 8 }}>LEGEND</div>
        {[
          ['Wall (confirmed)', '#3a7ab4'],
          ['Wall (suspect)',   'rgba(58,122,180,0.4)'],
          ['Free floor',       'rgba(255,255,255,0.2)'],
          ['Rover trail',      '#00d4ff'],
          ['Scan rays',        'rgba(0,212,255,0.5)'],
        ].map(([label, color]) => (
          <div key={label} style={{ display:'flex', alignItems:'center', gap: 8, marginBottom: 5 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0 }} />
            <span style={{ ...M, fontSize: 8, color: 'var(--text-dim)' }}>{label}</span>
          </div>
        ))}
        {viewMode !== 'default' && (
          <>
            <div style={{ borderTop: '1px solid rgba(0,212,255,0.08)', margin: '6px 0', paddingTop: 6 }}>
              <div style={{ ...M, fontSize: 8, color: 'var(--text-dim)', marginBottom: 4 }}>
                HEATMAP ({viewMode.toUpperCase()})
              </div>
              {['#10b981', '#f59e0b', '#ef4444'].map((c, i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap: 8, marginBottom: 3 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: c, flexShrink: 0 }} />
                  <span style={{ ...M, fontSize: 8, color: 'var(--text-dim)' }}>
                    {i===0 ? 'Safe/Low' : i===1 ? 'Warning' : 'Danger/High'}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Scan ray log ── */}
      <div style={{
        position: 'absolute', bottom: 20, left: 220,
        width: 280, zIndex: 40,
        background: 'rgba(3,8,16,0.85)', backdropFilter: 'blur(12px)',
        border: '1px solid rgba(0,212,255,0.12)', borderRadius: 10, padding: '10px 14px',
        maxHeight: 160, overflowY: 'auto',
      }}>
        <div style={{ ...M, fontSize: 8, color: 'var(--text-dim)', letterSpacing: '0.2em', marginBottom: 8 }}>📡 SCAN LOG</div>
        {log.length === 0 ? (
          <div style={{ ...M, fontSize: 9, color: 'var(--text-dim)' }}>No scans yet — press ⚡ SIMULATE or start rover</div>
        ) : log.map((entry, i) => (
          <div key={i} style={{ ...M, fontSize: 8, color: i === 0 ? 'var(--accent)' : 'var(--text-dim)',
            marginBottom: 4, display: 'flex', gap: 8 }}>
            <span style={{ opacity: 0.5, flexShrink: 0 }}>{entry.time}</span>
            <span>{entry.text}</span>
          </div>
        ))}
      </div>

      {/* ── 2D Minimap ── */}
      <Minimap2D occupancy={occupancy} rover={rover} size={190} />

      {/* ── Minimap label ── */}
      <div style={{
        position: 'absolute', bottom: 215, left: 20,
        ...M, fontSize: 8, color: 'var(--text-dim)', letterSpacing: '0.15em',
      }}>TOP-DOWN MAP</div>

      {/* ── Compass ── */}
      <div style={{
        position: 'absolute', top: 60, left: 12,
        background: 'rgba(3,8,16,0.88)', backdropFilter: 'blur(12px)',
        border: '1px solid rgba(0,212,255,0.15)', borderRadius: '50%',
        width: 52, height: 52, zIndex: 40,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column',
      }}>
        <div style={{ fontSize: 18 }}>🧭</div>
        <div style={{ ...M, fontSize: 7, color: '#a78bfa' }}>
          {(rover.heading || 0).toFixed(0)}°
        </div>
      </div>

    </div>
  );
}
