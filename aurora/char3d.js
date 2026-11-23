// A character = sculpted skinned mesh + ink outline + dynamic hair/cloth. Motion comes from
// the planar 2D pose solve (skel2d.js), lifted to 3D joints with per-limb depth offsets.
import * as THREE from 'three';
import { solve, DIMS } from './skel2d.js';
import { BONES, boneFrame, buildSera, buildKokuya, hex } from './sculpt.js';
import { inkMaterial, linkLights } from './shaders.js';
import { clamp, lerp, noise1, dirUp } from './util.js';

const V3 = THREE.Vector3;

// ---------------------------------------------------------------- dynamic meshes
class Tube {
  constructor(n, m, colorFn, mats) {
    this.n = n; this.m = m;
    const g = new THREE.BufferGeometry(), cnt = n * (m + 1);
    this.pos = new Float32Array(cnt * 3); this.nrm = new Float32Array(cnt * 3);
    const col = new Float32Array(cnt * 3), idx = [];
    for (let i = 0; i < n; i++) for (let j = 0; j <= m; j++) {
      const c = colorFn(i / (n - 1), j / m); col.set(c, (i * (m + 1) + j) * 3);
      if (i < n - 1 && j < m) { const a = i * (m + 1) + j, b = a + m + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    }
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(this.nrm, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx);
    this.meshes = mats.map((mt) => { const me = new THREE.Mesh(g, mt); me.frustumCulled = false; return me; });
  }
  update(pts, radii, ref = new V3(0, 0, 1)) {
    const { n, m } = this, T = new V3(), A = new V3(), B = new V3();
    for (let i = 0; i < n; i++) {
      T.subVectors(pts[Math.min(i + 1, n - 1)], pts[Math.max(i - 1, 0)]).normalize();
      A.copy(ref).addScaledVector(T, -ref.dot(T)); if (A.lengthSq() < 1e-6) A.set(1, 0, 0); A.normalize(); B.crossVectors(T, A);
      for (let j = 0; j <= m; j++) {
        const th = (j / m) * Math.PI * 2, c = Math.cos(th), s = Math.sin(th), k = (i * (m + 1) + j) * 3;
        const nx = A.x * c + B.x * s, ny = A.y * c + B.y * s, nz = A.z * c + B.z * s;
        this.pos[k] = pts[i].x + nx * radii[i]; this.pos[k + 1] = pts[i].y + ny * radii[i]; this.pos[k + 2] = pts[i].z + nz * radii[i];
        this.nrm[k] = nx; this.nrm[k + 1] = ny; this.nrm[k + 2] = nz;
      }
    }
    const g = this.meshes[0].geometry; g.attributes.position.needsUpdate = true; g.attributes.normal.needsUpdate = true;
  }
}
// a cloth sheet built from several hanging chains (columns)
class Sheet {
  constructor(cols, rows, colorFn, mats) {
    this.cols = cols; this.rows = rows;
    const g = new THREE.BufferGeometry(), cnt = cols * rows;
    this.pos = new Float32Array(cnt * 3); this.nrm = new Float32Array(cnt * 3);
    const col = new Float32Array(cnt * 3), idx = [];
    for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
      col.set(colorFn(c / (cols - 1), r / (rows - 1)), (c * rows + r) * 3);
      if (c < cols - 1 && r < rows - 1) { const a = c * rows + r, b = a + rows; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    }
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(this.nrm, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx);
    this.meshes = mats.map((mt) => { const me = new THREE.Mesh(g, mt); me.frustumCulled = false; return me; });
  }
  update(chains) {
    const { cols, rows } = this;
    for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) { const p = chains[c][r], k = (c * rows + r) * 3; this.pos[k] = p.x; this.pos[k + 1] = p.y; this.pos[k + 2] = p.z; }
    const a = new V3(), b = new V3(), d1 = new V3(), d2 = new V3();
    for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
      const P = (cc, rr) => chains[Math.min(Math.max(cc, 0), cols - 1)][Math.min(Math.max(rr, 0), rows - 1)];
      d1.subVectors(P(c + 1, r), P(c - 1, r)); d2.subVectors(P(c, r + 1), P(c, r - 1));
      a.crossVectors(d1, d2).normalize(); const k = (c * rows + r) * 3;
      this.nrm[k] = a.x; this.nrm[k + 1] = a.y; this.nrm[k + 2] = a.z;
    }
    const g = this.meshes[0].geometry; g.attributes.position.needsUpdate = true; g.attributes.normal.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- character
export class Character3D {
  constructor(kind, anim, scene, lightSrc) {
    this.kind = kind; this.anim = anim;
    this.hero = kind === 'hero';
    this.scale = this.hero ? 1.0 : 1.2;
    this.D = this.hero ? { ...DIMS, headR: 0.146, blade: 0.86, hilt: 0.18 } : { ...DIMS, headR: 0.148, blade: 1.3, hilt: 0.32 };
    const model = this.hero ? buildSera() : buildKokuya();
    this.bindJ = model.J;
    this.invBind = BONES.map(([, a, b]) => boneFrame(this.bindJ[a], this.bindJ[b], [0, 0, 1]).clone().invert());
    this.bindLen = BONES.map(([, a, b]) => Math.hypot(...[0, 1, 2].map((i) => this.bindJ[b][i] - this.bindJ[a][i])));
    this.shade = inkMaterial({ skinned: true });
    this.line = inkMaterial({ skinned: true, outline: 2.2 });
    this.clothMat = inkMaterial({ twoSided: true });
    this.clothLine = inkMaterial({ outline: 1.8 });
    this.clothLine.side = THREE.DoubleSide;
    this.mats = [this.shade, this.line, this.clothMat, this.clothLine];
    if (lightSrc) linkLights(this.mats, lightSrc);
    this.mesh = new THREE.Mesh(model.geometry, this.shade);
    this.outlineMesh = new THREE.Mesh(model.geometry, this.line);
    for (const m of [this.mesh, this.outlineMesh]) { m.frustumCulled = false; scene.add(m); }
    this.cache = new Map();
    this.parts = [];
    const cm = [this.clothMat, this.clothLine];
    if (this.hero) {
      this.pony = new Tube(12, 10, (u) => (u < 0.62 ? hex('#cfd5e6') : u < 0.85 ? hex('#5fd9cc') : hex('#8b6ff0')), cm);
      this.haori = new Sheet(5, 9, (u, v) => {
        if (v > 0.78) { const wave = Math.abs(Math.sin(u * 18 + v * 9)) < 0.2; return wave ? hex('#e9edf6') : (v > 0.9 ? hex('#2a2f6a') : hex('#1f7f86')); }
        if (v > 0.74) return hex('#b8975a');
        return v < 0.05 ? hex('#1a1f33') : hex('#aab0be');
      }, cm);
      this.scarf = [0, 1].map(() => new Sheet(2, 7, (u, v) => (v > 0.85 ? hex('#5b1424') : hex('#16192a')), cm));
      this.tassel = new Tube(4, 6, () => hex('#2fb7aa'), cm);
      this.parts = [this.pony, this.haori, ...this.scarf, this.tassel];
    } else {
      this.mane = [0, 1, 2, 3].map((k) => new Tube(10, 9, (u) => (u < 0.7 ? hex('#7d0d22') : hex('#1a080d')), cm));
      this.cape = new Sheet(6, 10, (u, v) => (v > 0.82 ? (Math.sin(u * 30 + v * 12) > 0.6 ? hex('#a3102a') : hex('#3a0812')) : hex('#121016')), cm);
      this.tassel = new Tube(5, 6, () => hex('#8e1024'), cm);
      this.parts = [...this.mane, this.cape, this.tassel];
    }
    for (const p of this.parts) for (const m of p.meshes) scene.add(m);
    this.tmpM = new THREE.Matrix4(); this.boneM = BONES.map(() => new THREE.Matrix4());
  }
  setVisible(v) { this.mesh.visible = this.outlineMesh.visible = v; for (const p of this.parts) for (const m of p.meshes) m.visible = v; }
  state(t) {
    const key = Math.round(t * 1000);
    let s = this.cache.get(key);
    if (!s) {
      const P = this.anim.poseAt(t), R = this.anim.rootAt(t);
      const J = solve(P, this.D);
      s = { P, R, J, L: this.lift(J, P), W: this.worldMatrix(R) };
      if (this.cache.size > 1500) this.cache.clear();
      this.cache.set(key, s);
    }
    return s;
  }
  // 2D joints (x forward, y down) -> 3D local joints (x forward, y up, z toward camera)
  lift(J, P) {
    const L = (p, z) => [p[0], -p[1], z];
    const two = P.two > 0.5 || (P.sheath > 0.5 && P.grip > 0.5) || (P.sheathing > 0.001 && P.sheathing < 0.999);
    const o = {};
    o.hip = L(J.hip, 0); o.chest = L(J.chest, 0); o.neck = L(J.neck, 0);
    const hd = dirUp(J.headAng); o.headTop = [o.neck[0] + hd[0] * 0.29, o.neck[1] - hd[1] * 0.29, 0];
    const zs = 0.18 * (1 - Math.abs(P.turn) * 0.25);
    o.shF = L(J.shF, zs); o.shB = L(J.shB, -zs);
    const zwF = two ? 0.07 : 0.16;
    o.elF = L(J.elF, 0.22); o.wrF = L(J.haF, zwF);
    o.elB = L(J.elB, two ? -0.04 : -0.21); o.wrB = L(J.haB, two ? 0.03 : -0.17);
    for (const s of ['F', 'B']) { const e = o['el' + s], w = o['wr' + s], d = [w[0] - e[0], w[1] - e[1], w[2] - e[2]], l = Math.hypot(...d) || 1; o['hd' + s] = [w[0] + d[0] / l * 0.08, w[1] + d[1] / l * 0.08, w[2] + d[2] / l * 0.08]; }
    for (const [s, z] of [['F', 1], ['B', -1]]) {
      o['hp' + s] = L(J['hip' + s], 0.095 * z); o['kn' + s] = L(J['kn' + s], 0.11 * z); o['an' + s] = L(J['an' + s], 0.1 * z);
      const a = (s === 'F' ? J.footAF : J.footAB) * Math.PI / 180, an = J['an' + s];
      o['to' + s] = L([an[0] + Math.cos(a) * 0.15 - Math.sin(a) * 0.04, an[1] + Math.sin(a) * 0.15 + Math.cos(a) * 0.04], 0.1 * z);
    }
    o.guard = L(J.guard, zwF); o.tip = L(J.tip, zwF);
    o.sbMouth = L(J.sbMouth, 0.15); o.sbEnd = [o.sbMouth[0] + J.sbDir[0] * 0.9, o.sbMouth[1] - J.sbDir[1] * 0.9, 0.15];
    return o;
  }
  worldMatrix(R) {
    const m = new THREE.Matrix4();
    m.makeTranslation(R.x, -R.y, R.z || 0);
    m.multiply(new THREE.Matrix4().makeRotationZ(-(R.rot || 0) * Math.PI / 180));
    m.multiply(new THREE.Matrix4().makeScale(R.facing * this.scale * (R.sx || 1), this.scale * (R.sy || 1), this.scale));
    return m;
  }
  toWorld(s, p) { return new V3(p[0], p[1], p[2]).applyMatrix4(s.W); }
  joint(t, name) { const s = this.state(t); return this.toWorld(s, s.L[name]); }
  // a hanging chain: anchors follow the body's past positions (lag), rest direction streams in the wind
  chain(t, n, len, lag, anchorFn, rest, wave, freq, kph, liftK = 1, zOff = 0) {
    const now = this.state(t), seg = len / (n - 1) * this.scale;
    const wind = now.R.wind == null ? 0.6 : now.R.wind, lift = (now.R.lift || 0) * liftK;
    const w15 = Math.min(wind, 1.5);
    const rd = new V3(lerp(rest[0] * 0.25, rest[0], w15) * now.R.facing, -(lerp(1, rest[1], w15) - lift * 1.4), rest[2] || 0).normalize();
    const pts = [];
    for (let i = 0; i < n; i++) {
      const s = this.state(t - i * lag), u = i / (n - 1);
      const aw = this.toWorld(s, anchorFn(s.L));
      const wob = Math.sin(t * freq - i * kph + zOff * 3) * wave * u * (0.35 + 0.65 * w15) + noise1(t * 2.3 + i * 0.37 + zOff * 5, 3) * wave * 0.35 * u;
      const p = aw.clone().addScaledVector(rd, seg * i);
      p.x += -rd.y * wob; p.y += rd.x * wob - u * u * 0.18 * seg * i * wind; p.z += Math.sin(t * freq * 0.7 - i * kph + zOff * 2) * wave * u * 0.8;
      if (i > 0) { const d = p.clone().sub(pts[i - 1]), L = d.length(), mx = seg * 1.25; if (L > mx) p.copy(pts[i - 1]).addScaledVector(d, mx / L); }
      pts.push(p);
    }
    return pts;
  }
  update(t, o = {}) {
    const s = this.state(t), L = s.L;
    for (let b = 0; b < BONES.length; b++) {
      const [, a, c] = BONES[b];
      const len = Math.hypot(L[c][0] - L[a][0], L[c][1] - L[a][1], L[c][2] - L[a][2]);
      boneFrame(L[a], L[c], [0, 0, 1], this.tmpM, len / this.bindLen[b]);
      this.boneM[b].multiplyMatrices(this.tmpM, this.invBind[b]);
    }
    const mirrored = s.W.determinant() < 0;
    for (const m of [this.shade, this.line]) { m.uniforms.uModel.value.copy(s.W); m.uniforms.uBones.value = this.boneM; }
    this.shade.side = mirrored ? THREE.BackSide : THREE.FrontSide;
    this.line.side = mirrored ? THREE.FrontSide : THREE.BackSide;
    for (const m of this.mats) { m.uniforms.uSil.value = o.sil || 0; m.uniforms.uTint.value = o.tint || m.uniforms.uTint.value; m.uniforms.uGlow.value = o.glow || 0; m.uniforms.uDis.value = o.dis || 0; m.uniforms.uDisY0.value = o.disY0 || 0; }
    const sc = this.scale;
    if (this.hero) {
      const hdir = (L2) => [L2.headTop[0] - L2.neck[0], L2.headTop[1] - L2.neck[1]];
      this.pony.update(this.chain(t, 12, 1.0, 0.026, (L2) => { const h = hdir(L2); return [L2.neck[0] - h[0] * 0.05 - 0.09 * (h[1] / 0.29), L2.neck[1] + h[1] * 0.68 + 0.09 * (h[0] / 0.29), 0]; }, [-0.74, 0.66], 0.07, 6, 0.8, 1),
        Array.from({ length: 12 }, (_, i) => sc * (0.034 * Math.pow(1 - i / 11, 0.6) + 0.006)));
      const cols = [-0.17, -0.085, 0, 0.085, 0.17].map((z, c) => this.chain(t, 9, 1.08, 0.04, (L2) => [L2.chest[0] - 0.1, L2.chest[1] + 0.2, z * 1.05], [-0.62, 0.78, z * 0.9], 0.08, 6, 0.7, 0.3, z));
      this.haori.update(cols);
      this.scarf.forEach((sh, k) => {
        const zz = k ? -0.03 : 0.03;
        sh.update([-0.025, 0.025].map((dz) => this.chain(t, 7, 0.62 - k * 0.08, 0.035, (L2) => [L2.neck[0] - 0.06, L2.neck[1] + 0.06, zz + dz], [-0.86, 0.45, zz * 3], 0.09, 7.5, 0.85, 0.6, k + dz * 10)));
      });
      this.tassel.update(this.chain(t, 4, 0.16, 0.03, (L2) => { const g = L2.guard, tp = L2.tip, d = [tp[0] - g[0], tp[1] - g[1]], l = Math.hypot(...d) || 1; return [g[0] - d[0] / l * 0.22, g[1] - d[1] / l * 0.22, g[2]]; }, [-0.3, 0.95], 0.02, 8, 1.2), [0.012, 0.011, 0.008, 0.004].map((r) => r * sc));
    } else {
      const anchors = [[-0.1, 0.24, 0.0], [-0.12, 0.17, 0.05], [-0.12, 0.17, -0.05], [-0.06, 0.28, 0]];
      this.mane.forEach((tb, k) => {
        const a = anchors[k];
        const pts = this.chain(t, 10, 1.15 - k * 0.12, 0.035, (L2) => [L2.neck[0] + a[0], L2.neck[1] + a[1], a[2]], [-0.86, 0.5, a[2] * 2], 0.09, 6.5 + k * 0.4, 0.8, 1, k);
        tb.update(pts, Array.from({ length: 10 }, (_, i) => sc * (0.05 - k * 0.006) * Math.pow(1 - i / 9, 0.55) + 0.006));
      });
      const cols = [-0.2, -0.12, -0.04, 0.04, 0.12, 0.2].map((z) => this.chain(t, 10, 1.25, 0.045, (L2) => [L2.chest[0] - 0.13, L2.chest[1] + 0.2, z * 1.1], [-0.6, 0.8, z * 0.9], 0.1, 5.5, 0.75, 0.3, z));
      this.cape.update(cols);
      this.tassel.update(this.chain(t, 5, 0.3, 0.035, (L2) => { const g = L2.guard, tp = L2.tip, d = [tp[0] - g[0], tp[1] - g[1]], l = Math.hypot(...d) || 1; return [g[0] - d[0] / l * 0.36, g[1] - d[1] / l * 0.36, g[2]]; }, [-0.3, 0.95], 0.03, 7, 1.1), [0.016, 0.015, 0.013, 0.01, 0.005].map((r) => r * sc));
    }
  }
}
