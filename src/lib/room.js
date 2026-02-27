/**
 * Randomized room layout: bounds, obstacles, light sources.
 * All coordinates in world space (canvas will scale if needed).
 */

const CANVAS_W = 900;
const CANVAS_H = 600;
const MIN_ROOM_W = 500;
const MAX_ROOM_W = 850;
const MIN_ROOM_H = 400;
const MAX_ROOM_H = 550;
const MIN_OBSTACLES = 2;
const MAX_OBSTACLES = 5;
const MIN_LIGHTS = 1;
const MAX_LIGHTS = 4;
const OBSTACLE_MIN_SIZE = 40;
const OBSTACLE_MAX_SIZE = 120;
const LIGHT_MIN_STRENGTH = 0.4;
const LIGHT_MAX_STRENGTH = 1;
const LIGHT_MIN_RADIUS = 80;
const LIGHT_MAX_RADIUS = 180;
const PADDING = 60;

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min, max) {
  return Math.random() * (max - min) + min;
}

/**
 * Generate a random room layout.
 * @returns {{ bounds: { width, height }, obstacles: Array<{x,y,w,h}>, lights: Array<{x,y,strength,radius}> }}
 */
export function generateRoom() {
  const width = randomInt(MIN_ROOM_W, MAX_ROOM_W);
  const height = randomInt(MIN_ROOM_H, MAX_ROOM_H);
  const bounds = { width, height };

  const obstacles = [];
  const numObstacles = randomInt(MIN_OBSTACLES, MAX_OBSTACLES);
  for (let i = 0; i < numObstacles; i++) {
    const w = randomInt(OBSTACLE_MIN_SIZE, OBSTACLE_MAX_SIZE);
    const h = randomInt(OBSTACLE_MIN_SIZE, OBSTACLE_MAX_SIZE);
    const x = randomInt(PADDING, width - PADDING - w);
    const y = randomInt(PADDING, height - PADDING - h);
    obstacles.push({ x, y, w, h });
  }

  const lights = [];
  const numLights = randomInt(MIN_LIGHTS, MAX_LIGHTS);
  for (let i = 0; i < numLights; i++) {
    const x = randomInt(PADDING + 50, width - PADDING - 50);
    const y = randomInt(PADDING + 50, height - PADDING - 50);
    const strength = randomFloat(LIGHT_MIN_STRENGTH, LIGHT_MAX_STRENGTH);
    const radius = randomInt(LIGHT_MIN_RADIUS, LIGHT_MAX_RADIUS);
    lights.push({ x, y, strength, radius });
  }

  return { bounds, obstacles, lights };
}

/**
 * Check if point (px, py) is inside any obstacle.
 */
export function pointInObstacle(px, py, obstacles) {
  return obstacles.some(({ x, y, w, h }) => px >= x && px <= x + w && py >= y && py <= y + h);
}

/**
 * Find a random spawn point inside bounds and not inside obstacles.
 * @param {{ width, height }} bounds
 * @param {Array} obstacles
 * @param {number} botRadius - clear space around point
 */
export function randomSpawn(bounds, obstacles, botRadius = 30) {
  const { width, height } = bounds;
  for (let attempt = 0; attempt < 80; attempt++) {
    const x = randomInt(botRadius + PADDING, width - PADDING - botRadius);
    const y = randomInt(botRadius + PADDING, height - PADDING - botRadius);
    if (!pointInObstacle(x, y, obstacles)) return { x, y };
  }
  return { x: width / 2, y: height / 2 };
}

export const ROOM_CONSTANTS = {
  CANVAS_W,
  CANVAS_H,
  PADDING,
};
