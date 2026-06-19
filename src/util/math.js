// Renderer-agnostic math helpers used by game logic.
export const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const TAU = Math.PI * 2;

// Wrap an angle into (-PI, PI].
export function wrapAngle(a) {
  a = a % TAU;
  if (a > Math.PI) a -= TAU;
  if (a <= -Math.PI) a += TAU;
  return a;
}

// Squared distance from point P to segment AB (objects with x,y,z). Used for
// swept projectile hit tests so fast bolts can't tunnel through targets.
export function segDistSq(p, a, b) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const apx = p.x - a.x, apy = p.y - a.y, apz = p.z - a.z;
  const abLen = abx * abx + aby * aby + abz * abz;
  let t = abLen > 0 ? (apx * abx + apy * aby + apz * abz) / abLen : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = apx - abx * t, dy = apy - aby * t, dz = apz - abz * t;
  return dx * dx + dy * dy + dz * dz;
}
