// Two floating spirit-armor warriors built from procedural geometry.
//  A: "Azure Ronin"  - lacquered samurai armor, cyan plasma katana, spirit-flame lower body, scarf
//  B: "Crimson Oni"  - obsidian armor with molten cracks, horns, thunder-drum halo, flaming glaive
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RNG, basisQuat, clamp } from './util.js';

export const NOISE3_GLSL = /* glsl */ `
float h31(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(h31(i+vec3(0,0,0)), h31(i+vec3(1,0,0)), f.x), mix(h31(i+vec3(0,1,0)), h31(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(h31(i+vec3(0,0,1)), h31(i+vec3(1,0,1)), f.x), mix(h31(i+vec3(0,1,1)), h31(i+vec3(1,1,1)), f.x), f.y), f.z); }
float fbm3(vec3 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ v += a * vnoise3(p); p = p * 2.03 + 17.1; a *= 0.5; } return v; }
`;

// ---------------------------------------------------------------- material helpers
const hdr = (hex, k) => new THREE.Color(hex).multiplyScalar(k);
const glow = (hex, k) => new THREE.MeshBasicMaterial({ color: hdr(hex, k) });

function addDissolve(mat, U) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uDissolve = U.uDissolve;
    sh.uniforms.uDisBase = U.uDisBase;
    sh.uniforms.uDisCol = U.uDisCol;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDisW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvDisW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vDisW; uniform float uDissolve, uDisBase; uniform vec3 uDisCol;\n${NOISE3_GLSL}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        float disKey = clamp((vDisW.y - uDisBase) / 2.8, 0.0, 1.0) * 0.55 + fbm3(vDisW * 9.0) * 0.6;
        float disThr = 1.15 - uDissolve * 1.4;
        if (uDissolve > 0.0 && disKey > disThr) discard;
        float disEdge = uDissolve > 0.0 ? smoothstep(0.09, 0.0, disThr - disKey) : 0.0;`)
      .replace('#include <tonemapping_fragment>', 'gl_FragColor.rgb += uDisCol * disEdge * 9.0;\n#include <tonemapping_fragment>');
  };
  mat.customProgramCacheKey = () => 'dissolve';
  return mat;
}

function crackTexture(seed, size = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, size, size);
  const rng = new RNG(seed);
  g.lineCap = 'round';
  for (let k = 0; k < 26; k++) {
    let x = rng.range(0, size), y = rng.range(0, size), a = rng.range(0, Math.PI * 2);
    const steps = rng.int(8, 22);
    let w = rng.range(1.5, 4.5);
    g.strokeStyle = `rgba(255,255,255,${rng.range(0.5, 1)})`;
    for (let i = 0; i < steps; i++) {
      const nx = x + Math.cos(a) * rng.range(6, 18), ny = y + Math.sin(a) * rng.range(6, 18);
      g.lineWidth = w;
      g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke();
      // wrap for tiling
      for (const [ox, oy] of [[size, 0], [-size, 0], [0, size], [0, -size]]) {
        g.beginPath(); g.moveTo(x + ox, y + oy); g.lineTo(nx + ox, ny + oy); g.stroke();
      }
      x = nx; y = ny; a += rng.range(-0.7, 0.7); w *= 0.93;
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function scratchTexture(seed, size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = 'rgb(128,128,128)';
  g.fillRect(0, 0, size, size);
  const rng = new RNG(seed);
  for (let i = 0; i < 400; i++) {
    const v = rng.range(90, 200);
    g.strokeStyle = `rgba(${v},${v},${v},0.5)`;
    g.lineWidth = rng.range(0.5, 1.5);
    const x = rng.range(0, size), y = rng.range(0, size), a = rng.range(0, Math.PI), l = rng.range(4, 30);
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ---------------------------------------------------------------- geometry helpers
function lathe(profile, segs = 24, sz = 1) {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segs);
  g.scale(1, 1, sz);
  return g;
}

function taperTube(pts, r0, r1, radial = 10, segs = 24) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
  const g = new THREE.TubeGeometry(curve, segs, 1, radial, false);
  const p = g.attributes.position;
  const c = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    const ring = Math.floor(i / (radial + 1));
    const u = ring / segs;
    curve.getPointAt(u, c);
    v.fromBufferAttribute(p, i).sub(c).multiplyScalar(r0 + (r1 - r0) * Math.pow(u, 0.9));
    p.setXYZ(i, c.x + v.x, c.y + v.y, c.z + v.z);
  }
  g.computeVertexNormals();
  return g;
}

function curvedPlate(r, h, theta0, thetaLen, thick = 0.012) {
  const g = new THREE.CylinderGeometry(r, r * 1.08, h, 18, 1, true, theta0, thetaLen);
  return g;
}

function mesh(geo, mat, parent, pos, rot, scl) {
  const m = new THREE.Mesh(geo, mat);
  if (pos) m.position.set(...pos);
  if (rot) m.rotation.set(...rot);
  if (scl) (typeof scl === 'number' ? m.scale.setScalar(scl) : m.scale.set(...scl));
  m.castShadow = true;
  m.receiveShadow = true;
  if (parent) parent.add(m);
  return m;
}

// ---------------------------------------------------------------- dynamic tube (spirit tail)
const TAIL_VS = /* glsl */ `
  varying vec2 vUv; varying vec3 vW; varying vec3 vN;
  void main(){ vUv = uv; vN = normal; vW = position; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }`;
const TAIL_FS = /* glsl */ `
  uniform vec3 uCore, uEdge; uniform float uTime, uIntensity;
  varying vec2 vUv; varying vec3 vW; varying vec3 vN;
  ${NOISE3_GLSL}
  void main(){
    vec3 V = normalize(cameraPosition - vW);
    float f = abs(dot(normalize(vN), V));
    float along = vUv.x;
    float n = fbm3(vW * 3.2 + vec3(0.0, uTime * 2.6, uTime * 0.7));
    float n2 = fbm3(vW * 7.0 + vec3(0.0, uTime * 4.0, 0.0));
    float body = pow(1.0 - along, 1.1);
    float flame = smoothstep(0.42, 0.9, n * 0.85 + n2 * 0.45 + body * 0.35 - (1.0 - f) * 0.3);
    vec3 col = mix(uEdge, uCore, pow(f, 2.0) * body);
    float a = flame * body * smoothstep(0.0, 0.06, along + 0.01) * (0.35 + 0.65 * f);
    gl_FragColor = vec4(col * a * uIntensity, 1.0);
  }`;

class DynamicTube {
  constructor(n, m, core, edge) {
    this.n = n; this.m = m;
    const geo = new THREE.BufferGeometry();
    const count = n * (m + 1);
    this.pos = new Float32Array(count * 3);
    this.nrm = new Float32Array(count * 3);
    const uv = new Float32Array(count * 2);
    const idx = [];
    for (let i = 0; i < n; i++) {
      for (let j = 0; j <= m; j++) {
        uv[(i * (m + 1) + j) * 2] = i / (n - 1);
        uv[(i * (m + 1) + j) * 2 + 1] = j / m;
        if (i < n - 1 && j < m) {
          const a = i * (m + 1) + j, b = a + m + 1;
          idx.push(a, b, a + 1, a + 1, b, b + 1);
        }
      }
    }
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(this.nrm, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    this.uniforms = { uCore: { value: core }, uEdge: { value: edge }, uTime: { value: 0 }, uIntensity: { value: 1 } };
    this.mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: TAIL_VS, fragmentShader: TAIL_FS,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    this.mesh.frustumCulled = false;
    this._t = new THREE.Vector3(); this._a = new THREE.Vector3(); this._b = new THREE.Vector3(); this._ref = new THREE.Vector3(1, 0, 0);
  }
  update(points, radii) {
    const { n, m } = this;
    const T = this._t, A = this._a, B = this._b;
    for (let i = 0; i < n; i++) {
      const p = points[i];
      const q = points[Math.min(i + 1, n - 1)], o = points[Math.max(i - 1, 0)];
      T.subVectors(q, o).normalize();
      A.copy(this._ref).addScaledVector(T, -this._ref.dot(T));
      if (A.lengthSq() < 1e-6) A.set(0, 0, 1);
      A.normalize();
      B.crossVectors(T, A);
      for (let j = 0; j <= m; j++) {
        const th = (j / m) * Math.PI * 2;
        const c = Math.cos(th), s = Math.sin(th);
        const nx = A.x * c + B.x * s, ny = A.y * c + B.y * s, nz = A.z * c + B.z * s;
        const k = (i * (m + 1) + j) * 3;
        this.pos[k] = p.x + nx * radii[i];
        this.pos[k + 1] = p.y + ny * radii[i];
        this.pos[k + 2] = p.z + nz * radii[i];
        this.nrm[k] = nx; this.nrm[k + 1] = ny; this.nrm[k + 2] = nz;
      }
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.normal.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- dynamic ribbon (scarf)
class DynamicRibbon {
  constructor(n, mat) {
    this.n = n;
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 2 * 3);
    const uv = new Float32Array(n * 2 * 2);
    const idx = [];
    for (let i = 0; i < n; i++) {
      uv[i * 4] = i / (n - 1); uv[i * 4 + 1] = 0;
      uv[i * 4 + 2] = i / (n - 1); uv[i * 4 + 3] = 1;
      if (i < n - 1) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
  }
  update(points, sides, widths) {
    for (let i = 0; i < this.n; i++) {
      const p = points[i], s = sides[i], w = widths[i];
      const k = i * 6;
      this.pos[k] = p.x - s.x * w; this.pos[k + 1] = p.y - s.y * w; this.pos[k + 2] = p.z - s.z * w;
      this.pos[k + 3] = p.x + s.x * w; this.pos[k + 4] = p.y + s.y * w; this.pos[k + 5] = p.z + s.z * w;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
  }
}

// ---------------------------------------------------------------- weapons
function buildKatana(mats) {
  const g = new THREE.Group();
  // handle (+Y is blade direction, grip at origin)
  mesh(new THREE.CylinderGeometry(0.021, 0.023, 0.3, 12), mats.wrap, g, [0, -0.12, 0]);
  for (let i = 0; i < 6; i++) mesh(new THREE.TorusGeometry(0.023, 0.004, 6, 12), mats.trim, g, [0, -0.25 + i * 0.05, 0], [Math.PI / 2, 0, 0]);
  mesh(new THREE.CylinderGeometry(0.026, 0.024, 0.035, 12), mats.trim, g, [0, -0.285, 0]);
  // tsuba: hexagonal guard with glowing rim
  mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.012, 6), mats.armorDark, g, [0, 0.04, 0]);
  mesh(new THREE.TorusGeometry(0.062, 0.0045, 6, 6), mats.glowSoft, g, [0, 0.04, 0], [Math.PI / 2, 0, Math.PI / 6]);
  mesh(new THREE.BoxGeometry(0.03, 0.04, 0.02), mats.trim, g, [0, 0.065, 0]);
  // blade: slightly curved katana profile, extruded
  const L = 1.08, w = 0.032;
  const sh = new THREE.Shape();
  const curve = (y) => 0.025 * Math.pow(y / L, 2);
  sh.moveTo(-w / 2, 0);
  const N = 20;
  for (let i = 1; i <= N; i++) { const y = (i / N) * (L - 0.06); sh.lineTo(-w / 2 + curve(y), y); }
  sh.lineTo(-w / 2 + curve(L) + 0.01, L);
  for (let i = N; i >= 0; i--) { const y = (i / N) * (L - 0.1); sh.lineTo(w / 2 + curve(y), y); }
  const bladeGeo = new THREE.ExtrudeGeometry(sh, { depth: 0.006, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 1 });
  bladeGeo.translate(0, 0.085, -0.003);
  const core = mesh(bladeGeo, mats.bladeCore, g);
  core.castShadow = false;
  // soft glow shell
  const shell = new THREE.Mesh(bladeGeo, mats.bladeShell);
  shell.scale.set(1.9, 1.0, 3.2);
  shell.position.y = -0.002;
  g.add(shell);
  const blade = new THREE.Group();
  // move blade parts into a pivot so they can extend on ignition
  g.remove(core); g.remove(shell);
  blade.add(core, shell);
  g.add(blade);
  return { group: g, blade, segs: [[0.09, 1.16]], len: L };
}

function buildGlaive(mats) {
  const g = new THREE.Group();
  const S = 0.85;
  mesh(new THREE.CylinderGeometry(0.026, 0.026, S * 2, 12), mats.armorDark, g);
  for (const y of [-0.8, -0.55, -0.12, 0.12, 0.55, 0.8]) mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.03, 12), mats.trim, g, [0, y, 0]);
  mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 12), mats.wrap, g, [0, 0, 0]);
  const blades = [];
  const bladeShape = () => {
    const s = new THREE.Shape();
    s.moveTo(0.0, 0.0);
    s.quadraticCurveTo(0.17, 0.12, 0.13, 0.42);
    s.quadraticCurveTo(0.1, 0.56, -0.02, 0.66);
    s.quadraticCurveTo(0.03, 0.4, -0.06, 0.12);
    s.lineTo(-0.04, 0.0);
    return s;
  };
  const edgeShape = () => {
    const s = new THREE.Shape();
    s.moveTo(0.02, 0.03);
    s.quadraticCurveTo(0.2, 0.14, 0.155, 0.43);
    s.quadraticCurveTo(0.12, 0.6, -0.025, 0.7);
    s.quadraticCurveTo(0.09, 0.56, 0.11, 0.42);
    s.quadraticCurveTo(0.14, 0.17, 0.0, 0.05);
    return s;
  };
  for (const sgn of [1, -1]) {
    const head = new THREE.Group();
    head.position.y = sgn * S;
    if (sgn < 0) head.rotation.z = Math.PI;
    const geo = new THREE.ExtrudeGeometry(bladeShape(), { depth: 0.014, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2 });
    geo.translate(0, 0, -0.007);
    mesh(geo, mats.bladeMetal, head);
    const eg = new THREE.ExtrudeGeometry(edgeShape(), { depth: 0.008, bevelEnabled: false });
    eg.translate(0, 0, -0.004);
    const edge = mesh(eg, mats.fireEdge, head);
    edge.castShadow = false;
    // collar
    mesh(new THREE.CylinderGeometry(0.045, 0.032, 0.08, 10), mats.trim, head, [0, -0.02, 0]);
    mesh(new THREE.ConeGeometry(0.03, 0.12, 8), mats.trim, head, [-0.05, 0.06, 0], [0, 0, 0.6]);
    g.add(head);
    blades.push(head);
  }
  return { group: g, blade: null, blades, segs: [[0.9, 1.5], [-0.9, -1.5]], staff: [-0.85, 0.85], len: 1.5 };
}

// ---------------------------------------------------------------- characters
export function buildCharacter(kind, scene) {
  const A = kind === 'A';
  const s = A ? 1.0 : 1.16;
  const rig = { kind, s };
  rig.dims = {
    waist: new THREE.Vector3(0, 0.12, 0).multiplyScalar(s),
    shoulderR: new THREE.Vector3(-0.25, 0.47, -0.02).multiplyScalar(s),
    shoulderL: new THREE.Vector3(0.25, 0.47, -0.02).multiplyScalar(s),
    neck: new THREE.Vector3(0, 0.58, 0.0).multiplyScalar(s),
    L1: 0.33 * s, L2: 0.32 * s,
  };
  const disU = { uDissolve: { value: 0 }, uDisBase: { value: 0 }, uDisCol: { value: new THREE.Color(1.0, 0.4, 0.08) } };
  rig.disU = disU;

  // ---- materials
  const scratch = scratchTexture(A ? 3 : 5);
  scratch.repeat.set(2, 2);
  const M = {};
  if (A) {
    M.armor = new THREE.MeshPhysicalMaterial({ color: 0x18243a, metalness: 0.55, roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.15, roughnessMap: scratch });
    M.armorDark = new THREE.MeshStandardMaterial({ color: 0x0b0f17, metalness: 0.7, roughness: 0.4 });
    M.trim = new THREE.MeshStandardMaterial({ color: 0xc9d4e3, metalness: 1.0, roughness: 0.22 });
    M.wrap = new THREE.MeshStandardMaterial({ color: 0x1c2d4d, metalness: 0.1, roughness: 0.8 });
    M.glow = glow(0x5fe6ff, 7);
    M.glowSoft = glow(0x5fe6ff, 3);
    M.eye = glow(0x9ff3ff, 12);
    M.bladeCore = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 3.0, 4.2) });
    M.bladeShell = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.05, 0.35, 0.6), transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
    M.scarf = new THREE.MeshStandardMaterial({ color: 0x24406e, roughness: 0.7, metalness: 0.0, side: THREE.DoubleSide, emissive: new THREE.Color(0x0a2240), emissiveIntensity: 0.4 });
  } else {
    const cracks = crackTexture(11);
    cracks.repeat.set(2, 2);
    M.armor = addDissolve(new THREE.MeshStandardMaterial({ color: 0x150f10, metalness: 0.75, roughness: 0.38, roughnessMap: scratch, emissive: new THREE.Color(1.0, 0.32, 0.05), emissiveMap: cracks, emissiveIntensity: 2.2 }), disU);
    M.armorDark = addDissolve(new THREE.MeshStandardMaterial({ color: 0x0c0909, metalness: 0.7, roughness: 0.45 }), disU);
    M.trim = addDissolve(new THREE.MeshStandardMaterial({ color: 0xa8742e, metalness: 1.0, roughness: 0.3 }), disU);
    M.wrap = addDissolve(new THREE.MeshStandardMaterial({ color: 0x3a0c0a, metalness: 0.1, roughness: 0.8 }), disU);
    M.mask = addDissolve(new THREE.MeshPhysicalMaterial({ color: 0x7a0b0b, metalness: 0.3, roughness: 0.35, clearcoat: 1.0, clearcoatRoughness: 0.1 }), disU);
    M.bone = addDissolve(new THREE.MeshStandardMaterial({ color: 0xd6c8a8, metalness: 0.0, roughness: 0.5 }), disU);
    M.glow = addDissolve(glow(0xff6a1a, 7), disU);
    M.glowSoft = addDissolve(glow(0xff6a1a, 3), disU);
    M.eye = addDissolve(glow(0xffc04a, 14), disU);
    M.bladeMetal = addDissolve(new THREE.MeshStandardMaterial({ color: 0x1a1312, metalness: 0.95, roughness: 0.25 }), disU);
    M.fireEdge = addDissolve(new THREE.MeshBasicMaterial({ color: new THREE.Color(7.0, 2.6, 0.5) }), disU);
  }
  rig.mats = M;

  // ---- hierarchy
  const root = new THREE.Group();
  const chest = new THREE.Group();
  chest.position.copy(rig.dims.waist);
  root.add(chest);
  const head = new THREE.Group();
  head.position.copy(rig.dims.neck);
  chest.add(head);
  scene.add(root);
  rig.root = root; rig.chest = chest; rig.head = head;
  const sc = (arr) => arr.map((v) => v * s);

  // ---- pelvis + skirt plates (hang from waist, sway with motion)
  mesh(new THREE.CylinderGeometry(0.15 * s, 0.13 * s, 0.1 * s, 16), M.armorDark, root, sc([0, 0.1, 0]));
  mesh(new THREE.TorusGeometry(0.15 * s, 0.012 * s, 6, 24), M.trim, root, sc([0, 0.14, 0]), [Math.PI / 2, 0, 0]);
  rig.plates = [];
  const plateAngles = A ? [-1.2, -0.6, 0, 0.6, 1.2, 1.9, 2.55, Math.PI, -2.55, -1.9] : [-1.25, -0.62, 0, 0.62, 1.25, 1.9, 2.55, Math.PI, -2.55, -1.9];
  for (const a of plateAngles) {
    const pivot = new THREE.Group();
    pivot.position.set(Math.sin(a) * 0.15 * s, 0.09 * s, Math.cos(a) * 0.15 * s);
    pivot.rotation.y = a;
    root.add(pivot);
    const pl = mesh(new RoundedBoxGeometry(0.11 * s, 0.34 * s, 0.02 * s, 2, 0.008 * s), M.armor, pivot, sc([0, -0.16, 0.045]), [0.3, 0, 0]);
    mesh(new THREE.BoxGeometry(0.112 * s, 0.012 * s, 0.024 * s), M.trim, pivot, sc([0, -0.325, 0.095]), [0.3, 0, 0]);
    if (!A) mesh(new THREE.ConeGeometry(0.016 * s, 0.06 * s, 6), M.trim, pivot, sc([0, -0.16, 0.07]), [Math.PI / 2 + 0.3, 0, 0]);
    else { const gl = mesh(new THREE.BoxGeometry(0.004 * s, 0.24 * s, 0.024 * s), M.glowSoft, pivot, sc([0, -0.17, 0.058]), [0.3, 0, 0]); gl.castShadow = false; }
    rig.plates.push({ pivot, a });
  }

  // ---- torso
  const torsoProfile = A
    ? [[0.0, 0.0], [0.12, 0.0], [0.14, 0.12], [0.2, 0.3], [0.23, 0.42], [0.2, 0.52], [0.09, 0.57], [0.0, 0.58]]
    : [[0.0, 0.0], [0.13, 0.0], [0.16, 0.12], [0.24, 0.3], [0.27, 0.42], [0.24, 0.53], [0.1, 0.58], [0.0, 0.59]];
  mesh(lathe(torsoProfile.map(([r, y]) => [r * s, y * s]), A ? 24 : 10, 0.72), M.armor, chest);
  // chest plate
  mesh(new RoundedBoxGeometry(0.34 * s, 0.26 * s, 0.07 * s, 3, 0.025 * s), M.armor, chest, sc([0, 0.38, 0.12]), [-0.12, 0, 0]);
  mesh(new RoundedBoxGeometry(0.3 * s, 0.14 * s, 0.06 * s, 3, 0.02 * s), M.armor, chest, sc([0, 0.2, 0.11]), [0.05, 0, 0]);
  mesh(new THREE.BoxGeometry(0.35 * s, 0.014 * s, 0.075 * s), M.trim, chest, sc([0, 0.5, 0.125]), [-0.12, 0, 0]);
  mesh(new THREE.BoxGeometry(0.31 * s, 0.012 * s, 0.065 * s), M.trim, chest, sc([0, 0.27, 0.12]));
  // glowing core
  rig.core = mesh(new THREE.OctahedronGeometry(0.045 * s, 0), M.glow, chest, sc([0, 0.37, 0.17]), [0, 0, 0], [1, 1.3, 0.5]);
  rig.core.castShadow = false;
  // seams
  for (const sx of [-1, 1]) {
    const seam = mesh(new THREE.BoxGeometry(0.005 * s, 0.2 * s, 0.01 * s), M.glowSoft, chest, sc([sx * 0.09, 0.36, 0.16]), [-0.12, 0, sx * 0.4]);
    seam.castShadow = false;
  }
  // back plate + collar
  mesh(new RoundedBoxGeometry(0.34 * s, 0.34 * s, 0.06 * s, 2, 0.02 * s), M.armor, chest, sc([0, 0.37, -0.12]), [0.1, 0, 0]);
  mesh(new THREE.CylinderGeometry(0.1 * s, 0.13 * s, 0.07 * s, 16, 1, true), M.armorDark, chest, sc([0, 0.58, 0]));

  // ---- shoulders
  rig.pauldrons = [];
  for (const side of [-1, 1]) {
    const sp = new THREE.Group();
    sp.position.copy(side < 0 ? rig.dims.shoulderR : rig.dims.shoulderL);
    chest.add(sp);
    if (A) {
      // samurai sode: stacked curved lames
      for (let i = 0; i < 3; i++) {
        const r = (0.12 + i * 0.012) * s;
        const lame = mesh(curvedPlate(r, 0.075 * s, side < 0 ? Math.PI : 0, Math.PI), M.armor, sp, [side * 0.04 * s, (0.02 - i * 0.06) * s, 0], [0, side < 0 ? -Math.PI / 2 : -Math.PI / 2, side * (0.32 + i * 0.05)]);
        lame.material = M.armor;
        lame.material.side = THREE.DoubleSide;
        mesh(new THREE.TorusGeometry(r * 1.06, 0.004 * s, 4, 16, Math.PI), M.trim, sp, [side * 0.04 * s, (-0.018 - i * 0.06) * s, 0], [Math.PI / 2, 0, side < 0 ? Math.PI / 2 : -Math.PI / 2]).rotation.y = side * (0.32 + i * 0.05);
      }
      mesh(new THREE.SphereGeometry(0.075 * s, 16, 10), M.armorDark, sp, [0, 0, 0]);
    } else {
      const shell = mesh(new THREE.SphereGeometry(0.16 * s, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), M.armor, sp, sc([side * 0.04, -0.02, 0]), [0, 0, side * 0.5], [1.0, 0.8, 1.0]);
      shell.material.side = THREE.DoubleSide;
      mesh(new THREE.TorusGeometry(0.155 * s, 0.012 * s, 6, 24), M.trim, sp, sc([side * 0.09, -0.08, 0]), [Math.PI / 2, side * 0.5, 0]);
      for (let k = 0; k < 3; k++) {
        const spike = mesh(new THREE.ConeGeometry(0.03 * s, (0.2 - k * 0.04) * s, 8), M.bone, sp, sc([side * (0.06 + k * 0.03), 0.1 - k * 0.02, -0.06 + k * 0.06]), [0.2 - k * 0.2, 0, -side * (0.5 + k * 0.25)]);
      }
    }
    rig.pauldrons.push(sp);
  }

  // ---- head
  if (A) {
    mesh(new THREE.SphereGeometry(0.11 * s, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), M.armor, head, sc([0, 0.12, 0]));
    mesh(new THREE.TorusGeometry(0.108 * s, 0.008 * s, 6, 32), M.trim, head, sc([0, 0.105, 0]), [Math.PI / 2, 0, 0]);
    // shikoro (neck guard) lames
    for (let i = 0; i < 3; i++) {
      const g = new THREE.CylinderGeometry((0.115 + i * 0.03) * s, (0.14 + i * 0.03) * s, 0.04 * s, 24, 1, true, Math.PI * 0.2, Math.PI * 1.6);
      const m = mesh(g, M.armor, head, sc([0, 0.09 - i * 0.035, -0.01]), [0.15, Math.PI, 0]);
      m.material.side = THREE.DoubleSide;
    }
    // fukigaeshi side flaps
    for (const sx of [-1, 1]) mesh(new RoundedBoxGeometry(0.02 * s, 0.07 * s, 0.07 * s, 2, 0.006 * s), M.armor, head, sc([sx * 0.15, 0.1, 0.05]), [0, sx * 0.5, sx * 0.3]);
    // face mask (menpo) with visor slit
    mesh(new THREE.SphereGeometry(0.085 * s, 20, 14), M.armorDark, head, sc([0, 0.07, 0.035]), [0, 0, 0], [1, 1.05, 0.95]);
    mesh(new RoundedBoxGeometry(0.13 * s, 0.05 * s, 0.05 * s, 2, 0.012 * s), M.armor, head, sc([0, 0.025, 0.08]));
    rig.eyes = [];
    for (const sx of [-1, 1]) {
      const e = mesh(new THREE.BoxGeometry(0.045 * s, 0.01 * s, 0.01 * s), M.eye, head, sc([sx * 0.032, 0.085, 0.112]), [0, 0, -sx * 0.18]);
      e.castShadow = false;
      rig.eyes.push(e);
    }
    // crescent crest (maedate)
    const cs = new THREE.Shape();
    cs.moveTo(-0.2, 0.15);
    cs.quadraticCurveTo(-0.08, -0.02, 0, -0.02);
    cs.quadraticCurveTo(0.08, -0.02, 0.2, 0.15);
    cs.quadraticCurveTo(0.07, 0.03, 0, 0.03);
    cs.quadraticCurveTo(-0.07, 0.03, -0.2, 0.15);
    const crest = mesh(new THREE.ExtrudeGeometry(cs, { depth: 0.006, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.003, bevelSegments: 1 }), M.trim, head, sc([0, 0.2, 0.085]), [-0.15, 0, 0], s);
    const crestGlow = mesh(new THREE.ExtrudeGeometry(cs, { depth: 0.002, bevelEnabled: false }), M.glowSoft, head, sc([0, 0.2, 0.093]), [-0.15, 0, 0], [s * 0.9, s * 0.8, s]);
    crestGlow.castShadow = false;
    // floating halo crescent behind the head
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.2 * s, 0.006 * s, 6, 48, Math.PI * 1.3), M.glow);
    halo.position.set(0, 0.12 * s, -0.17 * s);
    halo.rotation.z = Math.PI * 0.85;
    head.add(halo);
    rig.halo = halo;
  } else {
    // oni mask
    mesh(new THREE.SphereGeometry(0.13 * s, 24, 16), M.armorDark, head, sc([0, 0.1, -0.02]));
    mesh(new THREE.SphereGeometry(0.12 * s, 24, 16), M.mask, head, sc([0, 0.09, 0.03]), [0, 0, 0], [1.0, 1.08, 0.9]);
    mesh(new RoundedBoxGeometry(0.2 * s, 0.035 * s, 0.06 * s, 2, 0.012 * s), M.mask, head, sc([0, 0.14, 0.12]), [0.25, 0, 0]);
    mesh(new RoundedBoxGeometry(0.17 * s, 0.07 * s, 0.07 * s, 2, 0.02 * s), M.mask, head, sc([0, 0.0, 0.1]));
    rig.eyes = [];
    for (const sx of [-1, 1]) {
      const e = mesh(new THREE.BoxGeometry(0.05 * s, 0.016 * s, 0.01 * s), M.eye, head, sc([sx * 0.045, 0.11, 0.142]), [0, 0, sx * 0.35]);
      e.castShadow = false;
      rig.eyes.push(e);
    }
    const mouth = mesh(new THREE.BoxGeometry(0.11 * s, 0.012 * s, 0.01 * s), M.glow, head, sc([0, 0.02, 0.137]));
    mouth.castShadow = false;
    for (const sx of [-1, 1]) {
      mesh(new THREE.ConeGeometry(0.012 * s, 0.05 * s, 6), M.bone, head, sc([sx * 0.04, 0.045, 0.135]), [0, 0, 0]);
      mesh(new THREE.ConeGeometry(0.01 * s, 0.04 * s, 6), M.bone, head, sc([sx * 0.025, -0.0, 0.138]), [Math.PI, 0, 0]);
    }
    // horns
    for (const sx of [-1, 1]) {
      const pts = [[sx * 0.09, 0.15, 0.0], [sx * 0.17, 0.22, -0.03], [sx * 0.22, 0.36, -0.01], [sx * 0.19, 0.52, 0.06], [sx * 0.13, 0.6, 0.12]];
      mesh(taperTube(pts.map((p) => p.map((v) => v * s)), 0.04 * s, 0.004 * s, 10, 24), M.bone, head);
      const tip = mesh(new THREE.SphereGeometry(0.012 * s, 8, 6), M.glow, head, sc([sx * 0.13, 0.6, 0.12]));
      tip.castShadow = false;
    }
    // thunder-drum halo behind the back
    const ring = new THREE.Group();
    ring.position.set(0, 0.55 * s, -0.3 * s);
    chest.add(ring);
    mesh(new THREE.TorusGeometry(0.5 * s, 0.014 * s, 8, 64), M.trim, ring);
    const ringGlow = new THREE.Mesh(new THREE.TorusGeometry(0.5 * s, 0.006 * s, 6, 64), M.glowSoft);
    ringGlow.scale.setScalar(1.04);
    ring.add(ringGlow);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const d = new THREE.Group();
      d.position.set(Math.cos(a) * 0.5 * s, Math.sin(a) * 0.5 * s, 0);
      ring.add(d);
      mesh(new THREE.CylinderGeometry(0.075 * s, 0.075 * s, 0.07 * s, 16), M.mask, d, [0, 0, 0], [Math.PI / 2, 0, 0]);
      const face = mesh(new THREE.CircleGeometry(0.05 * s, 16), M.glow, d, [0, 0, 0.036 * s]);
      face.castShadow = false;
      mesh(new THREE.TorusGeometry(0.075 * s, 0.006 * s, 4, 16), M.trim, d, [0, 0, 0.036 * s]);
    }
    rig.ring = ring;
  }

  // ---- arms (live in world space, posed by IK every frame)
  rig.arms = {};
  for (const side of ['R', 'L']) {
    const upper = new THREE.Group(), fore = new THREE.Group(), hand = new THREE.Group();
    scene.add(upper, fore, hand);
    const L1 = rig.dims.L1, L2 = rig.dims.L2;
    const ar = (A ? 0.042 : 0.055) * s;
    mesh(new THREE.CapsuleGeometry(ar, L1 - ar * 2, 4, 12), M.armorDark, upper, [0, L1 / 2, 0]);
    mesh(new THREE.CylinderGeometry(ar * 1.18, ar * 1.38, L1 * 0.55, 14), M.armor, upper, [0, L1 * 0.42, 0]);
    mesh(new THREE.TorusGeometry(ar * 1.38, 0.005 * s, 6, 16), M.trim, upper, [0, L1 * 0.15, 0], [Math.PI / 2, 0, 0]);
    mesh(new THREE.SphereGeometry(ar * 1.25, 14, 10), M.trim, fore, [0, 0, 0]);
    mesh(new THREE.CylinderGeometry(ar * 1.15, ar * 1.45, L2 * 0.8, 12), M.armor, fore, [0, L2 * 0.55, 0]);
    mesh(new THREE.TorusGeometry(ar * 1.45, 0.006 * s, 6, 16), M.trim, fore, [0, L2 * 0.94, 0], [Math.PI / 2, 0, 0]);
    if (A) {
      const g = mesh(new THREE.BoxGeometry(0.004 * s, L2 * 0.6, 0.008 * s), M.glowSoft, fore, [0, L2 * 0.55, ar * 1.35]);
      g.castShadow = false;
    } else {
      for (let k = 0; k < 2; k++) mesh(new THREE.ConeGeometry(0.014 * s, 0.07 * s, 6), M.bone, fore, [0, L2 * (0.35 + k * 0.25), -ar * 1.5], [-Math.PI / 2 - 0.4, 0, 0]);
    }
    mesh(new RoundedBoxGeometry(0.075 * s, 0.09 * s, 0.085 * s, 2, 0.018 * s), M.armorDark, hand, [0, 0, 0]);
    mesh(new RoundedBoxGeometry(0.08 * s, 0.04 * s, 0.07 * s, 2, 0.012 * s), M.armor, hand, [0, -0.03 * s, -0.01 * s]);
    rig.arms[side] = { upper, fore, hand };
  }

  // ---- weapon
  const W = A ? buildKatana(M) : buildGlaive(M);
  W.group.scale.setScalar(A ? 1 : 1.0);
  scene.add(W.group);
  rig.weapon = W;

  // ---- spirit tail
  rig.tail = A
    ? new DynamicTube(18, 14, new THREE.Color(0.6, 1.4, 2.2), new THREE.Color(0.05, 0.35, 1.0))
    : new DynamicTube(18, 14, new THREE.Color(2.4, 1.0, 0.25), new THREE.Color(1.0, 0.12, 0.02));
  rig.tail.mesh.layers.set(1);
  scene.add(rig.tail.mesh);
  if (A) {
    rig.scarf = new DynamicRibbon(16, M.scarf);
    scene.add(rig.scarf.mesh);
  }

  // ---- per-frame pose application
  const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
  rig.apply = (P, t) => {
    root.position.copy(P.rootPos);
    root.quaternion.copy(P.rootQuat);
    chest.quaternion.copy(P.chestQuatL);
    head.quaternion.copy(P.headQuatL);
    // skirt sway against local velocity
    const lv = tmpV.copy(P.vel).applyQuaternion(tmpQ.copy(P.rootQuat).invert());
    for (const pl of rig.plates) {
      const fwd = Math.cos(pl.a) * lv.z + Math.sin(pl.a) * lv.x;
      pl.pivot.rotation.x = clamp(-fwd * 0.08, -0.2, 0.9) + Math.sin(t * 6 + pl.a * 3) * 0.03;
    }
    // arms
    for (const side of ['R', 'L']) {
      const a = rig.arms[side];
      const S = P['shoulder' + side], E = P['elbow' + side], Hd = P['hand' + side];
      a.upper.position.copy(S);
      basisQuat(tmpV.subVectors(E, S), P['pole' + side], a.upper.quaternion);
      const l1 = S.distanceTo(E) / rig.dims.L1;
      a.upper.scale.set(1, l1, 1);
      a.fore.position.copy(E);
      basisQuat(tmpV.subVectors(Hd, E), P['pole' + side], a.fore.quaternion);
      a.fore.scale.set(1, E.distanceTo(Hd) / rig.dims.L2, 1);
      a.hand.position.copy(Hd);
      if (side === 'R' || P.twoHand > 0.5) a.hand.quaternion.copy(P.weaponQuat);
      else basisQuat(tmpV.subVectors(Hd, E), P['pole' + side], a.hand.quaternion);
    }
    W.group.position.copy(P.weaponPos);
    W.group.quaternion.copy(P.weaponQuat);
    // ignition / glow levels
    if (A) {
      const b = P.blade;
      W.blade.scale.set(1, Math.max(b, 0.001), 1);
      W.blade.visible = b > 0.002;
      M.bladeCore.color.setRGB(1.0, 2.4, 3.4).multiplyScalar(0.6 + 0.4 * b + P.aura * 0.6);
      M.bladeShell.color.setRGB(0.05, 0.35, 0.6).multiplyScalar(1 + P.aura * 1.5);
      M.eye.color.setRGB(0.62, 0.95, 1.0).multiplyScalar(0.05 + 5 * P.eyes);
      M.glow.color.setRGB(0.37, 0.9, 1.0).multiplyScalar(0.2 + 3.0 * P.eyes + P.aura * 3);
      M.glowSoft.color.setRGB(0.37, 0.9, 1.0).multiplyScalar(0.1 + 1.4 * P.eyes + P.aura * 1.5);
      rig.halo.rotation.z = Math.PI * 0.85 + t * 0.4;
    } else {
      const fl = 0.85 + 0.15 * Math.sin(t * 23) * Math.sin(t * 7.3);
      M.fireEdge.color.setRGB(4.0, 1.5, 0.3).multiplyScalar((0.04 + P.blade * fl) * (1 + P.aura));
      M.eye.color.setRGB(1.0, 0.75, 0.29).multiplyScalar(0.05 + 6 * P.eyes);
      M.glow.color.setRGB(1.0, 0.42, 0.1).multiplyScalar(0.2 + 3.0 * P.eyes + P.aura * 3);
      M.glowSoft.color.setRGB(1.0, 0.42, 0.1).multiplyScalar(0.1 + 1.4 * P.eyes + P.aura * 1.5);
      M.armor.emissiveIntensity = (0.15 + 1.2 * P.eyes) * (0.8 + 0.2 * Math.sin(t * 3.1)) + P.aura * 3 + P.dissolve * 6;
      rig.ring.rotation.z = t * 0.5;
      disU.uDissolve.value = P.dissolve;
      disU.uDisBase.value = P.rootPos.y - 1.2;
    }
    // spirit tail
    rig.tail.uniforms.uTime.value = t;
    rig.tail.uniforms.uIntensity.value = (0.12 + 0.42 * P.eyes + P.aura * 0.45) * (1 - P.dissolve);
    rig.tail.update(P.tailPts, P.tailR);
    if (rig.scarf) rig.scarf.update(P.scarfPts, P.scarfSides, P.scarfW);
  };
  return rig;
}
