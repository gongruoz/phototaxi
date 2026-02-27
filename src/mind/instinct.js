/**
 * Instinct & Dynamics Layer.
 * Potential field: v = w1*∇L + w2*∇S + η. Homeostasis (resting). State report to Endocrine.
 */

import { getLightAt } from '../lib/light';
import {
  RESTING_VIBRATION_THRESHOLD,
  RESTING_LIGHT_THRESHOLD,
  DARK_LIGHT_THRESHOLD,
  ENCOUNTER_RSSI_THRESHOLD,
  STATE_REPORT_INTERVAL_TICKS,
  RSSI_NEAR,
} from './constants';

/**
 * Simple deterministic noise for exploration (organic feel). Uses bot position and tick.
 * @param {number} x
 * @param {number} y
 * @param {number} t
 * @returns {number} in [-1, 1]
 */
function noise2d(x, y, t) {
  const px = Math.sin(x * 0.1 + t * 0.02) * 43758.5453;
  const py = Math.sin(y * 0.1 + t * 0.03) * 26987.1234;
  return (Math.sin(px + py) + 1) / 2;
}

/**
 * @typedef {object} SomaticFrame
 * @property {number} light_gradient
 * @property {number} peer_rssi
 * @property {number} vibration
 * @property {number} battery_level
 */

/**
 * @typedef {object} Modulation
 * @property {number} exploration_noise
 * @property {number} social_weight
 * @property {number} light_weight
 */

/**
 * @typedef {object} InstinctStateReport
 * @property {string} current_state - 'wandering' | 'homing' | 'resting'
 * @property {number} time_in_darkness - seconds
 * @property {number} encounters_count
 */

/**
 * @typedef {object} SomaticCommand
 * @property {number} forward_thrust
 * @property {number} angular_velocity
 * @property {number} led_pulse_hz
 */

/**
 * Internal per-bot instinct state (accumulators for report).
 */
const botAccumulators = new Map();

function getAccumulator(botId) {
  if (!botAccumulators.has(botId)) {
    botAccumulators.set(botId, {
      timeInDarknessTicks: 0,
      encountersCount: 0,
      lastEncounterTick: -999,
      tickCount: 0,
    });
  }
  return botAccumulators.get(botId);
}

/**
 * Run one instinct tick: potential field + homeostasis -> command and state report.
 * @param {string|number} botId
 * @param {SomaticFrame} frame
 * @param {Modulation} modulation
 * @param {object} context - { lightAtBot, tickIndex }
 * @returns {{ command: SomaticCommand, stateReport: InstinctStateReport }}
 */
export function instinctTick(botId, frame, modulation, context = {}) {
  const { lightAtBot = 0, tickIndex = 0 } = context;
  const acc = getAccumulator(botId);
  acc.tickCount += 1;

  const w1 = Number(modulation?.light_weight) ?? 0.8;
  const w2 = Number(modulation?.social_weight) ?? 0.5;
  const noiseScale = Number(modulation?.exploration_noise) ?? 0.5;

  const vibration = frame.vibration ?? 0;
  const lightGradient = frame.light_gradient ?? 0;
  const peerRssi = frame.peer_rssi ?? -90;
  const broadcastAngleDiff = frame.peer_broadcast_angle_diff;

  const atLightResting =
    vibration >= RESTING_VIBRATION_THRESHOLD && lightAtBot >= RESTING_LIGHT_THRESHOLD;
  const reachedBroadcastingPeer =
    broadcastAngleDiff !== undefined && broadcastAngleDiff !== null && peerRssi >= RSSI_NEAR;
  const isResting = atLightResting || reachedBroadcastingPeer;

  let current_state = 'wandering';
  if (isResting) {
    current_state = 'resting';
  } else if (broadcastAngleDiff !== undefined && broadcastAngleDiff !== null) {
    current_state = 'homing_to_peer';
  } else if (Math.abs(lightGradient) > 0.1 || lightAtBot > 0.3) {
    current_state = 'homing';
  }

  // Accumulate time in darkness
  if (lightAtBot < DARK_LIGHT_THRESHOLD) {
    acc.timeInDarknessTicks += 1;
  } else {
    acc.timeInDarknessTicks = Math.max(0, acc.timeInDarknessTicks - 2);
  }
  if (peerRssi >= ENCOUNTER_RSSI_THRESHOLD && tickIndex - acc.lastEncounterTick > 30) {
    acc.encountersCount += 1;
    acc.lastEncounterTick = tickIndex;
  }

  let forward_thrust = 0;
  let angular_velocity = 0;
  let led_pulse_hz = 1;

  if (isResting) {
    forward_thrust = 0;
    angular_velocity = 0;
    led_pulse_hz = 0.6;
  } else if (broadcastAngleDiff !== undefined && broadcastAngleDiff !== null) {
    // Seeking peer: turn toward them; damp when almost aligned to avoid spinning
    const deadZone = 0.12;
    const damped = Math.abs(broadcastAngleDiff) < deadZone ? 0 : broadcastAngleDiff * 0.35;
    angular_velocity = Math.max(-0.2, Math.min(0.2, damped));
    forward_thrust = 0.45 + w2 * 0.25;
    led_pulse_hz = 1.0 + w2 * 0.3;
  } else {
    // ∇L: only react when gradient is meaningful (dead zone to reduce spinning)
    const gradDeadZone = 0.08;
    const effectiveGrad = Math.abs(lightGradient) > gradDeadZone ? lightGradient * w1 : 0;
    const gradL = effectiveGrad;
    const peerAttract = peerRssi >= ENCOUNTER_RSSI_THRESHOLD ? w2 * 0.25 : 0;
    const etaAngular = noiseScale * (2 * noise2d(frame.light_gradient, frame.vibration, tickIndex) - 1) * 0.18;
    const etaForward = noiseScale * noise2d(frame.peer_rssi, tickIndex, 1) * 0.3;
    const wobble = 0.04 * (2 * noise2d(tickIndex, 1, 2) - 1);

    angular_velocity = gradL * 0.18 + etaAngular + wobble;
    forward_thrust = Math.min(0.9, 0.3 + peerAttract + etaForward + (Math.abs(gradL) > 0.15 ? 0.22 : 0));
    led_pulse_hz = 0.8 + (peerRssi >= ENCOUNTER_RSSI_THRESHOLD ? 0.4 : 0) + noiseScale * 0.2;
  }

  const command = {
    forward_thrust: Math.max(0, Math.min(1, forward_thrust)),
    angular_velocity: Math.max(-0.2, Math.min(0.2, angular_velocity)),
    led_pulse_hz: Math.max(0.2, Math.min(2.5, led_pulse_hz)),
  };

  const reportInterval = STATE_REPORT_INTERVAL_TICKS;
  const shouldReport = acc.tickCount % reportInterval === 0;
  const tickMs = 120;
  const time_in_darkness_sec = (acc.timeInDarknessTicks * tickMs) / 1000;

  const stateReport = {
    current_state,
    time_in_darkness: Math.round(time_in_darkness_sec),
    encounters_count: acc.encountersCount,
  };

  return { command, stateReport };
}

/**
 * Reset accumulators for a bot (e.g. on room reset).
 */
export function resetInstinctAccumulator(botId) {
  botAccumulators.delete(botId);
}
