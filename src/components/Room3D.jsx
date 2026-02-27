import { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { getLightAt } from '../lib/light';

const DEFAULT_WIDTH = 900;
const DEFAULT_HEIGHT = 600;

function breath(t, ledPulseHz = 1, modulation = null) {
  const hz = Math.max(0.3, Math.min(2.5, Number(ledPulseHz) ?? 1));
  const phase = (t / 1000) * 2 * Math.PI * hz;
  const base = 0.6 + 0.2 * Math.sin(phase) + 0.15 * Math.sin(phase * 1.2 + 1) + 0.1 * Math.sin(phase * 0.8 + 2);
  if (!modulation) return Math.max(0.35, Math.min(0.95, base));
  const arousal = (
    (Number(modulation.exploration_noise) ?? 0.5) +
    (Number(modulation.social_weight) ?? 0.5) +
    (Number(modulation.light_weight) ?? 0.8)
  ) / 3;
  const depth = 0.5 + 0.5 * arousal;
  const val = 0.5 + (base - 0.5) * depth * 2;
  return Math.max(0.3, Math.min(1, val));
}

export default function Room3D({ room, bots = [], onRefresh, onBotPositionChange, getThought, getDialogue }) {
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const floorRef = useRef(null);
  const obstaclesRef = useRef([]);
  const lightsRef = useRef([]);
  const botsRef = useRef([]);
  const dragRef = useRef(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());
  const planeRef = useRef(new THREE.Plane(new THREE.Vector3(0, -1, 0), 0));
  const intersectRef = useRef(new THREE.Vector3());

  const [screenPositions, setScreenPositions] = useState([{ x: 0, y: 0 }, { x: 0, y: 0 }]);
  const frameCountRef = useRef(0);
  const sizeRef = useRef({ w: DEFAULT_WIDTH, h: DEFAULT_HEIGHT });

  useEffect(() => {
    if (!containerRef.current || !room?.bounds) return;
    const el = containerRef.current;
    const w = el.clientWidth || DEFAULT_WIDTH;
    const h = el.clientHeight || DEFAULT_HEIGHT;
    sizeRef.current = { w, h };

    const { bounds, obstacles, lights } = room;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0c);
    scene.fog = new THREE.FogExp2(0x0a0a0c, 0.00025);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(50, w / h, 1, 3000);
    camera.position.set(bounds.width / 2, bounds.height * 0.55, bounds.height / 2 + 80);
    camera.lookAt(bounds.width / 2, 0, bounds.height / 2);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.85;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const ambient = new THREE.AmbientLight(0x16161c, 0.5);
    scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xfff8ee, 0.25);
    dir.position.set(bounds.width / 2, 180, bounds.height / 2);
    dir.castShadow = true;
    dir.shadow.mapSize.width = 1024;
    dir.shadow.mapSize.height = 1024;
    dir.shadow.camera.near = 0.5;
    dir.shadow.camera.far = 400;
    dir.shadow.camera.left = -bounds.width;
    dir.shadow.camera.right = bounds.width;
    dir.shadow.camera.top = bounds.height;
    dir.shadow.camera.bottom = -bounds.height;
    scene.add(dir);

    const floorGeom = new THREE.PlaneGeometry(bounds.width, bounds.height);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x0e0e12,
      metalness: 0.02,
      roughness: 0.98,
    });
    const floor = new THREE.Mesh(floorGeom, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    floorRef.current = floor;

    obstacles.forEach(({ x, y, w, h }) => {
      const geom = new THREE.BoxGeometry(w, 10, h);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x1e1e24,
        metalness: 0.1,
        roughness: 0.9,
      });
      const box = new THREE.Mesh(geom, mat);
      box.position.set(x + w / 2, 5, y + h / 2);
      box.castShadow = true;
      box.receiveShadow = true;
      scene.add(box);
      obstaclesRef.current.push(box);
    });

    lights.forEach(({ x, y, strength, radius }) => {
      const glowGeom = new THREE.SphereGeometry(radius * 0.12, 32, 32);
      const glowMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(1, 0.98, 0.85),
        transparent: true,
        opacity: 0.4 + strength * 0.35,
      });
      const glow = new THREE.Mesh(glowGeom, glowMat);
      glow.position.set(x, 8, y);
      scene.add(glow);

      const pointLight = new THREE.PointLight(0xfff8e0, strength * 1.2, radius * 1.2, 1.5);
      pointLight.position.set(x, 12, y);
      pointLight.castShadow = true;
      pointLight.shadow.mapSize.width = 512;
      pointLight.shadow.mapSize.height = 512;
      scene.add(pointLight);

      const coreGeom = new THREE.SphereGeometry(4, 16, 16);
      const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffe8 });
      const core = new THREE.Mesh(coreGeom, coreMat);
      core.position.set(x, 8, y);
      scene.add(core);

      lightsRef.current.push({ glow, pointLight, core });
    });

    const botCount = 2;
    for (let i = 0; i < botCount; i++) {
      const geom = new THREE.SphereGeometry(18, 32, 32);
      const mat = new THREE.MeshStandardMaterial({
        color: 0xf5f5f0,
        emissive: 0xfffacd,
        emissiveIntensity: 0.35,
        metalness: 0,
        roughness: 0.7,
      });
      const sphere = new THREE.Mesh(geom, mat);
      sphere.castShadow = true;
      scene.add(sphere);
      botsRef.current.push({ mesh: sphere, material: mat });
    }

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry || !cameraRef.current || !rendererRef.current) return;
      const { width: w, height: h } = entry.contentRect;
      if (w <= 0 || h <= 0) return;
      sizeRef.current = { w, h };
      rendererRef.current.setSize(w, h);
      rendererRef.current.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      renderer.dispose();
      if (containerRef.current && renderer.domElement.parentNode) {
        containerRef.current.removeChild(renderer.domElement);
      }
      obstaclesRef.current = [];
      lightsRef.current = [];
      botsRef.current = [];
    };
  }, [room]);

  useEffect(() => {
    if (!room?.bounds || !sceneRef.current) return;
    const bounds = room.bounds;
    const camera = cameraRef.current;
    const renderer = rendererRef.current;
    if (!camera || !renderer) return;

    let rafId;
    const animate = () => {
      rafId = requestAnimationFrame(animate);
      const b = botsRef.current;
      const botMeshes = b.map((r) => r.mesh);
      const r = room;
      const botList = Array.isArray(bots) ? bots : [];

      botList.forEach((bot, i) => {
        if (!b[i]) return;
        b[i].mesh.position.set(bot.x, 18, bot.y);
        const lightLevel = r?.lights ? getLightAt(bot.x, bot.y, r.lights) : 0.3;
        const t = Date.now();
        const breathVal = breath(t, bot.ledPulseHz, bot.modulation);
        const intensity = 0.25 + lightLevel * 0.35 + breathVal * 0.35;
        b[i].material.emissiveIntensity = Math.min(0.9, intensity);
      });

      const { w, h } = sizeRef.current;
      const positions = [];
      const v = new THREE.Vector3();
      botList.forEach((bot) => {
        v.set(bot.x, 18, bot.y);
        v.project(camera);
        positions.push({
          x: (v.x * 0.5 + 0.5) * w,
          y: (1 - (v.y * 0.5 + 0.5)) * h,
        });
      });
      frameCountRef.current += 1;
      if (frameCountRef.current % 2 === 0) setScreenPositions(positions);

      renderer.render(sceneRef.current, camera);
    };
    animate();
    return () => cancelAnimationFrame(rafId);
  }, [room, bots]);

  const handlePointerDown = (e) => {
    if (!room?.bounds || !cameraRef.current || !rendererRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const rw = rect.width || 1;
    const rh = rect.height || 1;
    mouseRef.current.x = ((e.clientX - rect.left) / rw) * 2 - 1;
    mouseRef.current.y = -((e.clientY - rect.top) / rh) * 2 + 1;
    raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);
    raycasterRef.current.intersectObject(floorRef.current, false);
    const hit = raycasterRef.current.intersectObject(floorRef.current, false)[0];
    if (!hit) return;
    const wx = hit.point.x;
    const wz = hit.point.z;
    bots.forEach((bot, index) => {
      const dx = wx - bot.x;
      const dz = wz - bot.y;
      if (dx * dx + dz * dz <= 36 * 36) {
        dragRef.current = { index };
      }
    });
  };

  const handlePointerMove = (e) => {
    if (dragRef.current === null || !room?.bounds) return;
    e.preventDefault();
    const rect = containerRef.current.getBoundingClientRect();
    const rw = rect.width || 1;
    const rh = rect.height || 1;
    mouseRef.current.x = ((e.clientX - rect.left) / rw) * 2 - 1;
    mouseRef.current.y = -((e.clientY - rect.top) / rh) * 2 + 1;
    raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);
    const hit = raycasterRef.current.intersectObject(floorRef.current, false)[0];
    if (!hit) return;
    let wx = hit.point.x;
    let wz = hit.point.z;
    const { bounds } = room;
    wx = Math.max(20, Math.min(bounds.width - 20, wx));
    wz = Math.max(20, Math.min(bounds.height - 20, wz));
    onBotPositionChange?.(dragRef.current.index, { x: wx, y: wz });
  };

  const handlePointerUp = () => {
    dragRef.current = null;
  };

  const list = getDialogue?.() ?? [];

  return (
    <div className="room-monitor room-monitor--3d">
      <button type="button" className="refresh-btn" onClick={onRefresh} aria-label="换一局房间">
        换一局
      </button>
      <div
        ref={containerRef}
        className="room-canvas room-canvas--3d"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onTouchMove={(e) => { if (dragRef.current !== null) e.preventDefault(); }}
      />
      {getThought && bots.map((bot, i) => {
        const pos = screenPositions[i];
        if (!pos) return null;
        return (
          <div
            key={`thought-${i}`}
            className="thought-bubble thought-bubble--3d"
            style={{
              left: pos.x - 82,
              top: pos.y + 22,
            }}
          >
            {getThought(i) || '...'}
          </div>
        );
      })}
      {getDialogue && bots.map((bot, i) => {
        const lastFromMe = [...list].reverse().find((d) => d.from === i);
        if (!lastFromMe) return null;
        const pos = screenPositions[i];
        if (!pos) return null;
        return (
          <div
            key={`speech-${i}`}
            className="speech-bubble speech-bubble--3d"
            style={{
              left: pos.x - 70,
              top: pos.y - 54,
            }}
          >
            <p>{lastFromMe.text}</p>
          </div>
        );
      })}
    </div>
  );
}
