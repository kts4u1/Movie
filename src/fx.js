// Visual effects. Every particle is spawned up-front from the choreography and animated
// analytically on the GPU from scene time, so any frame can be rendered independently.
import * as THREE from 'three';
import { RNG, clamp, lerp, smoothstep } from './util.js';
import { A, B, evalPose, weaponSegments, contactPoint, events, warp, rootPosAt, DURATION, T_EXPLODE } from './choreo.js';
import { NOISE3_GLSL } from './characters.js';

const S = (r) => warp.S(r);
const OFF = 'gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return;';

// ---------------------------------------------------------------- textures
function canvasTex(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, size, size);
  g.globalCompositeOperation = 'lighter';
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}
const TEX = {};
function makeTextures() {
  TEX.glow = canvasTex(128, (g, n) => {
    const gr = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.15, 'rgba(255,255,255,0.65)');
    gr.addColorStop(0.45, 'rgba(255,255,255,0.15)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, n, n);
  });
  TEX.ring = canvasTex(256, (g, n) => {
    const gr = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(0.72, 'rgba(255,255,255,0.0)');
    gr.addColorStop(0.88, 'rgba(255,255,255,1)');
    gr.addColorStop(0.94, 'rgba(255,255,255,0.35)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, n, n);
  });
  const rng = new RNG(5);
  TEX.puff = canvasTex(128, (g, n) => {
    for (let i = 0; i < 26; i++) {
      const x = n / 2 + rng.gauss() * n * 0.12, y = n / 2 + rng.gauss() * n * 0.12, r = rng.range(n * 0.12, n * 0.3);
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(255,255,255,0.22)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, n, n);
    }
  });
  TEX.flame = canvasTex(128, (g, n) => {
    for (let i = 0; i < 14; i++) {
      const x = n / 2 + rng.gauss() * n * 0.07, y = n / 2 + rng.gauss() * n * 0.1, r = rng.range(n * 0.15, n * 0.32);
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(255,255,255,0.4)');
      gr.addColorStop(0.5, 'rgba(255,255,255,0.12)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, n, n);
    }
  });
}

// ---------------------------------------------------------------- streak particles (sparks, embers, bolts)
class StreakSystem {
  constructor() { this.items = []; }
  add(o) { this.items.push(o); }
  build(scene) {
    const n = Math.max(this.items.length, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('corner', new THREE.Float32BufferAttribute([0, -1, 1, -1, 1, 1, 0, 1], 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const P = new Float32Array(n * 3), Vv = new Float32Array(n * 3), T = new Float32Array(n * 4), C = new Float32Array(n * 4), M = new Float32Array(n * 4);
    this.items.forEach((o, i) => {
      P.set([o.p.x, o.p.y, o.p.z], i * 3);
      Vv.set([o.v.x, o.v.y, o.v.z], i * 3);
      T.set([o.t0, o.life, o.streak ?? 0.03, o.mode ?? 0], i * 4);
      C.set([o.c.r, o.c.g, o.c.b, o.bright ?? 1], i * 4);
      M.set([o.size ?? 0.015, o.drag ?? 0, o.grav ?? 0, o.flicker ?? 0], i * 4);
    });
    geo.setAttribute('aP', new THREE.InstancedBufferAttribute(P, 3));
    geo.setAttribute('aV', new THREE.InstancedBufferAttribute(Vv, 3));
    geo.setAttribute('aT', new THREE.InstancedBufferAttribute(T, 4));
    geo.setAttribute('aC', new THREE.InstancedBufferAttribute(C, 4));
    geo.setAttribute('aM', new THREE.InstancedBufferAttribute(M, 4));
    geo.instanceCount = this.items.length;
    this.uniforms = { uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1920, 816) } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute vec2 corner; attribute vec3 aP, aV; attribute vec4 aT, aC, aM;
        uniform float uTime; uniform vec2 uRes;
        varying vec2 vC; varying vec3 vCol; varying float vFade;
        vec3 posAt(float a){ float k = aM.y; vec3 d = k > 0.001 ? aV * (1.0 - exp(-k * a)) / k : aV * a; return aP + d + vec3(0.0, -0.5 * aM.z * a * a, 0.0); }
        void main(){
          float age = uTime - aT.x;
          if (age < 0.0 || age > aT.y) { ${OFF} }
          vec3 head, tail;
          if (aT.w > 0.5) { head = aP + aV; tail = aP; } else { head = posAt(age); tail = posAt(max(age - aT.z, 0.0)); }
          vec4 ch = projectionMatrix * viewMatrix * vec4(head, 1.0);
          vec4 ct = projectionMatrix * viewMatrix * vec4(tail, 1.0);
          if (ch.w < 0.05 || ct.w < 0.05) { ${OFF} }
          vec2 d = (ch.xy / ch.w - ct.xy / ct.w) * uRes * 0.5;
          float len = length(d);
          vec2 dir = len > 0.001 ? d / len : vec2(1.0, 0.0);
          vec2 nrm = vec2(-dir.y, dir.x);
          vec4 c = mix(ct, ch, corner.x);
          float raw = aM.x * uRes.y * projectionMatrix[1][1] * 0.5 / c.w;
          float wpx = max(raw, 1.1);
          vec2 off = nrm * corner.y * wpx + dir * (corner.x * 2.0 - 1.0) * wpx;
          c.xy += off / (uRes * 0.5) * c.w;
          gl_Position = c;
          float fade = 1.0 - age / aT.y;
          float fl = aM.w > 0.0 ? step(0.35, fract(sin(floor(uTime * aM.w) * 91.7 + aT.x * 413.1) * 43758.5)) : 1.0;
          vFade = fade; vC = corner;
          vCol = aC.rgb * aC.a * fl * min(1.0, raw / 1.1);
        }`,
      fragmentShader: /* glsl */ `
        varying vec2 vC; varying vec3 vCol; varying float vFade;
        void main(){
          float side = 1.0 - abs(vC.y);
          float core = side * side;
          float along = mix(0.25, 1.0, vC.x);
          float f = pow(vFade, 1.2);
          vec3 col = vCol * core * along * f + vec3(1.0) * pow(core, 4.0) * along * f * f * length(vCol) * 0.1;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    scene.add(this.mesh);
  }
  update(s, W, H) { this.uniforms.uTime.value = s; this.uniforms.uRes.value.set(W, H); }
}

// ---------------------------------------------------------------- billboard sprites (fire, smoke, glows)
class SpriteSystem {
  constructor(kind, tex) { this.kind = kind; this.tex = tex; this.items = []; }
  add(o) { this.items.push(o); }
  build(scene) {
    const n = Math.max(this.items.length, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('corner', new THREE.Float32BufferAttribute([-1, -1, 1, -1, 1, 1, -1, 1], 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const P = new Float32Array(n * 3), Vv = new Float32Array(n * 3), T = new Float32Array(n * 4), Sz = new Float32Array(n * 4), C = new Float32Array(n * 4), G = new Float32Array(n);
    this.items.forEach((o, i) => {
      P.set([o.p.x, o.p.y, o.p.z], i * 3);
      Vv.set([o.v.x, o.v.y, o.v.z], i * 3);
      T.set([o.t0, o.life, o.drag ?? 0, o.buoy ?? 0], i * 4);
      Sz.set([o.s0, o.s1, o.rot ?? 0, o.spin ?? 0], i * 4);
      C.set([o.c.r, o.c.g, o.c.b, o.a ?? 1], i * 4);
      G[i] = o.glow ?? 0;
    });
    geo.setAttribute('aP', new THREE.InstancedBufferAttribute(P, 3));
    geo.setAttribute('aV', new THREE.InstancedBufferAttribute(Vv, 3));
    geo.setAttribute('aT', new THREE.InstancedBufferAttribute(T, 4));
    geo.setAttribute('aS', new THREE.InstancedBufferAttribute(Sz, 4));
    geo.setAttribute('aC', new THREE.InstancedBufferAttribute(C, 4));
    geo.setAttribute('aG', new THREE.InstancedBufferAttribute(G, 1));
    geo.instanceCount = this.items.length;
    this.uniforms = { uTime: { value: 0 }, tMap: { value: this.tex }, uLight: { value: new THREE.Color(0.05, 0.06, 0.08) } };
    const smoke = this.kind === 'smoke';
    const fire = this.kind === 'fire';
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true, depthWrite: false,
      blending: smoke ? THREE.NormalBlending : THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute vec2 corner; attribute vec3 aP, aV; attribute vec4 aT, aS, aC; attribute float aG;
        uniform float uTime;
        varying vec2 vUv; varying vec4 vCol; varying float vU; varying float vG;
        void main(){
          float age = uTime - aT.x;
          if (age < 0.0 || age > aT.y) { ${OFF} }
          float u = age / aT.y;
          float k = aT.z;
          vec3 d = k > 0.001 ? aV * (1.0 - exp(-k * age)) / k : aV * age;
          vec3 p = aP + d + vec3(0.0, 0.5 * aT.w * age * age, 0.0);
          vec4 mv = viewMatrix * vec4(p, 1.0);
          float size = mix(aS.x, aS.y, 1.0 - pow(1.0 - u, 2.2));
          float r = aS.z + aS.w * age;
          vec2 c = vec2(cos(r) * corner.x - sin(r) * corner.y, sin(r) * corner.x + cos(r) * corner.y);
          mv.xy += c * size;
          gl_Position = projectionMatrix * mv;
          vUv = corner * 0.5 + 0.5; vCol = aC; vU = u; vG = aG;
        }`,
      fragmentShader: smoke ? /* glsl */ `
        uniform sampler2D tMap; uniform vec3 uLight;
        varying vec2 vUv; varying vec4 vCol; varying float vU; varying float vG;
        void main(){
          float t = texture2D(tMap, vUv).r;
          float a = t * vCol.a * smoothstep(0.0, 0.12, vU) * pow(1.0 - vU, 1.4);
          vec3 col = vCol.rgb * (0.4 + uLight * 6.0) + vec3(1.2, 0.45, 0.1) * vG * exp(-vU * 9.0);
          gl_FragColor = vec4(col, a);
        }` : fire ? /* glsl */ `
        uniform sampler2D tMap;
        varying vec2 vUv; varying vec4 vCol; varying float vU; varying float vG;
        void main(){
          float t = texture2D(tMap, vUv).r;
          vec3 hot = vec3(1.0, 0.85, 0.55) * 1.15;
          vec3 col = mix(hot * length(vCol.rgb), vCol.rgb, smoothstep(0.0, 0.35, vU));
          col = mix(col, vCol.rgb * vec3(0.6, 0.25, 0.2), smoothstep(0.5, 1.0, vU));
          float a = t * vCol.a * smoothstep(0.0, 0.08, vU) * pow(1.0 - vU, 1.3);
          gl_FragColor = vec4(col * a, 1.0);
        }` : /* glsl */ `
        uniform sampler2D tMap;
        varying vec2 vUv; varying vec4 vCol; varying float vU; varying float vG;
        void main(){
          float t = texture2D(tMap, vUv).r;
          float a = t * vCol.a * pow(1.0 - vU, 1.5);
          gl_FragColor = vec4(vCol.rgb * a, 1.0);
        }`,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = smoke ? 9 : 6;
    scene.add(this.mesh);
  }
  update(s) { this.uniforms.uTime.value = s; }
}

// ---------------------------------------------------------------- weapon trails
class Trail {
  constructor(scene, n, core, edge, segFn, dur) {
    this.n = n; this.segFn = segFn; this.dur = dur;
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 2 * 3);
    this.spd = new Float32Array(n * 2);
    const uv = new Float32Array(n * 2 * 2);
    const idx = [];
    for (let i = 0; i < n; i++) {
      uv.set([i / (n - 1), 0, i / (n - 1), 1], i * 4);
      if (i < n - 1) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('aSpd', new THREE.BufferAttribute(this.spd, 1));
    geo.setIndex(idx);
    this.uniforms = { uCore: { value: core }, uEdge: { value: edge }, uAlpha: { value: 1 } };
    this.mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: 'attribute float aSpd; varying vec2 vUv; varying float vS; void main(){ vUv = uv; vS = aSpd; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */ `
        uniform vec3 uCore, uEdge; uniform float uAlpha; varying vec2 vUv; varying float vS;
        void main(){
          float age = vUv.x;
          float a = pow(1.0 - age, 2.8) * smoothstep(0.0, 0.45, vUv.y) * smoothstep(1.5, 7.0, vS) * uAlpha;
          vec3 c = mix(uEdge, uCore, pow(vUv.y, 3.0) * (1.0 - age));
          gl_FragColor = vec4(c * a, 1.0);
        }`,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 7;
    scene.add(this.mesh);
    this._prev = new THREE.Vector3();
  }
  update(s) {
    const { n } = this;
    for (let i = 0; i < n; i++) {
      const tau = s - (i / (n - 1)) * this.dur;
      const seg = this.segFn(tau);
      this.pos.set([seg.a.x, seg.a.y, seg.a.z, seg.b.x, seg.b.y, seg.b.z], i * 6);
    }
    for (let i = 0; i < n; i++) {
      const j = Math.min(i + 1, n - 1), k = Math.max(j - 1, 0);
      const dx = this.pos[j * 6 + 3] - this.pos[k * 6 + 3], dy = this.pos[j * 6 + 4] - this.pos[k * 6 + 4], dz = this.pos[j * 6 + 5] - this.pos[k * 6 + 5];
      const sp = Math.hypot(dx, dy, dz) / (this.dur / (n - 1));
      this.spd[i * 2] = this.spd[i * 2 + 1] = sp;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.aSpd.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- wrapping particles (rain, ambient embers)
function makeWrapSystem(scene, count, seed, opts) {
  const rng = new RNG(seed);
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('corner', new THREE.Float32BufferAttribute([0, -1, 1, -1, 1, 1, 0, 1], 2));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const P = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) P.set([rng.next(), rng.next(), rng.next(), rng.next()], i * 4);
  geo.setAttribute('aR', new THREE.InstancedBufferAttribute(P, 4));
  geo.instanceCount = count;
  const uniforms = {
    uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1920, 816) }, uCenter: { value: new THREE.Vector3() },
    uBox: { value: opts.box }, uVel: { value: opts.vel }, uSway: { value: opts.sway }, uSize: { value: opts.size },
    uStreak: { value: opts.streak }, uColor: { value: opts.color }, uColor2: { value: opts.color2 || opts.color },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute vec2 corner; attribute vec4 aR;
      uniform float uTime, uSway, uSize, uStreak; uniform vec2 uRes; uniform vec3 uCenter, uBox, uVel, uColor, uColor2;
      varying vec2 vC; varying vec3 vCol; varying float vA;
      vec3 posAt(float t){
        vec3 base = aR.xyz * uBox + uVel * t * (0.7 + 0.6 * aR.w);
        base.x += sin(t * (0.6 + aR.w) + aR.w * 30.0) * uSway;
        base.z += cos(t * (0.5 + aR.y) + aR.x * 30.0) * uSway;
        vec3 lo = uCenter - uBox * 0.5;
        return lo + mod(base - lo, uBox);
      }
      void main(){
        vec3 head = posAt(uTime);
        vec3 tail = head - (uVel * (0.7 + 0.6 * aR.w)) * uStreak;
        vec4 ch = projectionMatrix * viewMatrix * vec4(head, 1.0);
        vec4 ct = projectionMatrix * viewMatrix * vec4(tail, 1.0);
        if (ch.w < 0.1 || ct.w < 0.1) { ${OFF} }
        vec2 d = (ch.xy / ch.w - ct.xy / ct.w) * uRes * 0.5;
        float len = length(d);
        vec2 dir = len > 0.001 ? d / len : vec2(1.0, 0.0);
        vec2 nrm = vec2(-dir.y, dir.x);
        vec4 c = mix(ct, ch, corner.x);
        float raw = uSize * uRes.y * projectionMatrix[1][1] * 0.5 / c.w;
        float wpx = max(raw, 1.0);
        c.xy += (nrm * corner.y * wpx + dir * (corner.x * 2.0 - 1.0) * wpx) / (uRes * 0.5) * c.w;
        gl_Position = c;
        vC = corner;
        float dist = ch.w;
        vA = min(1.0, raw) * smoothstep(0.3, 1.5, dist) * (1.0 - smoothstep(18.0, 30.0, dist));
        vCol = mix(uColor, uColor2, step(0.75, aR.w)) * (0.4 + 0.6 * fract(aR.w * 7.13));
      }`,
    fragmentShader: /* glsl */ `
      varying vec2 vC; varying vec3 vCol; varying float vA;
      void main(){ float s = 1.0 - abs(vC.y); gl_FragColor = vec4(vCol * s * s * mix(0.3, 1.0, vC.x) * vA, 1.0); }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 8;
  mesh.layers.set(opts.layer ?? 0);
  scene.add(mesh);
  return { mesh, uniforms };
}

// ---------------------------------------------------------------- shock rings (ground decals)
function makeGroundRing(scene, ev) {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uAge: { value: -1 }, uCol: { value: ev.color }, uMaxR: { value: ev.radius }, uLife: { value: ev.life } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */ `
      uniform float uAge, uMaxR, uLife; uniform vec3 uCol; varying vec2 vUv;
      ${NOISE3_GLSL}
      void main(){
        if (uAge < 0.0 || uAge > uLife) discard;
        float u = uAge / uLife;
        float r = length(vUv) * uMaxR;
        float R = uMaxR * (1.0 - pow(1.0 - u, 3.0)) * 0.95;
        float w = 0.08 + 0.35 * u;
        float n = vnoise3(vec3(vUv * 6.0, uAge * 3.0));
        float ring = exp(-pow((r - R) / w, 2.0)) * (0.6 + 0.8 * n);
        float inner = smoothstep(R, 0.0, r) * 0.15 * (1.0 - u);
        gl_FragColor = vec4(uCol * (ring + inner) * pow(1.0 - u, 1.5), 1.0);
      }`,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(ev.radius * 2, ev.radius * 2), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(ev.pos.x, 0.012, ev.pos.z);
  m.renderOrder = 3;
  m.frustumCulled = false;
  scene.add(m);
  return { mesh: m, ev };
}

// ---------------------------------------------------------------- build all effects
export function buildFX(scene, rigs, env) {
  makeTextures();
  const fx = {};
  const rng = new RNG(2024);
  const sparks = new StreakSystem();
  const fire = new SpriteSystem('fire', TEX.flame);
  const smoke = new SpriteSystem('smoke', TEX.puff);
  const glows = new SpriteSystem('glow', TEX.glow);
  const rings = new SpriteSystem('glow', TEX.ring);
  const groundRings = [];
  const flashes = []; // {s, pos, color, intensity, decay}

  const CY = new THREE.Color(0.35, 0.85, 1.0);
  const OR = new THREE.Color(1.0, 0.45, 0.1);
  const WH = new THREE.Color(1.0, 0.9, 0.7);
  const col = (c, k) => c.clone().multiplyScalar(k);
  const V = () => new THREE.Vector3();

  // helper: burst of sparks
  function sparkBurst(pos, s, n, o = {}) {
    for (let i = 0; i < n; i++) {
      const d = rng.dir(V());
      if (o.up) d.y = Math.abs(d.y) * o.up + d.y * (1 - o.up);
      if (o.axis) d.addScaledVector(o.axis, -d.dot(o.axis) * 0.6);
      d.normalize();
      const sp = rng.range(o.vmin ?? 3, o.vmax ?? 13) * (rng.next() < 0.15 ? 1.5 : 1);
      const pick = rng.next();
      const c = pick < 0.47 ? (o.c1 || CY) : pick < 0.93 ? (o.c2 || OR) : WH;
      sparks.add({
        p: pos.clone().addScaledVector(d, rng.range(0.02, 0.12)), v: d.multiplyScalar(sp), t0: s + rng.range(0, o.spread ?? 0.02), life: rng.range(o.lmin ?? 0.25, o.lmax ?? 0.9),
        c, bright: rng.range(1.4, 3.4) * (o.bright ?? 1), size: rng.range(0.008, 0.022) * (o.size ?? 1), drag: o.drag ?? 2.2, grav: o.grav ?? 9.8, streak: rng.range(0.025, 0.05),
      });
    }
  }
  function glowFlash(pos, s, size, color, life = 0.14, k = 1) {
    glows.add({ p: pos.clone(), v: V(), t0: s, life, s0: size * 0.4, s1: size, c: col(color, 0.8 * k), a: 1 });
    glows.add({ p: pos.clone(), v: V(), t0: s, life: life * 0.6, s0: size * 0.15, s1: size * 0.35, c: col(WH, 1.6 * k), a: 1 });
  }
  function ringPulse(pos, s, size, color, life = 0.3) {
    rings.add({ p: pos.clone(), v: V(), t0: s, life, s0: size * 0.08, s1: size, c: col(color, 0.45), a: 1 });
  }

  // ---- clashes
  for (const e of events.clashes) {
    const big = e.kind === 'big' || e.kind === 'heavy' || e.kind === 'air';
    const n = Math.round((big ? 210 : 90) * e.intensity);
    sparkBurst(e.pos, e.s, n, { vmax: big ? 17 : 12, lmax: big ? 1.1 : 0.8 });
    glowFlash(e.pos, e.s, big ? 1.6 : 0.8, WH, e.kind === 'air' ? 0.05 : big ? 0.14 : 0.09, e.kind === 'air' ? 0.6 : big ? 1.2 : 1);
    const rk = e.kind === 'air' ? 0.45 : 1;
    ringPulse(e.pos, e.s, big ? 3.2 : 1.4, CY.clone().lerp(WH, 0.5).multiplyScalar(rk), big ? 0.35 : 0.22);
    if (big) ringPulse(e.pos, e.s + 0.02, 3.0, OR.clone().multiplyScalar(rk), 0.4);
    flashes.push({ s: e.s, pos: e.pos, color: new THREE.Color(1, 0.92, 0.8), intensity: big ? 16 : 6 * e.intensity, decay: big ? 9 : 16 });
    if (e.kind === 'heavy' || e.kind === 'big') {
      for (let i = 0; i < 24; i++) {
        const d = rng.dir(V());
        smoke.add({ p: e.pos.clone().addScaledVector(d, 0.1), v: d.multiplyScalar(rng.range(1, 3)), t0: e.s, life: rng.range(0.8, 1.6), drag: 3, buoy: 0.4, s0: 0.15, s1: rng.range(0.5, 0.9), c: new THREE.Color(0.16, 0.17, 0.2), a: 0.35, glow: 0.4, rot: rng.range(0, 6), spin: rng.range(-1, 1) });
      }
    }
  }
  // ---- grinding sparks (rate per real second, so bullet time keeps them dense)
  for (const g of events.grinds) {
    const rate = g.r0 > 10 ? 45 : 85;
    for (let r = g.r0; r < g.r1; r += 1 / rate) {
      const s = S(r);
      const cp = contactPoint(s);
      if (!cp || cp.dist > 0.35) continue;
      sparkBurst(cp.mid, s, 1, { vmin: 2.5, vmax: 9, lmin: 0.2, lmax: 0.55, spread: 0, up: 0.3, bright: 0.7 });
    }
  }
  // ---- ignitions
  {
    const s = S(events.misc.igniteA);
    const P = evalPose(A, s, { _noVel: true });
    const base = P.weaponPos.clone().addScaledVector(P.dirW, 0.1);
    for (let i = 0; i < 70; i++) {
      const along = rng.range(0, 1.1);
      const p = base.clone().addScaledVector(P.dirW, along);
      const d = rng.dir(V());
      sparks.add({ p, v: d.multiplyScalar(rng.range(0.5, 2.5)), t0: s + along * 0.13, life: rng.range(0.3, 0.8), c: CY, bright: 6, size: 0.01, drag: 3, grav: -0.3, streak: 0.04 });
    }
    glowFlash(base, s, 1.2, CY, 0.25);
    ringPulse(base, s, 1.5, CY, 0.3);
    flashes.push({ s, pos: base, color: CY.clone(), intensity: 4, decay: 6 });
  }
  {
    const s = S(events.misc.igniteB);
    const P = evalPose(B, s, { _noVel: true });
    for (const sg of [1, -1]) {
      const p0 = P.weaponPos.clone().addScaledVector(P.dirW, sg * 1.15);
      for (let i = 0; i < 40; i++) {
        const d = rng.dir(V());
        fire.add({ p: p0.clone().addScaledVector(d, 0.1), v: d.multiplyScalar(rng.range(0.8, 2.5)), t0: s + rng.range(0, 0.05), life: rng.range(0.3, 0.6), drag: 3, buoy: 2, s0: 0.08, s1: rng.range(0.2, 0.4), c: col(OR, 1.4), a: 1, rot: rng.range(0, 6), spin: rng.range(-3, 3) });
      }
      glowFlash(p0, s, 1.4, OR, 0.3);
    }
    flashes.push({ s, pos: P.weaponPos.clone(), color: OR.clone(), intensity: 5, decay: 5 });
  }

  // ---- continuous emitters attached to the fighters
  const emitDt = (rate) => 1 / rate;
  // B glaive flames + embers
  for (let r = events.misc.igniteB; r < events.misc.shatter.r; r += emitDt(230)) {
    const s = S(r);
    const P = evalPose(B, s, { _noVel: true });
    if (P.blade < 0.05) continue;
    const sg = rng.next() < 0.5 ? 1 : -1;
    const along = sg * rng.range(0.9, 1.5);
    const p = P.weaponPos.clone().addScaledVector(P.dirW, along);
    const P2 = evalPose(B, s - 0.01, { _noVel: true });
    const p2 = P2.weaponPos.clone().addScaledVector(P2.dirW, along);
    const v = p.clone().sub(p2).multiplyScalar(100 * 0.25);
    v.add(rng.dir(V()).multiplyScalar(0.3));
    fire.add({ p, v, t0: s, life: rng.range(0.22, 0.45), drag: 4, buoy: 3.5, s0: rng.range(0.05, 0.09) * P.blade, s1: rng.range(0.1, 0.2) * P.blade, c: col(OR, 1.0), a: 0.7, rot: rng.range(0, 6), spin: rng.range(-4, 4) });
    if (rng.next() < 0.2) sparks.add({ p: p.clone(), v: v.clone().multiplyScalar(0.6).add(new THREE.Vector3(rng.range(-0.5, 0.5), rng.range(0.5, 2), rng.range(-0.5, 0.5))), t0: s, life: rng.range(0.6, 1.4), c: OR, bright: 5, size: 0.008, drag: 1.2, grav: -0.6, streak: 0.06, flicker: 12 });
  }
  // A blade motes
  for (let r = events.misc.igniteA + 0.2; r < events.misc.retract.r + 0.2; r += emitDt(45)) {
    const s = S(r);
    const P = evalPose(A, s, { _noVel: true });
    if (P.blade < 0.05) continue;
    const p = P.weaponPos.clone().addScaledVector(P.dirW, rng.range(0.15, 1.1) * P.blade);
    sparks.add({ p, v: rng.dir(V()).multiplyScalar(rng.range(0.1, 0.5)), t0: s, life: rng.range(0.4, 1.0), c: CY, bright: 5, size: 0.007, drag: 1, grav: -0.2, streak: 0.05, flicker: 9 });
  }
  // spirit tails: A wisps, B fire + embers, B mane
  for (let r = 0; r < DURATION; r += emitDt(70)) {
    const s = S(r);
    for (const c of [A, B]) {
      const isA = c === A;
      if (!isA && r > events.misc.dissolve.r1) continue;
      const P = evalPose(c, s, { _noVel: true });
      if (P.eyes < 0.05) continue;
      const base = P.rootPos.clone().add(new THREE.Vector3(rng.range(-0.1, 0.1), rng.range(-0.55, -0.15) * c.sc, rng.range(-0.1, 0.1)));
      const v = P.vel.clone().multiplyScalar(-0.15).add(new THREE.Vector3(rng.range(-0.2, 0.2), isA ? rng.range(-0.4, 0.1) : rng.range(0.2, 0.9), rng.range(-0.2, 0.2)));
      fire.add({ p: base, v, t0: s, life: rng.range(0.3, 0.6), drag: 2, buoy: isA ? 0.2 : 1.5, s0: 0.1 * c.sc, s1: rng.range(0.15, 0.3) * c.sc, c: isA ? col(CY, 0.6) : col(OR, 0.75), a: 0.5 * P.eyes, rot: rng.range(0, 6), spin: rng.range(-2, 2) });
      if (!isA && rng.next() < 0.6) {
        const hp = P.headPos.clone().add(new THREE.Vector3(0, 0.22 * c.sc, 0)).applyQuaternion(new THREE.Quaternion()).add(new THREE.Vector3(rng.range(-0.08, 0.08), 0, rng.range(-0.08, 0.08)));
        fire.add({ p: hp, v: new THREE.Vector3(rng.range(-0.2, 0.2), rng.range(0.4, 1.0), rng.range(-0.2, 0.2)).addScaledVector(P.vel, -0.1), t0: s, life: rng.range(0.25, 0.5), drag: 2, buoy: 2.5, s0: 0.06, s1: rng.range(0.1, 0.2), c: col(OR, 0.8), a: 0.55 * P.eyes, rot: rng.range(0, 6), spin: rng.range(-3, 3) });
      }
      if (rng.next() < (isA ? 0.25 : 0.4)) sparks.add({ p: base.clone(), v: v.clone().multiplyScalar(0.8).add(new THREE.Vector3(0, isA ? -0.2 : 0.5, 0)), t0: s, life: rng.range(0.8, 1.8), c: isA ? CY : OR, bright: 4, size: 0.007, drag: 0.8, grav: isA ? 0.1 : -0.4, streak: 0.06, flicker: 10 });
    }
  }
  // ---- aura power-up: particles converge on both fighters
  for (const c of [A, B]) {
    const isA = c === A;
    for (let r = 12.45; r < 13.0; r += emitDt(260)) {
      const s = S(r);
      const P = evalPose(c, s, { _noVel: true });
      const target = P.chestPos.clone();
      const d = rng.dir(V());
      const p0 = target.clone().addScaledVector(d, rng.range(1.2, 2.2));
      const T = rng.range(0.25, 0.4), k = 4;
      const v = target.clone().sub(p0).multiplyScalar(k / (1 - Math.exp(-k * T)));
      sparks.add({ p: p0, v, t0: s, life: T, c: isA ? CY : OR, bright: 6, size: 0.012, drag: k, grav: 0, streak: 0.08 });
    }
    const s = S(12.9);
    const P = evalPose(c, s, { _noVel: true });
    groundRings.push(makeGroundRing(scene, { pos: P.rootPos, s: S(12.5), life: 0.8, radius: 3.5, color: col(isA ? CY : OR, 1.0) }));
    groundRings.push(makeGroundRing(scene, { pos: P.rootPos, s: S(12.85), life: 0.6, radius: 2.5, color: col(isA ? CY : OR, 1.0) }));
  }
  // ---- dust / ground shocks under the fighters
  for (const d of events.dust) {
    const c = d.who === 'A' ? A : B;
    const s = S(d.r);
    const p = rootPosAt(c, s, V());
    const g = new THREE.Vector3(p.x, 0.05, p.z);
    groundRings.push(makeGroundRing(scene, { pos: g, s, life: d.big ? 0.9 : 0.6, radius: d.big ? 3.2 : 2.0, color: col(c === A ? CY : OR, d.big ? 0.8 : 0.45) }));
    const n = d.big ? 26 : 14;
    for (let i = 0; i < n; i++) {
      const a = rng.range(0, Math.PI * 2);
      const v = new THREE.Vector3(Math.cos(a), rng.range(0.05, 0.3), Math.sin(a)).multiplyScalar(rng.range(2, 5));
      smoke.add({ p: g.clone().add(new THREE.Vector3(0, 0.15, 0)), v, t0: s, life: rng.range(0.9, 1.8), drag: 3.5, buoy: 0.25, s0: 0.2, s1: rng.range(0.6, 1.1), c: new THREE.Color(0.1, 0.11, 0.13), a: 0.32, rot: rng.range(0, 6), spin: rng.range(-1, 1) });
    }
    for (let i = 0; i < (d.big ? 30 : 10); i++) {
      const a = rng.range(0, Math.PI * 2);
      sparks.add({ p: g.clone(), v: new THREE.Vector3(Math.cos(a), rng.range(0.4, 1.4), Math.sin(a)).multiplyScalar(rng.range(1.5, 4)), t0: s, life: rng.range(0.3, 0.7), c: new THREE.Color(0.6, 0.65, 0.75), bright: 1.2, size: 0.012, drag: 1, grav: 9.8, streak: 0.03 });
    }
  }
  // ---- fissure + crescent + explosion
  const fis = events.misc.fissure, cre = events.misc.crescent, ex = events.misc.explosion;
  {
    // fire bursts along the advancing crack
    const len = fis.origin.x - ex.pos.x;
    for (let x = 0; x < len; x += 0.07) {
      const s = fis.s0 + x / fis.speed;
      const p = new THREE.Vector3(fis.origin.x - x, 0.05, fis.origin.z + Math.sin(x * 3.1) * 0.12);
      for (let k = 0; k < 2; k++) {
        fire.add({ p: p.clone().add(new THREE.Vector3(rng.range(-0.1, 0.1), 0, rng.range(-0.15, 0.15))), v: new THREE.Vector3(rng.range(-0.6, 0.3), rng.range(1.5, 4.5), rng.range(-0.4, 0.4)), t0: s + rng.range(0, 0.03), life: rng.range(0.35, 0.8), drag: 1.5, buoy: 2, s0: 0.12, s1: rng.range(0.35, 0.7), c: col(OR, 1.1), a: 0.8, rot: rng.range(0, 6), spin: rng.range(-2, 2) });
      }
      if (rng.next() < 0.5) sparks.add({ p: p.clone(), v: new THREE.Vector3(rng.range(-1, 1), rng.range(2, 6), rng.range(-1, 1)), t0: s, life: rng.range(0.5, 1.0), c: OR, bright: 5, size: 0.01, drag: 0.8, grav: 6, streak: 0.04 });
      if (rng.next() < 0.25) smoke.add({ p: p.clone().add(new THREE.Vector3(0, 0.3, 0)), v: new THREE.Vector3(0, rng.range(0.5, 1.2), 0), t0: s + 0.1, life: rng.range(1.2, 2), drag: 1, buoy: 0.3, s0: 0.3, s1: rng.range(0.8, 1.3), c: new THREE.Color(0.09, 0.08, 0.08), a: 0.3, glow: 0.6, rot: rng.range(0, 6), spin: rng.range(-0.5, 0.5) });
    }
    groundRings.push(makeGroundRing(scene, { pos: fis.origin, s: fis.s0, life: 0.7, radius: 2.6, color: col(OR, 1.1) }));
    sparkBurst(fis.origin.clone().add(new THREE.Vector3(0, 0.1, 0)), fis.s0, 120, { up: 0.9, c1: OR, vmax: 9 });
    glowFlash(fis.origin.clone().add(new THREE.Vector3(0, 0.3, 0)), fis.s0, 2.5, OR, 0.25);
    flashes.push({ s: fis.s0, pos: fis.origin.clone().add(new THREE.Vector3(0, 0.5, 0)), color: OR.clone(), intensity: 12, decay: 7 });
    // crescent trail particles
    for (let s = cre.s0; s < cre.sEnd; s += 0.004) {
      const x = cre.origin.x + cre.speed * (s - cre.s0);
      for (let k = 0; k < 3; k++) {
        const a = rng.range(-1.1, 1.1);
        const p = new THREE.Vector3(x + Math.cos(a) * 0.55 - 0.55, cre.origin.y + rng.range(-0.05, 0.05), cre.origin.z + Math.sin(a) * 0.95);
        sparks.add({ p, v: new THREE.Vector3(rng.range(-2, 0), rng.range(-0.3, 0.6), rng.range(-0.5, 0.5)), t0: s, life: rng.range(0.25, 0.6), c: CY, bright: 6, size: 0.012, drag: 2, grav: 0, streak: 0.05 });
      }
    }
    // the explosion
    const P = ex.pos, s = ex.s;
    for (let i = 0; i < 90; i++) {
      const d = rng.dir(V()); d.y = Math.abs(d.y) * 0.8 + 0.1;
      const cyan = rng.next() < 0.3;
      fire.add({ p: P.clone().addScaledVector(d, rng.range(0, 0.4)), v: d.clone().multiplyScalar(rng.range(2, 9)), t0: s + rng.range(0, 0.06), life: rng.range(0.5, 1.3), drag: 2.8, buoy: 1.2, s0: 0.35, s1: rng.range(0.8, 1.9), c: cyan ? col(CY, 0.55) : col(OR, 0.7), a: 0.42, rot: rng.range(0, 6), spin: rng.range(-2, 2) });
    }
    for (let i = 0; i < 70; i++) {
      const d = rng.dir(V()); d.y = Math.abs(d.y) * 0.6 + 0.05;
      smoke.add({ p: P.clone().addScaledVector(d, rng.range(0.2, 0.8)), v: d.clone().multiplyScalar(rng.range(1.5, 5)), t0: s + rng.range(0.02, 0.15), life: rng.range(2.2, 3.6), drag: 1.6, buoy: 0.35, s0: 0.6, s1: rng.range(2.0, 3.4), c: new THREE.Color(0.09, 0.09, 0.1), a: 0.75, glow: 1.0, rot: rng.range(0, 6), spin: rng.range(-0.4, 0.4) });
    }
    sparkBurst(P, s, 260, { vmax: 22, lmax: 1.6, up: 0.4, size: 1.2, bright: 0.85 });
    glowFlash(P, s, 1.6, new THREE.Color(1.0, 0.55, 0.2), 0.12, 0.7);
    glowFlash(P, s, 4.5, OR, 0.45, 0.6);
    ringPulse(P, s, 6, OR.clone().lerp(WH, 0.3).multiplyScalar(0.6), 0.4);
    groundRings.push(makeGroundRing(scene, { pos: new THREE.Vector3(P.x, 0, P.z), s, life: 1.4, radius: 9, color: col(OR.clone().lerp(WH, 0.5), 1.3) }));
    flashes.push({ s, pos: P.clone().add(new THREE.Vector3(0, 0.6, 0)), color: new THREE.Color(1, 0.75, 0.5), intensity: 60, decay: 3.5 });
  }
  // ---- final cross
  {
    const e = events.misc.finalCross;
    sparkBurst(e.pos, e.s, 260, { vmax: 20, lmax: 1.4, size: 1.1, bright: 1.0 });
    glowFlash(e.pos, e.s, 2.2, WH, 0.18, 1.0);
    ringPulse(e.pos, e.s, 7, WH.clone().multiplyScalar(0.7), 0.35);
    ringPulse(e.pos, e.s + 0.02, 4.5, CY.clone().multiplyScalar(0.7), 0.45);
    groundRings.push(makeGroundRing(scene, { pos: new THREE.Vector3(e.pos.x, 0, e.pos.z), s: e.s, life: 1.2, radius: 7, color: col(WH, 1.2) }));
    flashes.push({ s: e.s, pos: e.pos, color: new THREE.Color(1, 0.95, 0.9), intensity: 35, decay: 5 });
    // a long horizontal slash line hanging in the air
    sparks.add({ p: e.pos.clone().add(new THREE.Vector3(-3.5, 0.15, 0.25)), v: new THREE.Vector3(7, -0.3, -0.5), t0: e.s, life: 0.5, mode: 1, c: WH, bright: 5, size: 0.03 });
    sparks.add({ p: e.pos.clone().add(new THREE.Vector3(-3.0, 0.1, 0.2)), v: new THREE.Vector3(6, -0.2, -0.4), t0: e.s, life: 0.7, mode: 1, c: CY, bright: 0.9, size: 0.08 });
  }
  // ---- glaive shatter + dissolve of the oni
  {
    const e = events.misc.shatter;
    const P = evalPose(B, e.s, { _noVel: true });
    for (let i = 0; i < 6; i++) {
      const p = P.weaponPos.clone().addScaledVector(P.dirW, rng.range(-1.4, 1.4));
      sparkBurst(p, e.s, 40, { c1: OR, c2: OR, vmax: 7, lmax: 1.0, grav: 3 });
      glowFlash(p, e.s + rng.range(0, 0.05), 1.0, OR, 0.25);
    }
    flashes.push({ s: e.s, pos: P.weaponPos.clone(), color: OR.clone(), intensity: 10, decay: 4 });
    const d = events.misc.dissolve;
    for (let r = d.r0; r < d.r1 + 0.2; r += 1 / 520) {
      const s = S(r);
      const Q = evalPose(B, s, { _noVel: true });
      const u = clamp((r - d.r0) / (d.r1 - d.r0), 0, 1);
      // spawn from the dissolving front (top first)
      const h = lerp(1.0, -0.6, u) * B.sc + rng.range(-0.15, 0.15);
      const p = Q.rootPos.clone().add(new THREE.Vector3(rng.range(-0.28, 0.28), h, rng.range(-0.22, 0.22)));
      const v = new THREE.Vector3(rng.range(-0.6, 0.6), rng.range(0.6, 2.2), rng.range(-0.6, 0.6));
      if (rng.next() < 0.55) sparks.add({ p, v, t0: s, life: rng.range(0.8, 2.0), c: rng.next() < 0.8 ? OR : WH, bright: rng.range(4, 8), size: rng.range(0.008, 0.016), drag: 0.6, grav: -0.8, streak: 0.07, flicker: 8 });
      else fire.add({ p, v: v.multiplyScalar(0.5), t0: s, life: rng.range(0.3, 0.7), drag: 2, buoy: 2, s0: 0.08, s1: rng.range(0.2, 0.35), c: col(OR, 0.9), a: 0.6, rot: rng.range(0, 6), spin: rng.range(-3, 3) });
    }
    groundRings.push(makeGroundRing(scene, { pos: rootPosAt(B, d.s0, V()).setY(0), s: d.s0, life: 1.0, radius: 3, color: col(OR, 1.0) }));
  }
  // ---- blade retract
  {
    const s = S(events.misc.retract.r);
    const P = evalPose(A, s, { _noVel: true });
    for (let i = 0; i < 40; i++) {
      const p = P.weaponPos.clone().addScaledVector(P.dirW, rng.range(0.1, 1.1));
      sparks.add({ p, v: rng.dir(V()).multiplyScalar(rng.range(0.2, 1.2)), t0: s + rng.range(0, 0.2), life: rng.range(0.4, 0.9), c: CY, bright: 5, size: 0.008, drag: 2, grav: -0.3, streak: 0.04 });
    }
  }
  // ---- lightning bolts
  const bolts = [];
  for (const L of events.lightning) {
    const s = S(L.r);
    const top = L.pos.clone().add(new THREE.Vector3(rng.range(-4, 4), 45, rng.range(-4, 4)));
    const bottom = L.pos.clone();
    const branch = (a, b, depth, width, bright) => {
      const n = 12;
      let prev = a.clone();
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        const p = a.clone().lerp(b, t);
        if (i < n) p.add(new THREE.Vector3(rng.gauss(), rng.gauss() * 0.3, rng.gauss()).multiplyScalar(a.distanceTo(b) * 0.035));
        for (const k of [0, 0.06, 0.13]) sparks.add({ p: prev.clone(), v: p.clone().sub(prev), t0: s + k, life: 0.09, mode: 1, c: new THREE.Color(0.7, 0.8, 1.0), bright: bright * L.strength * (k === 0 ? 1 : 0.7), size: width });
        if (depth > 0 && rng.next() < 0.18) {
          const dir = p.clone().sub(prev).normalize().add(new THREE.Vector3(rng.range(-1, 1), -0.2, rng.range(-1, 1))).normalize();
          branch(p.clone(), p.clone().addScaledVector(dir, a.distanceTo(b) * rng.range(0.15, 0.3)), depth - 1, width * 0.5, bright * 0.6);
        }
        prev = p;
      }
    };
    branch(top, bottom, 2, 0.12, 22);
    bolts.push({ s, strength: L.strength, pos: L.pos });
  }
  fx.bolts = bolts;

  sparks.build(scene); fire.build(scene); smoke.build(scene); glows.build(scene); rings.build(scene);
  console.log(`fx: sparks ${sparks.items.length}, fire ${fire.items.length}, smoke ${smoke.items.length}, glows ${glows.items.length}`);

  // ---- weapon trails
  const segCache = new Map();
  const segAt = (c, s) => {
    const key = c.name + s.toFixed(5);
    let v = segCache.get(key);
    if (!v) {
      v = weaponSegments(c, s);
      segCache.set(key, v);
      if (segCache.size > 4000) segCache.clear();
    }
    return v;
  };
  const trails = [
    new Trail(scene, 26, new THREE.Color(0.8, 1.7, 2.2), new THREE.Color(0.02, 0.14, 0.45), (s) => segAt(A, s)[0], 0.13),
    new Trail(scene, 26, new THREE.Color(1.4, 0.7, 0.2), new THREE.Color(0.3, 0.05, 0.01), (s) => segAt(B, s)[0], 0.1),
    new Trail(scene, 26, new THREE.Color(1.4, 0.7, 0.2), new THREE.Color(0.3, 0.05, 0.01), (s) => segAt(B, s)[1], 0.1),
  ];

  // ---- fissure crack decal
  const fisLen = fis.origin.x - ex.pos.x + 0.6;
  const crackMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uFront: { value: 0 }, uFade: { value: 0 }, uLen: { value: fisLen }, uTime: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */ `
      uniform float uFront, uFade, uLen, uTime; varying vec2 vUv;
      ${NOISE3_GLSL}
      void main(){
        float x = vUv.x * uLen;
        if (x > uFront) discard;
        float z = (vUv.y - 0.5) * 1.6;
        float c = sin(x * 3.1) * 0.12 + (vnoise3(vec3(x * 4.0, 0.0, 1.0)) - 0.5) * 0.25;
        float d = abs(z - c);
        float crack = exp(-d * 55.0) * 1.4 + exp(-d * 9.0) * 0.35;
        float br = vnoise3(vec3(x * 7.0, z * 7.0, 3.0));
        crack += exp(-abs(z - c + (br - 0.5) * 0.8) * 70.0) * step(0.62, br) * 0.6;
        float hot = exp(-(uFront - x) * 1.2);
        vec3 col = mix(vec3(1.0, 0.25, 0.03), vec3(1.0, 0.75, 0.35), hot) * (2.0 + 4.0 * hot);
        gl_FragColor = vec4(col * crack * uFade * (0.8 + 0.2 * sin(uTime * 20.0 + x * 5.0)), 1.0);
      }`,
  });
  const crack = new THREE.Mesh(new THREE.PlaneGeometry(fisLen, 1.6), crackMat);
  crack.rotation.x = -Math.PI / 2;
  crack.rotation.z = Math.PI;
  crack.position.set(fis.origin.x - fisLen / 2, 0.015, fis.origin.z);
  crack.renderOrder = 3;
  scene.add(crack);

  // ---- crescent wave mesh
  const cs = new THREE.Shape();
  const N = 24;
  for (let i = 0; i <= N; i++) { const a = -1.15 + (i / N) * 2.3; const x = Math.cos(a) * 1.0, z = Math.sin(a) * 1.15; i === 0 ? cs.moveTo(x, z) : cs.lineTo(x, z); }
  for (let i = N; i >= 0; i--) { const a = -1.05 + (i / N) * 2.1; cs.lineTo(Math.cos(a) * 0.72 - 0.05, Math.sin(a) * 1.0); }
  const creGeo = new THREE.ShapeGeometry(cs);
  creGeo.rotateX(Math.PI / 2);
  const creMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uI: { value: 0 }, uTime: { value: 0 } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */ `
      uniform float uI, uTime; varying vec3 vP;
      void main(){
        float r = length(vec2(vP.x, vP.z / 1.15));
        float edge = smoothstep(0.72, 1.0, r);
        float tips = 1.0 - smoothstep(0.6, 1.1, abs(vP.z));
        vec3 col = mix(vec3(0.1, 0.5, 1.0), vec3(0.8, 1.0, 1.0), pow(edge, 3.0)) * (1.0 + 2.2 * pow(edge, 6.0));
        gl_FragColor = vec4(col * edge * tips * uI, 1.0);
      }`,
  });
  const crescent = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(creGeo, creMat);
    m.position.x = -i * 0.25;
    m.scale.setScalar(1 - i * 0.12);
    crescent.add(m);
  }
  crescent.visible = false;
  scene.add(crescent);

  // ---- debris rocks from the explosion
  const debrisN = 26;
  const debris = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.09, 0), new THREE.MeshStandardMaterial({ color: 0x3a3c42, roughness: 0.9 }), debrisN);
  debris.castShadow = true;
  const debrisData = [];
  for (let i = 0; i < debrisN; i++) {
    const d = rng.dir(V()); d.y = Math.abs(d.y) * 0.8 + 0.3;
    debrisData.push({ v: d.multiplyScalar(rng.range(3, 9)), sc: rng.range(0.5, 1.6), rot: new THREE.Vector3(rng.range(-9, 9), rng.range(-9, 9), rng.range(-9, 9)) });
  }
  scene.add(debris);

  // ---- glaive fragments when it shatters
  const fragN = 10;
  const frags = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 0.28, 0.05), rigs.B.mats.armorDark, fragN);
  const fragData = [];
  for (let i = 0; i < fragN; i++) fragData.push({ along: -1.3 + (i / (fragN - 1)) * 2.6, v: new THREE.Vector3(rng.range(-1.5, 1.5), rng.range(0.5, 3), rng.range(-1.5, 1.5)), rot: new THREE.Vector3(rng.range(-8, 8), rng.range(-8, 8), rng.range(-8, 8)) });
  frags.visible = false;
  scene.add(frags);

  // ---- ambient particles
  const rain = makeWrapSystem(scene, 5000, 11, { box: new THREE.Vector3(26, 16, 26), vel: new THREE.Vector3(-1.2, -16, 0.6), sway: 0, size: 0.004, streak: 0.035, color: new THREE.Color(0.45, 0.55, 0.75).multiplyScalar(0.55), layer: 1 });
  const embers = makeWrapSystem(scene, 700, 12, { box: new THREE.Vector3(30, 10, 30), vel: new THREE.Vector3(0.2, 0.45, 0.05), sway: 0.6, size: 0.012, streak: 0.25, color: new THREE.Color(1.0, 0.45, 0.12).multiplyScalar(2.5), color2: new THREE.Color(0.4, 0.85, 1.0).multiplyScalar(2.2) });

  // ---- lights
  const lightA = new THREE.PointLight(0x4fd8ff, 0, 0, 2);
  const lightB = new THREE.PointLight(0xff6a22, 0, 0, 2);
  const flashL = new THREE.PointLight(0xffffff, 0, 0, 2);
  const fxL = new THREE.PointLight(0xff7a30, 0, 0, 2);
  scene.add(lightA, lightB, flashL, fxL);

  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3();

  fx.update = (r, s, camera, W, H, poses) => {
    for (const sys of [sparks, fire, smoke, glows, rings]) sys.update(s, W, H);
    sparks.update(s, W, H);
    for (const t of trails) t.update(s);
    trails[0].uniforms.uAlpha.value = clamp(poses.A.blade, 0, 1);
    trails[1].uniforms.uAlpha.value = trails[2].uniforms.uAlpha.value = r < events.misc.shatter.r ? clamp(poses.B.blade, 0, 1) : 0;
    for (const g of groundRings) g.mesh.material.uniforms.uAge.value = s - g.ev.s;
    // fissure
    crackMat.uniforms.uFront.value = clamp((s - fis.s0) * fis.speed, 0, fisLen);
    crackMat.uniforms.uFade.value = s < fis.s0 ? 0 : 1 - smoothstep(ex.s + 0.3, ex.s + 1.8, s);
    crackMat.uniforms.uTime.value = s;
    crack.visible = s > fis.s0 && s < ex.s + 2;
    // crescent
    crescent.visible = s >= cre.s0 && s < cre.sEnd;
    if (crescent.visible) {
      const u = (s - cre.s0) / (cre.sEnd - cre.s0);
      crescent.position.set(cre.origin.x + cre.speed * (s - cre.s0), cre.origin.y, cre.origin.z);
      crescent.scale.setScalar(0.7 + u * 0.5);
      crescent.rotation.z = -0.12;
      creMat.uniforms.uI.value = smoothstep(0, 0.05, s - cre.s0) * 0.8;
    }
    // debris
    debris.visible = s > ex.s;
    if (debris.visible) {
      const age = s - ex.s;
      for (let i = 0; i < debrisN; i++) {
        const d = debrisData[i];
        const tl = (d.v.y + Math.sqrt(d.v.y * d.v.y + 2 * 9.8 * ex.pos.y)) / 9.8;
        const a = Math.min(age, tl);
        tmpP.set(ex.pos.x + d.v.x * a, ex.pos.y + d.v.y * a - 4.9 * a * a, ex.pos.z + d.v.z * a);
        tmpP.y = Math.max(tmpP.y, 0.05);
        tmpE.set(d.rot.x * a, d.rot.y * a, d.rot.z * a);
        tmpQ.setFromEuler(tmpE);
        tmpS.setScalar(d.sc);
        tmpM.compose(tmpP, tmpQ, tmpS);
        debris.setMatrixAt(i, tmpM);
      }
      debris.instanceMatrix.needsUpdate = true;
    }
    // glaive shatter
    const sh = events.misc.shatter;
    rigs.B.weapon.group.visible = r < sh.r;
    frags.visible = r >= sh.r && r < 15;
    if (frags.visible) {
      const P0 = poses.Bshatter || (poses.Bshatter = evalPose(B, sh.s, { _noVel: true }));
      const age = s - sh.s;
      for (let i = 0; i < fragN; i++) {
        const d = fragData[i];
        tmpP.copy(P0.weaponPos).addScaledVector(P0.dirW, d.along);
        const tl = Math.max((d.v.y + Math.sqrt(d.v.y * d.v.y + 2 * 9.8 * tmpP.y)) / 9.8, 0.01);
        const a = Math.min(age, tl);
        tmpP.x += d.v.x * a; tmpP.y += d.v.y * a - 4.9 * a * a; tmpP.z += d.v.z * a;
        tmpP.y = Math.max(tmpP.y, 0.03);
        tmpQ.setFromEuler(tmpE.set(d.rot.x * a, d.rot.y * a, d.rot.z * a)).premultiply(P0.weaponQuat);
        tmpM.compose(tmpP, tmpQ, tmpS.setScalar(1));
        frags.setMatrixAt(i, tmpM);
      }
      frags.instanceMatrix.needsUpdate = true;
    }
    // ambient
    rain.uniforms.uTime.value = r;
    rain.uniforms.uCenter.value.copy(camera.position);
    rain.uniforms.uRes.value.set(W, H);
    embers.uniforms.uTime.value = r;
    embers.uniforms.uCenter.value.set(0, 4, 0);
    embers.uniforms.uRes.value.set(W, H);
    // lights
    const PA = poses.A, PB = poses.B;
    lightA.position.copy(PA.weaponPos).addScaledVector(PA.dirW, 0.6).addScaledVector(tmpS.subVectors(camera.position, lightA.position).normalize(), 0.0);
    lightA.position.addScaledVector(tmpS.subVectors(camera.position, lightA.position).normalize(), 0.35);
    lightA.intensity = 2.2 * clamp(PA.blade, 0, 1.2) * (1 + PA.aura * 1.5);
    lightB.position.copy(PB.weaponPos).addScaledVector(tmpS.subVectors(camera.position, PB.weaponPos).normalize(), 0.35);
    const flick = 0.8 + 0.2 * Math.sin(s * 31) * Math.sin(s * 13.7);
    lightB.intensity = r < sh.r ? 2.8 * clamp(PB.blade, 0, 1.2) * flick * (1 + PB.aura) : 0;
    let best = 0, bestF = null;
    for (const f of flashes) {
      const age = s - f.s;
      if (age < 0 || age > 2) continue;
      const k = f.intensity * Math.exp(-age * f.decay);
      if (k > best) { best = k; bestF = f; }
    }
    flashL.intensity = best;
    if (bestF) {
      // keep the flash a little off the contact point (toward the camera) to avoid hot spots on nearby armor
      flashL.position.copy(bestF.pos).addScaledVector(tmpP.subVectors(camera.position, bestF.pos).normalize(), 0.9);
      flashL.color.copy(bestF.color);
    }
    // effect light: fissure front, crescent, aura, dissolve
    let fi = 0;
    if (s > fis.s0 && s < ex.s) { fi = 10; fxL.color.set(0xff6a20); fxL.position.set(fis.origin.x - (s - fis.s0) * fis.speed, 0.5, 0); }
    if (crescent.visible) { fi = 10; fxL.color.set(0x55ccff); fxL.position.copy(crescent.position); }
    if (r > events.misc.dissolve.r0 && r < events.misc.dissolve.r1 + 0.3) { fi = 8; fxL.color.set(0xff6a20); fxL.position.copy(PB.chestPos); }
    fxL.intensity = fi;
    // magic circle pulse on big moments
    let pulse = 0, pr = 0;
    for (const p of [{ s: ex.s, k: 1.5 }, { s: events.misc.finalCross.s, k: 1.2 }, { s: events.clashes[0].s, k: 0.8 }, { s: fis.s0, k: 0.6 }]) {
      const age = s - p.s;
      if (age > 0 && age < 1.5) { const v = p.k * Math.exp(-age * 2.5); if (v > pulse) { pulse = v; pr = age * 9; } }
    }
    env.circle.material.uniforms.uPulse.value = pulse;
    env.circle.material.uniforms.uPulseR.value = pr;
    env.circle.material.uniforms.uGlow.value = 0.22 + 0.25 * Math.max(PA.aura, Math.min(PB.aura, 1)) + 0.1 * (PA.eyes + PB.eyes) * 0.5;
    // smoke is lit by flashes
    smoke.uniforms.uLight.value.setRGB(0.05, 0.06, 0.08).addScalar(best / 400);
    // lightning flash level for the sky
    let lf = 0;
    for (const b of bolts) {
      const age = s - b.s;
      if (age >= 0 && age < 0.6) lf = Math.max(lf, b.strength * (Math.exp(-age * 8) + (age > 0.06 && age < 0.1 ? 0.6 : 0) + (age > 0.13 && age < 0.17 ? 0.4 : 0)));
    }
    fx.lightningFlash = lf;
  };
  return fx;
}
