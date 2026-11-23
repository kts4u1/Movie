// Procedural sculpting: characters are modelled as signed distance fields (smoothly blended
// ellipsoids, round cones and boxes), meshed with Surface Nets, coloured per material and
// skinned to a 17-bone skeleton. Rigid accessories (armour, swords, hair spikes) are merged
// into the same skinned mesh with a single bone each.
import * as THREE from 'three';

const D2R = Math.PI / 180;

// ---------------------------------------------------------------- SDF primitives
function sdEllipsoid(x, y, z, c, r) {
  const px = (x - c[0]) / r[0], py = (y - c[1]) / r[1], pz = (z - c[2]) / r[2];
  const k0 = Math.sqrt(px * px + py * py + pz * pz);
  const qx = px / r[0], qy = py / r[1], qz = pz / r[2];
  const k1 = Math.sqrt(qx * qx + qy * qy + qz * qz) || 1e-6;
  return (k0 * (k0 - 1)) / k1;
}
function sdRoundCone(x, y, z, a, b, r1, r2) {
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1 / l2;
  const pax = x - a[0], pay = y - a[1], paz = z - a[2];
  const yy = pax * bax + pay * bay + paz * baz;
  const zz = yy - l2;
  const qx = pax * l2 - bax * yy, qy = pay * l2 - bay * yy, qz = paz * l2 - baz * yy;
  const x2 = qx * qx + qy * qy + qz * qz, y2 = yy * yy * l2, z2 = zz * zz * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(zz) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
  if (Math.sign(yy) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
  return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - r1;
}
function sdRoundBox(x, y, z, c, h, r) {
  const qx = Math.abs(x - c[0]) - h[0] + r, qy = Math.abs(y - c[1]) - h[1] + r, qz = Math.abs(z - c[2]) - h[2] + r;
  const ox = Math.max(qx, 0), oy = Math.max(qy, 0), oz = Math.max(qz, 0);
  return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, Math.max(qy, qz)), 0) - r;
}
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };

// primitive helpers: each returns {d(x,y,z), bone, mat, k}
export const P = {
  ell: (c, r, bone, mat, k = 0.03) => ({ d: (x, y, z) => sdEllipsoid(x, y, z, c, r), bone, mat, k }),
  cone: (a, b, r1, r2, bone, mat, k = 0.03) => ({ d: (x, y, z) => sdRoundCone(x, y, z, a, b, r1, r2), bone, mat, k }),
  box: (c, h, r, bone, mat, k = 0.02) => ({ d: (x, y, z) => sdRoundBox(x, y, z, c, h, r), bone, mat, k }),
};
// wrap a primitive with vertical pleats / folds (cloth) around a vertical axis through (ax, az)
export function pleated(prim, ax, az, amp, n, phase = 0) {
  const f = prim.d;
  return { ...prim, d: (x, y, z) => f(x, y, z) + amp * Math.sin(Math.atan2(z - az, x - ax) * n + phase + y * 3) };
}
export function clipBy(prim, plane) { // keep the side where nx*x+ny*y+nz*z < w
  const f = prim.d;
  return { ...prim, d: (x, y, z) => Math.max(f(x, y, z), plane[0] * x + plane[1] * y + plane[2] * z - plane[3]) };
}

function fieldAt(prims, x, y, z, out) {
  let d = 1e9, best = 1e9, mat = 0;
  for (let i = 0; i < prims.length; i++) {
    const p = prims[i], di = p.d(x, y, z);
    d = d > 1e8 ? di : smin(d, di, p.k);
    if (di < best) { best = di; mat = p.mat; }
  }
  if (out) out.mat = mat;
  return d;
}

// ---------------------------------------------------------------- Surface Nets mesher
export function meshSDF(prims, bmin, bmax, h) {
  const nx = Math.ceil((bmax[0] - bmin[0]) / h) + 1, ny = Math.ceil((bmax[1] - bmin[1]) / h) + 1, nz = Math.ceil((bmax[2] - bmin[2]) / h) + 1;
  const F = new Float32Array(nx * ny * nz);
  const id = (i, j, k) => i + nx * (j + ny * k);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) F[id(i, j, k)] = fieldAt(prims, bmin[0] + i * h, bmin[1] + j * h, bmin[2] + k * h);
  const cid = (i, j, k) => i + (nx - 1) * (j + (ny - 1) * k);
  const vmap = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const pos = [];
  const corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const v = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let mask = 0;
    for (let c = 0; c < 8; c++) { const o = corners[c]; v[c] = F[id(i + o[0], j + o[1], k + o[2])]; if (v[c] < 0) mask |= 1 << c; }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, cnt = 0;
    for (const [a, b] of edges) {
      if ((v[a] < 0) === (v[b] < 0)) continue;
      const t = v[a] / (v[a] - v[b]), A = corners[a], B = corners[b];
      sx += A[0] + (B[0] - A[0]) * t; sy += A[1] + (B[1] - A[1]) * t; sz += A[2] + (B[2] - A[2]) * t; cnt++;
    }
    vmap[cid(i, j, k)] = pos.length / 3;
    pos.push(bmin[0] + (i + sx / cnt) * h, bmin[1] + (j + sy / cnt) * h, bmin[2] + (k + sz / cnt) * h);
  }
  const idx = [];
  const quad = (a, b, c, d, flip) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; if (flip) idx.push(a, d, c, a, c, b); else idx.push(a, b, c, a, c, d); };
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = F[id(i, j, k)], b = F[id(i + 1, j, k)]; if ((a < 0) === (b < 0)) continue;
    quad(vmap[cid(i, j - 1, k - 1)], vmap[cid(i, j, k - 1)], vmap[cid(i, j, k)], vmap[cid(i, j - 1, k)], a < 0);
  }
  for (let k = 1; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const a = F[id(i, j, k)], b = F[id(i, j + 1, k)]; if ((a < 0) === (b < 0)) continue;
    quad(vmap[cid(i - 1, j, k - 1)], vmap[cid(i - 1, j, k)], vmap[cid(i, j, k)], vmap[cid(i, j, k - 1)], a < 0);
  }
  for (let k = 0; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const a = F[id(i, j, k)], b = F[id(i, j, k + 1)]; if ((a < 0) === (b < 0)) continue;
    quad(vmap[cid(i - 1, j - 1, k)], vmap[cid(i, j - 1, k)], vmap[cid(i, j, k)], vmap[cid(i - 1, j, k)], a < 0);
  }
  // normals + materials from the field itself
  const n = pos.length / 3, nrm = new Float32Array(n * 3), mats = new Uint8Array(n);
  const e = h * 0.5, tmp = {};
  for (let q = 0; q < n; q++) {
    const x = pos[q * 3], y = pos[q * 3 + 1], z = pos[q * 3 + 2];
    const gx = fieldAt(prims, x + e, y, z) - fieldAt(prims, x - e, y, z);
    const gy = fieldAt(prims, x, y + e, z) - fieldAt(prims, x, y - e, z);
    const gz = fieldAt(prims, x, y, z + e) - fieldAt(prims, x, y, z - e);
    const L = Math.hypot(gx, gy, gz) || 1;
    nrm[q * 3] = gx / L; nrm[q * 3 + 1] = gy / L; nrm[q * 3 + 2] = gz / L;
    fieldAt(prims, x, y, z, tmp); mats[q] = tmp.mat;
  }
  // make triangle winding agree with the outward field gradient
  let agree = 0, total = 0;
  for (let t = 0; t < idx.length && total < 4000; t += 3 * 7, total++) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    if (cx * nrm[a] + cy * nrm[a + 1] + cz * nrm[a + 2] > 0) agree++;
  }
  if (agree < total / 2) for (let t = 0; t < idx.length; t += 3) { const tmp = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = tmp; }
  return { pos: new Float32Array(pos), nrm, idx, mats };
}

// ---------------------------------------------------------------- skeleton
export const BONES = [
  ['pelvis', 'hip', 'chest'], ['spine', 'chest', 'neck'], ['head', 'neck', 'headTop'],
  ['uarmF', 'shF', 'elF'], ['farmF', 'elF', 'wrF'], ['handF', 'wrF', 'hdF'],
  ['uarmB', 'shB', 'elB'], ['farmB', 'elB', 'wrB'], ['handB', 'wrB', 'hdB'],
  ['thighF', 'hpF', 'knF'], ['shinF', 'knF', 'anF'], ['footF', 'anF', 'toF'],
  ['thighB', 'hpB', 'knB'], ['shinB', 'knB', 'anB'], ['footB', 'anB', 'toB'],
  ['sword', 'guard', 'tip'], ['sheath', 'sbMouth', 'sbEnd'],
];
export const BONE_INDEX = Object.fromEntries(BONES.map((b, i) => [b[0], i]));

// bind pose (A-pose), local frame: +X forward, +Y up, +Z toward the camera side
export function bindJoints(blade = 0.86) {
  const J = { hip: [0, 0.97, 0], chest: [0, 1.22, 0], neck: [0, 1.47, 0], headTop: [0, 1.76, 0] };
  const a = 40 * D2R, sh = 1.425, sz = 0.18;
  for (const [s, z] of [['F', 1], ['B', -1]]) {
    J['sh' + s] = [0, sh, sz * z];
    J['el' + s] = [0, sh - 0.26 * Math.cos(a), z * (sz + 0.26 * Math.sin(a))];
    J['wr' + s] = [0, sh - 0.51 * Math.cos(a), z * (sz + 0.51 * Math.sin(a))];
    J['hd' + s] = [0, sh - 0.59 * Math.cos(a), z * (sz + 0.59 * Math.sin(a))];
    J['hp' + s] = [0, 0.95, 0.095 * z]; J['kn' + s] = [0.01, 0.52, 0.1 * z]; J['an' + s] = [0, 0.08, 0.1 * z]; J['to' + s] = [0.15, 0.03, 0.1 * z];
  }
  J.guard = [0.45, 1.0, 0.0]; J.tip = [0.45, 1.0 + blade, 0.0];
  J.sbMouth = [0.4, 0.6, 0.0]; J.sbEnd = [0.4, 1.5, 0.0];
  return J;
}
// bone frame: origin at the head joint, +Y toward the tail, +Z = reference (lateral) axis
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
export function boneFrame(a, b, ref, out = new THREE.Matrix4(), sy = 1) {
  _y.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
  _z.set(ref[0], ref[1], ref[2]).addScaledVector(_y, -(_y.x * ref[0] + _y.y * ref[1] + _y.z * ref[2]));
  if (_z.lengthSq() < 1e-8) _z.set(1, 0, 0).addScaledVector(_y, -_y.x);
  _z.normalize();
  _x.crossVectors(_y, _z);
  out.set(_x.x, _y.x * sy, _z.x, a[0], _x.y, _y.y * sy, _z.y, a[1], _x.z, _y.z * sy, _z.z, a[2], 0, 0, 0, 1);
  return out;
}

// ---------------------------------------------------------------- mesh assembly
export class MeshBuilder {
  constructor() { this.pos = []; this.nrm = []; this.col = []; this.si = []; this.sw = []; this.idx = []; }
  get count() { return this.pos.length / 3; }
  // add an SDF-sculpted body: weights from the primitives' bones, colours from a material palette
  addSDF(prims, bmin, bmax, h, colorFn) {
    const m = meshSDF(prims, bmin, bmax, h);
    const base = this.count, n = m.pos.length / 3;
    for (let q = 0; q < n; q++) {
      const x = m.pos[q * 3], y = m.pos[q * 3 + 1], z = m.pos[q * 3 + 2];
      this.pos.push(x, y, z); this.nrm.push(m.nrm[q * 3], m.nrm[q * 3 + 1], m.nrm[q * 3 + 2]);
      const c = colorFn(m.mats[q], x, y, z); this.col.push(c[0], c[1], c[2]);
      // skin weights: soft falloff from each primitive, summed per bone, top 4
      const acc = new Map();
      for (const p of prims) { const d = Math.max(p.d(x, y, z), 0); const w = Math.exp(-d * 55); acc.set(p.bone, (acc.get(p.bone) || 0) + w); }
      const top = [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
      const s = top.reduce((a, e) => a + e[1], 0) || 1;
      for (let k = 0; k < 4; k++) { this.si.push(top[k] ? BONE_INDEX[top[k][0]] : 0); this.sw.push(top[k] ? top[k][1] / s : 0); }
    }
    for (const i of m.idx) this.idx.push(base + i);
    return n;
  }
  // add a rigid geometry defined in a bone's local frame
  addRigid(geo, bone, bindFrame, color, colorFn) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    g.computeVertexNormals();
    const p = g.attributes.position, nn = g.attributes.normal, base = this.count;
    const v = new THREE.Vector3(), nv = new THREE.Vector3(), nm = new THREE.Matrix3().getNormalMatrix(bindFrame);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i); const lx = v.x, ly = v.y, lz = v.z; v.applyMatrix4(bindFrame);
      nv.fromBufferAttribute(nn, i).applyMatrix3(nm).normalize();
      this.pos.push(v.x, v.y, v.z); this.nrm.push(nv.x, nv.y, nv.z);
      const c = colorFn ? colorFn(lx, ly, lz) : color; this.col.push(c[0], c[1], c[2]);
      this.si.push(BONE_INDEX[bone], 0, 0, 0); this.sw.push(1, 0, 0, 0);
      this.idx.push(base + i);
    }
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('skinIndex', new THREE.Float32BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    g.setIndex(this.idx);
    return g;
  }
}

export const hex = (h, k = 1) => { const c = new THREE.Color(h); return [c.r * k, c.g * k, c.b * k]; };
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const vnoise = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };

// ================================================================ SERA (hero)
export function buildSera() {
  const J = bindJoints(0.86), mb = new MeshBuilder();
  const C = {
    skin: hex('#e8d2d2'), hair: hex('#e2e7f3'), kimono: hex('#2c3554'), haori: hex('#b4b9c6'), hakama: hex('#363e60'),
    obi: hex('#226a72'), glove: hex('#24262f'), boot: hex('#2c2e37'), wrap: hex('#262b3d'), gold: hex('#d6b06a'), steel: hex('#59606e'),
  };
  const M = { skin: 0, hair: 1, kimono: 2, haori: 3, hakama: 4, obi: 5, glove: 6, boot: 7, wrap: 8, steel: 9 };
  const mid = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const prims = [
    // head, jaw, hair cap, face wrap
    P.ell([0.0, 1.625, 0], [0.092, 0.112, 0.082], 'head', M.skin, 0.02),
    P.cone([0.015, 1.6, 0], [0.058, 1.535, 0], 0.066, 0.03, 'head', M.skin, 0.03),
    clipBy(P.ell([-0.012, 1.648, 0], [0.104, 0.118, 0.094], 'head', M.hair, 0.01), [0.8, -0.55, 0, -0.85]),
    P.ell([0.042, 1.555, 0], [0.068, 0.052, 0.086], 'head', M.wrap, 0.015),
    P.cone([0, 1.44, 0], [0.01, 1.56, 0], 0.062, 0.052, 'spine', M.wrap, 0.02),
    // torso
    P.ell([0.008, 1.31, 0], [0.1, 0.145, 0.155], 'spine', M.kimono, 0.05),
    P.ell([0.0, 1.13, 0], [0.09, 0.13, 0.128], 'pelvis', M.kimono, 0.05),
    P.ell([0.0, 0.99, 0], [0.108, 0.11, 0.15], 'pelvis', M.hakama, 0.04),
    P.box([0.0, 1.06, 0], [0.104, 0.042, 0.142], 0.035, 'pelvis', M.obi, 0.012),
  ];
  for (const [s, z] of [['F', 1], ['B', -1]]) {
    const sh = J['sh' + s], el = J['el' + s], wr = J['wr' + s], hd = J['hd' + s];
    prims.push(
      P.ell(sh, [0.06, 0.055, 0.065], 'uarm' + s, M.haori, 0.04),
      P.cone(sh, el, 0.055, 0.047, 'uarm' + s, M.haori, 0.03),
      pleated(P.cone(el, mid(el, wr, 0.62), 0.058, 0.088, 'farm' + s, M.haori, 0.02), 0, el[2], 0.004, 9),
      P.cone(mid(el, wr, 0.5), wr, 0.037, 0.032, 'farm' + s, M.steel, 0.01),
      P.ell(mid(wr, hd, 0.55), [0.042, 0.052, 0.032], 'hand' + s, M.glove, 0.015),
    );
    const hp = J['hp' + s], kn = J['kn' + s], an = J['an' + s], to = J['to' + s];
    prims.push(
      pleated(P.cone(hp, mid(kn, an, 0.55), 0.1, 0.132, 'thigh' + s, M.hakama, 0.035), hp[0], hp[2], 0.006, 7),
      P.cone(mid(kn, an, 0.45), an, 0.046, 0.04, 'shin' + s, M.boot, 0.015),
      P.cone(an, to, 0.045, 0.034, 'foot' + s, M.boot, 0.02),
    );
  }
  // hakama pleats need the knee weight too: add an invisible-ish knee primitive in hakama colour
  for (const [s] of [['F'], ['B']]) prims.push(P.ell(mid(J['kn' + s], J['an' + s], 0.25), [0.1, 0.1, 0.1], 'shin' + s, M.hakama, 0.06));
  mb.addSDF(prims, [-0.3, -0.02, -0.7], [0.32, 1.82, 0.7], 0.0105, (m, x, y, z) => {
    const n = vnoise(Math.floor(x * 120), Math.floor(y * 120), Math.floor(z * 120)) * 0.05;
    switch (m) {
      case M.skin: return C.skin;
      case M.hair: return mixc(C.hair, hex('#9aa6c4'), Math.max(0, (1.66 - y) * 4));
      case M.kimono: {
        // white haori lapels down the front
        if (x > 0.035 && Math.abs(z) > 0.035 && Math.abs(z) < 0.085 && y > 1.1) return C.haori;
        return mixc(C.kimono, C.kimono.map((v) => v * 1.25), n * 6);
      }
      case M.haori: { const cuff = y < 1.12 && y > 1.08; return cuff ? hex('#2fb7aa') : mixc(C.haori, hex('#b8bdd0'), n * 4); }
      case M.hakama: return mixc(C.hakama, hex('#2a3150'), n * 5);
      case M.obi: return Math.abs(y - 1.06) > 0.03 ? C.gold : C.obi;
      case M.glove: return C.glove;
      case M.boot: return y > 0.2 && y < 0.23 ? C.gold : C.boot;
      case M.wrap: return mixc(C.wrap, hex('#252a3a'), n * 6);
      case M.steel: return C.steel;
      default: return C.kimono;
    }
  });
  const frame = (bone) => { const b = BONES[BONE_INDEX[bone]]; return boneFrame(J[b[1]], J[b[2]], [0, 0, 1]); };
  // ---- accessories
  // eyes: thin almond slits with a faint glint (heterochromia lives in the glint colour)
  for (const [z, col] of [[0.045, hex('#4ff0dc', 2.2)], [-0.045, hex('#a47bff', 2.2)]]) {
    const g = new THREE.SphereGeometry(0.014, 10, 6); g.scale(0.5, 0.42, 1.25); g.translate(0.0, 0.0, 0);
    // place on the face in head-bone local frame (+Y up along the head, +X forward)
    const hf = frame('head');
    const eye = g.clone(); eye.translate(0.085, 0.165 - 0.005, z * 0.8);
    mb.addRigid(eye, 'head', hf, hex('#0b0c12'));
    const gl = new THREE.SphereGeometry(0.0045, 6, 4); gl.translate(0.093, 0.163, z * 0.8 + 0.004);
    mb.addRigid(gl, 'head', hf, col);
  }
  // hair: bangs, side locks, ahoge (thin cones in the head frame)
  {
    const hf = frame('head');
    const spike = (base, dir, len, r, bend) => {
      const pts = []; for (let i = 0; i <= 6; i++) { const u = i / 6; pts.push(new THREE.Vector3(base[0] + dir[0] * len * u + bend[0] * u * u, base[1] + dir[1] * len * u + bend[1] * u * u, base[2] + dir[2] * len * u + bend[2] * u * u)); }
      const curve = new THREE.CatmullRomCurve3(pts); const g = new THREE.TubeGeometry(curve, 8, 1, 6, false);
      const p = g.attributes.position, c = new THREE.Vector3(), q = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) { const ring = Math.floor(i / 7), u = ring / 8; curve.getPointAt(u, c); q.fromBufferAttribute(p, i).sub(c).multiplyScalar(r * (1 - u * 0.92)); p.setXYZ(i, c.x + q.x, c.y + q.y, c.z + q.z); }
      return g;
    };
    const tipCol = (lx, ly, lz) => C.hair;
    for (let i = 0; i < 9; i++) {
      const zz = -0.075 + i * 0.019, base = [0.06 - Math.abs(zz) * 0.3, 0.27, zz];
      mb.addRigid(spike(base, [0.35, -0.94, zz * 2], 0.12 + 0.03 * Math.sin(i * 1.7), 0.016, [0.02, 0, 0]), 'head', hf, mixc(C.hair, hex('#aeb6d0'), (i % 3) * 0.2));
    }
    for (const z of [0.08, -0.08]) {
      const g = spike([0.04, 0.22, z], [0.12, -1, z * 0.8], 0.27, 0.017, [0.02, 0, 0]);
      mb.addRigid(g, 'head', hf, C.hair, (lx, ly) => mixc(C.hair, hex('#3fd8c4'), Math.max(0, Math.min(1, (0.05 - ly) * 9))));
    }
    mb.addRigid(spike([0.0, 0.31, 0], [0.4, 0.9, 0], 0.11, 0.008, [0.06, -0.04, 0]), 'head', hf, C.hair);
    // gold crescent hair ornament at the back of the head
    const orn = new THREE.TorusGeometry(0.03, 0.006, 6, 18, Math.PI * 1.35); orn.rotateY(Math.PI / 2); orn.translate(-0.09, 0.2, 0);
    mb.addRigid(orn, 'head', hf, hex('#e2c27a', 1.3));
  }
  // forearm guards
  for (const s of ['F', 'B']) {
    const g = new THREE.CylinderGeometry(0.04, 0.046, 0.15, 10, 1, true, -Math.PI * 0.55, Math.PI * 1.1); g.translate(0, 0.17, 0);
    mb.addRigid(g, 'farm' + s, frame('farm' + s), C.steel);
  }
  // sword: slightly curved blade with a luminous edge, crescent guard, white wrapped hilt
  {
    const sf = frame('sword');
    const L = 0.86, sh = new THREE.Shape();
    const cv = (u) => 0.012 * u * u;
    sh.moveTo(-0.014, 0.04);
    for (let i = 1; i <= 16; i++) { const u = i / 16; sh.lineTo(-0.014 + cv(u) * (u < 0.94 ? 1 : 1), 0.04 + (L - 0.05) * u); }
    sh.lineTo(0.0 + cv(1), L);
    for (let i = 16; i >= 0; i--) { const u = i / 16; sh.lineTo(0.012 + cv(u), 0.04 + (L - 0.08) * u); }
    const bg = new THREE.ExtrudeGeometry(sh, { depth: 0.004, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 1 }); bg.translate(0, 0, -0.002);
    mb.addRigid(bg, 'sword', sf, hex('#e8f2ff'), (lx) => (lx > 0.006 ? hex('#7ff7ea', 1.6) : hex('#cfd8e8')));
    const ts = new THREE.CylinderGeometry(0.045, 0.045, 0.008, 18); ts.translate(0, 0.03, 0);
    mb.addRigid(ts, 'sword', sf, hex('#c9a659'));
    const hl = new THREE.CylinderGeometry(0.0155, 0.017, 0.22, 10, 26); hl.translate(0, -0.085, 0);
    mb.addRigid(hl, 'sword', sf, C.haori, (lx, ly) => ((Math.floor(ly * 60) % 2) ? hex('#bfc4d0') : hex('#1d5f5c')));
    const pm = new THREE.CylinderGeometry(0.019, 0.019, 0.02, 10); pm.translate(0, -0.2, 0);
    mb.addRigid(pm, 'sword', sf, hex('#c9a659'));
  }
  // scabbard: white lacquer with gold fittings
  {
    const g = new THREE.CylinderGeometry(0.02, 0.017, 0.9, 10, 90); g.scale(1.3, 1, 1); g.translate(0, 0.45, 0);
    mb.addRigid(g, 'sheath', frame('sheath'), hex('#14161f'), (lx, ly) => (ly < 0.025 || (ly > 0.13 && ly < 0.145) || ly > 0.88 ? hex('#a88a4e') : (lx > 0.012 ? hex('#3a4258') : hex('#151824'))));
  }
  return { J, geometry: mb.geometry(), palette: C };
}

// ================================================================ KOKUYA (rival)
export function buildKokuya() {
  const J = bindJoints(1.3), mb = new MeshBuilder();
  const C = { cloth: hex('#241f2b'), hakama: hex('#2b2532'), steel: hex('#3f3a47'), steelL: hex('#625b6b'), red: hex('#a5142c'), gold: hex('#a8844a'), bone: hex('#ddd0b8'), mask: hex('#bdb5aa') };
  const M = { cloth: 0, hakama: 1, steel: 2, hood: 3 };
  const mid = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const prims = [
    P.ell([0.0, 1.62, 0], [0.098, 0.115, 0.09], 'head', M.hood, 0.03),
    P.cone([0, 1.43, 0], [0, 1.56, 0], 0.07, 0.06, 'spine', M.cloth, 0.03),
    P.ell([0.0, 1.31, 0], [0.122, 0.16, 0.19], 'spine', M.cloth, 0.05),
    P.ell([0.0, 1.13, 0], [0.105, 0.13, 0.15], 'pelvis', M.cloth, 0.05),
    P.ell([0.0, 0.99, 0], [0.12, 0.115, 0.165], 'pelvis', M.hakama, 0.04),
  ];
  for (const [s] of [['F'], ['B']]) {
    const sh = J['sh' + s], el = J['el' + s], wr = J['wr' + s], hd = J['hd' + s];
    prims.push(
      P.ell(sh, [0.075, 0.068, 0.078], 'uarm' + s, M.cloth, 0.04),
      P.cone(sh, el, 0.068, 0.056, 'uarm' + s, M.cloth, 0.03),
      P.cone(el, wr, 0.056, 0.046, 'farm' + s, M.steel, 0.025),
      P.ell(mid(wr, hd, 0.55), [0.05, 0.06, 0.04], 'hand' + s, M.steel, 0.015),
    );
    const hp = J['hp' + s], kn = J['kn' + s], an = J['an' + s], to = J['to' + s];
    prims.push(
      pleated(P.cone(hp, mid(kn, an, 0.55), 0.115, 0.15, 'thigh' + s, M.hakama, 0.035), hp[0], hp[2], 0.007, 7),
      P.ell(mid(kn, an, 0.25), [0.11, 0.11, 0.11], 'shin' + s, M.hakama, 0.06),
      P.cone(mid(kn, an, 0.4), an, 0.056, 0.048, 'shin' + s, M.steel, 0.015),
      P.cone(an, to, 0.05, 0.04, 'foot' + s, M.steel, 0.02),
    );
  }
  mb.addSDF(prims, [-0.3, -0.02, -0.72], [0.32, 1.8, 0.72], 0.0105, (m, x, y, z) => {
    const n = vnoise(Math.floor(x * 120), Math.floor(y * 120), Math.floor(z * 120)) * 0.05;
    if (m === M.steel) return mixc(C.steel, C.steelL, n * 6);
    if (m === M.hakama) return mixc(C.hakama, hex('#262130'), n * 5);
    if (m === M.hood) return hex('#0e0c12');
    return mixc(C.cloth, hex('#201c28'), n * 6);
  });
  const frame = (bone) => { const b = BONES[BONE_INDEX[bone]]; return boneFrame(J[b[1]], J[b[2]], [0, 0, 1]); };
  const plate = (w, h, d, bev = 0.006) => { const g = new THREE.BoxGeometry(w, h, d, 1, 1, 1); return g; };
  // chest: layered lamellar plates (front + back) with crimson lacing
  {
    const f = frame('spine');
    for (let i = 0; i < 4; i++) {
      for (const side of [1, -1]) {
        const g = new THREE.CylinderGeometry(0.205 - i * 0.01, 0.2 - i * 0.008, 0.06, 18, 1, true, side > 0 ? -Math.PI * 0.45 : Math.PI * 0.55, Math.PI * 0.9);
        g.scale(0.72, 1, 1); g.rotateY(Math.PI / 2); g.translate(0.0, -0.06 + i * 0.058, 0);
        mb.addRigid(g, 'spine', f, side > 0 ? C.steelL : C.steel, (lx, ly) => (Math.abs(ly - (-0.06 + i * 0.058) + 0.025) < 0.006 ? C.red : (side > 0 ? C.steelL : C.steel)));
      }
    }
    // prayer beads across the chest
    for (let i = 0; i <= 12; i++) {
      const u = i / 12, g = new THREE.SphereGeometry(i === 6 ? 0.028 : 0.021, 8, 6);
      g.translate(0.15 + Math.sin(u * Math.PI) * 0.03, 0.2 - u * 0.33, 0.16 - u * 0.32);
      mb.addRigid(g, 'spine', f, i === 6 ? C.gold : i % 2 ? hex('#7a0d1e') : hex('#101014'));
    }
  }
  // tassets (kusazuri) hanging from the waist
  {
    const f = frame('pelvis');
    for (let i = 0; i < 6; i++) {
      const a = -1.2 + (i / 5) * 2.4;
      const g = new THREE.BoxGeometry(0.012, 0.25, 0.12); g.rotateZ(-0.18);
      g.translate(Math.cos(a) * 0.16, -0.08, Math.sin(a) * 0.19);
      g.rotateY(0);
      mb.addRigid(g, 'pelvis', f, C.steel, (lx, ly) => (ly < -0.18 ? C.red : C.steel));
    }
  }
  // layered shoulder guards (sode) and gauntlet plates
  for (const s of ['F', 'B']) {
    const f = frame('uarm' + s);
    for (let i = 0; i < 4; i++) {
      const c0 = s === 'F' ? 0 : Math.PI;
      const g = new THREE.CylinderGeometry(0.088 + i * 0.006, 0.098 + i * 0.006, 0.058, 12, 2, true, c0 - Math.PI * 0.32, Math.PI * 0.64);
      g.translate(0, -0.01 - i * 0.05 + 0.07, 0);
      mb.addRigid(g, 'uarm' + s, f, i % 2 ? C.steel : C.steelL, (lx, ly) => (ly < -0.01 - i * 0.055 + 0.08 - 0.02 ? C.red : (i % 2 ? C.steel : C.steelL)));
    }
    const gf = frame('farm' + s);
    for (let k = 0; k < 2; k++) { const sp = new THREE.ConeGeometry(0.014, 0.06, 6); sp.rotateZ(-Math.PI / 2); sp.translate(0.07, 0.1 + k * 0.08, 0); mb.addRigid(sp, 'farm' + s, gf, C.bone); }
  }
  // helmet, grinning mask, horns (one broken)
  {
    const f = frame('head');
    const dome = new THREE.SphereGeometry(0.115, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55); dome.translate(-0.005, 0.12, 0);
    mb.addRigid(dome, 'head', f, C.steel);
    for (let i = 0; i < 3; i++) { const g = new THREE.CylinderGeometry(0.12 + i * 0.03, 0.15 + i * 0.03, 0.045, 18, 1, true, Math.PI * 0.82, Math.PI * 1.36); g.translate(-0.01, 0.1 - i * 0.04, 0); mb.addRigid(g, 'head', f, i === 2 ? C.red : C.steel); }
    // the mask: a half ellipsoid with a painted red grin full of teeth and one burning eye slit
    const mask = new THREE.SphereGeometry(0.1, 56, 44, -Math.PI / 2, Math.PI, 0.15 * Math.PI, 0.78 * Math.PI); mask.rotateY(Math.PI); mask.scale(0.95, 1.18, 1.0); mask.translate(0.03, 0.14, 0);
    mb.addRigid(mask, 'head', f, C.mask, (lx0, ly0, lz) => {
      const lx = lx0 - 0.01, ly = ly0 - 0.14;
      const gy = -0.055 + 0.0018 / (Math.abs(lz) + 0.02) * 0.0 + (lz * lz) * 3.2; // grin curve rises toward the cheeks
      const inGrin = ly < gy + 0.012 && ly > gy - 0.03 && Math.abs(lz) < 0.08 && lx > 0.04;
      if (inGrin) { const tooth = (Math.floor((lz + 0.1) * 120) % 2) === 0; return ly > gy - 0.012 && tooth ? hex('#efe8dc') : hex('#a3102a'); }
      const az = Math.abs(lz), slit = az > 0.018 && az < 0.062 && Math.abs(ly - 0.03 + (az - 0.018) * 0.45) < 0.007 && lx > 0.04;
      if (slit) return lz < 0 ? hex('#ff1236', 2.4) : hex('#060508');
      return C.mask;
    });
    const horn = (pts, r0, col) => {
      const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
      const g = new THREE.TubeGeometry(curve, 16, 1, 8, false);
      const p = g.attributes.position, c = new THREE.Vector3(), q = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) { const ring = Math.floor(i / 9), u = ring / 16; curve.getPointAt(u, c); q.fromBufferAttribute(p, i).sub(c).multiplyScalar(r0 * (1 - u * 0.93)); p.setXYZ(i, c.x + q.x, c.y + q.y, c.z + q.z); }
      mb.addRigid(g, 'head', f, col);
    };
    horn([[0.02, 0.19, 0.06], [0.06, 0.28, 0.1], [0.14, 0.38, 0.12], [0.26, 0.45, 0.1]], 0.026, C.bone);
    horn([[0.02, 0.19, -0.06], [0.04, 0.24, -0.09], [0.06, 0.27, -0.1]], 0.024, hex('#a8997e'));
  }
  // odachi: long black blade with a crimson edge, square guard, long hilt
  {
    const sf = frame('sword');
    const L = 1.3, sh = new THREE.Shape();
    sh.moveTo(-0.022, 0.04); sh.lineTo(-0.02 + 0.03, L - 0.06); sh.lineTo(0.012, L); sh.lineTo(0.022 + 0.026, L - 0.1); sh.lineTo(0.022, 0.04);
    const bg = new THREE.ExtrudeGeometry(sh, { depth: 0.006, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 1 }); bg.translate(0, 0, -0.003);
    mb.addRigid(bg, 'sword', sf, hex('#0d0b10'), (lx, ly) => (lx > 0.012 + ly * 0.02 ? hex('#ff2b4c', 2.0) : hex('#0f0d12')));
    const gd = new THREE.BoxGeometry(0.1, 0.014, 0.06); gd.translate(0, 0.03, 0); mb.addRigid(gd, 'sword', sf, C.gold);
    const hl = new THREE.CylinderGeometry(0.02, 0.022, 0.34, 10); hl.translate(0, -0.15, 0);
    mb.addRigid(hl, 'sword', sf, hex('#1a1014'), (lx, ly) => ((Math.floor(ly * 50) % 2) ? hex('#1a1014') : hex('#6a0c1c')));
  }
  return { J, geometry: mb.geometry(), palette: C };
}
