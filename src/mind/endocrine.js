/**
 * Endocrine & Emotion Layer.
 * Slow emotion metabolism: anxiety from time_in_darkness, social weight from encounters.
 * Outputs modulation for Instinct layer. Optional LLM integration lives here.
 */

import {
  DEFAULT_MODULATION,
  MODULATION_MIN,
  MODULATION_MAX,
  ANXIETY_DARKNESS_SCALE,
  ANXIETY_MAX_BOOST,
} from './constants';

const botState = new Map();
const modulationOverrides = new Map();

/**
 * @typedef {object} InstinctStateReport
 * @property {string} current_state
 * @property {number} time_in_darkness
 * @property {number} encounters_count
 */

/**
 * @typedef {object} Modulation
 * @property {number} exploration_noise
 * @property {number} social_weight
 * @property {number} light_weight
 */

/**
 * Get current modulation for a bot (from emotion metabolism; can be overridden by Console).
 * @param {string|number} botId
 * @param {InstinctStateReport} [stateReport] - latest report; if provided, state is updated
 * @returns {Modulation}
 */
export function getModulation(botId, stateReport) {
  if (!botState.has(botId)) {
    botState.set(botId, {
      ...DEFAULT_MODULATION,
      lastReport: null,
    });
  }
  const state = botState.get(botId);
  if (stateReport) {
    state.lastReport = stateReport;
    const anxietyBoost = Math.min(
      ANXIETY_MAX_BOOST,
      stateReport.time_in_darkness * ANXIETY_DARKNESS_SCALE
    );
    state.exploration_noise = Math.min(
      MODULATION_MAX,
      DEFAULT_MODULATION.exploration_noise + anxietyBoost
    );
    state.light_weight = Math.min(MODULATION_MAX, DEFAULT_MODULATION.light_weight + anxietyBoost * 0.5);
    if (stateReport.encounters_count > 0) {
      state.social_weight = Math.min(
        MODULATION_MAX,
        DEFAULT_MODULATION.social_weight + stateReport.encounters_count * 0.1
      );
    }
    if (stateReport.current_state === 'resting') {
      state.exploration_noise = Math.max(MODULATION_MIN, state.exploration_noise - 0.1);
    }
  }
  const base = {
    exploration_noise: clamp(state.exploration_noise),
    social_weight: clamp(state.social_weight),
    light_weight: clamp(state.light_weight),
  };
  const override = modulationOverrides.get(botId);
  return override ? { ...base, ...override } : base;
}

/**
 * Set modulation override for a bot (e.g. from Console). Takes precedence over metabolism.
 * @param {string|number} botId
 * @param {Partial<Modulation>} override
 */
export function setModulationOverride(botId, override) {
  if (!override || Object.keys(override).length === 0) {
    modulationOverrides.delete(botId);
    return;
  }
  const current = modulationOverrides.get(botId) || {};
  modulationOverrides.set(botId, { ...current, ...override });
}

/**
 * Clear override and reset to metabolism-only (e.g. "恢复自动").
 * @param {string|number} botId
 */
export function clearModulationOverride(botId) {
  modulationOverrides.delete(botId);
}

function clamp(v) {
  return Math.max(MODULATION_MIN, Math.min(MODULATION_MAX, Number(v) ?? 0.5));
}
