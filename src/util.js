// Small math / animation helpers shared by every module.
import * as THREE from 'three';

export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const easeOutCubic = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
export const easeInCubic = (t) => Math.pow(clamp(t, 0, 1), 3);
export const pulse = (x, a, b, fadeIn, fadeOut) =>
  smoothstep(a - fadeIn, a, x) * (1 - smoothstep(b, b + fadeOut, x));
export const DEG = Math.PI / 180;

export function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
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
  // uniform direction on sphere
  dir(out = new THREE.Vector3()) {
    const u = this.range(-1, 1), th = this.range(0, Math.PI * 2);
    const s = Math.sqrt(1 - u * u);
    return out.set(s * Math.cos(th), u, s * Math.sin(th));
  }
  gauss() {
    let u = 0, v = 0;
    while (u === 0) u = this.r();
    v = this.r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
}

// smooth 1D value noise in [-1,1]
function hash1(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}
export function noise1(x, seed = 0) {
  const i = Math.floor(x), f = x - i;
  const u = f * f * (3 - 2 * f);
  return lerp(hash1(i + seed * 101.3), hash1(i + 1 + seed * 101.3), u) * 2 - 1;
}

// 2D value noise + fbm (used for procedural textures)
function hash2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
export function noise2(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uy);
}
export function fbm2(x, y, oct = 5) {
  let v = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) {
    v += a * noise2(x * f, y * f);
    f *= 2.03;
    a *= 0.5;
  }
  return v;
}
// tileable fbm on a torus domain (period p)
export function fbmTile(x, y, p, oct = 5) {
  let v = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) {
    const per = p * f;
    const xi = x * f, yi = y * f;
    const ix = Math.floor(xi), iy = Math.floor(yi);
    const fx = xi - ix, fy = yi - iy;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    const m = (k) => ((k % per) + per) % per;
    const h = (X, Y) => hash2(m(X) + i * 17, m(Y) + i * 31);
    const n = lerp(lerp(h(ix, iy), h(ix + 1, iy), ux), lerp(h(ix, iy + 1), h(ix + 1, iy + 1), ux), uy);
    v += a * n;
    f *= 2;
    a *= 0.5;
  }
  return v;
}

/**
 * Keyframe track with Hermite interpolation (non-uniform Catmull-Rom tangents).
 * keys: {t, v:number|number[], stop?:bool (zero tangent), hold?:bool (step)}
 */
export class Track {
  constructor(dim = 3) {
    this.dim = dim;
    this.keys = [];
    this.dirty = true;
  }
  add(t, v, opts = {}) {
    const val = typeof v === 'number' ? [v] : Array.from(v);
    this.keys.push({ t, v: val, ...opts });
    this.dirty = true;
    return this;
  }
  _prep() {
    this.keys.sort((a, b) => a.t - b.t);
    const k = this.keys, n = k.length, d = this.dim;
    for (let i = 0; i < n; i++) {
      const m = new Array(d).fill(0);
      if (!k[i].stop && i > 0 && i < n - 1) {
        const dt0 = k[i].t - k[i - 1].t, dt1 = k[i + 1].t - k[i].t;
        for (let j = 0; j < d; j++) {
          const s0 = (k[i].v[j] - k[i - 1].v[j]) / Math.max(dt0, 1e-6);
          const s1 = (k[i + 1].v[j] - k[i].v[j]) / Math.max(dt1, 1e-6);
          m[j] = (s0 * dt1 + s1 * dt0) / (dt0 + dt1);
        }
      }
      k[i].m = m;
    }
    this.dirty = false;
  }
  eval(t, out) {
    if (this.dirty) this._prep();
    const k = this.keys, n = k.length, d = this.dim;
    out = out || new Array(d);
    if (n === 0) { for (let j = 0; j < d; j++) out[j] = 0; return out; }
    if (t <= k[0].t) { for (let j = 0; j < d; j++) out[j] = k[0].v[j]; return out; }
    if (t >= k[n - 1].t) { for (let j = 0; j < d; j++) out[j] = k[n - 1].v[j]; return out; }
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (k[mid].t <= t) lo = mid; else hi = mid;
    }
    const a = k[lo], b = k[hi];
    if (a.hold) { for (let j = 0; j < d; j++) out[j] = a.v[j]; return out; }
    const dt = b.t - a.t;
    const s = (t - a.t) / dt;
    if (a.linear) { for (let j = 0; j < d; j++) out[j] = lerp(a.v[j], b.v[j], s); return out; }
    const s2 = s * s, s3 = s2 * s;
    const h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
    for (let j = 0; j < d; j++) out[j] = h00 * a.v[j] + h10 * dt * a.m[j] + h01 * b.v[j] + h11 * dt * b.m[j];
    return out;
  }
  eval1(t) { return this.eval(t, this._tmp || (this._tmp = [0]))[0]; }
}

/**
 * Real-time <-> scene-time mapping (hit-stops and bullet time).
 * segments: [{r0, r1, speed, rampIn, rampOut}]
 */
export class TimeWarp {
  constructor(segments, duration) {
    this.segments = segments;
    this.dt = 1 / 2000;
    const n = Math.ceil((duration + 2) / this.dt);
    this.table = new Float64Array(n + 1);
    let s = 0;
    this.table[0] = 0;
    for (let i = 1; i <= n; i++) {
      const r = (i - 0.5) * this.dt;
      s += this.speed(r) * this.dt;
      this.table[i] = s;
    }
  }
  speed(r) {
    let sp = 1;
    for (const g of this.segments) {
      const w = smoothstep(g.r0 - g.rampIn, g.r0, r) * (1 - smoothstep(g.r1, g.r1 + g.rampOut, r));
      sp = Math.min(sp, lerp(1, g.speed, w));
    }
    return sp;
  }
  S(r) {
    if (r <= 0) return r;
    const f = r / this.dt, i = Math.floor(f);
    if (i >= this.table.length - 1) return this.table[this.table.length - 1] + (r - (this.table.length - 1) * this.dt);
    return lerp(this.table[i], this.table[i + 1], f - i);
  }
  R(s) {
    if (s <= 0) return s;
    let lo = 0, hi = this.table.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.table[mid] <= s) lo = mid; else hi = mid;
    }
    const a = this.table[lo], b = this.table[hi];
    return (lo + (s - a) / Math.max(b - a, 1e-9)) * this.dt;
  }
}

// orient an object so its +Y axis runs from A to B, with +Z biased toward ref
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _m = new THREE.Matrix4();
export function basisQuat(yDir, zRef, out = new THREE.Quaternion()) {
  _y.copy(yDir).normalize();
  _z.copy(zRef).addScaledVector(_y, -zRef.dot(_y));
  if (_z.lengthSq() < 1e-8) {
    _z.set(0, 0, 1).addScaledVector(_y, -_y.z);
    if (_z.lengthSq() < 1e-8) _z.set(1, 0, 0).addScaledVector(_y, -_y.x);
  }
  _z.normalize();
  _x.crossVectors(_y, _z);
  _m.makeBasis(_x, _y, _z);
  return out.setFromRotationMatrix(_m);
}

export function v3(a) { return new THREE.Vector3(a[0], a[1], a[2]); }
