/**
 * Tiny 2D physics for the 404 glyphs: gravity, bounces off the playground edges,
 * floor friction and circle collisions between the glyphs. Units are px and seconds;
 * x/y is the body's center.
 */
export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  /** Held by the pointer: follows it and ignores gravity. */
  held: boolean;
}

export interface Bounds {
  width: number;
  height: number;
}

const GRAVITY = 2600;
const RESTITUTION = 0.45;
/** Below this impact speed a bounce stops instead of jittering on the floor. */
const BOUNCE_STOP = 120;
const FLOOR_FRICTION = 5;
const REST_SPEED = 8;
export const MAX_SPEED = 4000;
/** Longest step simulated at once, so a slow frame cannot tunnel through edges. */
const MAX_DT = 1 / 30;

function clampSpeed(body: Body): void {
  const speed = Math.hypot(body.vx, body.vy);
  if (speed <= MAX_SPEED) return;
  body.vx *= MAX_SPEED / speed;
  body.vy *= MAX_SPEED / speed;
}

function moveBody(body: Body, bounds: Bounds, dt: number): void {
  body.vy += GRAVITY * dt;
  clampSpeed(body);
  body.x += body.vx * dt;
  body.y += body.vy * dt;

  if (body.x - body.r < 0) {
    body.x = body.r;
    body.vx = Math.abs(body.vx) * RESTITUTION;
  } else if (body.x + body.r > bounds.width) {
    body.x = bounds.width - body.r;
    body.vx = -Math.abs(body.vx) * RESTITUTION;
  }

  if (body.y - body.r < 0) {
    body.y = body.r;
    body.vy = Math.abs(body.vy) * RESTITUTION;
  } else if (body.y + body.r >= bounds.height) {
    body.y = bounds.height - body.r;
    // A body already moving up (just thrown) keeps its speed.
    body.vy = body.vy > BOUNCE_STOP ? -body.vy * RESTITUTION : Math.min(body.vy, 0);
    body.vx *= Math.max(0, 1 - FLOOR_FRICTION * dt);
    if (Math.abs(body.vx) < REST_SPEED) body.vx = 0;
  }
}

function collide(a: Body, b: Body): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const distance = Math.hypot(dx, dy);
  const overlap = a.r + b.r - distance;
  if (overlap <= 0) return;

  // Coincident centers: push apart horizontally.
  const nx = distance > 0 ? dx / distance : 1;
  const ny = distance > 0 ? dy / distance : 0;
  // A held body acts as an immovable wall.
  const invA = a.held ? 0 : 1;
  const invB = b.held ? 0 : 1;
  const invSum = invA + invB;
  if (invSum === 0) return;

  a.x -= (nx * overlap * invA) / invSum;
  a.y -= (ny * overlap * invA) / invSum;
  b.x += (nx * overlap * invB) / invSum;
  b.y += (ny * overlap * invB) / invSum;

  const approaching = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (approaching >= 0) return;
  const impulse = (-(1 + RESTITUTION) * approaching) / invSum;
  a.vx -= impulse * nx * invA;
  a.vy -= impulse * ny * invA;
  b.vx += impulse * nx * invB;
  b.vy += impulse * ny * invB;
}

export function step(bodies: Body[], bounds: Bounds, dt: number): void {
  // rAF timestamps can precede the performance.now() taken when the loop woke up.
  const delta = Math.min(Math.max(dt, 0), MAX_DT);
  for (const body of bodies) {
    if (!body.held) moveBody(body, bounds, delta);
  }
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i];
      const b = bodies[j];
      if (a && b) collide(a, b);
    }
  }
}

/** On the floor or sitting on another body. */
function supported(body: Body, bodies: Body[], bounds: Bounds): boolean {
  if (body.y + body.r >= bounds.height - 1) return true;
  return bodies.some(
    (other) =>
      other !== body &&
      other.y > body.y &&
      Math.hypot(other.x - body.x, other.y - body.y) <= other.r + body.r + 1,
  );
}

/** Nothing held, moving or hanging in the air: the loop can sleep. */
export function atRest(bodies: Body[], bounds: Bounds): boolean {
  return bodies.every(
    (body) =>
      !body.held &&
      Math.abs(body.vx) < REST_SPEED &&
      Math.abs(body.vy) < REST_SPEED &&
      supported(body, bodies, bounds),
  );
}
