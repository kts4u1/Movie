// Shared 2D helpers: math, easing, deterministic noise, path smoothing, colors.
export const TAU = Math.PI * 2;
export const D2R = Math.PI / 180;
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const pulse = (x, a, b, fin, fout) => smoothstep(a - fin, a, x) * (1 - smoothstep(b, b + fout, x));
export const v = (x, y) => [x, y];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
export const mul = (a, k) => [a[0] * k, a[1] * k];
export const len = (a) => Math.hypot(a[0], a[1]);
export const norm = (a) => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; };
export const perp = (a) => [-a[1], a[0]];
export const mixv = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
// limb/sword direction convention (canvas y is down): 0 = down, 90 = forward (+x), 180 = up, -90 = back
export const dirA = (deg) => [Math.sin(deg * D2R), Math.cos(deg * D2R)];
// spine convention: 0 = straight up, positive leans forward (+x)
export const dirUp = (deg) => [Math.sin(deg * D2R), -Math.cos(deg * D2R)];

export const ease = {
  linear: (u) => u,
  in: (u) => u * u * u,
  out: (u) => 1 - Math.pow(1 - u, 3),
  inout: (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2),
  snap: (u) => 1 - Math.pow(1 - u, 5),
  over: (u) => { const c = 1.9; return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2); },
  anti: (u) => { const c = 1.7; return (c + 1) * u * u * u - c * u * u; },
};

export function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export class RNG {
  constructor(seed) { this.r = mulberry32(seed); }
  next() { return this.r(); }
  range(a, b) { return a + (b - a) * this.r(); }
  int(a, b) { return Math.floor(this.range(a, b + 1)); }
  pick(arr) { return arr[Math.floor(this.r() * arr.length)]; }
  gauss() { let u = 0; while (u === 0) u = this.r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * this.r()); }
}
export function hash1(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
export function noise1(x, seed = 0) {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return lerp(hash1(i + seed * 101.3), hash1(i + 1 + seed * 101.3), u) * 2 - 1;
}
export function fbm1(x, seed = 0, oct = 3) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < oct; i++) { s += a * noise1(x * f, seed + i * 7); f *= 2.1; a *= 0.5; } return s; }

// Catmull-Rom spline through points, drawn with beziers
export function smoothPath(p, pts, closed = true, tension = 0.5) {
  const n = pts.length;
  if (n < 2) return p;
  const g = (i) => (closed ? pts[(i + n) % n] : pts[clamp(i, 0, n - 1)]);
  p.moveTo(pts[0][0], pts[0][1]);
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = g(i - 1), p1 = g(i), p2 = g(i + 1), p3 = g(i + 2);
    const k = tension / 3 * 2;
    p.bezierCurveTo(p1[0] + (p2[0] - p0[0]) * k / 2, p1[1] + (p2[1] - p0[1]) * k / 2, p2[0] - (p3[0] - p1[0]) * k / 2, p2[1] - (p3[1] - p1[1]) * k / 2, p2[0], p2[1]);
  }
  if (closed) p.closePath();
  return p;
}
export function poly(p, pts, closed = true) {
  p.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
  if (closed) p.closePath();
  return p;
}
// capsule with different end radii
export function limbPath(p0, p1, r0, r1, p = new Path2D()) {
  const d = sub(p1, p0), L = Math.hypot(d[0], d[1]) || 1e-6;
  const nx = -d[1] / L, ny = d[0] / L, an = Math.atan2(ny, nx);
  p.moveTo(p0[0] + nx * r0, p0[1] + ny * r0);
  p.lineTo(p1[0] + nx * r1, p1[1] + ny * r1);
  p.arc(p1[0], p1[1], r1, an, an - Math.PI, true);
  p.lineTo(p0[0] - nx * r0, p0[1] - ny * r0);
  p.arc(p0[0], p0[1], r0, an + Math.PI, an, true);
  p.closePath();
  return p;
}
export function hexToRgb(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
export function rgba(hex, a = 1) { const [r, g, b] = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; }
export function mixHex(a, b, t) { const A = hexToRgb(a), B = hexToRgb(b); return `rgb(${Math.round(lerp(A[0], B[0], t))},${Math.round(lerp(A[1], B[1], t))},${Math.round(lerp(A[2], B[2], t))})`; }
// 2-bone IK; prefer = 'right' | 'left' | 'down' | 'up' picks which side the middle joint bends toward
export function ik2(a, t, l1, l2, prefer = 'right') {
  let dx = t[0] - a[0], dy = t[1] - a[1];
  let d = Math.hypot(dx, dy) || 1e-6;
  const dc = clamp(d, Math.abs(l1 - l2) + 1e-4, l1 + l2 - 1e-4);
  dx /= d; dy /= d;
  const A = (l1 * l1 - l2 * l2 + dc * dc) / (2 * dc), h = Math.sqrt(Math.max(l1 * l1 - A * A, 0));
  const mx = a[0] + dx * A, my = a[1] + dy * A;
  const j1 = [mx - dy * h, my + dx * h], j2 = [mx + dy * h, my - dx * h];
  const end = [a[0] + dx * dc, a[1] + dy * dc];
  let pick1;
  if (prefer === 'right') pick1 = j1[0] > j2[0]; else if (prefer === 'left') pick1 = j1[0] < j2[0]; else if (prefer === 'down') pick1 = j1[1] > j2[1]; else pick1 = j1[1] < j2[1];
  return { joint: pick1 ? j1 : j2, end };
}
