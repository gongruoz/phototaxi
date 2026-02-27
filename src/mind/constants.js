/**
 * Shared constants for Somatic, Instinct, and Endocrine layers.
 * Tuned for simulation; ESP firmware can override per-environment.
 */

export const BOT_RADIUS = 18;

/** Somatic: sampling and physics (slower = clumsier/cuter) */
export const SAMPLE_DIST = 28;
export const STEP_TICKS = 8;
export const BASE_SPEED = 2.8;
export const UNSTUCK_STEP = 2;

/** RSSI: distance (px) -> signal strength proxy. Closer = stronger (less negative). */
export const RSSI_NEAR_DIST = 40;
export const RSSI_FAR_DIST = 300;
export const RSSI_NEAR = -50;
export const RSSI_FAR = -90;

/** Vibration: contact/collision proxy. Decay per tick. */
export const VIBRATION_ON_CONTACT = 0.85;
export const VIBRATION_DECAY = 0.92;

/** Instinct: homeostasis (resting when vibration + light high) */
export const RESTING_VIBRATION_THRESHOLD = 0.5;
export const RESTING_LIGHT_THRESHOLD = 0.4;

/** Instinct: state report interval (ticks) */
export const STATE_REPORT_INTERVAL_TICKS = 50;

/** Instinct: "dark" for time_in_darkness (getLightAt below this) */
export const DARK_LIGHT_THRESHOLD = 0.15;

/** Instinct: encounter = peer_rssi above this (e.g. -70) */
export const ENCOUNTER_RSSI_THRESHOLD = -70;

/** Endocrine: default modulation bounds */
export const DEFAULT_MODULATION = {
  exploration_noise: 0.5,
  social_weight: 0.5,
  light_weight: 0.8,
};
export const MODULATION_MIN = 0;
export const MODULATION_MAX = 1;

/** Endocrine: anxiety from time_in_darkness (seconds) -> exploration_noise boost */
export const ANXIETY_DARKNESS_SCALE = 0.015;
export const ANXIETY_MAX_BOOST = 0.4;

/** Tick interval (ms) for main loop */
export const TICK_MS = 120;
