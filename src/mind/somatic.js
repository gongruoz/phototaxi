/**
 * Somatic Reflex Layer (simulation).
 * Produces sensor data frame and applies motor/LED commands.
 * Vibration is proxied by contact/collision (no physical squeeze sensor).
 */

import { pointInObstacle } from '../lib/room';
import { getLightAt, sampleLightDirections } from '../lib/light';
import {
  BOT_RADIUS,
  SAMPLE_DIST,
  RSSI_NEAR_DIST,
  RSSI_FAR_DIST,
  RSSI_NEAR,
  RSSI_FAR,
  VIBRATION_ON_CONTACT,
  VIBRATION_DECAY,
  BASE_SPEED,
} from './constants';

/**
 * Map distance to peer to RSSI-like value (closer = stronger, less negative).
 * @param {number} dist - distance in world units
 * @returns {number} RSSI proxy, roughly -90 to -50
 */
function distanceToRssi(dist) {
  if (dist <= RSSI_NEAR_DIST) return RSSI_NEAR;
  if (dist >= RSSI_FAR_DIST) return RSSI_FAR;
  const t = (dist - RSSI_NEAR_DIST) / (RSSI_FAR_DIST - RSSI_NEAR_DIST);
  return RSSI_NEAR + t * (RSSI_FAR - RSSI_NEAR);
}

/**
 * Compute vibration from contact: bot–bot or bot–obstacle at current position.
 * Uses previous vibration with decay; bumps up when in contact.
 * @param {object} bot - { x, y, vibration }
 * @param {number} botIndex
 * @param {Array} allBots
 * @param {object} room - { bounds, obstacles }
 */
export function computeVibration(bot, botIndex, allBots, room) {
  let contact = 0;
  const { obstacles } = room || {};
  const margin = BOT_RADIUS * 2;

  if (obstacles?.length) {
    for (const obs of obstacles) {
      const closestX = Math.max(obs.x, Math.min(bot.x, obs.x + obs.w));
      const closestY = Math.max(obs.y, Math.min(bot.y, obs.y + obs.h));
      const d = Math.hypot(bot.x - closestX, bot.y - closestY);
      if (d < margin) contact = Math.max(contact, 1 - d / margin);
    }
  }
  for (let i = 0; i < (allBots?.length ?? 0); i++) {
    if (i === botIndex) continue;
    const other = allBots[i];
    const d = Math.hypot(bot.x - other.x, bot.y - other.y);
    if (d < margin && d > 0) contact = Math.max(contact, 1 - d / margin);
  }

  const prev = typeof bot.vibration === 'number' ? bot.vibration : 0;
  const next = contact > 0 ? Math.max(prev, contact, VIBRATION_ON_CONTACT) : prev * VIBRATION_DECAY;
  return Math.max(0, Math.min(1, next));
}

/**
 * Somatic data frame (ESP -> Instinct).
 * @typedef {object} SomaticFrame
 * @property {number} light_gradient - left-right light difference, positive = right brighter
 * @property {number} peer_rssi - RSSI proxy from nearest peer
 * @property {number} vibration - 0..1, contact/collision proxy
 * @property {number} battery_level - 0..1
 * @property {number} [peer_broadcast_angle_diff] - when a peer is resting (broadcasting), angle to turn toward them (rad), positive = turn right
 */

/**
 * Compute one somatic data frame from current bot and environment.
 * @param {object} bot - { x, y, vibration?, ... }
 * @param {number} botIndex
 * @param {Array} allBots
 * @param {object} room - { bounds, obstacles, lights }
 * @returns {SomaticFrame}
 */
export function computeSomaticFrame(bot, botIndex, allBots, room) {
  const { bounds, obstacles, lights } = room || {};
  if (!lights?.length) {
    return {
      light_gradient: 0,
      peer_rssi: RSSI_FAR,
      vibration: computeVibration(bot, botIndex, allBots, room),
      battery_level: 0.5,
    };
  }

  const sample = sampleLightDirections(bot.x, bot.y, lights, SAMPLE_DIST);
  const e = sample.e;
  const w = sample.w;
  const sum = e + w;
  const light_gradient = sum < 0.01 ? 0 : (e - w) / (sum + 0.01);
  const clampedGradient = Math.max(-1, Math.min(1, light_gradient));

  let peer_rssi = RSSI_FAR;
  let peer_broadcast_angle_diff;
  if (allBots?.length > 1) {
    let minDist = Infinity;
    let broadcastingPeer = null;
    for (let i = 0; i < allBots.length; i++) {
      if (i === botIndex) continue;
      const other = allBots[i];
      const d = Math.hypot(bot.x - other.x, bot.y - other.y);
      if (d < minDist) minDist = d;
      if (other._lastStateReport?.current_state === 'resting') {
        broadcastingPeer = other;
      }
    }
    if (minDist < Infinity) peer_rssi = distanceToRssi(minDist);
    if (broadcastingPeer) {
      const targetAngle = Math.atan2(
        broadcastingPeer.y - bot.y,
        broadcastingPeer.x - bot.x
      );
      let diff = targetAngle - (bot.facing ?? 0);
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      peer_broadcast_angle_diff = diff;
    }
  }

  const vibration = computeVibration(bot, botIndex, allBots, room);

  const frame = {
    light_gradient: clampedGradient,
    peer_rssi,
    vibration,
    battery_level: 0.5,
  };
  if (peer_broadcast_angle_diff !== undefined) {
    frame.peer_broadcast_angle_diff = peer_broadcast_angle_diff;
  }
  return frame;
}

/**
 * Motor/LED command (Instinct -> Somatic).
 * @typedef {object} SomaticCommand
 * @property {number} forward_thrust - 0..1
 * @property {number} angular_velocity - rad/tick, positive = turn right
 * @property {number} led_pulse_hz - Hz for breath LED
 */

/**
 * Apply command to bot: update position and facing, clamp to bounds and avoid obstacles.
 * @param {object} bot - { x, y, facing, ... }
 * @param {SomaticCommand} command
 * @param {object} room - { bounds, obstacles }
 * @param {number} dtTicks - 1 for one tick
 * @returns {{ bot: object, ledPulseHz: number }} updated bot (x, y, facing, ledPulseHz) and LED frequency
 */
export function applySomaticCommand(bot, command, room, dtTicks = 1) {
  const { bounds, obstacles } = room || {};
  if (!bounds) return { bot: { ...bot, ledPulseHz: command?.led_pulse_hz ?? 1 }, ledPulseHz: command?.led_pulse_hz ?? 1 };

  const thrust = Math.max(0, Math.min(1, Number(command?.forward_thrust) ?? 0));
  const omega = Number(command?.angular_velocity) ?? 0;
  const ledPulseHz = Math.max(0.1, Math.min(3, Number(command?.led_pulse_hz) ?? 1));

  const facing = (bot.facing ?? 0) + omega * dtTicks;
  const dx = Math.cos(facing) * thrust * BASE_SPEED * dtTicks;
  const dy = Math.sin(facing) * thrust * BASE_SPEED * dtTicks;

  let nx = bot.x + dx;
  let ny = bot.y + dy;
  nx = Math.max(BOT_RADIUS, Math.min(bounds.width - BOT_RADIUS, nx));
  ny = Math.max(BOT_RADIUS, Math.min(bounds.height - BOT_RADIUS, ny));
  const hitObstacle = pointInObstacle(nx, ny, obstacles || []);
  const didNotMove = (nx === bot.x && ny === bot.y) || hitObstacle;
  if (hitObstacle) {
    nx = bot.x;
    ny = bot.y;
  }
  let nextFacing = facing;
  if (didNotMove && thrust > 0.1) {
    nextFacing = facing + (Math.random() < 0.5 ? 0.4 : -0.4);
  }

  const nextBot = {
    ...bot,
    x: nx,
    y: ny,
    facing: nextFacing,
    ledPulseHz,
  };
  return { bot: nextBot, ledPulseHz };
}
