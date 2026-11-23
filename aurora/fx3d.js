// 3D effects: camera-facing ribbons (blade trails, slash arcs, aurora spirals, the ink dragon,
// the ink wave) and instanced billboards (sparks, glows, rings, ink blots, dust, crows).
import * as THREE from 'three';

const V3 = THREE.Vector3;

const RIB_VS = /* glsl */ `
  attribute vec4 rgba; attribute vec2 uvw;
  varying vec4 vC; varying vec2 vUv;
  void main(){ vC = rgba; vUv = uvw; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }`;
const GLOW_FS = /* glsl */ `
  varying vec4 vC; varying vec2 vUv; uniform float uSoft;
  void main(){
    float e = 1.0 - abs(vUv.y * 2.0 - 1.0);
    float a = vC.a * (pow(e, 1.5 + uSoft * 2.0) * 0.75 + pow(e, 8.0) * 0.9);
    gl_FragColor = vec4(vC.rgb + vec3(pow(e, 10.0)) * 0.8 * length(vC.rgb), a);
  }`;
const INK_FS = /* glsl */ `
  varying vec4 vC; varying vec2 vUv; uniform float uSeed;
  float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float vn(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.-2.*f); return mix(mix(h12(i), h12(i+vec2(1,0)), u.x), mix(h12(i+vec2(0,1)), h12(i+vec2(1,1)), u.x), u.y); }
  void main(){
    float e = 1.0 - abs(vUv.y * 2.0 - 1.0);
    float n = vn(vec2(vUv.x * 14.0 + uSeed, vUv.y * 3.0)) * 0.6 + vn(vec2(vUv.x * 41.0 - uSeed, vUv.y * 9.0)) * 0.4;
    float a = vC.a * smoothstep(0.0, 0.12, e - n * 0.55);
    if (a < 0.01) discard;
    gl_FragColor = vec4(vC.rgb * (0.7 + 0.6 * n * e), a);
  }`;

function ribbonMaterial(kind) {
  return new THREE.ShaderMaterial({
    uniforms: { uSoft: { value: 0.5 }, uSeed: { value: 0 } },
    vertexShader: RIB_VS, fragmentShader: kind === 'glow' ? GLOW_FS : INK_FS,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: kind === 'glow' ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}

// a strip of quads rebuilt every frame
class Ribbon {
  constructor(maxN, mat, scene) {
    this.max = maxN;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(maxN * 2 * 3); this.col = new Float32Array(maxN * 2 * 4); this.uv = new Float32Array(maxN * 2 * 2);
    const idx = [];
    for (let i = 0; i < maxN - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('rgba', new THREE.BufferAttribute(this.col, 4));
    g.setAttribute('uvw', new THREE.BufferAttribute(this.uv, 2));
    g.setIndex(idx);
    this.mat = mat.clone();
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.visible = false;
    scene.add(this.mesh);
  }
  // explicit edges
  edges(A, B, colFn) {
    const n = Math.min(A.length, this.max);
    for (let i = 0; i < n; i++) {
      const u = n > 1 ? i / (n - 1) : 0, c = colFn(u, i);
      this.pos.set([A[i].x, A[i].y, A[i].z, B[i].x, B[i].y, B[i].z], i * 6);
      this.col.set([c[0], c[1], c[2], c[3], c[0], c[1], c[2], c[3]], i * 8);
      this.uv.set([u, 0, u, 1], i * 4);
    }
    this.finish(n);
  }
  // a centre line with widths; side = camera-facing unless a fixed normal is given
  line(P, widthFn, colFn, cam, normal) {
    const n = Math.min(P.length, this.max), T = new V3(), S = new V3(), V = new V3();
    for (let i = 0; i < n; i++) {
      T.subVectors(P[Math.min(i + 1, n - 1)], P[Math.max(i - 1, 0)]);
      if (normal) S.crossVectors(T, normal); else { V.subVectors(cam.position, P[i]); S.crossVectors(T, V); }
      if (S.lengthSq() < 1e-12) S.set(0, 1, 0);
      const u = n > 1 ? i / (n - 1) : 0, w = widthFn(u, i) * 0.5, c = colFn(u, i);
      S.normalize().multiplyScalar(w);
      this.pos.set([P[i].x - S.x, P[i].y - S.y, P[i].z - S.z, P[i].x + S.x, P[i].y + S.y, P[i].z + S.z], i * 6);
      this.col.set([c[0], c[1], c[2], c[3], c[0], c[1], c[2], c[3]], i * 8);
      this.uv.set([u, 0, u, 1], i * 4);
    }
    this.finish(n);
  }
  finish(n) {
    const g = this.mesh.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.rgba.needsUpdate = true; g.attributes.uvw.needsUpdate = true;
    g.setDrawRange(0, Math.max(0, (n - 1) * 6));
    this.mesh.visible = n > 1;
  }
}

class RibbonPool {
  constructor(kind, count, maxN, scene, order) {
    const base = ribbonMaterial(kind);
    this.items = Array.from({ length: count }, (_, i) => { const r = new Ribbon(maxN, base, scene); r.mesh.renderOrder = order; r.mat.uniforms.uSeed.value = i * 7.3; return r; });
    this.i = 0;
  }
  begin() { this.i = 0; for (const r of this.items) r.mesh.visible = false; }
  get() { return this.items[Math.min(this.i++, this.items.length - 1)]; }
}

// ---------------------------------------------------------------- billboards
const SPR_VS = /* glsl */ `
  attribute vec3 iPos; attribute vec2 iSize; attribute vec4 iCol; attribute vec4 iPar;
  varying vec2 vUv; varying vec4 vC; varying vec4 vPar;
  void main(){
    vec4 mv = viewMatrix * vec4(iPos, 1.0);
    float c = cos(iPar.x), s = sin(iPar.x);
    vec2 q = position.xy * iSize; q = vec2(c * q.x - s * q.y, s * q.x + c * q.y);
    mv.xy += q; vUv = position.xy; vC = iCol; vPar = iPar;
    gl_Position = projectionMatrix * mv;
  }`;
const SPR_FS = /* glsl */ `
  varying vec2 vUv; varying vec4 vC; varying vec4 vPar;
  float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float vn(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.-2.*f); return mix(mix(h12(i), h12(i+vec2(1,0)), u.x), mix(h12(i+vec2(0,1)), h12(i+vec2(1,1)), u.x), u.y); }
  float seg(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
  float segT(vec2 p, vec2 a, vec2 b, out float h){ vec2 pa = p - a, ba = b - a; h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
  void main(){
    vec2 p = vUv; float d = length(p); float a = 0.0; vec3 col = vC.rgb;
    int shape = int(vPar.y + 0.5);
    if (shape == 0) { a = exp(-d * d * 5.0) * (1.0 - smoothstep(0.85, 1.0, d)); }
    else if (shape == 1) {
      // ink crow seen from the side: body, head, beak, tail and a flapping wing pair
      float fl = sin(vPar.z), h;
      float body = length((p - vec2(0.02, 0.0)) / vec2(0.36, 0.11)) - 1.0;
      float head = length(p - vec2(0.36, 0.05)) / 0.095 - 1.0;
      float beak = seg(p, vec2(0.42, 0.05), vec2(0.6, 0.02)) / 0.03 - 1.0;
      float tail = seg(p, vec2(-0.25, 0.0), vec2(-0.56, -0.03 + fl * 0.04)) / (0.07) - 1.0;
      vec2 sh = vec2(0.08, 0.06), el = vec2(-0.05, 0.08 + fl * 0.42), tp = vec2(-0.32, 0.1 + fl * 0.88);
      float w1 = segT(p, sh, el, h) / mix(0.12, 0.09, h) - 1.0;
      float w2 = segT(p, el, tp, h) / mix(0.09, 0.02, h) - 1.0;
      vec2 el2 = vec2(0.0, 0.06 + fl * 0.3), tp2 = vec2(-0.22, 0.08 + fl * 0.6);
      float w3 = segT(p, sh, el2, h) / mix(0.09, 0.07, h) - 1.0;
      float w4 = segT(p, el2, tp2, h) / mix(0.07, 0.02, h) - 1.0;
      float sdf = min(min(min(body, head), min(beak, tail)), min(min(w1, w2), min(w3, w4)));
      float n = vn(p * 9.0 + vPar.w * 13.0);
      a = 1.0 - smoothstep(-0.15, 0.12, sdf + (n - 0.5) * 0.5);
      if (head < -0.35 && length(p - vec2(0.4, 0.07)) < 0.025) col = vec3(2.2, 0.15, 0.3);
    }
    else if (shape == 2) {
      // hot streak (sparks): long along x
      float ax = abs(p.x), ay = abs(p.y);
      a = (1.0 - ax) * exp(-ay * ay * 9.0) * smoothstep(1.0, 0.6, ax);
      col = mix(col, vec3(length(col)), exp(-ay * ay * 40.0) * 0.6);
    }
    else if (shape == 3) {
      // ink blot with a ragged edge
      float n = vn(p * 3.5 + vPar.w * 17.0) * 0.6 + vn(p * 9.0 - vPar.w * 5.0) * 0.4;
      a = 1.0 - smoothstep(0.55, 0.7, d + (n - 0.5) * 0.55);
      col *= 0.8 + 0.4 * n;
    }
    else if (shape == 4) { a = exp(-pow((d - 0.82) * 11.0, 2.0)) + exp(-pow((d - 0.82) * 4.0, 2.0)) * 0.25; }
    else if (shape == 5) {
      // dust puff
      float n = vn(p * 2.5 + vPar.w * 11.0) * 0.6 + vn(p * 6.0 + vPar.w) * 0.4;
      a = smoothstep(1.0, 0.2, d) * (0.5 + 0.7 * n);
    }
    else if (shape == 6) { a = exp(-d * d * 40.0) * 1.2 + exp(-abs(p.x) * 30.0) * exp(-p.y * p.y * 3.0) * 0.8 + exp(-abs(p.y) * 30.0) * exp(-p.x * p.x * 3.0) * 0.8; }
    a *= vC.a;
    if (a < 0.004) discard;
    gl_FragColor = vec4(col, a);
  }`;

class Sprites {
  constructor(max, blending, scene, order) {
    this.max = max;
    const base = new THREE.PlaneGeometry(2, 2);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index; g.attributes.position = base.attributes.position;
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.aSize = new THREE.InstancedBufferAttribute(new Float32Array(max * 2), 2);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
    this.aPar = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
    for (const a of [this.aPos, this.aSize, this.aCol, this.aPar]) a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iPos', this.aPos); g.setAttribute('iSize', this.aSize); g.setAttribute('iCol', this.aCol); g.setAttribute('iPar', this.aPar);
    g.instanceCount = 0;
    this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({ vertexShader: SPR_VS, fragmentShader: SPR_FS, transparent: true, depthWrite: false, blending }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = order;
    scene.add(this.mesh);
    this.n = 0;
  }
  begin() { this.n = 0; }
  // pos: Vector3|array, w,h: world size, col: [r,g,b,a], rot (view-space radians), shape, phase, seed
  add(p, w, h, col, rot = 0, shape = 0, phase = 0, seed = 0) {
    if (this.n >= this.max) return;
    const i = this.n++;
    if (p.isVector3) this.aPos.setXYZ(i, p.x, p.y, p.z); else this.aPos.setXYZ(i, p[0], p[1], p[2]);
    this.aSize.setXY(i, w, h); this.aCol.setXYZW(i, col[0], col[1], col[2], col[3]); this.aPar.setXYZW(i, rot, shape, phase, seed);
  }
  end() {
    this.mesh.geometry.instanceCount = this.n;
    for (const a of [this.aPos, this.aSize, this.aCol, this.aPar]) a.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- helpers
export class RNG {
  constructor(seed) { this.s = (seed * 9301 + 49297) % 233280 || 1; }
  next() { this.s = (this.s * 16807) % 2147483647; return (this.s - 1) / 2147483646; }
  range(a, b) { return a + (b - a) * this.next(); }
}
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const easeOut = (x) => 1 - (1 - x) ** 3;

export class FX {
  constructor(scene, camera) {
    this.cam = camera;
    this.inkR = new RibbonPool('ink', 40, 96, scene, 5);
    this.glowR = new RibbonPool('glow', 40, 96, scene, 8);
    this.ink = new Sprites(2600, THREE.NormalBlending, scene, 6);
    this.glow = new Sprites(2600, THREE.AdditiveBlending, scene, 9);
  }
  begin() { this.inkR.begin(); this.glowR.begin(); this.ink.begin(); this.glow.begin(); }
  end() { this.ink.end(); this.glow.end(); }
  // screen-space angle of a world direction at a point
  viewAngle(p, d) {
    const a = p.clone().applyMatrix4(this.cam.matrixWorldInverse), b = p.clone().add(d).applyMatrix4(this.cam.matrixWorldInverse);
    return Math.atan2(b.y - a.y, b.x - a.x);
  }

  // blade trail from the sword's past positions
  bladeTrail(ch, t, o = {}) {
    const n = 14, dur = o.dur || 0.11, A = [], B = [];
    let move = 0;
    for (let i = 0; i < n; i++) {
      const tt = t - (i / (n - 1)) * dur;
      const g = ch.joint(tt, 'guard'), tp = ch.joint(tt, 'tip');
      A.push(tp); B.push(g.clone().lerp(tp, o.inner ?? 0.35));
      if (i) move += A[i].distanceTo(A[i - 1]);
    }
    if (move < (o.minMove ?? 0.25)) return;
    const k = clamp((move - (o.minMove ?? 0.25)) / 0.6, 0, 1) * (o.alpha ?? 1);
    const c = o.col || [0.35, 2.2, 1.9];
    const r = (o.ink ? this.inkR : this.glowR).get();
    r.edges(A, B, (u) => [c[0], c[1], c[2], k * (1 - u) ** 1.6]);
  }
  // stylised slash arc in the fight plane (2D arc data: cx, cy in metres with y down)
  slashArc(t, a, z = 0.0) {
    const age = t - a.t0;
    if (age < 0 || age > a.life) return;
    const grow = easeOut(clamp(age / a.dur, 0, 1)), fade = 1 - sstep(a.dur, a.life, age);
    const n = 40, P = [], rot = (a.rot || 0) * Math.PI / 180;
    const a0 = a.a0 * Math.PI / 180, a1 = a.a1 * Math.PI / 180;
    const head = grow, tail = Math.max(0, grow - 0.75 - (1 - fade) * 0.25) + sstep(0.3, 1, 1 - fade) * grow;
    for (let i = 0; i < n; i++) {
      const u = tail + (head - tail) * (i / (n - 1)), ang = a0 + (a1 - a0) * u;
      const x = Math.cos(ang) * a.rx, y = Math.sin(ang) * a.ry;
      P.push(new V3(a.cx + x * Math.cos(rot) - y * Math.sin(rot), -(a.cy + x * Math.sin(rot) + y * Math.cos(rot)), z + Math.sin(u * Math.PI) * 0.25));
    }
    const ink = a.style === 'ink';
    const W = a.width * (ink ? 0.8 : 0.5);
    if (ink) {
      this.inkR.get().line(P, (u) => W * Math.sin(Math.PI * Math.min(1, u * 1.15)) ** 0.7 * (0.4 + 0.6 * u), (u) => [0.02, 0.012, 0.02, 0.92 * fade], this.cam);
      this.glowR.get().line(P, (u) => W * 0.3 * Math.sin(Math.PI * u), (u) => [1.8, 0.08, 0.2, 0.9 * fade * u], this.cam);
    } else {
      this.glowR.get().line(P, (u) => W * Math.sin(Math.PI * Math.min(1, u * 1.1)) ** 0.6 * (0.3 + 0.7 * u), (u) => [0.2 + 0.6 * (1 - u), 1.0 + 0.4 * u, 1.2 + 0.3 * (1 - u), 0.85 * fade], this.cam);
      this.glowR.get().line(P, (u) => W * 0.14 * Math.sin(Math.PI * u), () => [1.8, 2.0, 2.0, fade], this.cam);
    }
  }
  // spark burst at a clash
  spark(t, s) {
    const age = t - s.t0;
    if (age < 0 || age > 0.7) return;
    const p0 = new V3(s.x, -s.y, s.z || 0.1), rr = new RNG(s.seed * 31 + 7), c = s.col || [2.4, 1.6, 0.9];
    const size = s.size || 1;
    // flash core and star
    const fk = Math.exp(-age * 18);
    this.glow.add(p0, 0.9 * size * (1 + age * 3), 0.9 * size * (1 + age * 3), [c[0], c[1], c[2], fk * 0.9], 0, 0);
    this.glow.add(p0, 1.6 * size, 1.6 * size, [3, 3, 3, fk], rr.range(0, 3), 6);
    // expanding ring
    const rk = easeOut(clamp(age / 0.3, 0, 1));
    this.glow.add(p0, 0.3 + rk * 1.4 * size, 0.3 + rk * 1.4 * size * (s.squash || 1), [c[0] * 0.6, c[1] * 0.8, c[2], (1 - rk) * 0.7], 0, 4);
    for (let i = 0; i < (s.count || 18); i++) {
      const th = rr.range(0, Math.PI * 2), ph = rr.range(-0.6, 0.6), v = rr.range(2.5, 7) * size;
      const d = new V3(Math.cos(th) * Math.cos(ph), Math.sin(th) * Math.cos(ph) + 0.3, Math.sin(ph));
      const life = rr.range(0.2, 0.55);
      if (age > life) continue;
      const p = p0.clone().addScaledVector(d, v * age); p.y -= 4.9 * age * age;
      const vel = d.clone().multiplyScalar(v); vel.y -= 9.8 * age;
      const k = 1 - age / life, len = 0.04 + vel.length() * 0.025;
      this.glow.add(p, len, 0.012 + 0.01 * k, [c[0], c[1], c[2], k], this.viewAngle(p, vel), 2);
    }
  }
  dust(t, d) {
    const age = t - d.t0;
    if (age < 0 || age > 1.4) return;
    const rr = new RNG(Math.floor(d.t0 * 1000) + 3);
    for (let i = 0; i < (d.n || 6); i++) {
      const dir = d.dir === 0 ? rr.range(-1, 1) : d.dir * rr.range(0.2, 1);
      const sp = rr.range(0.8, 2.2) * (d.size || 1);
      const x = d.x + dir * sp * easeOut(clamp(age / 1.2, 0, 1)), y = 0.08 + rr.range(0, 0.4) * (d.size || 1) * easeOut(clamp(age / 0.8, 0, 1));
      const z = (d.z || 0) + rr.range(-0.6, 0.6);
      const r = (0.25 + age * 0.6) * (d.size || 1) * rr.range(0.6, 1.2);
      const k = (1 - sstep(0.2, 1.4, age)) * 0.32;
      this.ink.add([x, y, z], r, r * 0.7, [0.16, 0.18, 0.25, k], rr.range(0, 6), 5, 0, rr.range(0, 9));
    }
  }
  // ink crows: bezier paths between endpoints; optional cut time turns a crow into a spray of ink
  crows(t, o) {
    const rr = new RNG(o.seed);
    for (let i = 0; i < o.n; i++) {
      const t0 = o.t0 + rr.range(0, o.stagger), dur = o.dur * rr.range(0.8, 1.2);
      const from = o.from(i, rr), to = o.to(i, rr), bend = rr.range(-1, 1) * (o.bend || 0.6);
      const ph0 = rr.range(0, 6.28), fr = rr.range(14, 20), sz = (o.size || 1) * rr.range(0.24, 0.36), sd = rr.range(0, 9);
      const cutT = o.cut ? o.cut(i, t0 + dur * 0.92) : Infinity;
      const at = (tt) => {
        const u = clamp((tt - t0) / dur, 0, 1), e = o.ease ? o.ease(u) : u;
        const mid = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2 + bend * 1.2, (from[2] + to[2]) / 2 + bend * 0.6];
        const q = (k) => (1 - e) * (1 - e) * from[k] + 2 * (1 - e) * e * mid[k] + e * e * to[k];
        return new V3(q(0), q(1), q(2));
      };
      if (t < t0) continue;
      if (t >= cutT) {
        const age = t - cutT, p = at(cutT);
        if (age < 0.5) {
          const r2 = new RNG(i * 13 + o.seed);
          for (let k = 0; k < 7; k++) {
            const d = new V3(r2.range(-1, 1), r2.range(-0.5, 1), r2.range(-0.5, 0.5)).normalize();
            const q = p.clone().addScaledVector(d, age * r2.range(1, 2.5)); q.y -= 3 * age * age;
            const s = sz * r2.range(0.15, 0.35) * (1 - age * 1.6);
            if (s > 0) this.ink.add(q, s, s, [0.02, 0.015, 0.02, 1], 0, 3, 0, r2.range(0, 9));
          }
          if (age < 0.12) this.glow.add(p, sz * 3, sz * 0.12, [1.5, 2.6, 2.4, 1 - age / 0.12], rr.range(-1, 1), 2);
        }
        continue;
      }
      const u = (t - t0) / dur;
      if (u > 1 && o.keep === false) continue;
      const p = at(t), p2 = at(t + 0.02), vel = p2.clone().sub(p);
      let ang = this.viewAngle(p, vel.lengthSq() > 1e-9 ? vel : new V3(-1, 0, 0));
      const flip = Math.cos(ang) < 0;
      const fade = o.fadeIn ? sstep(0, 0.15, u) : 1;
      this.ink.add(p, sz * (flip ? -1 : 1), sz, [0.02, 0.016, 0.024, fade], ang + (flip ? Math.PI : 0), 1, ph0 + t * fr, sd);
    }
  }
  // ink drops / spray
  blots(list) { for (const b of list) this.ink.add(b.p, b.r, b.r, [b.c?.[0] ?? 0.02, b.c?.[1] ?? 0.015, b.c?.[2] ?? 0.02, b.a ?? 1], b.rot || 0, 3, 0, b.seed || 0); }
}
