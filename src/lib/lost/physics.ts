/**
 * Small rigid-body physics for the 404 glyphs: square bodies that fall, spin, bounce off
 * the playground edges and knock into each other. Grabbing a body pins one of its points
 * to the pointer with a spring, so a glyph held by a corner swings and turns like a
 * pendulum. Units are px, seconds and radians; x/y is the body's center.
 */
export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  /** Angular velocity (rad/s, clockwise on screen). */
  spin: number;
  /** Half the side of the square. */
  half: number;
  /** Pointer grab: a point in body space pulled toward a target in world space. */
  grab?: { localX: number; localY: number; targetX: number; targetY: number } | undefined;
}

export interface Bounds {
  width: number;
  height: number;
}

interface Contact {
  a: Body;
  /** Undefined for the playground edges (static). */
  b: Body | undefined;
  px: number;
  py: number;
  /** Unit normal pointing from b (or the wall) into a. */
  nx: number;
  ny: number;
  depth: number;
}

const GRAVITY = 2600;
const RESTITUTION = 0.35;
/** Below this approach speed contacts do not bounce, so resting bodies settle. */
const BOUNCE_MIN = 90;
const FRICTION = 0.5;
const LINEAR_DAMPING = 0.4;
const ANGULAR_DAMPING = 1.2;
const SUBSTEP = 1 / 240;
const ITERATIONS = 6;
const SLOP = 0.5;
/** Grab spring: ~6 Hz, slightly under-damped so a held glyph sways. */
const GRAB_STIFFNESS = 1400;
const GRAB_DAMPING = 50;
export const MAX_SPEED = 4000;
const MAX_SPIN = 18;
const REST_SPEED = 6;
const REST_SPIN = 0.05;
/** Longest frame simulated at once; a stalled tab must not tunnel bodies through walls. */
const MAX_DT = 1 / 30;

// Unit mass; a uniform square's moment of inertia is m·side²/6.
const inertia = (body: Body) => (2 * body.half) ** 2 / 6;
const cross = (ax: number, ay: number, bx: number, by: number) => ax * by - ay * bx;

export function corners(body: Body): [number, number][] {
  const cos = Math.cos(body.angle) * body.half;
  const sin = Math.sin(body.angle) * body.half;
  return [
    [body.x - cos + sin, body.y - sin - cos],
    [body.x + cos + sin, body.y + sin - cos],
    [body.x + cos - sin, body.y + sin + cos],
    [body.x - cos - sin, body.y - sin + cos],
  ];
}

/** World position of a point given in body space. */
export function toWorld(body: Body, localX: number, localY: number): [number, number] {
  const cos = Math.cos(body.angle);
  const sin = Math.sin(body.angle);
  return [body.x + localX * cos - localY * sin, body.y + localX * sin + localY * cos];
}

/** Body-space position of a world point. */
export function toLocal(body: Body, x: number, y: number): [number, number] {
  const cos = Math.cos(body.angle);
  const sin = Math.sin(body.angle);
  const dx = x - body.x;
  const dy = y - body.y;
  return [dx * cos + dy * sin, -dx * sin + dy * cos];
}

function wallContacts(body: Body, bounds: Bounds, out: Contact[]): void {
  for (const [px, py] of corners(body)) {
    const wall = (nx: number, ny: number, depth: number) =>
      out.push({ a: body, b: undefined, px, py, nx, ny, depth });
    if (py > bounds.height) wall(0, -1, py - bounds.height);
    if (py < 0) wall(0, 1, -py);
    if (px < 0) wall(1, 0, -px);
    if (px > bounds.width) wall(-1, 0, px - bounds.width);
  }
}

interface Overlap {
  /** Unit normal pointing from b into a. */
  nx: number;
  ny: number;
  depth: number;
}

/** Separating-axis test for two squares: the axis of least overlap, or null. */
function overlap(a: Body, b: Body): Overlap | null {
  const axes = [a.angle, b.angle].flatMap((angle): [number, number][] => [
    [Math.cos(angle), Math.sin(angle)],
    [-Math.sin(angle), Math.cos(angle)],
  ]);
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  let best: Overlap | null = null;
  for (const [ax, ay] of axes) {
    // A square's shadow on an axis: half · (|cos θ| + |sin θ|) relative to its own sides.
    const reach = (body: Body) => {
      const along = Math.abs(Math.cos(body.angle) * ax + Math.sin(body.angle) * ay);
      const across = Math.abs(-Math.sin(body.angle) * ax + Math.cos(body.angle) * ay);
      return body.half * (along + across);
    };
    const distance = dx * ax + dy * ay;
    const depth = reach(a) + reach(b) - Math.abs(distance);
    if (depth <= 0) return null;
    if (!best || depth < best.depth) {
      const sign = distance < 0 ? -1 : 1;
      best = { nx: ax * sign, ny: ay * sign, depth };
    }
  }
  return best;
}

const insideBox = (box: Body, [x, y]: [number, number]) => {
  const [lx, ly] = toLocal(box, x, y);
  return Math.abs(lx) <= box.half + SLOP && Math.abs(ly) <= box.half + SLOP;
};

/** Contact points between two squares: corners of each one inside the other. */
function boxContacts(a: Body, b: Body, out: Contact[]): void {
  const hit = overlap(a, b);
  if (!hit) return;
  const points = [
    ...corners(a).filter((corner) => insideBox(b, corner)),
    ...corners(b).filter((corner) => insideBox(a, corner)),
  ];
  // Edges crossing with no corner inside: push at the midpoint.
  if (points.length === 0) points.push([(a.x + b.x) / 2, (a.y + b.y) / 2]);
  for (const [px, py] of points) out.push({ a, b, px, py, ...hit });
}

function findContacts(bodies: Body[], bounds: Bounds): Contact[] {
  const contacts: Contact[] = [];
  bodies.forEach((body, i) => {
    wallContacts(body, bounds, contacts);
    for (const other of bodies.slice(i + 1)) boxContacts(body, other, contacts);
  });
  return contacts;
}

function applyImpulse(body: Body, jx: number, jy: number, rx: number, ry: number): void {
  body.vx += jx;
  body.vy += jy;
  body.spin += cross(rx, ry, jx, jy) / inertia(body);
}

function solveVelocity(contact: Contact): void {
  const { a, b, px, py, nx, ny } = contact;
  const rax = px - a.x;
  const ray = py - a.y;
  const rbx = b ? px - b.x : 0;
  const rby = b ? py - b.y : 0;
  // Velocity of the contact point on a relative to b.
  const vx = a.vx - a.spin * ray - (b ? b.vx - b.spin * rby : 0);
  const vy = a.vy + a.spin * rax - (b ? b.vy + b.spin * rbx : 0);
  const vn = vx * nx + vy * ny;
  if (vn >= 0) return;

  const raN = cross(rax, ray, nx, ny);
  const rbN = cross(rbx, rby, nx, ny);
  const massN = 1 + raN ** 2 / inertia(a) + (b ? 1 + rbN ** 2 / inertia(b) : 0);
  const bounce = vn < -BOUNCE_MIN ? RESTITUTION : 0;
  const jn = (-(1 + bounce) * vn) / massN;
  applyImpulse(a, jn * nx, jn * ny, rax, ray);
  if (b) applyImpulse(b, -jn * nx, -jn * ny, rbx, rby);

  // Coulomb friction along the tangent: what makes a glyph landing on a corner tip over.
  const tx = -ny;
  const ty = nx;
  const vt = vx * tx + vy * ty;
  const raT = cross(rax, ray, tx, ty);
  const rbT = cross(rbx, rby, tx, ty);
  const massT = 1 + raT ** 2 / inertia(a) + (b ? 1 + rbT ** 2 / inertia(b) : 0);
  const jt = Math.max(-FRICTION * jn, Math.min(FRICTION * jn, -vt / massT));
  applyImpulse(a, jt * tx, jt * ty, rax, ray);
  if (b) applyImpulse(b, -jt * tx, -jt * ty, rbx, rby);
}

/** Moves bodies out of the walls and out of each other, once per wall and per pair. */
function solvePositions(bodies: Body[], bounds: Bounds): void {
  bodies.forEach((body, i) => {
    const points = corners(body);
    const xs = points.map(([x]) => x);
    const ys = points.map(([, y]) => y);
    const bottom = Math.max(...ys) - bounds.height;
    const top = -Math.min(...ys);
    const left = -Math.min(...xs);
    const right = Math.max(...xs) - bounds.width;
    if (bottom > SLOP) body.y -= (bottom - SLOP) * 0.8;
    if (top > SLOP) body.y += (top - SLOP) * 0.8;
    if (left > SLOP) body.x += (left - SLOP) * 0.8;
    if (right > SLOP) body.x -= (right - SLOP) * 0.8;

    for (const other of bodies.slice(i + 1)) {
      const hit = overlap(body, other);
      if (!hit || hit.depth <= SLOP) continue;
      const share = ((hit.depth - SLOP) * 0.8) / 2;
      body.x += hit.nx * share;
      body.y += hit.ny * share;
      other.x -= hit.nx * share;
      other.y -= hit.ny * share;
    }
  });
}

function pullGrab(body: Body, dt: number): void {
  if (!body.grab) return;
  const { localX, localY, targetX, targetY } = body.grab;
  const [px, py] = toWorld(body, localX, localY);
  const rx = px - body.x;
  const ry = py - body.y;
  const pointVx = body.vx - body.spin * ry;
  const pointVy = body.vy + body.spin * rx;
  const fx = GRAB_STIFFNESS * (targetX - px) - GRAB_DAMPING * pointVx;
  const fy = GRAB_STIFFNESS * (targetY - py) - GRAB_DAMPING * pointVy;
  applyImpulse(body, fx * dt, fy * dt, rx, ry);
}

function substep(bodies: Body[], bounds: Bounds, dt: number): void {
  for (const body of bodies) {
    body.vy += GRAVITY * dt;
    pullGrab(body, dt);
    body.vx *= 1 - LINEAR_DAMPING * dt;
    body.vy *= 1 - LINEAR_DAMPING * dt;
    body.spin *= 1 - ANGULAR_DAMPING * dt;
  }

  const contacts = findContacts(bodies, bounds);
  for (let i = 0; i < ITERATIONS; i++) contacts.forEach(solveVelocity);

  for (const body of bodies) {
    const speed = Math.hypot(body.vx, body.vy);
    if (speed > MAX_SPEED) {
      body.vx *= MAX_SPEED / speed;
      body.vy *= MAX_SPEED / speed;
    }
    body.spin = Math.max(-MAX_SPIN, Math.min(MAX_SPIN, body.spin));
    body.x += body.vx * dt;
    body.y += body.vy * dt;
    body.angle += body.spin * dt;
  }

  for (let i = 0; i < 3; i++) solvePositions(bodies, bounds);
}

export function step(bodies: Body[], bounds: Bounds, dt: number): void {
  // rAF timestamps can precede the performance.now() taken when the loop woke up.
  let remaining = Math.min(Math.max(dt, 0), MAX_DT);
  while (remaining > 1e-6) {
    const slice = Math.min(SUBSTEP, remaining);
    substep(bodies, bounds, slice);
    remaining -= slice;
  }
}

/** Nothing grabbed, moving or hanging in the air: the loop can sleep. */
export function atRest(bodies: Body[], bounds: Bounds): boolean {
  const contacts = findContacts(bodies, bounds);
  return bodies.every(
    (body) =>
      !body.grab &&
      Math.hypot(body.vx, body.vy) < REST_SPEED &&
      Math.abs(body.spin) < REST_SPIN &&
      (corners(body).some(([, py]) => py >= bounds.height - 1) ||
        contacts.some((contact) => contact.a === body || contact.b === body)),
  );
}
