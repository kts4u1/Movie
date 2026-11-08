// Choreography: keyframed performance of both fighters, time warp, events and camera.
// Keys are authored in real seconds (R) and converted to scene seconds (S) so that
// hit-stops and bullet time slow down everything that lives in scene time.
import * as THREE from 'three';
import { Track, TimeWarp, clamp, lerp, smoothstep, noise1, DEG } from './util.js';

export const DURATION = 15.0;
export const T_EXPLODE = 9.05; // real time of the wave collision

export const warp = new TimeWarp([
  { r0: 4.1, r1: 4.2, speed: 0.06, rampIn: 0.02, rampOut: 0.14 }, // first clash hit-stop
  { r0: 7.45, r1: 7.5, speed: 0.1, rampIn: 0.02, rampOut: 0.1 }, // heavy slam
  { r0: T_EXPLODE, r1: T_EXPLODE + 0.2, speed: 0.3, rampIn: 0.001, rampOut: 0.25 }, // explosion
  { r0: 10.52, r1: 11.85, speed: 0.07, rampIn: 0.1, rampOut: 0.22 }, // bullet time
  { r0: 13.08, r1: 13.17, speed: 0.08, rampIn: 0.02, rampOut: 0.1 }, // final cross
], DURATION);
const S = (r) => warp.S(r);

// ------------------------------------------------------------------ characters
function makeChar(name, opts) {
  const c = {
    name, ...opts,
    pos: new Track(3), yaw: new Track(1), autoFace: new Track(1), yawOff: new Track(1), flip: new Track(1),
    lean: new Track(1), twist: new Track(1), chestLean: new Track(1),
    hand: new Track(3), dir: new Track(3), two: new Track(1), handL: new Track(3),
    blade: new Track(1), eyes: new Track(1), aura: new Track(1), dissolve: new Track(1), headLook: new Track(1),
  };
  c.autoFace.add(0, 1);
  c.headLook.add(0, 1);
  c.handL.add(0, opts.freeL);
  return c;
}

export const A = makeChar('A', {
  sc: 1.0, phase: 0.0,
  waist: new THREE.Vector3(0, 0.12, 0), shR: new THREE.Vector3(-0.25, 0.47, -0.02), shL: new THREE.Vector3(0.25, 0.47, -0.02), neck: new THREE.Vector3(0, 0.58, 0),
  L1: 0.33, L2: 0.32, gripL: 0.2, freeL: [0.3, 0.28, 0.2],
  segs: [[0.09, 1.16]],
});
export const B = makeChar('B', {
  sc: 1.16, phase: 1.7,
  waist: new THREE.Vector3(0, 0.12, 0).multiplyScalar(1.16), shR: new THREE.Vector3(-0.25, 0.47, -0.02).multiplyScalar(1.16), shL: new THREE.Vector3(0.25, 0.47, -0.02).multiplyScalar(1.16), neck: new THREE.Vector3(0, 0.58, 0).multiplyScalar(1.16),
  L1: 0.33 * 1.16, L2: 0.32 * 1.16, gripL: 0.42, freeL: [0.38, 0.32, 0.15],
  segs: [[0.9, 1.5], [-0.9, -1.5]], staff: [-0.85, 0.85],
});
A.opp = B; B.opp = A;

// ------------------------------------------------------------------ pose evaluation
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler();
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0), AZ = new THREE.Vector3(0, 0, 1);
const tmpArr = [0, 0, 0];

function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export function rootPosAt(c, s, out = new THREE.Vector3()) {
  c.pos.eval(s, tmpArr);
  out.set(tmpArr[0], tmpArr[1], tmpArr[2]);
  out.y += Math.sin(s * 2.1 + c.phase) * 0.035 + Math.sin(s * 3.7 + c.phase * 2) * 0.012;
  return out;
}

const _p0 = new THREE.Vector3(), _p1 = new THREE.Vector3(), _po = new THREE.Vector3();
export function rootAt(c, s, out = {}) {
  const pos = rootPosAt(c, s, out.pos || new THREE.Vector3());
  const h = 1 / 120;
  rootPosAt(c, s + h, _p1);
  rootPosAt(c, s - h, _p0);
  const vel = (out.vel || new THREE.Vector3()).subVectors(_p1, _p0).multiplyScalar(1 / (2 * h));
  rootPosAt(c.opp, s, _po);
  const yawFace = Math.atan2(_po.x - pos.x, _po.z - pos.z);
  const yaw = lerpAngle(c.yaw.eval1(s), yawFace, clamp(c.autoFace.eval1(s), 0, 1)) + c.yawOff.eval1(s);
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  const vf = vel.x * fx + vel.z * fz;
  const vr = vel.x * fz - vel.z * fx;
  const lean = clamp(vf * 0.065, -0.4, 0.45) + c.lean.eval1(s);
  const bank = clamp(-vr * 0.06, -0.35, 0.35);
  const flip = c.flip.eval1(s);
  const q = out.quat || new THREE.Quaternion();
  q.setFromAxisAngle(AY, yaw);
  q.multiply(_q.setFromAxisAngle(AX, lean + flip));
  q.multiply(_q.setFromAxisAngle(AZ, bank));
  out.pos = pos; out.vel = vel; out.quat = q; out.yaw = yaw;
  return out;
}

function ik(S, T, L1, L2, pole, outE, outH) {
  const d = _v.subVectors(T, S);
  let dist = d.length();
  let l1 = L1, l2 = L2;
  const reach = (L1 + L2) * 0.999;
  let stretch = 1;
  if (dist > reach) {
    stretch = Math.min(dist / reach, 1.12);
    l1 *= stretch; l2 *= stretch;
  }
  const maxD = (l1 + l2) * 0.999;
  const dn = d.clone().normalize();
  if (dist > maxD) dist = maxD;
  dist = Math.max(dist, Math.abs(l1 - l2) + 0.02);
  outH.copy(S).addScaledVector(dn, dist);
  const a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(l1 * l1 - a * a, 0));
  const perp = _v2.copy(pole).addScaledVector(dn, -pole.dot(dn));
  if (perp.lengthSq() < 1e-8) perp.set(0, -1, 0);
  perp.normalize();
  outE.copy(S).addScaledVector(dn, a).addScaledVector(perp, h);
  return stretch;
}

function v3(arr) { return new THREE.Vector3(arr[0], arr[1], arr[2]); }

export function evalPose(c, s, P = {}) {
  const R = rootAt(c, s, P._root || (P._root = {}));
  P.rootPos = R.pos; P.rootQuat = R.quat; P.vel = R.vel;
  const hand = v3(c.hand.eval(s, tmpArr));
  const dir = v3(c.dir.eval(s, tmpArr)).normalize();
  // chest follows the weapon hand
  const twist = clamp(0.42 * Math.atan2(hand.x, hand.z + 0.35), -0.8, 0.8) + c.twist.eval1(s);
  const chestLean = clamp(-(hand.y - 0.55 * c.sc) * 0.25, -0.25, 0.2) + c.chestLean.eval1(s);
  P.chestQuatL = (P.chestQuatL || new THREE.Quaternion()).setFromAxisAngle(AY, twist).multiply(_q.setFromAxisAngle(AX, chestLean));
  const chestW = _q2.copy(R.quat).multiply(P.chestQuatL);
  const waistW = _v3.copy(c.waist).applyQuaternion(R.quat).add(R.pos);
  P.shoulderR = (P.shoulderR || new THREE.Vector3()).copy(c.shR).applyQuaternion(chestW).add(waistW);
  P.shoulderL = (P.shoulderL || new THREE.Vector3()).copy(c.shL).applyQuaternion(chestW).add(waistW);
  P.chestW = (P.chestW || new THREE.Quaternion()).copy(chestW);
  P.headPos = (P.headPos || new THREE.Vector3()).copy(c.neck).applyQuaternion(chestW).add(waistW);
  P.chestPos = (P.chestPos || new THREE.Vector3()).set(0, 0.36 * c.sc, 0).applyQuaternion(chestW).add(waistW);
  const handW = hand.clone().applyQuaternion(R.quat).add(R.pos);
  const dirW = dir.clone().applyQuaternion(R.quat);
  P.poleR = (P.poleR || new THREE.Vector3()).set(-0.7, -0.45, -0.55).applyQuaternion(chestW);
  P.poleL = (P.poleL || new THREE.Vector3()).set(0.7, -0.45, -0.55).applyQuaternion(chestW);
  P.elbowR = P.elbowR || new THREE.Vector3();
  P.handR = P.handR || new THREE.Vector3();
  P.stretch = ik(P.shoulderR, handW, c.L1, c.L2, P.poleR, P.elbowR, P.handR);
  // weapon orientation: blade along dir, edge leading the swing
  P.weaponPos = (P.weaponPos || new THREE.Vector3()).copy(P.handR);
  P.dirW = (P.dirW || new THREE.Vector3()).copy(dirW);
  const zRef = new THREE.Vector3(0, 1, 0).applyQuaternion(R.quat).addScaledVector(new THREE.Vector3(0, 0, -1).applyQuaternion(R.quat), 0.35);
  if (!P._noVel) {
    const h = 1 / 120;
    const tipA = tipAt(c, s + h), tipB = tipAt(c, s - h);
    const tv = tipA.sub(tipB).multiplyScalar(1 / (2 * h));
    tv.addScaledVector(dirW, -tv.dot(dirW));
    const sp = tv.length();
    P.tipSpeed = sp;
    if (sp > 0.5) {
      const w = smoothstep(1.5, 5, sp);
      const zv = tv.normalize().cross(dirW).normalize();
      zRef.normalize().multiplyScalar(1 - w).addScaledVector(zv, w);
    }
  }
  P.weaponQuat = basisQuatLocal(dirW, zRef, P.weaponQuat || new THREE.Quaternion());
  // left hand: free or on the grip
  const two = clamp(c.two.eval1(s), 0, 1);
  P.twoHand = two;
  const grip = P.handR.clone().addScaledVector(dirW, -c.gripL);
  const freeL = v3(c.handL.eval(s, tmpArr)).applyQuaternion(R.quat).add(R.pos);
  const targetL = freeL.lerp(grip, two);
  P.elbowL = P.elbowL || new THREE.Vector3();
  P.handL = P.handL || new THREE.Vector3();
  ik(P.shoulderL, targetL, c.L1, c.L2, P.poleL, P.elbowL, P.handL);
  // head looks at the opponent
  const look = clamp(c.headLook.eval1(s), 0, 1);
  const oppChest = rootPosAt(c.opp, s, new THREE.Vector3()).add(new THREE.Vector3(0, 0.55 * c.opp.sc, 0));
  const ld = oppChest.sub(P.headPos).applyQuaternion(chestW.clone().invert());
  const hy = clamp(Math.atan2(ld.x, ld.z), -1.0, 1.0) * look;
  const hp = clamp(-Math.atan2(ld.y, Math.hypot(ld.x, ld.z)), -0.6, 0.6) * look;
  P.headQuatL = (P.headQuatL || new THREE.Quaternion()).setFromEuler(_e.set(hp, hy, 0, 'YXZ'));
  // scalar channels
  P.blade = clamp(c.blade.eval1(s), 0, 1.3);
  P.eyes = clamp(c.eyes.eval1(s), 0, 1);
  P.aura = Math.max(c.aura.eval1(s), 0);
  P.dissolve = clamp(c.dissolve.eval1(s), 0, 1);
  return P;
}

function basisQuatLocal(yDir, zRef, out) {
  const y = yDir.clone().normalize();
  const z = zRef.clone().addScaledVector(y, -zRef.dot(y));
  if (z.lengthSq() < 1e-8) z.set(1, 0, 0).addScaledVector(y, -y.x);
  z.normalize();
  const x = new THREE.Vector3().crossVectors(y, z);
  return out.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

// weapon tip without IK refinements (used for velocity estimates)
function tipAt(c, s) {
  const R = rootAt(c, s, {});
  const hand = v3(c.hand.eval(s, tmpArr)).applyQuaternion(R.quat).add(R.pos);
  const dir = v3(c.dir.eval(s, tmpArr)).normalize().applyQuaternion(R.quat);
  return hand.addScaledVector(dir, c.segs[0][1]);
}

// world-space weapon segments [{a, b}] at scene time s
export function weaponSegments(c, s, P) {
  P = P || evalPose(c, s, { _noVel: true });
  const out = [];
  for (const [a, b] of c.segs) {
    const bb = c.name === 'A' ? a + (b - a) * clamp(P.blade, 0, 1) : b;
    out.push({ a: P.weaponPos.clone().addScaledVector(P.dirW, a), b: P.weaponPos.clone().addScaledVector(P.dirW, bb) });
  }
  if (c.staff) out.push({ a: P.weaponPos.clone().addScaledVector(P.dirW, c.staff[0]), b: P.weaponPos.clone().addScaledVector(P.dirW, c.staff[1]), staff: true });
  return out;
}

function closestSegSeg(p1, q1, p2, q2) {
  const d1 = q1.clone().sub(p1), d2 = q2.clone().sub(p2), r = p1.clone().sub(p2);
  const a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r);
  let s = 0, t = 0;
  const c = d1.dot(r), b = d1.dot(d2), den = a * e - b * b;
  s = den > 1e-9 ? clamp((b * f - c * e) / den, 0, 1) : 0;
  t = (b * s + f) / e;
  if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); } else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
  const c1 = p1.clone().addScaledVector(d1, s), c2 = p2.clone().addScaledVector(d2, t);
  return { c1, c2, dist: c1.distanceTo(c2), mid: c1.clone().add(c2).multiplyScalar(0.5) };
}

export function contactPoint(s) {
  const sa = weaponSegments(A, s), sb = weaponSegments(B, s);
  let best = null;
  for (const x of sa) for (const y of sb) {
    const r = closestSegSeg(x.a, x.b, y.a, y.b);
    if (!best || r.dist < best.dist) best = r;
  }
  return best;
}

// ------------------------------------------------------------------ authoring helpers
const K = (c, r, hand, dir, opts) => { c.hand.add(S(r), hand, opts); c.dir.add(S(r), dir, opts); };
const POS = (c, r, p, opts) => c.pos.add(S(r), p, opts);
const SC = (c, track, r, v, opts) => c[track].add(S(r), v, opts);
// key the weapon so that the point `along` meters up the weapon sits at world point C with world direction dirW
function contact(c, r, C, dirW, along, opts) {
  const s = S(r);
  const R = rootAt(c, s, {});
  const d = new THREE.Vector3(...dirW).normalize();
  const handW = new THREE.Vector3(...C).addScaledVector(d, -along);
  const inv = R.quat.clone().invert();
  const hl = handW.sub(R.pos).applyQuaternion(inv);
  const dl = d.applyQuaternion(inv);
  c.hand.add(s, [hl.x, hl.y, hl.z], opts);
  c.dir.add(s, [dl.x, dl.y, dl.z], opts);
}

// poses (character-local; +Z forward, -X = right hand side)
const PA = {
  LOW: [[-0.3, 0.12, 0.28], [-0.15, -0.45, 1]],
  SALUTE: [[-0.04, 0.58, 0.3], [0.0, 1, 0.08]],
  GUARD: [[-0.08, 0.38, 0.4], [0.05, 0.55, 1]],
  JODAN: [[-0.06, 0.92, 0.1], [0.05, 0.35, -1]],
  WAKI: [[-0.33, 0.25, -0.05], [-0.35, -0.25, -1]],
  IAI: [[-0.3, 0.3, 0.02], [-0.45, -0.3, -1]],
  TUCK: [[-0.18, 0.4, 0.28], [-0.2, 0.25, -1]],
};
const PB = {
  REST: [[-0.38, 0.42, 0.22], [0.04, 1, 0.12]],
  READY: [[-0.12, 0.52, 0.5], [0.3, -0.08, 1]],
  HIGH: [[-0.1, 1.12, 0.05], [0.1, 0.55, -1]],
  SPIN: [[-0.55, 0.5, 0.25], [-1, 0.05, 0.15]],
  BACK: [[-0.38, 0.45, 0.05], [-0.6, -0.3, -0.75]],
};
const KA = (r, name, opts) => K(A, r, PA[name][0], PA[name][1], opts);
const KB = (r, name, opts) => K(B, r, PB[name][0], PB[name][1], opts);

export const events = { clashes: [], grinds: [], lightning: [], dust: [], whooshes: [], misc: {} };
const clash = (r, intensity, kind = 'clash') => events.clashes.push({ r, s: S(r), intensity, kind });

// ================================================================== PERFORMANCE
// ---- Phase 0: intros (0 - 3.0)
POS(A, 0, [-5, 1.1, 0]); POS(A, 2.95, [-5, 1.1, 0], { stop: true });
POS(B, 0, [5, 1.25, 0]); POS(B, 2.95, [5, 1.25, 0], { stop: true });
SC(A, 'eyes', 0, 0); SC(A, 'eyes', 0.5, 0, { stop: true }); SC(A, 'eyes', 0.68, 1, { stop: true });
SC(A, 'blade', 0, 0); SC(A, 'blade', 0.85, 0, { stop: true }); SC(A, 'blade', 1.0, 1.12); SC(A, 'blade', 1.12, 1.0, { stop: true });
SC(B, 'eyes', 0, 0); SC(B, 'eyes', 1.62, 0, { stop: true }); SC(B, 'eyes', 1.8, 1, { stop: true });
SC(B, 'blade', 0, 0); SC(B, 'blade', 1.98, 0, { stop: true }); SC(B, 'blade', 2.12, 1.15); SC(B, 'blade', 2.3, 1.0, { stop: true });
events.misc.igniteA = 0.85; events.misc.igniteB = 1.98; events.misc.eyesA = 0.5; events.misc.eyesB = 1.62;
SC(A, 'two', 0, 0); SC(A, 'two', 1.3, 0, { stop: true }); SC(A, 'two', 1.6, 1, { stop: true });
KA(0, 'SALUTE'); KA(1.12, 'SALUTE', { stop: true });
K(A, 1.32, [-0.25, 0.42, 0.32], [-0.6, 0.2, 0.7]);
KA(1.5, 'LOW', { stop: true });
KA(2.95, 'LOW', { stop: true });
SC(B, 'two', 0, 1); SC(B, 'two', 2.1, 1, { stop: true }); SC(B, 'two', 2.18, 0, { stop: true }); SC(B, 'two', 2.8, 0, { stop: true }); SC(B, 'two', 2.95, 1, { stop: true });
KB(0, 'REST'); KB(2.12, 'REST', { stop: true });
// one-handed spin flourish in the frontal plane
for (let i = 0; i <= 10; i++) {
  const r = 2.2 + i * 0.055;
  const th = Math.PI / 2 + (i / 10) * Math.PI * 4;
  K(B, r, [-0.12, 0.6, 0.48], [Math.cos(th), Math.sin(th), 0.12]);
}
KB(2.85, 'READY', { stop: true });
KB(2.95, 'READY', { stop: true });

// ---- Phase 1: charge + first clash (3.0 - 5.3)
POS(A, 3.0, [-5, 1.1, 0], { stop: true }); POS(A, 3.25, [-4.4, 1.0, 0]); POS(A, 3.85, [-1.55, 1.2, 0]); POS(A, 4.1, [-0.8, 1.25, 0], { stop: true });
POS(B, 3.0, [5, 1.25, 0], { stop: true }); POS(B, 3.3, [4.3, 1.2, 0]); POS(B, 3.9, [1.5, 1.35, 0]); POS(B, 4.1, [0.85, 1.4, 0], { stop: true });
events.dust.push({ r: 3.05, who: 'A' }, { r: 3.08, who: 'B' });
KA(3.0, 'LOW', { stop: true });
KA(3.55, 'JODAN');
K(A, 3.92, [-0.05, 0.98, 0.3], [0.1, 1, 0.15]);
KB(3.0, 'READY', { stop: true });
K(B, 3.6, [-0.25, 0.75, 0.35], [-0.2, 0.4, 1]);
const C1 = [0.35, 2.15, 0];
contact(A, 4.1, C1, [1, 0.05, 0], 0.75, { stop: true });
contact(B, 4.1, C1, [0.12, 0.08, -1], -0.22, { stop: true });
clash(4.1, 1.0, 'big');
// blade lock grind
POS(A, 4.45, [-0.78, 1.22, 0.04]); POS(A, 4.8, [-0.82, 1.2, -0.02]); POS(A, 5.0, [-0.8, 1.22, 0], { stop: true });
POS(B, 4.45, [0.83, 1.38, 0.02]); POS(B, 4.8, [0.82, 1.36, 0]); POS(B, 5.0, [0.85, 1.38, 0], { stop: true });
contact(A, 4.45, [0.3, 2.06, 0.03], [0.98, -0.05, 0.12], 0.72);
contact(B, 4.45, [0.3, 2.06, 0.03], [0.1, 0.05, -1], -0.2);
contact(A, 4.8, [0.27, 1.98, -0.02], [0.97, -0.12, -0.08], 0.68);
contact(B, 4.8, [0.27, 1.98, -0.02], [0.14, 0.02, -1], -0.2);
contact(A, 5.0, [0.28, 2.0, 0.0], [0.97, -0.08, 0.0], 0.7, { stop: true });
contact(B, 5.0, [0.28, 2.0, 0.0], [0.12, 0.05, -1], -0.2, { stop: true });
events.grinds.push({ r0: 4.12, r1: 4.98 });
// B shoves A away
K(B, 5.18, [-0.05, 0.85, 0.75], [0.15, 0.15, -1]);
POS(B, 5.25, [0.7, 1.35, 0]);
K(A, 5.15, [-0.15, 0.8, 0.15], [0.2, 0.85, -0.5]);
POS(A, 5.35, [-2.2, 1.12, 0.1], { stop: true });
clash(5.03, 0.45, 'push');

// ---- Phase 2: spin attack, counter flurry, heavy slam (5.3 - 7.6)
KA(5.35, 'GUARD');
SC(B, 'two', 5.22, 1, { stop: true }); SC(B, 'two', 5.32, 0, { stop: true }); SC(B, 'two', 5.95, 0, { stop: true }); SC(B, 'two', 6.1, 1, { stop: true });
SC(B, 'yawOff', 5.3, 0, { stop: true }); SC(B, 'yawOff', 5.55, Math.PI * 0.5); SC(B, 'yawOff', 5.8, Math.PI * 1.5); SC(B, 'yawOff', 6.0, Math.PI * 2, { stop: true });
POS(B, 5.3, [0.7, 1.35, 0], { stop: true }); POS(B, 5.55, [0.3, 1.3, 0.05]); POS(B, 5.8, [-0.15, 1.3, 0.08]); POS(B, 6.0, [-0.3, 1.32, 0.05]);
KB(5.3, 'SPIN'); KB(5.55, 'SPIN'); KB(5.8, 'SPIN'); KB(5.98, 'SPIN');
// A blocks the first blade, ducks under the second
POS(A, 5.45, [-2.1, 1.12, 0.1]); POS(A, 5.62, [-2.15, 1.05, 0.1]); POS(A, 5.8, [-2.1, 0.7, 0.08]); POS(A, 6.0, [-1.8, 1.05, 0.0]);
{
  const s = S(5.55);
  const Pb = evalPose(B, s, { _noVel: true });
  const C2 = Pb.weaponPos.clone().addScaledVector(Pb.dirW, 1.12);
  contact(A, 5.55, [C2.x, C2.y, C2.z], [0.15, 0.95, -0.25], 0.5, { stop: true });
  clash(5.55, 0.8);
}
KA(5.8, 'TUCK');
events.whooshes.push({ r: 5.8, gain: 0.9 });
// counter flurry
POS(A, 6.15, [-1.55, 1.12, -0.05]); POS(A, 6.45, [-1.2, 1.17, -0.05]); POS(A, 6.75, [-0.98, 1.2, 0.02]); POS(A, 7.0, [-0.9, 1.16, 0], { stop: true });
POS(B, 6.2, [0.15, 1.35, 0]); POS(B, 6.5, [0.55, 1.36, 0]); POS(B, 6.8, [0.85, 1.4, 0]); POS(B, 7.0, [1.0, 1.42, 0], { stop: true });
KB(6.1, 'READY');
K(A, 6.1, [-0.32, 0.86, 0.08], [-0.4, 0.6, -0.7]);
{
  const r = 6.27;
  const a = rootPosAt(A, S(r), new THREE.Vector3()), b = rootPosAt(B, S(r), new THREE.Vector3());
  const C = [lerp(a.x, b.x, 0.47), 1.95, 0.12];
  contact(A, r, C, [0.82, 0.3, 0.45], 0.7);
  contact(B, r, C, [0.15, 0.8, -0.55], 0.3);
  clash(r, 0.75);
}
K(A, 6.36, [0.05, 0.35, 0.45], [0.7, -0.3, -0.6]);
K(A, 6.44, [0.36, 0.52, 0.18], [0.85, 0.15, -0.45]);
{
  const r = 6.56;
  const a = rootPosAt(A, S(r), new THREE.Vector3()), b = rootPosAt(B, S(r), new THREE.Vector3());
  const C = [lerp(a.x, b.x, 0.5), 1.72, -0.32];
  contact(A, r, C, [0.86, 0.05, -0.5], 0.7);
  contact(B, r, C, [0.05, 1, -0.12], 0.32);
  clash(r, 0.7);
}
K(A, 6.66, [-0.3, 0.1, 0.3], [-0.3, -0.7, 0.6]);
{
  const r = 6.86;
  const a = rootPosAt(A, S(r), new THREE.Vector3()), b = rootPosAt(B, S(r), new THREE.Vector3());
  const C = [lerp(a.x, b.x, 0.5), 1.5, 0.22];
  contact(A, r, C, [0.8, 0.5, 0.3], 0.72);
  contact(B, r, C, [0.2, -0.7, -0.68], -0.25);
  clash(r, 0.8);
}
K(A, 6.98, [-0.1, 0.75, 0.4], [0.2, 1, -0.1]);
// heavy overhead slam by B
KB(7.05, 'READY');
KB(7.25, 'HIGH');
SC(B, 'chestLean', 7.0, 0); SC(B, 'chestLean', 7.25, -0.25); SC(B, 'chestLean', 7.45, 0.25); SC(B, 'chestLean', 7.8, 0);
POS(B, 7.25, [1.05, 1.55, 0]); POS(B, 7.45, [1.0, 1.4, 0], { stop: true });
POS(A, 7.3, [-0.9, 1.15, 0]); POS(A, 7.45, [-0.92, 1.1, 0]); POS(A, 7.6, [-1.0, 0.85, 0], { stop: true });
POS(A, 7.75, [-1.8, 1.6, 0]);
{
  const C6 = [-0.4, 2.0, 0];
  contact(B, 7.45, C6, [-0.95, -0.25, 0], 1.15, { stop: true });
  contact(A, 7.45, C6, [0.05, 0.1, -1], 0.4, { stop: true });
  clash(7.45, 1.0, 'heavy');
  events.dust.push({ r: 7.47, who: 'A', big: true });
}
KA(7.25, 'GUARD');
K(A, 7.6, [-0.05, 0.62, 0.32], [0.05, 0.2, -1]);
K(B, 7.6, [-0.12, 0.7, 0.62], [-0.2, -0.8, 0.6]);

// ---- Phase 3: backflip, ground fissure vs crescent wave, explosion (7.6 - 9.6)
POS(A, 8.0, [-3.6, 2.8, 0]); POS(A, 8.25, [-5.3, 2.0, 0]); POS(A, 8.45, [-5.9, 1.1, 0], { stop: true });
SC(A, 'flip', 7.65, 0, { stop: true }); SC(A, 'flip', 8.35, -Math.PI * 2, { stop: true });
KA(7.8, 'TUCK'); KA(8.3, 'TUCK');
events.whooshes.push({ r: 7.9, gain: 0.8 }, { r: 8.15, gain: 0.6 });
events.dust.push({ r: 8.45, who: 'A' });
POS(B, 7.8, [1.0, 1.42, 0]); POS(B, 8.2, [1.2, 1.5, 0]); POS(B, 8.45, [1.0, 2.0, 0]); POS(B, 8.62, [0.6, 0.92, 0], { stop: true }); POS(B, 9.0, [0.7, 1.15, 0], { stop: true });
KB(8.1, 'READY');
KB(8.42, 'HIGH');
K(B, 8.62, [-0.1, 0.25, 0.58], [0.0, -0.75, 0.65], { stop: true });
K(B, 8.9, [-0.1, 0.3, 0.58], [0.0, -0.7, 0.68], { stop: true });
SC(B, 'chestLean', 8.42, -0.2); SC(B, 'chestLean', 8.62, 0.35); SC(B, 'chestLean', 9.1, 0.0);
// A answers with a horizontal slash that releases a crescent wave
K(A, 8.6, [0.36, 0.55, 0.12], [0.9, 0.2, -0.4]);
K(A, 8.86, [-0.1, 0.5, 0.55], [-0.1, 0.05, 1]);
K(A, 8.98, [-0.45, 0.5, 0.2], [-0.85, 0.1, 0.45], { stop: true });
SC(A, 'two', 8.5, 1, { stop: true }); SC(A, 'two', 8.65, 0, { stop: true }); SC(A, 'two', 9.4, 0, { stop: true }); SC(A, 'two', 9.6, 1, { stop: true });
{
  const sSlam = S(8.62), sWave = S(8.86), sEx = S(T_EXPLODE);
  const Pb = evalPose(B, sSlam, { _noVel: true });
  const tip = Pb.weaponPos.clone().addScaledVector(Pb.dirW, 1.4);
  const fissureSpeed = 9;
  const xf = tip.x - fissureSpeed * (sEx - sSlam);
  const a = rootPosAt(A, sWave, new THREE.Vector3());
  const origin = new THREE.Vector3(a.x + 0.9, 1.15, a.z);
  const crescentSpeed = (xf - origin.x) / (sEx - sWave);
  events.misc.fissure = { s0: sSlam, r0: 8.62, origin: new THREE.Vector3(tip.x, 0.02, tip.z), speed: fissureSpeed, sEnd: sEx };
  events.misc.crescent = { s0: sWave, r0: 8.86, origin, speed: crescentSpeed, sEnd: sEx };
  events.misc.explosion = { s: sEx, r: T_EXPLODE, pos: new THREE.Vector3(xf, 0.9, 0) };
}
// pushed back by the blast
POS(A, T_EXPLODE + 0.02, [-5.9, 1.1, 0]); POS(A, T_EXPLODE + 0.45, [-6.5, 1.25, 0.2], { stop: true });
POS(B, T_EXPLODE + 0.02, [0.72, 1.15, 0]); POS(B, T_EXPLODE + 0.45, [2.2, 1.3, 0], { stop: true });
KA(9.3, 'GUARD');
KB(9.3, 'READY');

// ---- Phase 4: charge through smoke, mid-air clash, bullet time (9.6 - 12.5)
POS(A, 9.6, [-6.5, 1.25, 0.2], { stop: true }); POS(A, 9.85, [-5.7, 1.6, 0.1]); POS(A, 10.32, [-3.0, 3.25, 0.0]); POS(A, 10.42, [-2.6, 3.5, 0]);
POS(B, 9.6, [2.2, 1.3, 0], { stop: true }); POS(B, 9.88, [1.6, 1.7, 0]); POS(B, 10.32, [0.15, 3.15, 0]); POS(B, 10.42, [-0.2, 3.35, 0]);
events.dust.push({ r: 9.7, who: 'A' }, { r: 9.75, who: 'B' });
POS(A, 11.85, [-2.55, 3.45, 0.02]); POS(B, 11.85, [-0.22, 3.3, 0]);
POS(A, 12.15, [-3.8, 2.6, 0.1]); POS(A, 12.5, [-5.0, 1.1, 0.1], { stop: true });
POS(B, 12.15, [1.0, 2.5, 0]); POS(B, 12.5, [2.4, 1.3, 0], { stop: true });
KA(9.9, 'JODAN');
KB(9.9, 'BACK');
K(B, 10.25, [-0.35, 0.3, 0.2], [-0.9, -0.3, 0.3]);
{
  const C7 = [-1.6, 4.25, 0.05];
  contact(A, 10.42, C7, [0.92, 0.3, 0.2], 0.75);
  contact(B, 10.42, C7, [-0.9, 0.4, -0.15], 1.15);
  clash(10.42, 1.0, 'air');
  contact(A, 11.85, [-1.5, 4.18, 0.08], [0.9, 0.36, 0.25], 0.68);
  contact(B, 11.85, [-1.5, 4.18, 0.08], [-0.88, 0.45, -0.1], 1.1);
  events.grinds.push({ r0: 10.45, r1: 11.85 });
}
events.lightning.push({ r: 0.22, strength: 1.0, pos: new THREE.Vector3(-14, 0, -30) }, { r: 12.62, strength: 0.8, pos: new THREE.Vector3(7, 0, -28) });
K(A, 12.1, [-0.2, 0.75, 0.2], [0.1, 0.9, -0.4]);
K(B, 12.1, [-0.3, 0.8, 0.3], [-0.4, 0.8, 0.4]);
clash(11.95, 0.6, 'push');
events.dust.push({ r: 12.5, who: 'A', big: true }, { r: 12.52, who: 'B', big: true });

// ---- Phase 5: power up, final cross (12.5 - 13.3)
KA(12.65, 'IAI', { stop: true }); KA(12.95, 'IAI', { stop: true });
KB(12.65, 'BACK', { stop: true }); KB(12.95, 'BACK', { stop: true });
SC(A, 'aura', 0, 0); SC(A, 'aura', 12.45, 0, { stop: true }); SC(A, 'aura', 12.9, 1); SC(A, 'aura', 13.3, 0.6); SC(A, 'aura', 13.9, 0.0, { stop: true });
SC(B, 'aura', 0, 0); SC(B, 'aura', 12.45, 0, { stop: true }); SC(B, 'aura', 12.9, 1); SC(B, 'aura', 13.3, 0.5); SC(B, 'aura', 13.85, 1.6); SC(B, 'aura', 14.2, 2.5);
SC(A, 'autoFace', 12.85, 1, { stop: true }); SC(A, 'autoFace', 12.9, 0, { stop: true });
SC(B, 'autoFace', 12.85, 1, { stop: true }); SC(B, 'autoFace', 12.9, 0, { stop: true });
SC(A, 'yaw', 0, Math.PI / 2); SC(B, 'yaw', 0, -Math.PI / 2);
POS(A, 12.95, [-5.0, 1.1, 0.1], { stop: true }); POS(A, 13.02, [-4.0, 1.05, 0.35]); POS(A, 13.12, [-0.4, 1.1, 0.5]); POS(A, 13.26, [1.0, 1.15, 0.35], { stop: true });
POS(B, 12.95, [2.4, 1.3, 0], { stop: true }); POS(B, 13.02, [1.6, 1.25, -0.3]); POS(B, 13.12, [-2.0, 1.3, -0.5]); POS(B, 13.26, [-3.0, 1.35, -0.35], { stop: true });
K(A, 13.04, [-0.32, 0.45, 0.25], [-0.7, 0.0, 0.7]);
K(A, 13.12, [0.25, 0.5, 0.5], [0.6, 0.05, 0.8]);
K(A, 13.26, [0.48, 0.42, 0.25], [0.85, -0.05, 0.4], { stop: true });
K(B, 13.04, [-0.4, 0.5, 0.3], [-0.85, 0.0, 0.5]);
K(B, 13.12, [0.2, 0.55, 0.55], [0.6, 0.0, 0.8]);
K(B, 13.26, [0.45, 0.5, 0.3], [0.85, 0.0, 0.4], { stop: true });
SC(A, 'two', 12.6, 1, { stop: true }); SC(A, 'two', 13.0, 0, { stop: true });
SC(B, 'two', 12.6, 1, { stop: true }); SC(B, 'two', 13.0, 0, { stop: true });
events.misc.finalCross = { r: 13.09, s: S(13.09), pos: new THREE.Vector3(-1.1, 1.75, 0.0) };
events.dust.push({ r: 12.97, who: 'A', big: true }, { r: 12.97, who: 'B', big: true });

// ---- Phase 6: aftermath (13.3 - 15)
KA(13.9, 'LOW');
K(A, 13.9, [0.45, 0.4, 0.25], [0.85, -0.1, 0.4], { stop: true });
K(A, 14.08, [-0.15, 0.3, 0.42], [0.1, -0.6, 0.8]);
K(A, 14.25, [-0.3, 0.15, 0.3], [-0.2, -0.55, 0.8], { stop: true });
SC(A, 'blade', 14.1, 1.0, { stop: true }); SC(A, 'blade', 14.32, 0.0, { stop: true });
K(B, 13.85, [0.45, 0.5, 0.3], [0.85, 0.0, 0.4], { stop: true });
K(B, 14.2, [0.3, 0.2, 0.35], [0.6, -0.5, 0.5]);
POS(B, 13.85, [-3.0, 1.35, -0.35], { stop: true }); POS(B, 14.4, [-3.0, 0.95, -0.35]);
SC(B, 'dissolve', 0, 0); SC(B, 'dissolve', 13.95, 0, { stop: true }); SC(B, 'dissolve', 14.75, 1, { stop: true });
SC(B, 'headLook', 13.2, 1, { stop: true }); SC(B, 'headLook', 13.4, 0, { stop: true });
SC(A, 'headLook', 13.2, 1, { stop: true }); SC(A, 'headLook', 13.4, 0, { stop: true });
SC(B, 'chestLean', 13.85, 0); SC(B, 'chestLean', 14.4, 0.45);
events.misc.shatter = { r: 13.9, s: S(13.9) };
events.misc.dissolve = { r0: 13.95, r1: 14.75, s0: S(13.95), s1: S(14.75) };
events.misc.retract = { r: 14.1 };
events.misc.title = { r: 14.3 };
// finalise default tracks
for (const c of [A, B]) {
  for (const k of ['yaw', 'yawOff', 'flip', 'lean', 'twist', 'chestLean', 'aura', 'dissolve']) if (c[k].keys.length === 0) c[k].add(0, 0);
}

// resolve clash positions from the actual poses
for (const e of events.clashes) e.pos = contactPoint(e.s).mid;
events.misc.finalCross.pos = (() => {
  const a = evalPose(A, events.misc.finalCross.s, { _noVel: true }), b = evalPose(B, events.misc.finalCross.s, { _noVel: true });
  return a.chestPos.clone().add(b.chestPos).multiplyScalar(0.5);
})();

// automatic whoosh detection from blade tip speed (real time)
{
  const dt = 1 / 120;
  for (const c of [A, B]) {
    let prev = 0, rising = false, peak = 0, peakR = 0;
    for (let r = 0; r < DURATION; r += dt) {
      const s = S(r);
      const P = evalPose(c, s);
      const sp = (P.tipSpeed || 0) * warp.speed(r);
      if (sp > prev) { rising = true; if (sp > peak) { peak = sp; peakR = r; } }
      else if (rising && sp < prev && peak > 9) {
        events.whooshes.push({ r: peakR, gain: clamp(peak / 25, 0.3, 1), who: c.name });
        rising = false; peak = 0;
      }
      if (sp < 4) { peak = 0; rising = false; }
      prev = sp;
    }
  }
}

// ------------------------------------------------------------------ camera
const cam = (r0, r1, fn) => ({ r0, r1, fn });
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const ease = (u) => u * u * (3 - 2 * u);
const charPos = (c, r, dy = 0.5) => rootPosAt(c, S(r), new THREE.Vector3()).add(V(0, dy * c.sc, 0));

export const shots = [
  // 1. Azure Ronin intro: low push-in while the blade ignites
  cam(0.0, 1.5, (r, u) => ({ pos: V(-3.35, 1.35, 2.35).lerp(V(-3.85, 1.55, 1.65), ease(u)), target: V(-5, 1.62, 0).lerp(V(-5, 1.72, 0), u), fov: 34 - u * 4 })),
  // 2. Crimson Oni intro: low angle, glaive spin
  cam(1.5, 2.95, (r, u) => ({ pos: V(2.7, 0.75, 2.6).lerp(V(3.15, 0.95, 2.0), ease(u)), target: V(5, 1.95, 0).lerp(V(5, 1.85, 0), u), fov: 38 - u * 3 })),
  // 3. the charge: wide side dolly
  cam(2.95, 4.32, (r, u) => ({ pos: V(-0.6, 1.4, 8.6).lerp(V(0.1, 1.9, 6.2), ease(u)), target: V(-0.2, 1.55, 0).lerp(V(0.1, 1.9, 0), ease(u)), fov: 40 - u * 4 })),
  // 4. blade lock close-up
  cam(4.32, 5.22, (r, u) => {
    const a = lerp(1.25, 1.62, u);
    return { pos: V(0.15 + Math.cos(a) * 3.2, 2.3 + u * 0.1, Math.sin(a) * 3.2), target: V(0.15, 1.9, 0), fov: 34 };
  }),
  // 5. flurry: orbit around the pair
  cam(5.22, 7.95, (r, u) => {
    const m = charPos(A, r, 0.45).add(charPos(B, r, 0.45)).multiplyScalar(0.5);
    const a = lerp(1.95, 0.95, ease(u));
    const rad = lerp(5.2, 4.4, u);
    return { pos: V(m.x + Math.cos(a) * rad, 1.75 + Math.sin(u * 3) * 0.15, Math.sin(a) * rad), target: m, fov: 38, smoothTarget: true };
  }),
  // 6. waves: high wide angle
  cam(7.95, 9.58, (r, u) => ({ pos: V(-1.2, 3.0, 9.4).lerp(V(-2.0, 2.4, 8.6), ease(u)), target: V(-2.4, 1.3, 0).lerp(V(-2.4, 1.2, 0), u), fov: 46 })),
  // 7. charge through the smoke: low looking up
  cam(9.58, 10.36, (r, u) => ({ pos: V(-1.6, 0.45, 5.6).lerp(V(-1.5, 0.8, 4.8), u), target: V(-2.2, 2.0, 0).lerp(V(-1.5, 3.7, 0), ease(u)), fov: 44 })),
  // 8. bullet-time orbit
  cam(10.36, 11.95, (r, u) => {
    const c = V(-1.45, 3.95, 0.05);
    const a = lerp(1.25, 1.25 + Math.PI * 1.05, ease(u));
    const rad = lerp(3.4, 3.0, u);
    return { pos: V(c.x + Math.cos(a) * rad, c.y + 0.25 - u * 0.35, c.z + Math.sin(a) * rad), target: c, fov: 36 };
  }),
  // 9. separation + landing + power up
  cam(11.95, 12.98, (r, u) => ({ pos: V(-1.2, 0.85, 8.2).lerp(V(-1.2, 0.95, 7.3), u), target: V(-1.2, 1.9, 0).lerp(V(-1.2, 1.5, 0), ease(u)), fov: 42 })),
  // 10. final cross: low, centred on the crossing point
  cam(12.98, 13.55, (r, u) => ({ pos: V(-1.1, 0.55, 4.6).lerp(V(-1.0, 0.65, 4.2), u), target: V(-1.1, 1.6, 0), fov: 50 })),
  // 11. aftermath: slow push past the victor toward the falling oni
  cam(13.55, 15.0, (r, u) => ({ pos: V(3.2, 1.2, 2.9).lerp(V(2.75, 1.3, 2.45), ease(u)), target: V(-0.9, 1.55, -0.1).lerp(V(-1.2, 1.5, -0.2), u), fov: 36 })),
];

// impacts that kick the camera (real time, amplitude)
export const shakes = [];
for (const e of events.clashes) shakes.push({ r: e.r, amp: e.kind === 'big' || e.kind === 'heavy' || e.kind === 'air' ? 1.0 : e.intensity * 0.45, decay: 6 });
shakes.push({ r: T_EXPLODE, amp: 1.4, decay: 3.5 }, { r: 8.62, amp: 0.8, decay: 5 }, { r: 13.09, amp: 1.0, decay: 4 }, { r: 12.5, amp: 0.4, decay: 7 }, { r: 13.9, amp: 0.5, decay: 5 });

export function cameraAt(r, out) {
  let shot = shots[shots.length - 1];
  for (const sh of shots) if (r >= sh.r0 && r < sh.r1) { shot = sh; break; }
  const u = clamp((r - shot.r0) / (shot.r1 - shot.r0), 0, 1);
  const c = shot.fn(r, u);
  let yaw = 0, pitch = 0, roll = 0;
  for (const k of shakes) {
    const d = r - k.r;
    if (d < 0 || d > 1.5) continue;
    const a = k.amp * Math.exp(-d * k.decay) * 0.035;
    yaw += noise1(r * 22 + k.r * 7, 1) * a;
    pitch += noise1(r * 25 + k.r * 3, 2) * a;
    roll += noise1(r * 18 + k.r * 5, 3) * a * 0.6;
  }
  // gentle handheld drift
  yaw += noise1(r * 0.7, 4) * 0.004;
  pitch += noise1(r * 0.9, 5) * 0.004;
  out.pos = c.pos; out.target = c.target; out.fov = c.fov; out.yaw = yaw; out.pitch = pitch; out.roll = roll; out.shot = shots.indexOf(shot);
  return out;
}
