import { useRef, useEffect } from 'react';
import { getLightAt } from '../lib/light';

const CANVAS_W = 900;
const CANVAS_H = 600;

function drawRoom(ctx, room) {
  const { bounds, obstacles, lights } = room;
  const scaleX = CANVAS_W / bounds.width;
  const scaleY = CANVAS_H / bounds.height;
  const scale = Math.min(scaleX, scaleY);
  const offsetX = (CANVAS_W - bounds.width * scale) / 2;
  const offsetY = (CANVAS_H - bounds.height * scale) / 2;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#1a1b1e';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.restore();

  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);

  const toScreen = (wx, wy) => ({
    x: offsetX + wx * scale,
    y: offsetY + wy * scale,
  });

  ctx.fillStyle = '#2d2e33';
  ctx.strokeStyle = '#4a4b52';
  ctx.lineWidth = 2 / scale;
  ctx.fillRect(0, 0, bounds.width, bounds.height);
  ctx.strokeRect(0, 0, bounds.width, bounds.height);

  obstacles.forEach(({ x, y, w, h }) => {
    ctx.fillStyle = '#3d3e44';
    ctx.strokeStyle = '#5a5b62';
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
  });

  lights.forEach(({ x, y, strength, radius }) => {
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, `rgba(255, 248, 200, ${0.3 + strength * 0.4})`);
    gradient.addColorStop(0.4, `rgba(255, 240, 180, ${0.15})`);
    gradient.addColorStop(1, 'rgba(255, 240, 180, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    ctx.fillStyle = 'rgba(255, 250, 220, 0.95)';
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.restore();
  return { scale, offsetX, offsetY };
}

function getTransform(room) {
  if (!room?.bounds) return null;
  const { bounds } = room;
  const scaleX = CANVAS_W / bounds.width;
  const scaleY = CANVAS_H / bounds.height;
  const scale = Math.min(scaleX, scaleY);
  const offsetX = (CANVAS_W - bounds.width * scale) / 2;
  const offsetY = (CANVAS_H - bounds.height * scale) / 2;
  return { scale, offsetX, offsetY, bounds };
}

/**
 * Breathing curve for LED: frequency from ledPulseHz (endocrine/instinct), depth from emotion modulation.
 * Higher arousal (anxiety/social/light weight) = more pronounced breath so LED "emotes".
 * @param {number} t - Date.now()
 * @param {number} [ledPulseHz] - breath rate (Hz), e.g. 0.6–1.5
 * @param {object} [modulation] - { exploration_noise, social_weight, light_weight } 0..1
 */
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

function drawJellyfishBot(ctx, bot, room, worldToScreen) {
  const { x: sx, y: sy } = worldToScreen(bot.x, bot.y);
  const facing = bot.facing ?? 0;
  const stepPhase = bot.stepPhase ?? 0;
  const lightLevel = room?.lights ? getLightAt(bot.x, bot.y, room.lights) : 0.3;
  const t = Date.now();
  const breathVal = breath(t, bot.ledPulseHz, bot.modulation);

  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(facing);

  const r = 18;
  const footLen = 12;
  const legAngles = [-3 * Math.PI / 4, -Math.PI / 4, Math.PI / 4, 3 * Math.PI / 4];
  const forwardPair = stepPhase === 0 ? [1, 3] : [0, 2];
  const stepBase = 5;
  const wobble = (i) => 2.2 * Math.sin(t * 0.0025 + i * 1.3) + 0.8 * Math.sin(t * 0.005 + i);

  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 1.5);
  g.addColorStop(0, 'rgba(255, 255, 255, 0.6)');
  g.addColorStop(0.45, 'rgba(255, 252, 250, 0.4)');
  g.addColorStop(0.85, 'rgba(255, 250, 248, 0.18)');
  g.addColorStop(1, 'rgba(255, 248, 245, 0.08)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  for (let i = 0; i < 4; i++) {
    const a = legAngles[i];
    const bx = Math.cos(a) * (r + 2);
    const by = Math.sin(a) * (r + 2);
    const isForward = forwardPair.includes(i);
    const stepAhead = stepBase + (isForward ? wobble(i) : -wobble(i) * 0.6);
    const fy = by + Math.sin(a) * footLen + (isForward ? -stepAhead : stepAhead);
    const fx = bx + Math.cos(a) * footLen;
    ctx.strokeStyle = 'rgba(220, 225, 240, 0.9)';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(fx, fy);
    ctx.stroke();
  }

  const ledIntensity = Math.min(1, lightLevel * 0.5 + 0.2);
  const pulse = ledIntensity * breathVal;
  const glowR = 8 + pulse * 8;
  const ledG = ctx.createRadialGradient(0, 0, 0, 0, 0, glowR);
  ledG.addColorStop(0, `rgba(255, 255, 220, ${0.35 + pulse * 0.55})`);
  ledG.addColorStop(0.5, `rgba(255, 248, 200, ${0.15 + pulse * 0.35})`);
  ledG.addColorStop(1, 'rgba(255, 240, 180, 0)');
  ctx.fillStyle = ledG;
  ctx.beginPath();
  ctx.arc(0, 0, glowR, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `rgba(255, 255, 235, ${0.65 + pulse * 0.35})`;
  ctx.beginPath();
  ctx.arc(0, 0, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

export default function RoomCanvas({ room, bots = [], onRefresh, onBotPositionChange, getThought, getDialogue }) {
  const canvasRef = useRef(null);
  const transformRef = useRef({ scale: 1, offsetX: 0, offsetY: 0 });
  const dragRef = useRef(null);

  const transform = getTransform(room);
  if (transform) transformRef.current = { ...transform, bounds: transform.bounds };

  const roomRef = useRef(room);
  const botsRef = useRef(bots);
  roomRef.current = room;
  botsRef.current = bots;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !room) return;
    const ctx = canvas.getContext('2d');

    let rafId;
    const draw = () => {
      const r = roomRef.current;
      const b = botsRef.current;
      if (!r?.bounds || !b?.length) return;
      const { scale, offsetX, offsetY, bounds } = getTransform(r) ?? transformRef.current;
      if (!bounds) return;

      drawRoom(ctx, r);
      const worldToScreen = (wx, wy) => ({
        x: offsetX + wx * scale,
        y: offsetY + wy * scale,
      });
      b.forEach((bot) => drawJellyfishBot(ctx, bot, r, worldToScreen));
      rafId = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(rafId);
  }, [room, bots]);

  const handlePointerDown = (e) => {
    const canvas = canvasRef.current;
    if (!canvas || !room) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const { scale, offsetX, offsetY, bounds } = transformRef.current;
    const wx = (sx - offsetX) / scale;
    const wy = (sy - offsetY) / scale;
    bots.forEach((bot, index) => {
      const dx = wx - bot.x;
      const dy = wy - bot.y;
      if (dx * dx + dy * dy <= 25 * 25) {
        dragRef.current = { index };
      }
    });
  };

  const handlePointerMove = (e) => {
    if (!dragRef.current || !room?.bounds) return;
    const { index } = dragRef.current;
    const rect = canvasRef.current.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const { scale, offsetX, offsetY, bounds } = transformRef.current;
    let wx = (sx - offsetX) / scale;
    let wy = (sy - offsetY) / scale;
    wx = Math.max(20, Math.min(bounds.width - 20, wx));
    wy = Math.max(20, Math.min(bounds.height - 20, wy));
    onBotPositionChange?.(index, { x: wx, y: wy });
  };

  const handlePointerUp = () => {
    dragRef.current = null;
  };

  return (
    <div className="room-monitor">
      <button type="button" className="refresh-btn" onClick={onRefresh} aria-label="换一局房间">
        换一局
      </button>
      <canvas
        ref={canvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
        className="room-canvas"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />
      {transform && getThought && bots.map((bot, i) => (
        <div
          key={`thought-${i}`}
          className="thought-bubble"
          style={{
            left: transform.offsetX + bot.x * transform.scale - 80,
            top: transform.offsetY + bot.y * transform.scale + 28,
          }}
        >
          {getThought(i) || '...'}
        </div>
      ))}
      {transform && getDialogue && bots.map((bot, i) => {
        const list = getDialogue();
        const lastFromMe = [...list].reverse().find((d) => d.from === i);
        if (!lastFromMe) return null;
        return (
          <div
            key={`speech-${i}`}
            className="speech-bubble"
            style={{
              left: transform.offsetX + bot.x * transform.scale - 70,
              top: transform.offsetY + bot.y * transform.scale - 52,
            }}
          >
            <p>{lastFromMe.text}</p>
          </div>
        );
      })}
    </div>
  );
}
