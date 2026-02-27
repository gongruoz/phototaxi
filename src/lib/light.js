/**
 * Light intensity at a point (x, y) from multiple light sources.
 * Falloff: intensity drops with distance (inverse square-ish).
 */

/**
 * @param {number} x
 * @param {number} y
 * @param {Array<{x, y, strength, radius}>} lights
 * @returns {number} total light intensity in [0, 1]
 */
export function getLightAt(x, y, lights) {
  let total = 0;
  for (const l of lights) {
    const dx = x - l.x;
    const dy = y - l.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d >= l.radius) continue;
    const falloff = 1 - (d / l.radius) * (d / l.radius);
    total += l.strength * Math.max(0, falloff);
  }
  return Math.min(1, total);
}

/**
 * Sample light in 4 directions (N, E, S, W) at offset dist from (x, y).
 * @returns {{ n, e, s, w }} intensities in [0, 1]
 */
export function sampleLightDirections(x, y, lights, dist = 25) {
  return {
    n: getLightAt(x, y - dist, lights),
    e: getLightAt(x + dist, y, lights),
    s: getLightAt(x, y + dist, lights),
    w: getLightAt(x - dist, y, lights),
  };
}
